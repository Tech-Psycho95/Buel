import { test } from "@playwright/test";
import fs from "node:fs";

/*
 * Hero layout verification at the four required viewports (1440/1280/768/390),
 * after reload, with console + page-error capture.
 */

const SIZES: Array<[number, number, string]> = [
  [1440, 900, "1440x900"],
  [1280, 800, "1280x800"],
  [768, 1024, "768x1024"],
  [390, 844, "390x844"],
];

test("hero layout at four viewports", async ({ page }) => {
  fs.mkdirSync("design-caps", { recursive: true });

  const consoleIssues: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      const t = msg.text();
      if (t.includes("Download the React DevTools")) return;
      consoleIssues.push(`${msg.type()}: ${t}`);
    }
  });
  page.on("pageerror", (err) => consoleIssues.push(`pageerror: ${err.message}`));

  for (const [w, h, name] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await page.waitForTimeout(3200); // scene settles + fonts
    await page.screenshot({ path: `design-caps/hero-${name}.png` });

    // No horizontal overflow at any size.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) {
      consoleIssues.push(`horizontal overflow ${overflow}px at ${name}`);
    }
  }

  // Reload behavior: animations restart cleanly at 1440.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.reload();
  await page.waitForTimeout(3200);
  await page.screenshot({ path: "design-caps/hero-1440x900-reload.png" });

  // Report (test passes if zero ERROR-level issues; warnings are surfaced in output).
  const errors = consoleIssues.filter((i) => i.startsWith("error") || i.startsWith("pageerror") || i.includes("overflow"));
  console.log("console issues:", JSON.stringify(consoleIssues, null, 2));
  expectSoft(errors);
});

function expectSoft(errors: string[]) {
  if (errors.length) throw new Error(`Hero issues:\n${errors.join("\n")}`);
}
