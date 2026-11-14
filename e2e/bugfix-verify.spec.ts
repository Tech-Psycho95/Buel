import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { bridgeSessionInBrowser } from "./helpers/auth";

/*
 * Verification captures for the two visual-bug fixes:
 *   Bug 1 — council-map intelligence flow (judge/gate nodes + attached edges)
 *   Bug 2 — forensics showcase alignment + evidence-graph image 404
 * Includes scroll forward/backward stability, reload behavior, mobile
 * viewport, and a network check for failed showcase assets.
 */

test("bug-fix verification captures + asset checks", async ({ page }) => {
  fs.mkdirSync("design-caps", { recursive: true });

  const failedAssets: string[] = [];
  page.on("response", (res) => {
    if (res.status() >= 400 && res.url().includes("/showcases/")) {
      failedAssets.push(`${res.status()} ${res.url()}`);
    }
  });

  // ---------- Desktop: bridge a Privy session and land on command center ----------
  await page.setViewportSize({ width: 1440, height: 960 });
  const email = `bugfix-${Date.now()}@sentisel.test`;
  await bridgeSessionInBrowser(page, email);
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /enter command center/i }).click();
  await page.waitForURL("**/command-center");

  // ---------- BUG 1: council map on the landing ----------
  await page.goto("/");
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 4300));
  await page.waitForTimeout(1400); // draw-in + flow overlay settle
  await page.screenshot({ path: "design-caps/fix-01-council-map.png" });

  // Judge + gate nodes must exist in the rendered SVG.
  const judgeVisible = await page.locator('svg[aria-label="Agent council intelligence map"]').getByText("JUDGE").count();
  const gateVisible = await page.locator('svg[aria-label="Agent council intelligence map"]').getByText("GATE", { exact: true }).count();
  expect(judgeVisible).toBeGreaterThan(0);
  expect(gateVisible).toBeGreaterThan(0);

  // Scroll forward past it, then backward — the map must stay stable.
  await page.evaluate(() => window.scrollTo(0, 6200));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 4300));
  await page.waitForTimeout(800);
  await page.screenshot({ path: "design-caps/fix-02-council-map-backscroll.png" });
  await expect(page.locator('svg[aria-label="Agent council intelligence map"]').getByText("JUDGE").first()).toBeVisible();

  // ---------- BUG 2: forensics showcase + evidence-graph tile ----------
  await page.evaluate(() => window.scrollTo(0, 7300));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "design-caps/fix-03-showcase-top.png" });
  await page.evaluate(() => window.scrollTo(0, 8000));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "design-caps/fix-04-showcase-grid.png" });

  // The evidence-graph tile image must be present AND loaded (no 404).
  const evidenceImg = page.locator('img[src*="12-evidence-graph"]');
  await expect(evidenceImg).toHaveCount(1);
  const natural = await evidenceImg.evaluate((el: HTMLImageElement) => ({
    w: el.naturalWidth,
    h: el.naturalHeight,
    complete: el.complete,
  }));
  expect(natural.w).toBeGreaterThan(0); // loaded, not broken
  expect(natural.complete).toBe(true);

  // No failed showcase asset requests anywhere in this session.
  expect(failedAssets, `Failed showcase assets: ${failedAssets.join("; ")}`).toEqual([]);

  // ---------- Mobile ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.scrollTo(0, 4300));
  await page.waitForTimeout(1100);
  await page.screenshot({ path: "design-caps/fix-05-mobile-council-map.png" });
  await page.evaluate(() => window.scrollTo(0, 7600));
  await page.waitForTimeout(1100);
  await page.screenshot({ path: "design-caps/fix-06-mobile-showcase.png" });
});
