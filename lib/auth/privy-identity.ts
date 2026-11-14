import { and, eq, sql } from "drizzle-orm";
import type { SentiselDb } from "@/lib/db/client";
import { privyIdentities, users, watchlists } from "@/lib/db/schema";
import { pickUniqueUsername, sanitizeUsername } from "@/lib/auth/username";
import type { PrivyUserProfile } from "@/lib/auth/privy-server";

/*
 * Privy identity resolution + legacy account claim (PHASE 4 + 5).
 *
 * Invariants:
 *  - The internal users.id is the SOLE ownership key. A Privy DID is only a
 *    pointer to it. Email/wallet strings are never ownership keys.
 *  - Identity is established server-side from a Privy-verified DID — never
 *    from any client-supplied user id, email, or wallet string.
 *  - Legacy accounts (pre-Privy) are NEVER auto-merged by email match: the
 *    previous system did not verify email ownership. Claiming requires
 *    proof of the previous account (one-time legacy-password verification)
 *    performed server-side against the stored scrypt hash.
 *  - Every resolution writes/refreshes last_authenticated_at for audit.
 */

export type ResolveResult =
  | {
      action: "authenticated";
      userId: string;
      isNew: boolean;
      email: string | null;
    }
  | {
      action: "needs_legacy_claim";
      legacyEmail: string;
      legacyUserId: string;
    }
  | {
      action: "legacy_claim_failed";
      legacyEmail: string;
      legacyUserId: string;
      reason: "invalid_password";
    };

export type PrivyVerifier = {
  /** Verify an access token and return the Privy DID. Throws on any failure. */
  verify(accessToken: string): Promise<{ did: string }>;
  /** Resolve the verified Privy profile from an ID token (may be absent for wallet-only logins). */
  profile(idToken: string | null): Promise<PrivyUserProfile | null>;
  /** Resolve the verified Privy profile directly from the DID (server-side getUser). Optional. */
  profileFromDid?(did: string): Promise<PrivyUserProfile | null>;
};

export async function resolvePrivyIdentity(
  db: SentiselDb,
  verifier: PrivyVerifier,
  params: { accessToken: string; idToken?: string | null; legacyPassword?: string | null },
): Promise<ResolveResult> {
  const { did } = await verifier.verify(params.accessToken);

  // 1) Existing mapping -> authenticate the corresponding internal user.
  const existing = await db
    .select()
    .from(privyIdentities)
    .where(eq(privyIdentities.privyDid, did))
    .limit(1);
  if (existing[0]) {
    await db
      .update(privyIdentities)
      .set({ lastAuthenticatedAt: new Date() })
      .where(eq(privyIdentities.id, existing[0].id));
    const u = (
      await db.select().from(users).where(eq(users.id, existing[0].userId)).limit(1)
    )[0];
    // Self-healing enrichment: accounts created before the verified profile
    // was available carry a placeholder email; resolve the real one from the
    // DID now that we can (never overwrites a real email).
    let email = u.email;
    if (email?.endsWith("@privy.local") && verifier.profileFromDid) {
      const healed = await verifier.profileFromDid(did);
      if (healed?.email) {
        email = healed.email;
        await db
          .update(users)
          .set({
            email: healed.email,
            displayName: healed.email.split("@")[0]?.slice(0, 60) || u.displayName,
          })
          .where(eq(users.id, u.id));
        const healedName = sanitizeUsername(healed.email.split("@")[0]);
        if (healedName) {
          await db
            .update(users)
            .set({ username: healedName })
            .where(and(eq(users.id, u.id), sql`lower(${users.username}) <> ${healedName}`));
        }
      }
    }
    return {
      action: "authenticated",
      userId: u.id,
      isNew: false,
      email,
    };
  }

  // 2) No mapping -> resolve the Privy profile server-side (never trust the client).
  //    Wallet-only logins may carry no id token -> null profile -> fresh user.
  const profile =
    (params.idToken ? await verifier.profile(params.idToken) : null) ??
    (verifier.profileFromDid ? await verifier.profileFromDid(did) : null);

  // 3) Legacy account with the SAME email? Never auto-merge — require the
  //    one-time legacy-password proof (the old system never verified emails).
  //    Wallet-only logins (no id token / no email) always take the fresh path.
  if (profile?.email) {
    const legacy = (
      await db
        .select()
        .from(users)
        .where(eq(users.email, profile.email))
        .limit(1)
    )[0];
    if (legacy) {
      if (params.legacyPassword) {
        const { verifyPassword } = await import("./password");
        const ok = await verifyPassword(params.legacyPassword, legacy.passwordHash);
        if (ok) {
          // Claim verified: attach the Privy DID to the existing internal user.
          await db.insert(privyIdentities).values({
            userId: legacy.id,
            privyDid: did,
            metadata: { email: profile?.email ?? null, loginMethod: "privy", walletAddress: profile?.walletAddress ?? null },
          });
          return {
            action: "authenticated",
            userId: legacy.id,
            isNew: false,
            email: legacy.email,
          };
        }
        return {
          action: "legacy_claim_failed",
          legacyEmail: legacy.email,
          legacyUserId: legacy.id,
          reason: "invalid_password",
        };
      }
      return {
        action: "needs_legacy_claim",
        legacyEmail: legacy.email,
        legacyUserId: legacy.id,
      };
    }
  }

  // 4) Genuinely new user: fresh internal account + mapping. Product data
  //    starts empty; no legacy data can be attached to a fresh id by accident.
  // Username (NOT NULL, case-insensitively unique): derived from the verified
  // email, de-conflicted before insert.
  const usernameValue = await pickUniqueUsername(
    db,
    sanitizeUsername(profile?.email?.split("@")[0]) ?? `user${did.replace(/[^a-z0-9]/gi, "").slice(0, 10).toLowerCase()}`,
  );
  const created = (
    await db
      .insert(users)
      .values({
        email: profile?.email ?? `${did.replace(/[^a-zA-Z0-9]/g, "")}@privy.local`,
        // Privy accounts have no password: self-describing placeholder hash
        // that can never verify (scrypt output format required by the column).
        passwordHash: "privy$no-password",
        displayName: profile?.email?.split("@")[0]?.slice(0, 60) || "Privy user",
        username: usernameValue,
        onboardedAt: null,
      })
      .returning({ id: users.id, email: users.email })
  )[0];

  // Default watchlist — the previous signup flow created one for every new
  // account; keep that contract so Watchlists/onboarding behave identically.
  await db
    .insert(watchlists)
    .values({ userId: created.id, name: "Main", isDefault: true });

  await db.insert(privyIdentities).values({
    userId: created.id,
    privyDid: did,
    metadata: { email: profile?.email ?? null, loginMethod: "privy", walletAddress: profile?.walletAddress ?? null },
  });

  return { action: "authenticated", userId: created.id, isNew: true, email: created.email };
}

/** Attach a Privy DID to an internal user after server-side verification. */
export async function linkPrivyIdentity(
  db: SentiselDb,
  did: string,
  userId: string,
  metadata?: { email?: string | null; loginMethod?: string | null; walletAddress?: string | null },
): Promise<void> {
  const existing = await db
    .select()
    .from(privyIdentities)
    .where(eq(privyIdentities.privyDid, did))
    .limit(1);
  if (existing[0]) {
    if (existing[0].userId !== userId) {
      throw new Error("Privy identity is already linked to a different internal user");
    }
    return;
  }
  await db.insert(privyIdentities).values({
    userId,
    privyDid: did,
    metadata: metadata ?? null,
  });
}

/** Live lookup used by tests and the session route. */
export async function getUserIdForDid(
  db: SentiselDb,
  did: string,
): Promise<string | null> {
  const rows = await db
    .select({ userId: privyIdentities.userId })
    .from(privyIdentities)
    .where(and(eq(privyIdentities.privyDid, did)))
    .limit(1);
  return rows[0]?.userId ?? null;
}
