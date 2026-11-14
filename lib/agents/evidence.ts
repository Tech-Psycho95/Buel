import { Decimal, parseMoney, sum } from "@/lib/money";
import type { RawCandle } from "@/lib/market-data/types";

/*
 * Deterministic evidence builders for the Agent Council. Every metric the
 * agents cite is computed HERE, in code, with an evidence ID — the agents
 * (and any LLM narrative layer) may only reference these computed facts.
 */

export type EvidenceItem = {
  id: string;
  kind: "momentum" | "trend" | "volatility" | "volume" | "funding" | "open_interest" | "regime";
  label: string;
  /** Signed score in [-1, 1]; positive = bullish-leaning, negative = bearish-leaning. */
  score: number;
  /** Human-readable value string the narrative may quote verbatim. */
  display: string;
  sampleSize: number;
};

export type MarketEvidence = {
  symbol: string;
  items: EvidenceItem[];
  freshness: { source: string; fetchedAt: number; ageSec: number; stale: boolean };
  candleCount: number;
};

function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const slice = values.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

function clamp(v: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

export function buildEvidence(
  symbol: string,
  candles: RawCandle[],
  ctx: { markPx: string; fundingRate: string; openInterest: string; dayNtlVlm: string; prevDayPx: string } | null,
  freshness: MarketEvidence["freshness"],
): MarketEvidence {
  const items: EvidenceItem[] = [];
  const closes = candles.map((c) => Number(c.c));
  const last = closes[closes.length - 1] ?? 0;

  // Momentum: returns over 24h and 7d (1h candles assumed).
  const ret = (n: number): number | null =>
    closes.length > n ? (last - closes[closes.length - 1 - n]) / closes[closes.length - 1 - n] : null;
  const r24 = ret(24);
  const r168 = ret(168);
  if (r24 !== null) {
    items.push({
      id: `ev:mom:24h:${symbol}`,
      kind: "momentum",
      label: "24h price change",
      score: clamp(r24 * 20),
      display: `${(r24 * 100).toFixed(2)}%`,
      sampleSize: 24,
    });
  }
  if (r168 !== null) {
    items.push({
      id: `ev:mom:7d:${symbol}`,
      kind: "momentum",
      label: "7d price change",
      score: clamp(r168 * 8),
      display: `${(r168 * 100).toFixed(2)}%`,
      sampleSize: 168,
    });
  }

  // Trend structure: price vs SMA24 and SMA168.
  const sma24 = sma(closes, 24);
  const sma168 = sma(closes, 168);
  if (sma24 !== null) {
    const dev = (last - sma24) / sma24;
    items.push({
      id: `ev:trend:sma24:${symbol}`,
      kind: "trend",
      label: "price vs SMA24",
      score: clamp(dev * 15),
      display: `${dev >= 0 ? "+" : ""}${(dev * 100).toFixed(2)}% vs SMA24`,
      sampleSize: 24,
    });
  }
  if (sma168 !== null) {
    const dev = (last - sma168) / sma168;
    items.push({
      id: `ev:trend:sma168:${symbol}`,
      kind: "trend",
      label: "price vs SMA168",
      score: clamp(dev * 10),
      display: `${dev >= 0 ? "+" : ""}${(dev * 100).toFixed(2)}% vs SMA168`,
      sampleSize: 168,
    });
  }

  // Volatility: hourly-return stdev, annualized-ish scale.
  const hourlyReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) hourlyReturns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  const vol = stdev(hourlyReturns);
  if (hourlyReturns.length >= 12) {
    items.push({
      id: `ev:vol:${symbol}`,
      kind: "volatility",
      label: "hourly volatility",
      score: 0, // volatility is context, not directional
      display: `${(vol * 100).toFixed(3)}% per hour`,
      sampleSize: hourlyReturns.length,
    });
  }

  // Volume context.
  if (ctx) {
    items.push({
      id: `ev:volume:${symbol}`,
      kind: "volume",
      label: "24h notional volume",
      score: 0,
      display: `$${Number(ctx.dayNtlVlm).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      sampleSize: 1,
    });

    // Funding rate (HL funding is an hourly rate; typical range ±0.001%).
    const fr = Number(ctx.fundingRate);
    items.push({
      id: `ev:funding:${symbol}`,
      kind: "funding",
      label: "current funding rate",
      // Positive funding = longs pay shorts → mildly bearish for longs.
      // Calibrated so a normal 0.01%/h rate is a mild −0.2, not a veto.
      score: clamp(-fr * 2000),
      display: `${(fr * 100).toFixed(4)}% per hour`,
      sampleSize: 1,
    });

    // Open interest level (context; change requires history we may not have).
    items.push({
      id: `ev:oi:${symbol}`,
      kind: "open_interest",
      label: "open interest",
      score: 0,
      display: `$${Number(ctx.openInterest).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      sampleSize: 1,
    });
  }

  // Regime classification (trendiness).
  if (sma24 !== null && sma168 !== null && vol > 0) {
    const trendStrength = Math.abs(last / sma24 - last / sma168);
    const regime = trendStrength > vol * 8 ? "trending" : trendStrength > vol * 3 ? "mixed" : "ranging";
    items.push({
      id: `ev:regime:${symbol}`,
      kind: "regime",
      label: "market regime",
      score: 0,
      display: regime,
      sampleSize: Math.min(closes.length, 168),
    });
  }

  return {
    symbol,
    items,
    freshness,
    candleCount: candles.length,
  };
}

/** Aggregate bullishness of the evidence set (deterministic). */
export function evidenceBias(items: EvidenceItem[]): number {
  if (items.length === 0) return 0;
  return clamp(items.reduce((a, b) => a + b.score, 0) / Math.max(2, items.length));
}

export function evidenceById(items: EvidenceItem[]): Record<string, EvidenceItem> {
  return Object.fromEntries(items.map((i) => [i.id, i]));
}
