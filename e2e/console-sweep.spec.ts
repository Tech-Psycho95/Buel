import { test, expect } from "@playwright/test";
import { bridgeSessionInBrowser } from "./helpers/auth";

/*
 * Console-error sweep: visits every page as a signed-in user and fails on
 * real console errors (hydration problems, uncaught exceptions, failed
 * requests). Next dev overlay warnings about dev tooling are ignored.
 */

const PAGES = [
  ["/command-center", "Welcome back"],
  ["/market-pulse", "markets in universe"],
  ["/agent-council", "Run the council"],
  ["/decision-ledger", ""],
  ["/scenario-lab", "Build a counterfactual"],
  ["/strategy-arena", "Run the arena"],
  ["/paper-trading", "PAPER TRADING"],
  ["/portfolio-guardian", "Risk-limit evaluation"],
  ["/catalyst-intelligence", "Catalyst Intelligence"],
  ["/market-memory", "Find historical analogues"],
  ["/performance-lab", "Directional precision"],
  ["/evidence-graph", "Evidence Graph"],
  ["/forensics", "Analyze a Hyperliquid wallet"],
  ["/watchlists", "symbols"],
  ["/risk-preferences", "Simulated-trading risk limits"],
  ["/settings", "Profile"],
];

const PUBLIC_PAGES = [
  ["/", "Autonomous market intelligence"],
];

test("no console errors on any page", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (
        text.includes("favicon") ||
        text.includes("net::ERR") && text.includes("hyperliquid") ||
        text.includes("[fast-refresh]")
      )
        return;
      errors.push(`${msg.location().url}: ${text}`);
    }
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  // Bridge a Privy session into the browser context (real verification path).
  const email = `sweep-${Date.now()}@sentisel.test`;
  await bridgeSessionInBrowser(page, email);
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /enter command center/i }).click();
  await page.waitForURL("**/command-center");

  for (const [path, marker] of PAGES) {
    await page.goto(path);
    if (marker) await expect(page.getByText(marker).first()).toBeVisible({ timeout: 30_000 });
  }

  // Sign out, then verify public pages render clean too.
  await page.request.post("/api/auth/logout");
  for (const [path, marker] of PUBLIC_PAGES) {
    await page.goto(path);
    if (marker) await expect(page.getByText(marker).first()).toBeVisible({ timeout: 30_000 });
  }
  // /login was removed in the Privy migration — /auth renders either the
  // Privy sign-in button or the NEEDS CONFIGURATION panel (pre-credentials).
  await page.goto("/auth");
  await expect(
    page.getByRole("button", { name: /sign in to buel/i }).or(page.getByText("NEEDS CONFIGURATION")),
  ).toBeVisible({ timeout: 30_000 });

  expect(errors, `Console errors found:\n${errors.join("\n")}`).toEqual([]);
});
