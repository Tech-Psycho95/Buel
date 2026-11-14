import { defineConfig } from "@playwright/test";

/*
 * Deterministic e2e journey. The dev server is started with SENTISEL_DEMO_DATA=1
 * so every market number is seed-stable — external services are never touched.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3111",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // Distinct per-run client identity so local auth rate limits (which key on
    // x-forwarded-for) never collide across e2e runs.
    extraHTTPHeaders: {
      "x-forwarded-for": `203.0.113.${1 + Math.floor(Math.random() * 200)}`,
    },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npx next dev -p 3111",
        url: "http://localhost:3111",
        reuseExistingServer: true,
        env: {
          SENTISEL_DEMO_DATA: "1",
          SENTISEL_PG_MEMORY: "0",
          // Enables the DEV-ONLY Privy test-session minter + fallback verifier
          // (hard-disabled in production builds regardless of this value).
          SENTISEL_TEST_SECRET: "e2e-test-secret",
        },
      },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
