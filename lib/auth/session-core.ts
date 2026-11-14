import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { SentiselDb } from "@/lib/db/client";
import { hashToken, generateToken, newId } from "./password";
import { sessions, passwordResets, users } from "@/lib/db/schema";

/*
 * Session and reset-token core — pure database operations, no request glue, so
 * they are directly unit/integration-testable. Cookie wiring lives in
 * lib/auth/session-cookies.ts.
 */

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, sliding
export const RESET_TTL_MS = 15 * 60 * 1000; // 15 minutes, single-use

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  username: string;
  onboardedAt: Date | null;
};

export async function createSession(
  db: SentiselDb,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: newId(),
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

/**
 * Resolve a raw session token to its user. Sliding expiry: each successful
 * resolution extends the session's lifetime (never shortens it).
 */
export async function resolveSession(
  db: SentiselDb,
  token: string,
): Promise<SessionUser | null> {
  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      username: users.username,
      onboardedAt: users.onboardedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const newExpiry = new Date(Date.now() + SESSION_TTL_MS);
  if (newExpiry.getTime() > row.expiresAt.getTime() + 60 * 60 * 1000) {
    // Refresh at most once per hour to keep write volume low.
    await db
      .update(sessions)
      .set({ expiresAt: newExpiry, lastSeenAt: new Date() })
      .where(eq(sessions.id, row.sessionId));
  } else {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.sessionId));
  }

  return {
    id: row.userId,
    email: row.email,
    displayName: row.displayName,
    username: row.username,
    onboardedAt: row.onboardedAt,
  };
}

export async function revokeSession(db: SentiselDb, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function revokeAllUserSessions(db: SentiselDb, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Revoke every session EXCEPT the provided token (used on password change). */
export async function revokeOtherUserSessions(
  db: SentiselDb,
  userId: string,
  keepToken?: string,
): Promise<void> {
  if (!keepToken) return revokeAllUserSessions(db, userId);
  const keepHash = hashToken(keepToken);
  const all = await db.select({ id: sessions.id, tokenHash: sessions.tokenHash }).from(sessions).where(eq(sessions.userId, userId));
  for (const s of all) {
    if (s.tokenHash !== keepHash) {
      await db.delete(sessions).where(eq(sessions.id, s.id));
    }
  }
}

/** Purge expired sessions (call opportunistically; cheap on indexed expiry). */
export async function purgeExpiredSessions(db: SentiselDb): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

// ---------------------------------------------------------------------------
// Password reset tokens: hashed at rest, short-lived, single-use.
// ---------------------------------------------------------------------------

export async function createResetToken(
  db: SentiselDb,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  // Invalidate outstanding tokens — only the newest may be consumed.
  await db.delete(passwordResets).where(eq(passwordResets.userId, userId));
  const token = generateToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db.insert(passwordResets).values({
    id: newId(),
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

/**
 * Consume a reset token exactly once. Returns the userId on success.
 * A used or expired token is rejected (and cleaned up).
 */
export async function consumeResetToken(
  db: SentiselDb,
  token: string,
): Promise<string | null> {
  const tokenHash = hashToken(token);
  const rows = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.tokenHash, tokenHash), gt(passwordResets.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || row.usedAt) return null;

  // Single-use: atomically mark consumed only if not already used.
  // (NULL usedAt = unconsumed; SQL `NULL < epoch` would never match, so this
  // must be isNull(), not a comparison against epoch zero.)
  const updated = await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.id, row.id), isNull(passwordResets.usedAt)))
    .returning({ id: passwordResets.id });
  if (updated.length === 0) return null; // raced by another consumer

  return row.userId;
}
