import type { APIRequestContext, Page } from "@playwright/test";

/*
 * Shared e2e auth helper.
 *
 * Uses the DEV-ONLY Privy test-session minter (/api/auth/privy/test-session):
 * the server creates a real Privy user for the email via the official server
 * SDK and mints a REAL Privy access token; the token is then verified by
 * /api/auth/privy/session (real signature/issuer/audience/expiry checks) and
 * an internal HttpOnly session cookie is issued. This exercises the actual
 * production auth path — it is not a mock of the session layer.
 *
 * The minter is hard-disabled whenever NODE_ENV === "production".
 */

type Response = { status(): number; text(): Promise<string>; json(): Promise<unknown> };

async function expectStatus(res: Response, status: number, what: string): Promise<unknown> {
  if (res.status() !== status) {
    const body = await res.text().catch(() => "");
    throw new Error(`${what}: expected ${status}, got ${res.status()} — ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function privyTestSession(
  req: APIRequestContext,
  email: string,
): Promise<{ accessToken: string; did: string }> {
  const res = await req.post("/api/auth/privy/test-session", {
    headers: { "x-sentisel-test-secret": process.env.SENTISEL_TEST_SECRET ?? "e2e-test-secret" },
    data: { email },
  });
  return expectStatus(res, 200, "test-session mint") as Promise<{ accessToken: string; did: string }>;
}

export async function registerPrivySession(
  req: APIRequestContext,
  accessToken: string,
): Promise<{ action: string; next?: string; userId?: string }> {
  // Mirrors the production client: the browser posts BOTH the access token
  // (verification) and the identity token (server-side profile resolution).
  const res = await req.post("/api/auth/privy/session", {
    headers: { "x-sentisel-test-secret": process.env.SENTISEL_TEST_SECRET ?? "e2e-test-secret" },
    data: { accessToken, idToken: accessToken },
  });
  return expectStatus(res, 200, "privy session bridge") as Promise<{
    action: string;
    next?: string;
    userId?: string;
  }>;
}

/** Full signup+onboarding in one call: returns the created user id. */
export async function createAuthenticatedUser(req: APIRequestContext, email: string): Promise<string> {
  const { accessToken } = await privyTestSession(req, email);
  const session = await registerPrivySession(req, accessToken);
  const onboarding = await req.post("/api/onboarding", {
    data: {
      watchlistSymbols: ["BTC"],
      startingBalance: "100000",
      risk: { maxPositionPct: 20, maxDailyLossPct: 10, maxOpenPositions: 6, maxLeverageX: 5, maxConcentrationPct: 50 },
    },
  });
  await expectStatus(onboarding, 200, "onboarding");
  return session.userId!;
}

/** Bridge a Privy session into the BROWSER context (cookies land on the page). */
export async function bridgeSessionInBrowser(page: Page, email: string): Promise<string> {
  const { accessToken } = await privyTestSession(page.request, email);
  const res = await page.request.post("/api/auth/privy/session", {
    headers: { "x-sentisel-test-secret": process.env.SENTISEL_TEST_SECRET ?? "e2e-test-secret" },
    data: { accessToken, idToken: accessToken },
  });
  const body = (await expectStatus(res, 200, "privy session bridge")) as { userId?: string };
  return body.userId ?? "";
}
