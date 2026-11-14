import { test, expect } from "@playwright/test";

/*
 * Sign-in / sign-out cycle (production parity):
 * sign in -> new user lands on onboarding -> onboards -> session persists on
 * refresh -> sign out -> protected pages redirect and the signed-out notice
 * shows exactly once -> sign in again -> same account, straight to the app.
 * Privy Google/email flows themselves require a real browser + inbox; the
 * bridge exercises the identical server-side session machinery.
 */

const email = () => `cycle-${Date.now()}@sentisel.test`;

async function signIn(page: import("@playwright/test").Page, emailAddr: string) {
  const mint = await page.request.post("/api/auth/privy/test-session", {
    headers: { "x-sentisel-test-secret": "e2e-test-secret" },
    data: { email: emailAddr },
  });
  expect(mint.ok()).toBeTruthy();
  const body = await mint.json();
  const reg = await page.request.post("/api/auth/privy/session", {
    headers: { "x-sentisel-test-secret": "e2e-test-secret" },
    data: { accessToken: body.accessToken, idToken: body.accessToken },
  });
  expect(reg.ok()).toBeTruthy();
  return (await reg.json()) as { action: string; next?: string; userId?: string };
}

async function onboard(page: import("@playwright/test").Page) {
  const res = await page.request.post("/api/onboarding", {
    headers: { Origin: "http://localhost:3111" },
    data: { watchlistSymbols: ["BTC"], startingBalance: "100000",
      risk: { maxPositionPct: 20, maxDailyLossPct: 10, maxOpenPositions: 6, maxLeverageX: 5, maxConcentrationPct: 50 } },
  });
  expect(res.ok()).toBeTruthy();
}

test("sign-in / sign-out cycle", async ({ page }) => {
  const emailAddr = email();

  // 1. Sign in — a NEW user is told to onboard
  const first = await signIn(page, emailAddr);
  expect(first.action).toBe("authenticated");
  expect(first.next).toBe("/onboarding");
  await page.goto("/command-center");
  await page.waitForURL("**/onboarding", { timeout: 30000 });
  await expect(page.getByText(/BUEL onboarding/i)).toBeVisible();

  // 2. Complete onboarding -> authenticated Command Center
  await onboard(page);
  await page.goto("/command-center");
  await expect(page.getByText(/Welcome back/)).toBeVisible({ timeout: 30000 });

  // 3. Session survives a refresh
  await page.reload();
  await expect(page.getByText(/Welcome back/)).toBeVisible({ timeout: 30000 });

  // 4. Sign out via the app UI -> /auth?loggedOut=1. The flag is consumed and
  //    stripped from the URL immediately, so a Privy OAuth reload can never
  //    re-arm the cleanup.
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/auth?loggedOut=1");
  await expect(page.getByText(/Signed out\. Your Privy session/)).toBeVisible();
  await expect(page).toHaveURL(/\/auth$/); // loggedOut=1 stripped before any reload

  // 5. Protected page now redirects to sign-in
  await page.goto("/command-center");
  await page.waitForURL("**/auth**");
  await expect(page).toHaveURL(/auth/);

  // 6. The signed-out notice is NOT stale on this fresh visit
  await expect(page.getByText(/Signed out\. Your Privy session/)).toHaveCount(0);

  // 7. The server session is really gone
  const session = await page.request.get("/api/auth/session");
  expect(session.status()).toBe(401);

  // 8. Reloading the sign-in page stays signed out and does not resurrect the
  //    notice
  await page.goto("/auth");
  await page.waitForURL("**/auth**");
  await page.reload();
  await expect(page.getByText(/Signed out\. Your Privy session/)).toHaveCount(0);
  expect((await page.request.get("/api/auth/session")).status()).toBe(401);

  // 9. Sign in again — SAME account, straight to the app (no onboarding)
  const again = await signIn(page, emailAddr);
  expect(again.action).toBe("authenticated");
  expect(again.next).toBe("/command-center");
  await page.goto("/command-center");
  await expect(page.getByText(/Welcome back/)).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Signed out\. Your Privy session/)).toHaveCount(0);

  // 10. The notice does not follow the user back to /auth either (an
  //     authenticated visitor is redirected into the app)
  await page.goto("/auth");
  await page.waitForURL("**/command-center");
  await expect(page.getByText(/Signed out\. Your Privy session/)).toHaveCount(0);
});
