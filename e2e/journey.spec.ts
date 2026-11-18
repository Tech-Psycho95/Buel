import { test, expect } from "@playwright/test";
import { bridgeSessionInBrowser, privyTestSession, registerPrivySession } from "./helpers/auth";

/*
 * Full deterministic demo journey:
 * landing → signup → onboarding → command center (16 nav) → market pulse →
 * agent council run → decision ledger → paper trade → guardian → forensics →
 * watchlists → risk → settings → logout → login again.
 */

const uniqueEmail = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@sentisel.test`;
const PASSWORD = "paper-trading-password";

test("complete user journey", async ({ page }) => {
  const email = uniqueEmail();

  // ---------- Landing ----------
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /intelligence beyond/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /get started/i }).first()).toBeVisible();

  // ---------- Signup (Privy session bridge, DEV-ONLY minter) ----------
  // Bridge only — onboarding itself is exercised through the UI below.
  await bridgeSessionInBrowser(page, email);
  await page.goto("/onboarding");

  // ---------- Onboarding ----------
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /enter command center/i }).click();
  await page.waitForURL("**/command-center");

  // ---------- All 16 destinations visible in the authenticated nav ----------
  const navLabels = [
    "Command Center", "Live Market Pulse", "Agent Council", "Decision Ledger",
    "Scenario Lab", "Strategy Arena", "Paper Trading", "Portfolio Guardian",
    "Catalyst Intelligence", "Market Memory", "Performance Lab", "Evidence Graph",
    "Wallet Forensics", "Watchlists", "Risk Preferences", "Settings / Profile",
  ];
  for (const label of navLabels) {
    await expect(page.locator("nav").getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("DEMO DATA").first()).toBeVisible();

  // ---------- Market Pulse ----------
  await page.locator("nav").getByText("Live Market Pulse").click();
  await expect(page.getByText("markets in universe")).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder("Search symbol…").fill("BTC");
  await expect(page.locator("table").getByText("BTC", { exact: true }).first()).toBeVisible();

  // ---------- Agent Council: run a gated decision ----------
  await page.locator("nav").getByText("Agent Council").click();
  await expect(page.getByRole("heading", { name: "Run the council" })).toBeVisible();
  await page.getByRole("button", { name: /run council/i }).click();
  await expect(page.getByText("Signal Quality Gate")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("text=/LONG|SHORT|NO TRADE|ABSTAIN/").first()).toBeVisible();
  await expect(page.getByText("Red-Team challenge")).toBeVisible();

  // ---------- Decision Ledger with replay ----------
  await page.locator("nav").getByText("Decision Ledger").click();
  await expect(page.getByRole("button", { name: "replay" }).first()).toBeVisible();
  await page.getByRole("button", { name: "replay" }).first().click();
  await expect(page.getByText(/Rendered from the immutable stored snapshot/i)).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();

  // ---------- Paper Trading: place a simulated order ----------
  await page.locator("nav").getByText("Paper Trading").click();
  await expect(page.getByText("PAPER TRADING — every balance")).toBeVisible();
  await page.getByLabel("Symbol").fill("BTC");
  await page.getByLabel("Quantity").fill("0.05");
  await page.getByRole("button", { name: /simulate entry/i }).click();
  await expect(page.getByText(/Filled long/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Open positions (simulated)")).toBeVisible();
  await expect(page.locator("table").getByText("BTC").first()).toBeVisible();

  // ---------- Portfolio Guardian reflects the position ----------
  await page.locator("nav").getByText("Portfolio Guardian").click();
  await expect(page.getByRole("heading", { name: /Risk-limit evaluation/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Order size limit|Leverage utilization/).first()).toBeVisible();
  await expect(page.getByText("1 open position(s) after this order; limit 6.")).toBeVisible();

  // ---------- Scenario Lab ----------
  await page.locator("nav").getByText("Scenario Lab").click();
  await page.getByRole("button", { name: /run scenario/i }).click();
  await expect(page.getByText("What changed")).toBeVisible({ timeout: 60_000 });

  // ---------- Strategy Arena ----------
  await page.locator("nav").getByText("Strategy Arena").click();
  await page.getByRole("button", { name: /run backtests/i }).click();
  await expect(page.getByText("Backtest assumptions & limitations")).toBeVisible({ timeout: 90_000 });

  // ---------- Wallet Forensics ----------
  await page.locator("nav").getByText("Wallet Forensics").click();
  await page.getByLabel("Hyperliquid address").fill("0xc0ffee0000000000000000000000000000000002");
  await page.getByRole("button", { name: /run forensics/i }).click();
  await expect(page.getByRole("heading", { name: "The autopsy" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Data Coverage & exclusions")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accounting separation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Post-Loss Size Escalation" })).toBeVisible();

  // Forensics follow-up chat (deterministic answers)
  await page.getByLabel("Chat message").fill("How much did fees cost?");
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.getByText(/Signed fee total/i).first()).toBeVisible({ timeout: 30_000 });

  // ---------- Watchlists ----------
  await page.locator("nav").getByText("Watchlists").click();
  await page.getByLabel("Symbol to add").fill("LINK");
  await page.getByRole("button", { name: /add/i }).click();
  await expect(page.locator("table").getByText("LINK")).toBeVisible();

  // ---------- Risk Preferences ----------
  await page.locator("nav").getByText("Risk Preferences").click();
  await page.getByRole("button", { name: /save limits/i }).click();
  await expect(page.getByText(/Limits saved/i)).toBeVisible();

  // ---------- Performance Lab + Evidence Graph + Memory + Catalysts ----------
  await page.locator("nav").getByText("Performance Lab").click();
  await expect(page.getByText("Method & limitations")).toBeVisible({ timeout: 30_000 });
  await page.locator("nav").getByText("Evidence Graph").click();
  await expect(page.getByText("Select a decision")).toBeVisible();
  await page.locator("nav").getByText("Market Memory").click();
  await expect(page.getByRole("heading", { name: "Nearest historical analogues" })).toBeVisible({ timeout: 60_000 });
  await page.locator("nav").getByText("Catalyst Intelligence").click();
  await expect(page.getByText(/labeled demo fixture/i).first()).toBeVisible({ timeout: 30_000 });

  // ---------- Settings + logout ----------
  await page.locator("nav").getByText("Settings / Profile").click();
  await expect(page.getByText("Username", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /change username/i })).toBeVisible();
  await page.getByRole("button", { name: /sign out of this device/i }).click();
  // Sign-out lands on /auth (the loggedOut flag is consumed and stripped there)
  await page.waitForURL("**/auth**");

  // ---------- Login again (Privy re-bridge → SAME internal user) ----------
  const again = await privyTestSession(page.request, email);
  const reauth = await registerPrivySession(page.request, again.accessToken);
  expect(reauth.action).toBe("authenticated");

  await page.goto("/command-center");
  await expect(page.getByText(/Welcome back, e2e-/i)).toBeVisible();
  // Session persists into a fresh page load (server-side session).
  await page.goto("/paper-trading");
  await expect(page.getByText("PAPER TRADING — every balance")).toBeVisible();
});
