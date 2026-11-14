import { getDb } from "@/lib/db/client";
import { and, eq } from "drizzle-orm";
import { watchlists, watchlistItems } from "@/lib/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { ok, unauthorized, handleError } from "@/lib/http/respond";
import { getMarketSnapshot } from "@/lib/market-data/hyperliquid";
import { classifyCoin } from "@/lib/market-data/classify";

/*
 * Market data API for Market Pulse + Command Center.
 * GET /api/market            → full snapshot (all supported perps + context)
 * GET /api/market?symbol=BTC → single-token detail with candles
 */

export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();

    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol");
    const snap = await getMarketSnapshot();

    if (symbol) {
      const s = symbol.trim().toUpperCase();
      const asset = snap.assets.find((a) => a.name === s);
      if (!asset) {
        return ok({ ok: false, error: "unknown_symbol", message: `${s} is not in the supported perpetuals universe.` }, { status: 404 });
      }
      const { getCandles } = await import("@/lib/market-data/hyperliquid");
      // Supported detail intervals; span scales so chart density stays similar.
      const interval = ["15m", "1h", "4h", "1d"].includes(url.searchParams.get("interval") ?? "")
        ? (url.searchParams.get("interval") as string)
        : "1h";
      const spanMs = interval === "15m" ? 2 * 24 * 3600_000 : interval === "1h" ? 7 * 24 * 3600_000 : interval === "4h" ? 30 * 24 * 3600_000 : 120 * 24 * 3600_000;
      const endMs = Date.now();
      const { candles, freshness, mode } = await getCandles(s, interval, endMs - spanMs, endMs);
      return ok({ asset, candles, freshness, mode, interval, snapshotFreshness: snap.freshness });
    }

    // Watchlist-aware ordering for the list view.
    const db = await getDb();
    const wl = (
      await db
        .select()
        .from(watchlists)
        .where(and(eq(watchlists.userId, user.id), eq(watchlists.isDefault, true)))
        .limit(1)
    )[0];
    const watchSymbols = wl
      ? (await db.select().from(watchlistItems).where(eq(watchlistItems.watchlistId, wl.id))).map((i) => i.symbol)
      : [];

    const perps = snap.assets
      .filter((a) => a.classification === "perp")
      .sort((a, b) => {
        const ai = watchSymbols.indexOf(a.name);
        const bi = watchSymbols.indexOf(b.name);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return (Number(b.ctx?.dayNtlVlm ?? 0) || 0) - (Number(a.ctx?.dayNtlVlm ?? 0) || 0);
      })
      .slice(0, 40);

    return ok({
      freshness: snap.freshness,
      mode: snap.mode,
      watchSymbols,
      assets: perps,
      totalMarkets: snap.assets.length,
    });
  } catch (e) {
    return handleError(e);
  }
}
