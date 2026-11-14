import { Decimal } from "@/lib/money";
import type { RawCandle } from "@/lib/market-data/types";

/*
 * Strategy Arena — equal-constraint backtests over candle history.
 *
 * NO LOOK-AHEAD (structural guarantee): a signal computed on bar i can only
 * fill at bar i+1's OPEN. The engine indexes explicitly: signals read closes
 * up to and including i; fills use open[i+1]. Warm-up bars are excluded from
 * metrics. Fees and slippage mirror the paper engine. The dataset window and
 * sample size are always reported with the results.
 */

export type StrategyName = "momentum" | "mean_reversion" | "breakout" | "defensive";

export const STRATEGY_LABELS: Record<StrategyName, string> = {
  momentum: "Momentum (SMA24 vs SMA96 trend-following)",
  mean_reversion: "Mean Reversion (z-score vs SMA24)",
  breakout: "Breakout (24-bar high/low channel)",
  defensive: "Defensive (trend + low-volatility filter, half size)",
};

export const ARENA_FEE_RATE = new Decimal("0.00045");
export const ARENA_SLIPPAGE = new Decimal("0.0005");
export const WARMUP_BARS = 100;

type Cfg = { startEquity: Decimal };

function sma(values: number[], n: number, endIdx: number): number | null {
  if (endIdx + 1 < n) return null;
  let s = 0;
  for (let i = endIdx - n + 1; i <= endIdx; i++) s += values[i];
  return s / n;
}

function stdev(values: number[], n: number, endIdx: number): number | null {
  if (endIdx + 1 < n) return null;
  const slice = values.slice(endIdx - n + 1, endIdx + 1);
  const m = slice.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(slice.reduce((a, b) => a + (b - m) ** 2, 0) / n);
}

/** Returns target exposure for bar i+1, decided ONLY from data ≤ bar i. */
function targetExposure(
  name: StrategyName,
  closes: number[],
  highs: number[],
  lows: number[],
  i: number,
): number {
  switch (name) {
    case "momentum": {
      const fast = sma(closes, 24, i);
      const slow = sma(closes, 96, i);
      if (fast === null || slow === null) return 0;
      return fast > slow ? 1 : 0;
    }
    case "mean_reversion": {
      const m = sma(closes, 24, i);
      const sd = stdev(closes, 24, i);
      if (m === null || sd === null || sd === 0) return 0;
      const z = (closes[i] - m) / sd;
      if (z < -2) return 1; // oversold → long
      if (z > 2) return 0; // overbought → flat (no short in v1)
      return NaN; // hold current exposure (resolved by the caller)
    }
    case "breakout": {
      const window = highs.slice(i - 24 + 1, i + 1);
      const lowsWindow = lows.slice(i - 12 + 1, i + 1);
      if (window.length < 24 || lowsWindow.length < 12) return 0;
      const high24 = Math.max(...window);
      const low12 = Math.min(...lowsWindow);
      if (closes[i] > high24) return 1;
      if (closes[i] < low12) return 0;
      return NaN; // hold
    }
    case "defensive": {
      const fast = sma(closes, 24, i);
      const slow = sma(closes, 96, i);
      const sd = stdev(closes, 24, i);
      if (fast === null || slow === null || sd === null) return 0;
      const volOk = sd / closes[i] < 0.02;
      return fast > slow && volOk ? 0.5 : 0;
    }
  }
}

export type StrategyResult = {
  strategy: StrategyName;
  label: string;
  finalEquity: Decimal;
  returnPct: Decimal;
  maxDrawdownPct: Decimal;
  winRate: Decimal;
  tradeCount: number;
  avgTradePnl: Decimal;
  equityCurve: Array<{ t: number; equity: string }>;
  sampleSize: number;
  windowStartIso: string;
  windowEndIso: string;
};

export function backtest(
  name: StrategyName,
  candles: RawCandle[],
  cfg: Cfg,
): StrategyResult {
  const closes = candles.map((c) => Number(c.c));
  const opens = candles.map((c) => Number(c.o));
  const highs = candles.map((c) => Number(c.h));
  const lows = candles.map((c) => Number(c.l));

  let equity = cfg.startEquity;
  let qty: Decimal | null = null; // open position (coin units)
  let entryPx: Decimal | null = null;
  let targetPrev = 0;
  const tradePnls: Decimal[] = [];
  const curve: Array<{ t: number; equity: string }> = [];
  let peak = equity;
  let maxDd = new Decimal(0);

  const startIdx = Math.min(WARMUP_BARS, Math.floor(candles.length / 3));
  for (let i = startIdx; i < candles.length - 1; i++) {
    // --- fills for signals decided on the PREVIOUS bar (no look-ahead) ---
    const desired = targetExposure(name, closes, highs, lows, i - 1);
    const desiredNow = Number.isNaN(desired) ? targetPrev : desired;
    const openNext = new Decimal(String(opens[i]));

    if (desiredNow > targetPrev && qty === null && desiredNow > 0) {
      // BUY at open[i] with fee + slippage; spend equity exactly.
      const fillPx = openNext.mul(new Decimal(1).plus(ARENA_SLIPPAGE));
      qty = equity.div(fillPx.mul(new Decimal(1).plus(ARENA_FEE_RATE)));
      entryPx = fillPx;
      equity = new Decimal(0); // fully deployed
    } else if (desiredNow < targetPrev && qty !== null) {
      // SELL at open[i].
      const fillPx = openNext.mul(new Decimal(1).minus(ARENA_SLIPPAGE));
      const proceeds = qty.mul(fillPx);
      const fee = proceeds.mul(ARENA_FEE_RATE);
      const net = proceeds.minus(fee);
      const pnl = net.minus(qty.mul(entryPx!).mul(new Decimal(1).plus(ARENA_FEE_RATE)));
      tradePnls.push(pnl);
      equity = net;
      qty = null;
      entryPx = null;
    }
    targetPrev = desiredNow;

    // Mark-to-market equity.
    const markPx = new Decimal(String(closes[i]));
    const mtm = qty !== null ? qty.mul(markPx) : equity;
    const current = qty !== null ? mtm : equity;
    peak = Decimal.max(peak, current);
    if (peak.gt(0)) {
      const dd = peak.minus(current).div(peak).mul(100);
      if (dd.gt(maxDd)) maxDd = dd;
    }
    curve.push({ t: candles[i].t, equity: current.toFixed(2) });
  }

  // Close any open position at the final close (mark as completed trade).
  if (qty !== null) {
    const lastClose = new Decimal(String(candles[candles.length - 1].c));
    const proceeds = qty.mul(lastClose);
    const fee = proceeds.mul(ARENA_FEE_RATE);
    const net = proceeds.minus(fee);
    tradePnls.push(net.minus(qty.mul(entryPx!).mul(new Decimal(1).plus(ARENA_FEE_RATE))));
    equity = net;
    qty = null;
  }

  const wins = tradePnls.filter((p) => p.gt(0)).length;
  const windowStartIso = new Date(candles[startIdx]?.t ?? Date.now()).toISOString();
  const windowEndIso = new Date(candles[candles.length - 1]?.t ?? Date.now()).toISOString();

  return {
    strategy: name,
    label: STRATEGY_LABELS[name],
    finalEquity: equity,
    returnPct: cfg.startEquity.gt(0)
      ? equity.minus(cfg.startEquity).div(cfg.startEquity).mul(100)
      : new Decimal(0),
    maxDrawdownPct: maxDd,
    winRate: tradePnls.length ? new Decimal(wins).div(tradePnls.length).mul(100) : new Decimal(0),
    tradeCount: tradePnls.length,
    avgTradePnl: tradePnls.length
      ? tradePnls.reduce((a, b) => a.plus(b), new Decimal(0)).div(tradePnls.length)
      : new Decimal(0),
    equityCurve: curve,
    sampleSize: Math.max(0, candles.length - startIdx),
    windowStartIso,
    windowEndIso,
  };
}

export function runArena(
  candles: RawCandle[],
  startEquity: Decimal,
  strategies: StrategyName[] = ["momentum", "mean_reversion", "breakout", "defensive"],
): { results: StrategyResult[]; assumptions: Record<string, string> } {
  return {
    results: strategies.map((s) => backtest(s, candles, { startEquity })),
    assumptions: {
      fillModel: "Signals computed on bar close i fill at bar i+1 OPEN (no look-ahead).",
      fees: `Taker fee ${(Number(ARENA_FEE_RATE) * 100).toFixed(3)}% per side.`,
      slippage: `${(Number(ARENA_SLIPPAGE) * 100).toFixed(3)}% adverse slippage per fill.`,
      warmup: `${WARMUP_BARS} warm-up bars excluded from metrics.`,
      capital: "Identical starting capital, full-collateral (no leverage), long-only v1.",
      disclosure: "Backtests are historical simulations, not performance guarantees.",
    },
  };
}
