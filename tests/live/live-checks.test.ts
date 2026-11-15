import { describe, it, expect } from "vitest";

/*
 * Opt-in LIVE checks against real external services. Run with:
 *   npm run test:live
 * These are excluded from the default suite (deterministic CI) by design.
 */

const shouldRun = process.env.RUN_LIVE === "1";

describe.skipIf(!shouldRun)("live: Hyperliquid public API", () => {
  it("serves market metadata", async () => {
    const { getMarketSnapshot } = await import("@/lib/market-data/hyperliquid");
    const snap = await getMarketSnapshot();
    expect(snap.mode).toBe("live");
    expect(snap.assets.length).toBeGreaterThan(5);
    expect(snap.assets.some((a) => a.name === "BTC")).toBe(true);
  });

  it("walks a real active wallet's history with coverage badges", async () => {
    // Discover a genuinely active address from the exchange's own recent
    // trades, then confirm the address actually holds fill history (the
    // taker/maker attribution may point at accounts with sparse records).
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "recentTrades", coin: "BTC" }),
    });
    const trades = (await res.json()) as Array<{ users: string[]; time: number }>;
    expect(trades.length).toBeGreaterThan(0);

    const candidates = [
      ...new Set(trades.flatMap((t) => t.users).filter((u) => u.startsWith("0x"))),
    ].slice(0, 8);

    const { fetchWalletHistory } = await import("@/lib/market-data/hyperliquid");
    let walked = false;
    for (const addr of candidates) {
      const history = await fetchWalletHistory(addr, Date.now() - 30 * 24 * 3600_000, Date.now());
      if (history.fills.totalCount === 0) continue;
      expect(["complete_api_available", "partial"]).toContain(history.fills.coverage.badge);
      expect(history.fills.coverage.reasons.length).toBeGreaterThan(0);
      // Funding events parse under the live delta envelope:
      expect(history.funding.coverage.reasons.length).toBeGreaterThan(0);
      walked = true;
      break;
    }
    expect(walked).toBe(true);
  }, 180_000);
});

describe.skipIf(!shouldRun || !process.env.XAI_API_KEY)("live: xAI Grok API", () => {
  it("generates a grounded autopsy through Grok when XAI_API_KEY is configured", async () => {
    const { generateAutopsy } = await import("@/lib/forensics/autopsy");
    const { buildWalletReport } = await import("@/lib/forensics/report");
    const report = await buildWalletReport("0xc0ffee0000000000000000000000000000000002", {
      windowDays: 90,
    });
    const autopsy = await generateAutopsy(report);
    // A real request must actually have produced this narrative: a silent fall
    // back to the deterministic template means Grok was never reached or its
    // output was rejected.
    expect(autopsy.generatedBy, autopsy.validationNote).toBe("llm");
    expect(autopsy.model).toBeTruthy();
    expect(autopsy.summary.length).toBe(3);
    expect(autopsy.findings.length).toBeGreaterThan(0);
    // Every cited evidence ID must resolve — even (especially) for LLM output.
    for (const f of [...autopsy.findings, autopsy.observation]) {
      for (const id of f.evidenceIds) {
        expect(id in report.evidence).toBe(true);
      }
    }
  }, 120_000);
});
