import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, type SentiselDb } from "@/lib/db/client";
import { resolvePrivyIdentity, linkPrivyIdentity, type PrivyVerifier } from "@/lib/auth/privy-identity";
import { verifyPassword } from "@/lib/auth/password";
import { users, watchlists, watchlistItems, privyIdentities } from "@/lib/db/schema";

/*
 * PHASE 5 + 10 — Privy identity resolution, legacy account claim, isolation.
 * The Privy verifier is faked (the real adapter is a thin wrapper over the
 * official server SDK); every security property under test lives in
 * resolvePrivyIdentity / linkPrivyIdentity, which is the code that runs in
 * production.
 */

type FakeUser = { did: string; email: string | null; wallet: string | null };

function makeVerifier(users: Map<string, FakeUser>): PrivyVerifier & { minted: string[] } {
  return {
    minted: [],
    async verify(accessToken: string) {
      const u = users.get(accessToken);
      if (!u) throw new Error("invalid token");
      return { did: u.did };
    },
    async profile(idToken: string | null) {
      if (!idToken) return null;
      const u = users.get(idToken);
      if (!u) throw new Error("invalid id token");
      return { did: u.did, email: u.email, walletAddress: u.wallet };
    },
  };
}

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
    const u = (
      await db.insert(users).values({ email, passwordHash: "privy$no-password", displayName, username: email.split("@")[0].replace(/[^a-z0-9_]/gi, "_").slice(0, 20) }).returning({ id: users.id, email: users.email })
    )[0];
    await db.insert(watchlists).values({ userId: u.id, name: "Main", isDefault: true });
    return u;
  }

  async function seedLegacyUser(email: string, password: string, displayName = email.split("@")[0]) {
  const hash = await import("@/lib/auth/password").then((m) => m.hashPassword(password));
  const inserted = await db
    .insert(users)
    .values({ email, passwordHash: hash, displayName, username: email.split("@")[0].replace(/[^a-z0-9_]/gi, "_").slice(0, 20) })
    .returning({ id: users.id, email: users.email });
  const u = inserted[0];
  const wl = (
    await db.insert(watchlists).values({ userId: u.id, name: "Main", isDefault: true }).returning({ id: watchlists.id })
  )[0];
  await db
    .insert(watchlistItems)
    .values({ watchlistId: wl.id, symbol: "BTC" })
    .onConflictDoNothing();
  return u;
}

describe("privy identity resolution", () => {
  const registry = new Map<string, FakeUser>();
  const verifier = makeVerifier(registry);

  it("fresh privy user creates a new internal user", async () => {
    const did = "did:privy:fresh1";
    registry.set(did, { did, email: "new1@x.test", wallet: null });

    const res = await resolvePrivyIdentity(db, verifier, { accessToken: did, idToken: did });
    expect(res.action).toBe("authenticated");
    if (res.action !== "authenticated") return;
    expect(res.isNew).toBe(true);
    expect(res.email).toBe("new1@x.test");

    const row = (await db.select().from(users).where(eq(users.id, res.userId)))[0];
    expect(row.email).toBe("new1@x.test");
    expect(row.passwordHash.startsWith("privy$")).toBe(true);

    const mapping = await db.select().from(privyIdentities).where(eq(privyIdentities.privyDid, did));
    expect(mapping).toHaveLength(1);
    expect(mapping[0].userId).toBe(res.userId);
  });

  it("returning user maps to the SAME internal id (no duplicate)", async () => {
    const did = "did:privy:fresh1";
    const res = await resolvePrivyIdentity(db, verifier, { accessToken: did });
    expect(res.action).toBe("authenticated");
    if (res.action !== "authenticated") return;
    expect(res.isNew).toBe(false);

    const count = await db.select().from(privyIdentities).where(eq(privyIdentities.privyDid, did));
    expect(count).toHaveLength(1);
  });

  it("wallet-only login (no id token) creates a privy-local user", async () => {
    const did = "did:privy:wallet0xabc";
    registry.set(did, { did, email: null, wallet: "0xabc" });
    const res = await resolvePrivyIdentity(db, verifier, { accessToken: did });
    expect(res.action).toBe("authenticated");
    if (res.action !== "authenticated") return;
    const row = (await db.select().from(users).where(eq(users.id, res.userId)))[0];
    expect(row.email.endsWith("@privy.local")).toBe(true);
  });

  it("mismatched tokens are rejected by the verifier", async () => {
    await expect(
      resolvePrivyIdentity(db, verifier, { accessToken: "did:privy:unknown" }),
    ).rejects.toThrow("invalid token");
  });
});

describe("legacy account claim (PHASE 5)", () => {
  const registry = new Map<string, FakeUser>();
  const verifier = makeVerifier(registry);
  let legacyUserId = "";

  async function seedUser(email: string) {
    const u = (
      await db.insert(users).values({ email, passwordHash: "privy$no-password", displayName: email.split("@")[0], username: email.split("@")[0].replace(/[^a-z0-9_]/gi, "_").slice(0, 20) }).returning({ id: users.id, email: users.email })
    )[0];
    await db.insert(watchlists).values({ userId: u.id, name: "Main", isDefault: true });
    return u;
  }

  beforeAll(async () => {
    const u = await seedLegacyUser("legacy@x.test", "old-password-123", "Legacy User");
    legacyUserId = u.id;
    // Privy user bound to the same email as the legacy account
    registry.set("did:privy:legacy", { did: "did:privy:legacy", email: "legacy@x.test", wallet: null });
  });

  it("first privy login against a legacy email -> needs_legacy_claim (never auto-merge)", async () => {
    const res = await resolvePrivyIdentity(db, verifier, { accessToken: "did:privy:legacy", idToken: "did:privy:legacy" });
    expect(res.action).toBe("needs_legacy_claim");
    if (res.action !== "needs_legacy_claim") return;
    expect(res.legacyEmail).toBe("legacy@x.test");
  });

  it("no mapping rows were created by the failed claim", async () => {
    const mappings = await db.select().from(privyIdentities);
    expect(mappings.every((m) => m.privyDid !== "did:privy:legacy")).toBe(true);
  });

  it("correct legacy password claims the account: SAME internal id, all data preserved", async () => {
    const res = await resolvePrivyIdentity(db, verifier, {
      accessToken: "did:privy:legacy",
      idToken: "did:privy:legacy",
      legacyPassword: "old-password-123",
    });
    expect(res.action).toBe("authenticated");
    if (res.action !== "authenticated") return;
    expect(res.userId).toBe(legacyUserId);
    expect(res.isNew).toBe(false);

    // Historical data preserved
    const wl = await db.select().from(watchlists).where(eq(watchlists.userId, res.userId));
    expect(wl.length).toBe(1);
    const items = await db
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, wl[0].id));
    expect(items.some((i) => i.symbol === "BTC")).toBe(true);

    const mapping = await db.select().from(privyIdentities).where(eq(privyIdentities.privyDid, "did:privy:legacy"));
    expect(mapping[0].userId).toBe(legacyUserId);
  });

  it("after claim: returning login maps straight to the same internal id", async () => {
    const res = await resolvePrivyIdentity(db, verifier, { accessToken: "did:privy:legacy" });
    expect(res.action).toBe("authenticated");
    if (res.action !== "authenticated") return;
    expect(res.userId).toBe(legacyUserId);
    expect(res.isNew).toBe(false);
  });

  it("wrong legacy password -> legacy_claim_failed, no data corruption", async () => {
    // new privy identity targeting the same legacy email
    registry.set("did:privy:attacker", { did: "did:privy:attacker", email: "legacy@x.test", wallet: null });
    const res = await resolvePrivyIdentity(db, verifier, {
      accessToken: "did:privy:attacker",
      idToken: "did:privy:attacker",
      legacyPassword: "wrong-password",
    });
    expect(res.action).toBe("legacy_claim_failed");
    if (res.action !== "legacy_claim_failed") return;
    expect(res.reason).toBe("invalid_password");

    // No mapping created for the failed claim
    const mappings = await db.select().from(privyIdentities).where(eq(privyIdentities.privyDid, "did:privy:attacker"));
    expect(mappings).toHaveLength(0);

    // Legacy user record unchanged (hash still verifies the original password)
    const row = (await db.select().from(users).where(eq(users.id, legacyUserId)))[0];
    expect(await verifyPassword("old-password-123", row.passwordHash)).toBe(true);
  });

  it("email collision with a DIFFERENT verified email never auto-links", async () => {
    // A privy identity with a DIFFERENT email must never touch the legacy account.
    registry.set("did:privy:other", { did: "did:privy:other", email: "other@x.test", wallet: null });
    const res = await resolvePrivyIdentity(db, verifier, { accessToken: "did:privy:other", idToken: "did:privy:other" });
    expect(res.action).toBe("authenticated");
    if (res.action !== "authenticated") return;
    expect(res.email).toBe("other@x.test");
    expect(res.userId).not.toBe(legacyUserId);
  });
});

describe("privy DID uniqueness", () => {
  it("enforces a unique constraint on the Privy DID", async () => {
    const u = (await db.select().from(users).limit(1))[0];
    await db.insert(privyIdentities).values({ userId: u.id, privyDid: "did:privy:dup-test" });
    await expect(
      db.insert(privyIdentities).values({ userId: u.id, privyDid: "did:privy:dup-test" }),
    ).rejects.toThrow();
  });
});

describe("account isolation after migration", () => {
  it("migrated users see only their own watchlist rows", async () => {
    const migrated = (await db.select().from(users).where(eq(users.email, "legacy@x.test")))[0];
    const other = await seedUser("isolation@x.test");
    await db
      .insert(watchlistItems)
      .values({ watchlistId: (await db.select().from(watchlists).where(eq(watchlists.userId, other.id)))[0].id, symbol: "SOL" })
      .onConflictDoNothing();

    const myLists = await db.select().from(watchlists).where(eq(watchlists.userId, migrated.id));
    const mine = await db
      .select()
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
      .where(eq(watchlists.userId, migrated.id));
    expect(mine.length).toBe(1);
    expect(mine[0].watchlists.userId).toBe(migrated.id);
  });
});
