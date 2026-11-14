import { eq, sql, and, ne } from "drizzle-orm";
import { z } from "zod";
import type { SentiselDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

/*
 * Username service — validation, availability and atomic updates.
 *
 * The username is the user-chosen handle (unique case-insensitively via the
 * users_username_unique index on lower(username)). It is identity flavour:
 * changing it never touches the internal user id, Privy DID, email or any
 * ownership relation.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** Handles that must not be claimable. Case-insensitive. */
export const USERNAME_RESERVED = new Set([
  "admin",
  "administrator",
  "support",
  "system",
  "buel",
  "root",
  "moderator",
  "mod",
  "help",
  "security",
  "official",
  "team",
  "buelteam",
]);

export const UsernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN, `Username must be at least ${USERNAME_MIN} characters.`)
  .max(USERNAME_MAX, `Username must be at most ${USERNAME_MAX} characters.`)
  .regex(/^[A-Za-z0-9_]+$/, "Only letters, numbers and underscores are allowed.");

export type UsernameCheck =
  | { available: true }
  | { available: false; reason: "invalid" | "reserved" | "taken" };

/** Validate the format + reserved list (no DB access). */
export function validateUsername(raw: string): { ok: true; value: string } | { ok: false; reason: "invalid" | "reserved" } {
  const parsed = UsernameSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const value = parsed.data;
  if (USERNAME_RESERVED.has(value.toLowerCase())) return { ok: false, reason: "reserved" };
  return { ok: true, value };
}

/** Case-insensitive availability against the database, excluding one's own row. */
export async function isUsernameAvailable(
  db: SentiselDb,
  username: string,
  exceptUserId?: string,
): Promise<boolean> {
  const normalized = username.toLowerCase();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      exceptUserId
        ? and(sql`lower(${users.username}) = ${normalized}`, ne(users.id, exceptUserId))
        : sql`lower(${users.username}) = ${normalized}`,
    )
    .limit(1);
  return rows.length === 0;
}

/**
 * Sanitize a candidate for programmatic assignment (sign-in defaults,
 * enrichment): lowercase, strip invalid characters, collapse separators,
 * trim separators, clamp length. Returns null when nothing usable remains.
 */
export function sanitizeUsername(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+/, "")
    .replace(/_+$/, "")
    .slice(0, USERNAME_MAX)
    .replace(/_+$/, "");
  if (base.length < USERNAME_MIN) return null;
  if (USERNAME_RESERVED.has(base)) return null;
  return base;
}

/**
 * Assign a unique username to a user, keeping their existing one if the
 * sanitized candidate collides (append a short id-based suffix).
 */
export async function ensureUsername(
  db: SentiselDb,
  userId: string,
  candidate: string | null | undefined,
): Promise<string> {
  const existing = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (existing[0]?.username) return existing[0].username;

  let wanted = sanitizeUsername(candidate) ?? `user${userId.replace(/-/g, "").slice(0, 8)}`;
  if (USERNAME_RESERVED.has(wanted)) wanted = `${wanted}_user`;
  let value = wanted;
  for (let n = 1; ; n++) {
    const free = await isUsernameAvailable(db, value);
    if (free) break;
    value = `${wanted.slice(0, 14)}_${userId.replace(/-/g, "").slice(0, 4)}${n}`;
  }
  await db.update(users).set({ username: value, updatedAt: new Date() }).where(eq(users.id, userId));
  return value;
}

/**
 * De-conflict a username BEFORE an insert (the column is NOT NULL and
 * case-insensitively unique). Returns a free handle derived from the
 * candidate, appending a short id-based suffix when taken.
 */
export async function pickUniqueUsername(
  db: SentiselDb,
  candidate: string,
): Promise<string> {
  let wanted = candidate;
  if (USERNAME_RESERVED.has(wanted)) wanted = `${wanted}_user`;
  let value = wanted;
  for (let n = 1; ; n++) {
    if (await isUsernameAvailable(db, value)) return value;
    value = `${wanted.slice(0, 16)}${n > 1 ? n : ""}`;
    if (n > 200) return `${wanted.slice(0, 10)}${Date.now().toString(36).slice(-6)}`;
  }
}

export type UsernameUpdateResult =
  | { ok: true; username: string }
  | { ok: false; reason: "invalid" | "reserved" | "taken" | "unavailable" };

/**
 * Atomic username change. Uniqueness is enforced by the database-level
 * unique index on lower(username); a concurrent claim that slips past the
 * availability check still fails here with a unique-violation.
 */
export async function changeUsername(
  db: SentiselDb,
  userId: string,
  raw: string,
): Promise<UsernameUpdateResult> {
  const check = validateUsername(raw);
  if (!check.ok) return { ok: false, reason: check.reason };
  const value = check.value;

  const free = await isUsernameAvailable(db, value, userId);
  if (!free) return { ok: false, reason: "taken" };

  try {
    const rows = await db
      .update(users)
      .set({ username: value, displayName: value, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ username: users.username });
    if (!rows[0]) return { ok: false, reason: "unavailable" };
    return { ok: true, username: rows[0].username };
  } catch (e) {
    // Postgres unique violation (23505): a concurrent claim won the race.
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "23505") {
      return { ok: false, reason: "taken" };
    }
    throw e;
  }
}
