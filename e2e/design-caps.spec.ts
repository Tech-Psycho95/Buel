import { test } from "@playwright/test";
import fs from "node:fs";
import { bridgeSessionInBrowser } from "./helpers/auth";

/*
 * Design-verification captures: sign up, walk the key routes, save PNGs for
 * visual inspection. Excluded from the journey; run via `npx playwright test design-caps`.
 */

test("capture design screenshots", async ({ page }) => {
  fs.mkdirSync("design-caps", { recursive: true });

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");
  await page.waitForTimeout(4200); // WebGL sculpture settles
  await page.screenshot({ path: "design-caps/01-landing-hero.png" });
  await page.evaluate(() => window.scrollTo(0, 2350));
  await page.waitForTimeout(1100);
  await page.screenshot({ path: "design-caps/19-pipeline-stage.png" });
  await page.evaluate(() => window.scrollTo(0, 4300));
  await page.waitForTimeout(1100);
  await page.screenshot({ path: "design-caps/20-council-map.png" });
  await page.evaluate(() => window.scrollTo(0, 5300));
  await page.waitForTimeout(1100);
  await page.screenshot({ path: "design-caps/21-forensics-board.png" });
  await page.evaluate(() => window.scrollTo(0, 7100));
  await page.waitForTimeout(1100);
  await page.screenshot({ path: "design-caps/22-showcases.png" });
  await page.screenshot({ path: "design-caps/01b-landing-full.png", fullPage: true });
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(800);
  await page.screenshot({ path: "design-caps/02-landing-pipeline.png" });
  await page.evaluate(() => window.scrollTo(0, 3100));
  await page.waitForTimeout(800);
  await page.screenshot({ path: "design-caps/03-landing-forensics.png" });

  await page.goto("/auth");
  await page.waitForTimeout(700);
  await page.screenshot({ path: "design-caps/04-login.png" });

  const email = `design-${Date.now()}@sentisel.test`;
  await bridgeSessionInBrowser(page, email);
  await page.goto("/onboarding");
  await page.screenshot({ path: "design-caps/05-onboarding.png" });
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /enter command center/i }).click();
  await page.waitForURL("**/command-center");
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "design-caps/06-command-center.png" });

  await page.goto("/agent-council");
  await page.getByRole("button", { name: /run council/i }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "design-caps/07-agent-council.png" });

  await page.goto("/paper-trading");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "design-caps/08-paper-trading.png" });

  // Evidence graph (needs a decision — run council first)
  await page.goto("/agent-council");
  await page.getByRole("button", { name: /run council/i }).click();
  await page.waitForTimeout(2500);
  await page.goto("/evidence-graph");
  await page.getByRole("button", { name: /BTC ·/ }).first().click();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "design-caps/12-evidence-graph.png" });

  await page.goto("/decision-ledger");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "design-caps/13-decision-ledger.png" });

  await page.goto("/scenario-lab");
  await page.getByRole("button", { name: /run scenario/i }).click();
  await page.waitForTimeout(2400);
  await page.screenshot({ path: "design-caps/17-scenario-lab.png" });

  // Wallet Forensics capture — MUST run at the desktop viewport (the mobile
  // capture below switches to 390px; a portrait shot in the desktop showcase
  // grid was the source of the misaligned-forensics-preview bug).
  await page.goto("/forensics");
  await page.getByLabel("Hyperliquid address").fill("0xc0ffee0000000000000000000000000000000002");
  await page.getByRole("button", { name: /run forensics/i }).click();
  await page.waitForTimeout(2600);
  await page.screenshot({ path: "design-caps/09-forensics.png" });

  await page.goto("/market-pulse");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "design-caps/18-market-pulse.png" });

  // Mobile captures — every capture below this line is 390×844.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForTimeout(2200);
  await page.screenshot({ path: "design-caps/14-mobile-landing-hero.png" });
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(900);
  await page.screenshot({ path: "design-caps/15-mobile-landing-mid.png" });
  await page.evaluate(() => window.scrollTo(0, 4600));
  await page.waitForTimeout(900);
  await page.screenshot({ path: "design-caps/16-mobile-landing-cta.png" });

  // Mobile smoke: same shell, small viewport.
  await page.goto("/command-center");
  await page.waitForTimeout(1400);
  await page.screenshot({ path: "design-caps/10-mobile-command-center.png" });
  await page.goto("/");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "design-caps/11-mobile-landing.png" });
});
