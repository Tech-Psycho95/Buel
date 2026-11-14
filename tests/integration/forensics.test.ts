import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Decimal } from "@/lib/money";
import { reconstructTrades } from "@/lib/forensics/trades";
import { computeAccounting } from "@/lib/forensics/accounting";
import { computeOverview } from "@/lib/forensics/stats";
import { buildWalletReport, InvalidAddressError } from "@/lib/forensics/report";
import type { RawFill, RawLedgerUpdate, RawFunding } from "@/lib/market-data/types";

let tid = 1;
const mk = (p: Partial<RawFill> & { coin: string; time: number; side: "B" | "A"; sz: string }): RawFill =>
  ({
    px: "100",
    dir: p.side === "B" ? "Open Long" : "Close Long",
    closedPnl: "0",
    fee: "0.5",
    startPosition: "0",
    tid: tid++,
    ...p,
  }) as RawFill;

beforeAll(() => {
  process.env.SENTISEL_DEMO_DATA = "1";
});
afterAll(() => {
  delete process.env.SENTISEL_DEMO_DATA;
});

describe("incomplete wallet-history boundary (integration)", () => {
  it("excludes boundary lifecycles from win rate but keeps their closedPnl in realized PnL", () => {
    // BTC: seeded mid-position at history start (long 1.0 before the window),
    // closed inside the window → NOT a completed trade.
    // ETH: opened and still open at window end → NOT a completed trade.
    // SOL: fully observed W and L trades.
    const fills: RawFill[] = [
      mk({ coin: "BTC", time: 1000, side: "A", sz: "1", px: "110", closedPnl: "10", startPosition: "1.0", fee: "1" }),
      mk({ coin: "SOL", time: 1500, side: "B", sz: "5", px: "50" }),
      mk({ coin: "SOL", time: 1600, side: "A", sz: "5", px: "60", closedPnl: "50", fee: "1" }), // W
      mk({ coin: "ETH", time: 2000, side: "A", sz: "2", px: "100" }), // short, still open at end
      mk({ coin: "SOL", time: 2500, side: "B", sz: "5", px: "55" }),
      mk({ coin: "SOL", time: 2600, side: "A", sz: "5", px: "45", closedPnl: "-50", fee: "1" }), // L
    ];
    const recon = reconstructTrades(fills);
    expect(recon.completedTrades.map((t) => t.coin)).toEqual(["SOL", "SOL"]);
    expect(recon.incomplete.some((x) => x.kind === "open_at_history_start")).toBe(true);
    expect(recon.incomplete.some((x) => x.kind === "open_at_window_end")).toBe(true);

    const overview = computeOverview(recon.completedTrades);
    // Win rate over COMPLETED trades only: 1 win / 2 trades.
    expect(overview.tradeCount).toBe(2);
    expect(overview.winRate.toFixed(4)).toBe("0.5000");

    // Realized PnL (authoritative Σ closedPnl) includes incomplete lifecycles:
    const acc = computeAccounting(fills, [], []);
    expect(new Decimal(acc.realizedPnl).eq("10")).toBe(true); // 10 + 50 − 50
  });
});

describe("reconciliation — cash flows never inflate trading PnL", () => {
  it("net trading PnL is independent of deposits/withdrawals/transfers", () => {
    const fills = [
      mk({ coin: "BTC", time: 1000, side: "B", sz: "1", px: "100", fee: "0" }),
      mk({ coin: "BTC", time: 2000, side: "A", sz: "1", px: "120", closedPnl: "20", fee: "2" }),
    ];
    const funding: RawFunding[] = [
      { time: 1500, coin: "BTC", usdc: "-5", fundingRate: "0.0001", szi: "1" },
    ];
    const ledger: RawLedgerUpdate[] = [
      { time: 500, hash: "0xd1", nonce: 1, delta: { type: "deposit", usdc: "5000000" } },
      { time: 3000, hash: "0xw1", nonce: 2, delta: { type: "withdraw", usdc: "2000000" } },
      { time: 3100, hash: "0xt1", nonce: 3, delta: { type: "transfer", usdc: "1000000" } },
    ];
    const acc = computeAccounting(fills, funding, ledger);
    // Formula identity: 20 − 2 + (−5) = 13
    expect(new Decimal(acc.netTradingPnl).eq("13")).toBe(true);
    // Massive cash flows did not move it:
    expect(new Decimal(acc.deposits).eq("5000000")).toBe(true);
    expect(new Decimal(acc.withdrawals).eq("2000000")).toBe(true);
    expect(new Decimal(acc.transfers).eq("1000000")).toBe(true);
    // And the formula identity holds numerically from the serialized strings:
    const identity = new Decimal(acc.realizedPnl)
      .minus(acc.signedFeeTotalUsdc)
      .plus(acc.signedNetFunding);
    expect(identity.eq(acc.netTradingPnl)).toBe(true);
  });
});

describe("full report pipeline (demo wallet)", () => {
  it("rejects invalid addresses with actionable guidance", async () => {
    await expect(buildWalletReport("not-an-address")).rejects.toThrow(InvalidAddressError);
    await expect(buildWalletReport("0x1234")).rejects.toThrow(InvalidAddressError);
  });

  it("produces an audited, evidence-referenced report over the demo wallet", async () => {
    const report = await buildWalletReport("0xc0ffee0000000000000000000000000000000002", {
      windowDays: 120,
    });

    // Scope disclosure (Safeguard 5) present and explicit:
    expect(report.scopeDisclosure.length).toBeGreaterThanOrEqual(4);
    expect(report.scopeDisclosure[0]).toContain(report.address);
    expect(report.scopeDisclosure.join(" ")).toMatch(/sub-account/i);

    // Market exclusions: demo wallet contains spot + HIP-3 fills, and they are
    // counted, categorized (HIP-3 ≠ non-perp), and excluded from perp stats.
    expect(report.seenFillCount).toBeGreaterThan(report.analyzedFillCount);
    const hip3 = report.exclusions.categories.find((c) => c.classification === "hip3")!;
    const spot = report.exclusions.categories.find((c) => c.classification === "spot")!;
    expect(hip3.fills).toBeGreaterThan(0);
    expect(spot.fills).toBeGreaterThan(0);
    expect(hip3.label).toMatch(/HIP-3/);

    // Coverage honesty:
    expect(["complete_api_available", "partial"]).toContain(report.completeness);
    expect(report.coveragePanels).toHaveLength(3);
    expect(report.caps.maxPages).toBeGreaterThan(0);

    // Deterministic stats exist and are consistent with the accounting:
    expect(report.reconstruction.completedTrades).toBeGreaterThan(10);
    expect(new Decimal(report.accounting.raw.netTradingPnl).eq(
      new Decimal(report.accounting.raw.realizedPnl)
        .minus(report.accounting.raw.signedFeeTotalUsdc)
        .plus(report.accounting.raw.signedNetFunding),
    )).toBe(true);
    // Deposits/withdrawals present in the demo ledger, reported separately:
    expect(new Decimal(report.accounting.raw.deposits).gt(0)).toBe(true);
    expect(new Decimal(report.accounting.raw.withdrawals).gt(0)).toBe(true);

    // Every evidence reference in the report resolves in the registry —
    // the precondition for AI isolation (Rule 7).
    const ids: string[] = [];
    const collect = (obj: unknown) => {
      if (obj === null || typeof obj !== "object") return;
      if (Array.isArray(obj)) return obj.forEach(collect);
      const o = obj as Record<string, unknown>;
      if (typeof o.evidenceId === "string") ids.push(o.evidenceId);
      Object.values(o).forEach(collect);
    };
    collect(report);
    expect(ids.length).toBeGreaterThan(5);
    const missing = ids.filter((id) => !(id in report.evidence));
    expect(missing).toEqual([]);

    // Evidence registry entries have honest sample sizes:
    for (const ev of Object.values(report.evidence)) {
      expect(ev.count).toBeGreaterThanOrEqual(0);
    }

    // Post-loss escalation framing is descriptive-only:
    expect(report.postLossEscalation.framing).toMatch(/not a claim about.*psycholog/i);
  });

  it("is deterministic for the same address and window", async () => {
    const fixedEnd = 1_790_000_000_000; // fixed analysis instant
    const a = await buildWalletReport("0xc0ffee0000000000000000000000000000000002", {
      windowDays: 120,
      endMs: fixedEnd,
    });
    const b = await buildWalletReport("0xc0ffee0000000000000000000000000000000002", {
      windowDays: 120,
      endMs: fixedEnd,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("escalating persona shows size escalation vs baseline (fixture sanity)", async () => {
    const report = await buildWalletReport("0xc0ffee0000000000000000000000000000000002", {
      windowDays: 120,
    });
    const b3 = report.postLossEscalation.afterN.find((x) => x.consecutiveLosses === "3+")!;
    expect(b3.sampleSize).toBeGreaterThan(0);
    expect(new Decimal(b3.avgOpeningNotional).gt(
      new Decimal(report.postLossEscalation.baselineAvgOpeningNotional),
    )).toBe(true);
  });
});
