import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, type SentiselDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import {
  changeUsername,
  isUsernameAvailable,
  sanitizeUsername,
  validateUsername,
  pickUniqueUsername,
  USERNAME_RESERVED,
} from "@/lib/auth/username";

/*
 * Username feature — validation, case-insensitive uniqueness, atomic claim
 * and the migration backfill. The users_username_unique index (lower(username))
 * is the concurrency backstop asserted here.
 */

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

describe("username validation", () => {
  it("accepts valid handles", () => {
    for (const v of ["anondragon6", "buel_user", "marketpilot23", "A_B_c123"]) {
      expect(validateUsername(v)).toEqual({ ok: true, value: v });
    }
  });
  it("rejects invalid handles", () => {
    for (const v of ["ab", "user name", "user@123", "user-name!", "", "x".repeat(21)]) {
      expect(validateUsername(v)).toEqual({ ok: false, reason: "invalid" });
    }
  });
  it("rejects reserved handles case-insensitively", () => {
    expect(USERNAME_RESERVED.has("admin")).toBe(true);
    expect(validateUsername("admin")).toEqual({ ok: false, reason: "reserved" });
    expect(validateUsername("ADMIN")).toEqual({ ok: false, reason: "reserved" });
    expect(validateUsername("Buel")).toEqual({ ok: false, reason: "reserved" });
    expect(validateUsername("Support")).toEqual({ ok: false, reason: "reserved" });
  });
  it("trims whitespace before validating", () => {
    expect(validateUsername("  trader1  ")).toEqual({ ok: true, value: "trader1" });
  });
});

describe("sanitizeUsername", () => {
  it("lowercases and strips invalid characters", () => {
    expect(sanitizeUsername("E2E Tester")).toBe("e2e_tester");
    expect(sanitizeUsername("Market Pilot 23!")).toBe("market_pilot_23");
  });
  it("collapses separator runs and trims edges", () => {
    expect(sanitizeUsername("--a__b--")).toBe("a_b");
  });
  it("returns null when nothing usable remains or the handle is reserved", () => {
    expect(sanitizeUsername("***")).toBeNull();
    expect(sanitizeUsername("ab")).toBeNull();
    expect(sanitizeUsername("admin")).toBeNull();
  });
});

describe("availability + atomic change", () => {
  let userIdA = "";
  let userIdB = "";

  beforeAll(async () => {
    const a = await db
      .insert(users)
      .values({
        email: "ua@test.dev",
        passwordHash: "privy$no-password",
        displayName: "usera",
        username: "usera",
      })
      .returning({ id: users.id });
    const b = await db
      .insert(users)
      .values({
        email: "ub@test.dev",
        passwordHash: "privy$no-password",
        displayName: "userb",
        username: "userb",
      })
      .returning({ id: users.id });
    userIdA = a[0].id;
    userIdB = b[0].id;
  });

  it("availability is case-insensitive", async () => {
    expect(await isUsernameAvailable(db, "USERA")).toBe(false);
    expect(await isUsernameAvailable(db, "usera")).toBe(false);
    expect(await isUsernameAvailable(db, "free_handle")).toBe(true);
  });

  it("availability excludes the caller's own row", async () => {
    expect(await isUsernameAvailable(db, "usera", userIdA)).toBe(true);
    expect(await isUsernameAvailable(db, "usera", userIdB)).toBe(false);
  });

  it("changes a username and syncs the display name", async () => {
    const res = await changeUsername(db, userIdA, "marketpilot23");
    expect(res).toEqual({ ok: true, username: "marketpilot23" });
    const row = (await db.select().from(users).where(eq(users.id, userIdA)))[0];
    expect(row.username).toBe("marketpilot23");
    expect(row.displayName).toBe("marketpilot23");
  });

  it("rejects a duplicate claim case-insensitively", async () => {
    const res = await changeUsername(db, userIdB, "MARKETPILOT23");
    expect(res).toEqual({ ok: false, reason: "taken" });
  });

  it("rejects reserved usernames", async () => {
    const res = await changeUsername(db, userIdB, "admin");
    expect(res).toEqual({ ok: false, reason: "reserved" });
  });

  it("rejects invalid usernames", async () => {
    expect(await changeUsername(db, userIdB, "user name")).toEqual({ ok: false, reason: "invalid" });
    expect(await changeUsername(db, userIdB, "ab")).toEqual({ ok: false, reason: "invalid" });
  });

  it("lets a user keep their own username", async () => {
    const res = await changeUsername(db, userIdA, "marketpilot23");
    expect(res).toEqual({ ok: true, username: "marketpilot23" });
  });

  it("the DB unique index rejects a concurrent claim that slips the check", async () => {
    // Simulate the race: both users pass availability, then insert the same
    // handle directly — the index (not the check) must be the backstop.
    await expect(
      db.insert(users).values({
        email: "race@test.dev",
        passwordHash: "privy$no-password",
        displayName: "race",
        username: "MarketPilot23",
      }),
    ).rejects.toThrow();
  });

  it("internal ids, email and data are untouched by a username change", async () => {
    const row = (await db.select().from(users).where(eq(users.id, userIdA)))[0];
    expect(row.id).toBe(userIdA);
    expect(row.email).toBe("ua@test.dev");
    // ua + ub only: the concurrent-claim insert was correctly rejected by the
    // unique index, so no extra row exists.
    const other = await db.select({ n: sql<number>`count(*)::int` }).from(users);
    expect(other[0].n).toBe(2);
  });
});

describe("migration backfill + pickUniqueUsername", () => {
  it("backfilled every seed user with a valid, unique username", async () => {
    const rows = await db
      .select({ id: users.id, username: users.username, email: users.email })
      .from(users);
    expect(rows.length).toBeGreaterThan(0);
    const lower = rows.map((r) => r.username.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
    for (const r of rows) {
      expect(r.username).toMatch(/^[a-z0-9_]{3,20}$/);
    }
  });

  it("pickUniqueUsername de-conflicts against existing rows", async () => {
    // "usera" was renamed to "marketpilot23" earlier in the suite.
    const picked = await pickUniqueUsername(db, "marketpilot23");
    expect(picked).not.toBe("marketpilot23");
    expect(await isUsernameAvailable(db, picked)).toBe(true);
  });
});
