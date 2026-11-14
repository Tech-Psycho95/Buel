import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { mintTestAccessToken, privyConfigured } from "@/lib/auth/privy-server";
import { rateLimit, clientIdentity } from "@/lib/http/rate-limit";
import { ok, err, tooMany, handleError } from "@/lib/http/respond";

/*
 * DEV/TEST-ONLY Privy session minter.
 *
 * With Privy credentials configured it creates (or reuses) a Privy user for
 * an email via the official server SDK and mints a REAL Privy access token,
 * so automated tests exercise the true verification + identity-resolution
 * path end to end without an inbox.
 *
 * Without Privy credentials (pre-configuration development) it returns a
 * self-describing `dev-test:<email>` token consumed by the dev-only fallback
 * verifier in the session bridge — the identity resolution, session and
 * scoping layers are still fully exercised.
 *
 * Hard guards (both paths):
 *  - refuses whenever NODE_ENV === "production"
 *  - requires SENTISEL_TEST_SECRET to be set AND to match the request header
 *  - the same secret pattern is used by no production code path
 */

const testSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return err(404, "not_found", "Not available.");
    }
    const expected = process.env.SENTISEL_TEST_SECRET?.trim();
    if (!expected) {
      return err(404, "not_found", "Not available.");
    }
    const provided = req.headers.get("x-sentisel-test-secret");
    if (!provided || provided !== expected) {
      return err(401, "unauthorized", "Invalid test secret.");
    }

    const db = await getDb();
    const rl = await rateLimit(
      db,
      "auth:test-session",
      clientIdentity(req.headers),
      30,
      15 * 60 * 1000,
    );
    if (!rl.allowed) return tooMany(rl);

    const input = testSchema.parse(await req.json());
    if (privyConfigured()) {
      try {
        const { token } = await mintTestAccessToken(input.email);
        return ok({ accessToken: token });
      } catch (mintError) {
        // Privy apps without test credentials enabled refuse getTestAccessToken
        // — fall back to the dev-token path so the suite still exercises the
        // bridge, identity resolution and session layers (dev only: this whole
        // route refuses production above).
        const msg = mintError instanceof Error ? mintError.message : String(mintError);
        if (!/test credential/i.test(msg)) throw mintError;
      }
    }
    return ok({ accessToken: `dev-test:${input.email}` });
  } catch (e) {
    return handleError(e);
  }
}
