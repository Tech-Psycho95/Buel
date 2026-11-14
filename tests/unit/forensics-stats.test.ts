import { describe, it, expect } from "vitest";
import { reconstructTrades, type CompletedTrade } from "@/lib/forensics/trades";
import {
  computeOverview,
  computeFeeDrag,
  computePostLossEscalation,
  computeHourPatterns,
  computeWeekdayPatterns,
  computeActivity,
  type EvidenceRegistry,
} from "@/lib/forensics/stats";
import type { RawFill } from "@/lib/market-data/types";
import { Decimal } from "@/lib/money";

let tid = 1;
const mk = (p: Partial<RawFill> & { coin: string; time: number; side: "B" | "A"; sz: string }): RawFill =>
  ({
    px: "100",
    dir: "Open Long",
    closedPnl: "0",
    fee: "0.5",
    startPosition: "0",
    tid: tid++,
    ...p,
  }) as RawFill;

const D = (s: string) => new Decimal(s);

/** Build completed trades directly for stats-level tests. */
function trade(over: Partial<CompletedTrade>): CompletedTrade {
  return {
    id: `T${tid++}`,
    coin: "BTC",
    side: "long",
    openedAt: 1_000_000,
    closedAt: 1_100_000,
    fillIndices: [],
    realizedPnl: D("0"),
    fees: D("0"),
    maxQty: D("1"),
    openingNotional: D("100"),
    additions: 0,
    partialExits: 0,
    wasReversed: false,
    ...over,
  } as CompletedTrade;
}

describe("overview stats", () => {
  it("win rate uses completed trades only", () => {
    const trades = [trade({ realizedPnl: D("10") }), trade({ realizedPnl: D("-5") }), trade({ realizedPnl: D("3") })];
    const o = computeOverview(trades);
    expect(o.tradeCount).toBe(3);
    expect(o.winRate.toFixed(4)).toBe("0.6667");
    expect(o.avgWin.toFixed(4)).toBe("6.5000");
    expect(o.avgLoss.toFixed(4)).toBe("5.0000");
    expect(o.profitFactor.toFixed(4)).toBe("2.6000"); // grossWin 13 / grossLoss 5
    expect(o.expectancy.toFixed(4)).toBe("2.6667");
  });

  it("empty trade list yields zeros without exceptions", () => {
    const o = computeOverview([]);
    expect(o.tradeCount).toBe(0);
    expect(o.winRate.toFixed(2)).toBe("0.00");
    expect(o.profitFactor.toFixed(2)).toBe("0.00");
  });
});

describe("fee drag", () => {
  it("counts winners whose fee exceeds 30% of gross profit", () => {
    const trades = [
      trade({ realizedPnl: D("10"), fees: D("4") }), // 40% → counted
      trade({ realizedPnl: D("10"), fees: D("2") }), // 20% → not counted
      trade({ realizedPnl: D("-8"), fees: D("2") }), // loser → not counted
    ];
    const ev: EvidenceRegistry = {};
    const fd = computeFeeDrag(trades, ev);
    expect(fd.winnersWithFeeOver30Pct).toBe(1);
    expect(fd.winnerCount).toBe(2);
    // feesAsPctOfGrossProfit = (4+2+2)/20 = 40%
    expect(fd.feesAsPctOfGrossProfit!.mul(100).toFixed(1)).toBe("40.0");
    expect(ev["ev:fee-drag"]).toBeTruthy();
  });

  it("handles zero gross profit without dividing by zero", () => {
    const ev: EvidenceRegistry = {};
    const fd = computeFeeDrag([trade({ realizedPnl: D("-5"), fees: D("1") })], ev);
    expect(fd.feesAsPctOfGrossProfit).toBeNull();
  });
});

describe("post-loss size escalation (descriptive)", () => {
  it("buckets trades by consecutive completed losses immediately before them", () => {
    // W = win, L = loss (−1). C = consecutive losses immediately BEFORE the
    // trade. Losing trades land in buckets too (they are trades as well).
    const seq = [
      trade({ closedAt: 1, realizedPnl: D("1"), openingNotional: D("100") }), // W  C0
      trade({ closedAt: 2, realizedPnl: D("-1"), openingNotional: D("100") }), // L C0
      trade({ closedAt: 3, realizedPnl: D("1"), openingNotional: D("200") }), // W  C1 → b1
      trade({ closedAt: 4, realizedPnl: D("-1"), openingNotional: D("100") }), // L C0
      trade({ closedAt: 5, realizedPnl: D("-1"), openingNotional: D("100") }), // L C1 → b1
      trade({ closedAt: 6, realizedPnl: D("1"), openingNotional: D("300") }), // W  C2 → b2
      trade({ closedAt: 7, realizedPnl: D("1"), openingNotional: D("150") }), // W  C0
      trade({ closedAt: 8, realizedPnl: D("-1"), openingNotional: D("100") }), // L C0
      trade({ closedAt: 9, realizedPnl: D("-1"), openingNotional: D("100") }), // L C1 → b1
      trade({ closedAt: 10, realizedPnl: D("-1"), openingNotional: D("100") }), // L C2 → b2
      trade({ closedAt: 11, realizedPnl: D("1"), openingNotional: D("400") }), // W C3+ → b3
      trade({ closedAt: 12, realizedPnl: D("-1"), openingNotional: D("100") }), // L C0
      trade({ closedAt: 13, realizedPnl: D("1"), openingNotional: D("500") }), // W  C1 → b1
      trade({ closedAt: 14, realizedPnl: D("-1"), openingNotional: D("100") }), // L C0
      trade({ closedAt: 15, realizedPnl: D("-1"), openingNotional: D("100") }), // L C1 → b1
      trade({ closedAt: 16, realizedPnl: D("-1"), openingNotional: D("100") }), // L C2 → b2
      trade({ closedAt: 17, realizedPnl: D("-1"), openingNotional: D("100") }), // L C3+ → b3
      trade({ closedAt: 18, realizedPnl: D("1"), openingNotional: D("600") }), // W C4 → 3+ → b3
      trade({ closedAt: 19, realizedPnl: D("-1"), openingNotional: D("100") }), // L C0
      trade({ closedAt: 20, realizedPnl: D("-1"), openingNotional: D("100") }), // L C1 → b1
      trade({ closedAt: 21, realizedPnl: D("-1"), openingNotional: D("100") }), // L C2 → b2
      trade({ closedAt: 22, realizedPnl: D("1"), openingNotional: D("120") }), // W C3+ → b3
      trade({ closedAt: 23, realizedPnl: D("-1"), openingNotional: D("100") }), // L C0
      trade({ closedAt: 24, realizedPnl: D("-1"), openingNotional: D("100") }), // L C1 → b1
      trade({ closedAt: 25, realizedPnl: D("-1"), openingNotional: D("100") }), // L C2 → b2
      trade({ closedAt: 26, realizedPnl: D("1"), openingNotional: D("700") }), // W C3 → 3+ → b3
    ];
    const ev: EvidenceRegistry = {};
    const pe = computePostLossEscalation(seq, ev);
    // baseline = mean over all 26 notionals: (18×100 + 200+300+150+400+500+600+120+700)/26 = 183.46
    expect(pe.baselineAvgOpeningNotional.toFixed(2)).toBe("183.46");
    const b1 = pe.afterN.find((x) => x.consecutiveLosses === "1")!;
    const b2 = pe.afterN.find((x) => x.consecutiveLosses === "2")!;
    const b3 = pe.afterN.find((x) => x.consecutiveLosses === "3+")!;
    // b1 = notionals at C1: 200,100,100,500,100,100,100 → 7 trades, 1200/7
    expect(b1.sampleSize).toBe(7);
    expect(b1.avgOpeningNotional.toFixed(2)).toBe("171.43");
    // b2 = notionals at C2: 300,100,100,100,100 → 5 trades, 700/5
    expect(b2.sampleSize).toBe(5);
    expect(b2.avgOpeningNotional.toFixed(2)).toBe("140.00");
    // b3 = notionals at C3+: 400,100,600,120,700 → 5 trades, 1920/5
    expect(b3.sampleSize).toBe(5);
    expect(b3.avgOpeningNotional.toFixed(2)).toBe("384.00");
    expect(ev["ev:streak:2"].count).toBe(5);
  });
});

describe("time patterns (UTC)", () => {
  it("buckets by hour of close in UTC", () => {
    // 10:30 UTC → hour "10"; 23:59 UTC → "23".
    const trades = [
      trade({ closedAt: Date.UTC(2026, 0, 1, 10, 30), realizedPnl: D("10") }),
      trade({ closedAt: Date.UTC(2026, 0, 2, 23, 59), realizedPnl: D("-4") }),
      trade({ closedAt: Date.UTC(2026, 0, 3, 10, 0), realizedPnl: D("2") }),
    ];
    const ev: EvidenceRegistry = {};
    const hp = computeHourPatterns(trades, ev);
    const h10 = hp.buckets.find((b) => b.key === "10")!;
    const h23 = hp.buckets.find((b) => b.key === "23")!;
    expect(h10.trades).toBe(2);
    expect(h10.pnl.toFixed(1)).toBe("12.0");
    expect(h23.pnl.toFixed(1)).toBe("-4.0");
    expect(hp.bestKey).toBe("10");
    expect(hp.worstKey).toBe("23");
  });

  it("buckets by weekday of close (Mon-first, UTC)", () => {
    // 2026-01-05 is a Monday; 2026-01-10 is a Saturday.
    const trades = [
      trade({ closedAt: Date.UTC(2026, 0, 5, 12), realizedPnl: D("5") }),
      trade({ closedAt: Date.UTC(2026, 0, 10, 12), realizedPnl: D("-3") }),
    ];
    const ev: EvidenceRegistry = {};
    const wp = computeWeekdayPatterns(trades, ev);
    const mon = wp.buckets.find((b) => b.key === "Mon")!;
    const sat = wp.buckets.find((b) => b.key === "Sat")!;
    expect(mon.trades).toBe(1);
    expect(sat.trades).toBe(1);
    expect(wp.bestKey).toBe("Mon");
  });
});

describe("activity", () => {
  it("aggregates trades per UTC day and ranks the busiest days", () => {
    const mkDay = (day: number, n: number) =>
      Array.from({ length: n }, (_, i) =>
        trade({ closedAt: Date.UTC(2026, 0, day, 12, i) }),
      );
    const trades = [...mkDay(2, 5), ...mkDay(3, 2), ...mkDay(4, 8)];
    const ev: EvidenceRegistry = {};
    const act = computeActivity(trades, ev);
    expect(act.activeDays).toBe(3);
    expect(act.tradesPerActiveDay.toFixed(2)).toBe("5.00");
    expect(act.topDays[0].count).toBe(8);
    expect(act.topDays[0].dateUtc).toBe("2026-01-04");
  });
});

describe("state machine + overview integration", () => {
  it("stats derive from reconstructed trades exactly", () => {
    const fills = [
      mk({ coin: "BTC", time: Date.UTC(2026, 0, 1, 9), side: "B", sz: "1", px: "100" }),
      mk({ coin: "BTC", time: Date.UTC(2026, 0, 1, 10), side: "A", sz: "1", px: "110", closedPnl: "10", fee: "1" }),
      mk({ coin: "BTC", time: Date.UTC(2026, 0, 2, 9), side: "B", sz: "2", px: "100" }),
      mk({ coin: "BTC", time: Date.UTC(2026, 0, 2, 10), side: "A", sz: "2", px: "90", closedPnl: "-20", fee: "1" }),
    ];
    const res = reconstructTrades(fills);
    const o = computeOverview(res.completedTrades);
    expect(o.tradeCount).toBe(2);
    expect(o.winRate.toFixed(4)).toBe("0.5000");
    expect(o.grossProfit.toFixed(2)).toBe("10.00");
    expect(o.grossLoss.toFixed(2)).toBe("20.00");
    expect(o.profitFactor.toFixed(4)).toBe("0.5000");
  });
});
