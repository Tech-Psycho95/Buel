import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { validateOrigin, allowMissingOrigin } from "@/lib/http/origin";
import { rateLimit, clientIdentity } from "@/lib/http/rate-limit";
import { ok, err, tooMany, handleError } from "@/lib/http/respond";
import {
  verifyPrivyToken,
  getPrivyUserByIdToken,
  getPrivyUserByDid,
  privyConfigured,
  devTestVerifier,
  devTestSecretValid,
  PrivyError,
} from "@/lib/auth/privy-server";
import { resolvePrivyIdentity } from "@/lib/auth/privy-identity";
import { startSessionCookie } from "@/lib/auth/session-cookies";

/*
 * Privy session bridge (PHASE 6).
 *
 * The client completes Privy authentication (email OTP / Google / wallet /
 * passkey) and posts the Privy access token here. The server verifies the
 * token (signature, issuer, audience, expiry) via the official server SDK,
 * resolves the verified Privy DID to the internal BUEL user (existing
 * mapping, verified legacy claim, or fresh account), and issues the
 * internal HttpOnly session cookie. Privy secrets never reach the browser.
 */

const sessionSchema = z.object({
  accessToken: z.string().min(10).max(8192),
  idToken: z.string().min(10).max(8192).optional().nullable(),
  legacyPassword: z.string().min(1).max(200).optional().nullable(),
});

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    validateOrigin(req.headers, { allowMissingOrigin: allowMissingOrigin() });
    const db = await getDb();

    // Rate limit per client IP before any Privy call (limits upstream cost).
    const rl = await rateLimit(
      db,
      "auth:privy:session",
      clientIdentity(req.headers),
      60,
      15 * 60 * 1000,
    );
    if (!rl.allowed) return tooMany(rl);

    const input = sessionSchema.parse(await req.json());

    // Verifier selection. Real Privy tokens always go through the official
    // SDK verification. Self-describing dev-test tokens (minted by the
    // dev-only test-session route) route to the dev fallback verifier —
    // hard-disabled in production and gated on the shared test secret.
    const isProduction = process.env.NODE_ENV === "production";
    const isDevTestToken = input.accessToken.startsWith("dev-test:");
    // The dev fallback verifier can only be selected outside production, for
    // an explicitly dev-formatted token, with the shared test secret. Real
    // tokens in production ALWAYS go through the official Privy SDK.
    const useDevVerifier =
      !isProduction && isDevTestToken && devTestSecretValid(req.headers.get("x-sentisel-test-secret"));
    if (isDevTestToken && !useDevVerifier) {
      return err(401, "invalid_token", "Invalid token.");
    }
    if (!isDevTestToken && !privyConfigured()) {
      return err(
        503,
        "privy_not_configured",
        "Privy is not configured. Set PRIVY_APP_ID and PRIVY_APP_SECRET (see the /auth page).",
      );
    }

    let identity;
    try {
      identity = await resolvePrivyIdentity(
        db,
        useDevVerifier ? devTestVerifier() : privyVerifier(),
        {
          accessToken: input.accessToken,
          idToken: input.idToken ?? null,
          legacyPassword: input.legacyPassword ?? null,
        },
      );
    } catch (e) {
      if (e instanceof PrivyError) {
        return err(e.status, e.code, e.message);
      }
      throw e;
    }

    if (identity.action === "needs_legacy_claim") {
      // Existing pre-Privy account with the same email. Never auto-merge:
      // require the one-time legacy-password proof (verified server-side).
      return ok({
        action: "needs_legacy_claim",
        legacyEmail: identity.legacyEmail,
        hint:
          "An existing BUEL account uses this email. Enter your previous password once to " +
          "restore your data, or continue with a new empty account.",
      });
    }

    if (identity.action === "legacy_claim_failed") {
      return err(
        401,
        "legacy_claim_failed",
        "That password does not match the existing account for this email. Try again, or continue with a new account.",
      );
    }

    // authenticated -> issue the internal HttpOnly session cookie
    await startSessionCookie(identity.userId);

    return ok({
      action: "authenticated",
      userId: identity.userId,
      isNew: identity.isNew,
      next: identity.isNew ? "/onboarding" : "/command-center",
    });
  } catch (e) {
    return handleError(e);
  }
}

/** Verifier bound to the official server SDK (verify + profile + DID lookup). */
function privyVerifier() {
  // Lazy import keeps the module graph identical to the adapter file.
  return {
    verify: async (accessToken: string) => await verifyPrivyToken(accessToken),
    profile: async (idToken: string | null) =>
      idToken ? await getPrivyUserByIdToken(idToken) : null,
    profileFromDid: async (did: string) => await getPrivyUserByDid(did),
  };
}
