import { requireApiUser } from "@/lib/auth/guard";
import { ok, unauthorized, badRequest, handleError } from "@/lib/http/respond";
import { getCandles } from "@/lib/market-data/hyperliquid";

/*
 * Market Memory — historical analogues via feature-vector similarity,
 * computed on the fly from candle history (deterministic, honest sample
 * sizes). Analogues are descriptive historical context, never predictions.
 */

const BUCKET_HOURS = 24;
const FEATURE_KEYS = ["trend", "volatility", "volumeZ"] as const;

type Features = { trend: number; volatility: number; volumeZ: number };

function featVec(closes: number[], vols: number[], end: number): Features | null {
  if (end < 30) return null;
  const window = closes.slice(end - 24, end + 1);
  const base = closes[end - 24];
  if (base <= 0) return null;
  const trend = (closes[end] - base) / base;
  const rets: number[] = [];
  for (let i = end - 23; i <= end; i++) {
    if (closes[i - 1] > 0) rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  const m = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const volatility = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, rets.length));
  const volNow = vols[end];
  const volHist = vols.slice(Math.max(0, end - 168), end);
  const volMean = volHist.length ? volHist.reduce((a, b) => a + b, 0) / volHist.length : volNow;
  const volumeZ = volMean > 0 ? (volNow - volMean) / volMean : 0;
  return { trend, volatility, volumeZ };
}

function dist(a: Features, b: Features): number {
  return Math.abs(a.trend - b.trend) * 2 + Math.abs(a.volatility - b.volatility) * 50 + Math.abs(a.volumeZ - b.volumeZ);
}

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();

    const url = new URL(req.url);
    const symbol = (url.searchParams.get("symbol") ?? "BTC").trim().toUpperCase();
    const endMs = Date.now();
    const { candles, freshness, mode } = await getCandles(symbol, "1h", endMs - 120 * 24 * 3600_000, endMs);
    if (candles.length < 200) {
      return badRequest(`Not enough history to compute analogues for ${symbol} (got ${candles.length} candles).`);
    }

    const closes = candles.map((c) => Number(c.c));
    const vols = candles.map((c) => Number(c.v));

    // Current setup = last completed bucket.
    const currentEnd = closes.length - 1;
    const current = featVec(closes, vols, currentEnd);
    if (!current) return badRequest("Could not compute current features.");

    // Historical buckets + their FORWARD 24h outcome.
    type Analogue = { t: number; features: Features; forwardReturnPct: number; distance: number };
    const analogues: Analogue[] = [];
    for (let end = 168; end < closes.length - 24; end += BUCKET_HOURS) {
      const f = featVec(closes, vols, end);
      if (!f) continue;
      const fwd = (closes[end + 24] - closes[end]) / closes[end];
      analogues.push({
        t: candles[end].t,
        features: f,
        forwardReturnPct: Number((fwd * 100).toFixed(2)),
        distance: dist(current, f),
      });
    }

    const nearest = [...analogues].sort((a, b) => a.distance - b.distance).slice(0, 8);
    const alignedUp = nearest.filter((n) => n.forwardReturnPct > 0).length;

    return ok({
      symbol,
      mode,
      freshness,
      currentFeatures: {
        trend24h: `${(current.trend * 100).toFixed(2)}%`,
        volatility: `${(current.volatility * 100).toFixed(3)}% per hour`,
        volumeVs168hMean: `${current.volumeZ >= 0 ? "+" : ""}${(current.volumeZ * 100).toFixed(1)}%`,
      },
      analogues: nearest.map((n) => ({
        dateIso: new Date(n.t).toISOString().slice(0, 10),
        trend24h: `${(n.features.trend * 100).toFixed(2)}%`,
        volatility: `${(n.features.volatility * 100).toFixed(3)}%`,
        volumeVsMean: `${n.features.volumeZ >= 0 ? "+" : ""}${(n.features.volumeZ * 100).toFixed(1)}%`,
        forwardReturnPct: n.forwardReturnPct,
        similarity: Number((100 - Math.min(100, n.distance * 40)).toFixed(1)),
      })),
      bucketsCompared: analogues.length,
      summary: nearest.length
        ? `${alignedUp} of ${nearest.length} nearest historical analogues saw a positive forward 24h return.`
        : "No analogues found.",
      disclosure: {
        method: "Similarity over trend/volatility/volume features on hourly candles; forward outcome = next 24h return of that historical bucket.",
        limitation: "Historical analogues are descriptive context. They do NOT predict future outcomes and never imply that history repeats.",
        sampleSize: analogues.length,
        featureKeys: FEATURE_KEYS,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
