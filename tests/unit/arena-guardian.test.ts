import { describe, it, expect } from "vitest";
import { backtest, runArena, WARMUP_BARS } from "@/lib/simulation/arena";
import { evaluateGuardian } from "@/lib/portfolio/guardian";
import { Decimal } from "@/lib/money";
import type { RawCandle } from "@/lib/market-data/types";

const D = (s: string) => new Decimal(s);

function candle(i: number, o: number, c: number): RawCandle {
  return {
    t: 1_700_000_000_000 + i * 3600_000,
    T: 1_700_000_000_000 + i * 3600_000 + 3599_000,
    s: "TEST",
    i: "1h",
    o: String(o),
    c: String(c),
    h: String(Math.max(o, c) * 1.001),
    l: String(Math.min(o, c) * 0.999),
    v: "1000",
  };
}

describe("Strategy Arena — no look-ahead", () => {
  it("fills at the bar AFTER the signal bar (explicit open[i+1] semantics)", () => {
    // Craft a series with a single huge jump after the warm-up: a momentum
    // strategy may only enter at the NEXT bar's open, never at the jump close.
    const n = 200;
    const candles: RawCandle[] = [];
    for (let i = 0; i < n; i++) {
      if (i < 150) {
        candles.push(candle(i, 100, 100)); // flat — SMA24 stays 100
      } else if (i === 150) {
        candles.push(candle(i, 100, 200)); // the jump bar (signal fires on close)
      } else {
        candles.push(candle(i, 200, 200)); // plateau
      }
    }
    const res = backtest("momentum", candles, { startEquity: D("10000") });
    // No look-ahead means the entry fills at the plateau OPEN (~200) — a
    // look-ahead engine would have bought at ~100 and shown a +90% fantasy.
    expect(res.tradeCount).toBe(1); // single round trip
    expect(Number(res.returnPct)).toBeLessThan(5);
    expect(Number(res.returnPct)).toBeGreaterThan(-5);
  });

  it("excludes warm-up bars from metrics and reports the window", () => {
    const candles = Array.from({ length: 300 }, (_, i) => candle(i, 100 + i * 0.01, 100 + i * 0.01));
    const res = backtest("momentum", candles, { startEquity: D("10000") });
    expect(res.sampleSize).toBe(300 - WARMUP_BARS);
    expect(new Date(res.windowStartIso).getTime()).toBeGreaterThan(candles[0].t);
  });

  it("runs all four strategies under identical constraints", () => {
    const candles = Array.from({ length: 400 }, (_, i) => {
      const p = 100 + Math.sin(i / 10) * 8 + i * 0.02;
      return candle(i, p, p + (i % 3 === 0 ? 0.5 : -0.3));
    });
    const { results, assumptions } = runArena(candles, D("50000"));
    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.sampleSize).toBe(400 - WARMUP_BARS);
      expect(r.tradeCount).toBeGreaterThanOrEqual(0);
      expect(Number(r.maxDrawdownPct)).toBeGreaterThanOrEqual(0);
      expect(assumptions.fillModel).toMatch(/no look-ahead/i);
    }
    // All share the same start capital by construction.
    const set = new Set(results.map((r) => r.label));
    expect(set.size).toBe(4);
  });
});

describe("Portfolio Guardian", () => {
  const limits = { maxPositionPct: 20, maxDailyLossPct: 10, maxOpenPositions: 3, maxLeverageX: 5, maxConcentrationPct: 50 };
  const equity = D("10000");

  it("passes an order within all limits", () => {
    const r = evaluateGuardian(limits, equity, { BTC: D("1000") }, { symbol: "ETH", notional: D("1500") });
    expect(r.passed).toBe(true);
    expect(r.checks.every((c) => c.passed)).toBe(true);
    expect(r.utilization.leverageX).toBe("0.25");
  });

  it("explains an order-size breach in plain language", () => {
    const r = evaluateGuardian(limits, equity, {}, { symbol: "BTC", notional: D("3000") });
    expect(r.passed).toBe(false);
    const breach = r.checks.find((c) => c.id === "order_size")!;
    expect(breach.passed).toBe(false);
    expect(breach.detail).toMatch(/30\.0% of equity.*limit 20%/);
  });

  it("explains a concentration breach on the proposed asset", () => {
    const r = evaluateGuardian(limits, equity, { BTC: D("4000") }, { symbol: "BTC", notional: D("1500") });
    const conc = r.checks.find((c) => c.id === "concentration")!;
    expect(conc.passed).toBe(false);
    expect(conc.detail).toMatch(/BTC would be 55\.0% of equity/);
  });

  it("enforces open-position and leverage caps", () => {
    const r = evaluateGuardian(
      limits,
      equity,
      { BTC: D("20000"), ETH: D("15000"), SOL: D("10000") },
      { symbol: "ARB", notional: D("10000") },
    );
    // 4th open position breaches the cap of 3.
    expect(r.checks.find((c) => c.id === "open_positions")!.passed).toBe(false);
    // Total notional 55000 / equity 10000 = 5.5× breaches the 5× cap.
    expect(r.checks.find((c) => c.id === "leverage")!.passed).toBe(false);
    expect(r.checks.find((c) => c.id === "leverage")!.detail).toMatch(/5\.50× equity.*limit 5×/);
  });

  it("evaluates the daily realized loss cap", () => {
    const r = evaluateGuardian(limits, equity, {}, undefined, D("-1500"));
    const dl = r.checks.find((c) => c.id === "daily_loss")!;
    expect(dl.passed).toBe(false);
    expect(dl.detail).toMatch(/15\.0% of equity.*cap −10%/);
  });
});
