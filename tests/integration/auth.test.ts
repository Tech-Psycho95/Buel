import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { createTestDb, type SentiselDb } from "@/lib/db/client";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  hashToken,
} from "@/lib/auth/password";
import {
  createSession,
  resolveSession,
  revokeSession,
  createResetToken,
  consumeResetToken,
} from "@/lib/auth/session-core";
import { rateLimit } from "@/lib/http/rate-limit";
import { validateOrigin } from "@/lib/http/origin";
import { users, sessions, watchlists, watchlistItems } from "@/lib/db/schema";

let db: SentiselDb;
let close: () => Promise<void>;

beforeAll(async () => {
  const t = await createTestDb();
  db = t.db;
  close = async () => {
    await t.client.close();
  };
});

afterAll(async () => {
  await close();
});

async function seedUser(email: string, displayName = email.split("@")[0]) {
  const inserted = await db
    .insert(users)
    .values({ email, passwordHash: "privy$no-password", displayName, username: email.split("@")[0].replace(/[^a-z0-9_]/gi, "_").slice(0, 20) })
    .returning({ id: users.id, email: users.email });
  const u = inserted[0];
  await db.insert(watchlists).values({ userId: u.id, name: "Main", isDefault: true });
  return u;
}

describe("password hashing (legacy claim + rollback path)", () => {
  it("round-trips a password and rejects wrong attempts", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("correct horse battery staplE", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("produces unique salts for identical passwords", async () => {
    const a = await hashPassword("same-password-10");
    const b = await hashPassword("same-password-10");
    expect(a).not.toBe(b);
  });

  it("rejects malformed stored hashes without throwing", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });

  it("privy placeholder hashes never verify", async () => {
    expect(await verifyPassword("anything", "privy$no-password")).toBe(false);
  });
});

describe("sessions", () => {
  it("creates, resolves, and revokes sessions", async () => {
    const u = await seedUser("session-user-1@x.test");
    const { token } = await createSession(db, u.id);

    const resolved = await resolveSession(db, token);
    expect(resolved?.id).toBe(u.id);

    await revokeSession(db, token);
    expect(await resolveSession(db, token)).toBeNull();
  });

  it("rejects expired sessions", async () => {
    const u = (await db.select().from(users).limit(1))[0];
    const { token } = await createSession(db, u.id);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.tokenHash, hashToken(token)));
    expect(await resolveSession(db, token)).toBeNull();
  });

  it("does not leak users between accounts (persistence isolation)", async () => {
    const a = (await db.select().from(users).where(eq(users.email, "session-user-1@x.test")))[0];
    const b = await seedUser("session-user-2@x.test");
    const { token } = await createSession(db, a.id);
    const resolved = await resolveSession(db, token);
    expect(resolved?.id).toBe(a.id);
    expect(resolved?.id).not.toBe(b.id);
  });
});

describe("persistent rate limiting", () => {
  it("allows up to the limit and rejects beyond it", async () => {
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await rateLimit(db, "test", "1.2.3.4", 5, 60_000));
    }
    expect(results.slice(0, 5).every((r) => r.allowed)).toBe(true);
    expect(results[5].allowed).toBe(false);
    expect(results[5].retryAfterSec).toBeGreaterThan(0);
  });

  it("keys limits per identity", async () => {
    const r = await rateLimit(db, "test2", "9.9.9.9", 1, 60_000);
    expect(r.allowed).toBe(true);
  });
});

describe("origin validation", () => {
  const h = (origin: string | null, host: string | null) => {
    const headers = new Headers();
    if (origin) headers.set("origin", origin);
    if (host) headers.set("host", host);
    return headers;
  };

  it("accepts matching origin/host", () => {
    expect(() =>
      validateOrigin(h("https://app.example.com", "app.example.com"), {
        allowMissingOrigin: false,
      }),
    ).not.toThrow();
  });

  it("rejects mismatched and malformed origins", () => {
    expect(() =>
      validateOrigin(h("https://evil.io", "app.example.com"), { allowMissingOrigin: false }),
    ).toThrow();
    expect(() =>
      validateOrigin(h("not-a-url", "app.example.com"), { allowMissingOrigin: false }),
    ).toThrow();
  });

  it("missing origin follows the allowMissingOrigin policy", () => {
    expect(() =>
      validateOrigin(h(null, "app.example.com"), { allowMissingOrigin: true }),
    ).not.toThrow();
    expect(() =>
      validateOrigin(h(null, "app.example.com"), { allowMissingOrigin: false }),
    ).toThrow();
  });
});

describe("watchlist scoping", () => {
  it("only the owning user's list is reachable by a user-scoped query", async () => {
    const a = (await db.select().from(users).where(eq(users.email, "session-user-1@x.test")))[0];
    const b = (await db.select().from(users).where(eq(users.email, "session-user-2@x.test")))[0];
    expect(a && b).toBeTruthy();
    if (!a || !b) return;

    const aList = (await db.select().from(watchlists).where(eq(watchlists.userId, a.id)))[0];
    await db
      .insert(watchlistItems)
      .values({ watchlistId: aList.id, symbol: "BTC" })
      .onConflictDoNothing();

    const bLists = await db.select().from(watchlists).where(eq(watchlists.userId, b.id));
    const bItems = await db
      .select()
      .from(watchlistItems)
      .where(
        bLists.length
          ? eq(watchlistItems.watchlistId, bLists[0].id)
          : and(eq(watchlistItems.id, "00000000-0000-0000-0000-000000000000")),
      );
    expect(bItems).toHaveLength(0);
  });
});

describe("token generation", () => {
  it("generates 256-bit url-safe tokens and stable hashes", () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(hashToken(generateToken()));
  });
});
