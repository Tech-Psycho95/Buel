import { createHash } from "node:crypto";
import { PrivyClient } from "@privy-io/server-auth";
import type { PrivyVerifier } from "@/lib/auth/privy-identity";

/*
 * Privy server adapter — the ONLY place the Privy server SDK is used.
 *
 * Configuration (server-side only, never exposed to the browser):
 *   PRIVY_APP_ID      — from dashboard.privy.io
 *   PRIVY_APP_SECRET  — from dashboard.privy.io (sensitive)
 *
 * When either is unset the adapter reports unconfigured and every Privy
 * endpoint answers with a clear NEEDS CONFIGURATION error — the app never
 * falls back to the legacy password login.
 *
 * Token verification uses the official `verifyAuthToken` (signature, issuer,
 * audience = this app, expiry) and returns the Privy DID.
 */

export type PrivyVerification = { did: string };
export type PrivyUserProfile = {
  did: string;
  email: string | null;
  walletAddress: string | null;
};

let client: PrivyClient | null = null;

/**
 * The Privy App ID is a public value (the browser bundle embeds it as
 * NEXT_PUBLIC_PRIVY_APP_ID), so the server accepts either variable name —
 * deployments only need to configure the ID once.
 */
function serverAppId(): string | undefined {
  return process.env.PRIVY_APP_ID?.trim() || process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
}

export function privyConfigured(): boolean {
  return Boolean(serverAppId() && process.env.PRIVY_APP_SECRET?.trim());
}

function getClient(): PrivyClient {
  if (!client) {
    const appId = serverAppId();
    const appSecret = process.env.PRIVY_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      const err = new Error(
        "Privy is not configured. Set PRIVY_APP_SECRET and the Privy App ID (PRIVY_APP_ID or NEXT_PUBLIC_PRIVY_APP_ID).",
      ) as Error & { code?: string };
      err.code = "PRIVY_NOT_CONFIGURED";
      throw err;
    }
    client = new PrivyClient(appId, appSecret);
  }
  return client;
}

export class PrivyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 500,
  ) {
    super(message);
    this.name = "PrivyError";
  }
}

/** Verify a Privy access token (signature, issuer, audience, expiry). */
export async function verifyPrivyToken(accessToken: string): Promise<PrivyVerification> {
  if (!accessToken || typeof accessToken !== "string" || accessToken.length < 20) {
    throw new PrivyError("Missing or malformed access token", "invalid_token", 401);
  }
  try {
    const claims = await getClient().verifyAuthToken(accessToken);
    if (!claims?.userId) {
      throw new PrivyError("Privy token verification returned no identity", "invalid_token", 401);
    }
    return { did: claims.userId };
  } catch (e) {
    if (e instanceof PrivyError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    // Privy SDK raises on expired/invalid signatures — surface as 401, never 500.
    throw new PrivyError(
      `Privy token rejected: ${msg}`,
      msg.toLowerCase().includes("expired") ? "token_expired" : "invalid_token",
      401,
    );
  }
}

/**
 * Resolve the verified Privy user profile (email / wallet) from an ID TOKEN
 * via the official server SDK `getUser({ idToken })` — the idToken itself is
 * a signed JWT, so this call is server-verified, never client-trusted.
 */
/**
 * Resolve the Privy profile by the VERIFIED DID (server-side getUser). Used
 * when the client identity token is unavailable — the DID itself comes from
 * the verified access token, so nothing client-supplied is trusted.
 */
/**
 * Extract the best email from a Privy user across ALL linked account types:
 * the email lives in `.address` for email accounts but in `.email` for
 * OAuth accounts (Google), so a single-field read misses real sign-ins.
 */
function resolveUserEmail(user: {
  email?: { address?: string } | null;
  linkedAccounts?: unknown;
}): string | null {
  if (user.email?.address) return user.email.address;
  const accounts = (user.linkedAccounts ?? []) as Array<{
    type?: string;
    address?: string;
    email?: string;
  }>;
  const google = accounts.find((a) => a.type === "google_oauth");
  return google?.email ?? google?.address ?? null;
}

export async function getPrivyUserByDid(
  did: string,
): Promise<PrivyUserProfile | null> {
  try {
    const user = await getClient().getUser(did);
    return { did: user.id, email: resolveUserEmail(user), walletAddress: user.wallet?.address ?? null };
  } catch {
    // Unknown DID / fetch failure — treat as no profile.
    return null;
  }
}

export async function getPrivyUserByIdToken(
  idToken: string,
): Promise<PrivyUserProfile> {
  if (!idToken || typeof idToken !== "string") {
    throw new PrivyError("Missing id token for profile resolution", "invalid_token", 401);
  }
  const user = await getClient().getUser({ idToken });
  return { did: user.id, email: resolveUserEmail(user), walletAddress: user.wallet?.address ?? null };
}

/**
 * DEV/TEST ONLY: mint a real Privy access token bound to an email via the
 * official `getTestAccessToken` (Privy Client test feature). Never enabled in
 * production code paths.
 */
export async function mintTestAccessToken(
  email: string,
): Promise<{ token: string }> {
  const res = await getClient().getTestAccessToken({ email });
  return { token: res.accessToken };
}

/* ---------------------------------------------------------------------------
 * DEV/TEST-ONLY fallback verifier.
 *
 * Before Privy credentials are configured, automated tests must still be able
 * to exercise the full identity-resolution + session-bridge path. This
 * verifier accepts self-describing `dev-test:<email>` tokens minted by the
 * dev-only test-session route. It is HARD-DISABLED in production:
 *  - devTestSecretValid() returns false whenever NODE_ENV === "production"
 *  - the shared secret (SENTISEL_TEST_SECRET) must be set server-side AND
 *    supplied by the caller
 *  - the real verifier below never sees these tokens (and Privy would
 *    reject them anyway)
 * ------------------------------------------------------------------------- */

const DEV_TEST_PREFIX = "dev-test:";

export function devTestSecretValid(provided: string | null): boolean {
  const expected = process.env.SENTISEL_TEST_SECRET?.trim();
  return (
    process.env.NODE_ENV !== "production" &&
    Boolean(expected) &&
    provided !== null &&
    provided === expected
  );
}

function devTestDid(email: string): string {
  return `did:privy:dev-${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;
}

function parseDevTestToken(token: string): string | null {
  if (!token.startsWith(DEV_TEST_PREFIX)) return null;
  const email = token.slice(DEV_TEST_PREFIX.length).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function devTestVerifier(): PrivyVerifier {
  return {
    async verify(accessToken: string) {
      // Defense in depth: this verifier must NEVER run in production, even if
      // a routing bug elsewhere selects it. Real tokens are therefore always
      // verified by the official Privy SDK.
      if (process.env.NODE_ENV === "production") {
        throw new PrivyError(
          "Dev verification is disabled in production",
          "dev_verifier_disabled",
          403,
        );
      }
      const email = parseDevTestToken(accessToken);
      if (!email) {
        throw new PrivyError("Invalid dev test token", "invalid_token", 401);
      }
      return { did: devTestDid(email) };
    },
    async profile(idToken: string | null) {
      if (process.env.NODE_ENV === "production") return null;
      if (!idToken) return null;
      const email = parseDevTestToken(idToken);
      if (!email) return null;
      return { did: devTestDid(email), email, walletAddress: null };
    },
  };
}
