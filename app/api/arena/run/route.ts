import { z } from "zod";
import { requireApiUser } from "@/lib/auth/guard";
import { validateOrigin, allowMissingOrigin } from "@/lib/http/origin";
import { rateLimit } from "@/lib/http/rate-limit";
import { ok, unauthorized, badRequest, tooMany, handleError } from "@/lib/http/respond";
import { getDb } from "@/lib/db/client";
import { getMarketSnapshot, getCandles, getUniverse } from "@/lib/market-data/hyperliquid";
import { classifyCoin } from "@/lib/market-data/classify";
import { runArena } from "@/lib/simulation/arena";
import { parseMoney } from "@/lib/money";

const arenaSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  windowDays: z.number().int().min(30).max(365).optional(),
});

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    validateOrigin(req.headers, { allowMissingOrigin: allowMissingOrigin() });
    const user = await requireApiUser();
    if (!user) return unauthorized();

    const db = await getDb();
    const rl = await rateLimit(db, "arena:run", user.id, 10, 15 * 60 * 1000);
    if (!rl.allowed) return tooMany(rl);

    const { symbol: rawSymbol, windowDays } = arenaSchema.parse(await req.json());
    const symbol = rawSymbol.trim().toUpperCase();
    const [snap, universe] = await Promise.all([getMarketSnapshot(), getUniverse()]);
    const asset = snap.assets.find((a) => a.name === symbol);
    if (!asset || classifyCoin(symbol, universe) !== "perp") {
      return badRequest(`${symbol} is not a supported core perpetual.`);
    }

    const endMs = Date.now();
    const startMs = endMs - (windowDays ?? 90) * 24 * 3600_000;
    const { candles, freshness, mode } = await getCandles(symbol, "1h", startMs, endMs);
    if (candles.length < 150) {
      return badRequest(`Not enough candle history for a fair backtest (got ${candles.length}, need >= 150).`);
    }

    const { results, assumptions } = runArena(candles, parseMoney("10000"));
    return ok({
      symbol,
      mode,
      freshness,
      candleCount: candles.length,
      results: results.map((r) => ({
        strategy: r.strategy,
        label: r.label,
        finalEquity: r.finalEquity.toFixed(2),
        returnPct: r.returnPct.toFixed(4),
        maxDrawdownPct: r.maxDrawdownPct.toFixed(2),
        winRate: r.winRate.toFixed(2),
        tradeCount: r.tradeCount,
        avgTradePnl: r.avgTradePnl.toFixed(2),
        sampleSize: r.sampleSize,
        windowStartIso: r.windowStartIso,
        windowEndIso: r.windowEndIso,
        equityCurve: r.equityCurve,
      })),
      assumptions,
    });
  } catch (e) {
    return handleError(e);
  }
}
