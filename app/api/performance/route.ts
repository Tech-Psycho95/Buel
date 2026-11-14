import { and, desc, eq, gt, lt } from "drizzle-orm";
import { Decimal, parseMoney } from "@/lib/money";
import { getDb } from "@/lib/db/client";
import { decisions, decisionOutcomes, paperOrders } from "@/lib/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { ok, unauthorized, handleError } from "@/lib/http/respond";
import { getMarketSnapshot } from "@/lib/market-data/hyperliquid";

/*
 * Performance Lab — calibration, precision, expectancy, drawdown, by-regime.
 * EVERY metric carries its sample size and date range. Outcomes are evaluated
 * only for decisions older than 24h (honest horizon), against current labeled
 * prices. No vanity metrics; small samples are labeled as such.
 */

export const maxDuration = 60;

const OUTCOME_HORIZON_MS = 24 * 3600_000;

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const db = await getDb();
    const snap = await getMarketSnapshot();
    const priceOf = (sym: string): Decimal | null => {
      const a = snap.assets.find((x) => x.name === sym);
      return a?.ctx ? parseMoney(a.ctx.markPx) : null;
    };

    // --- Evaluate unevaluated decisions older than the horizon ---------------
    const pending = await db
      .select()
      .from(decisions)
      .where(
        and(
          eq(decisions.userId, user.id),
          lt(decisions.createdAt, new Date(Date.now() - OUTCOME_HORIZON_MS)),
        ),
      )
      .orderBy(desc(decisions.createdAt))
      .limit(50);
    const existing = await db.select({ decisionId: decisionOutcomes.decisionId }).from(decisionOutcomes);
    const evaluated = new Set(existing.map((e) => e.decisionId));

    let newlyEvaluated = 0;
    for (const d of pending) {
      if (evaluated.has(d.id)) continue;
      const snapDoc = d.snapshot as { price?: string; judge?: { decision?: string } };
      const entryPx = snapDoc.price ? parseMoney(String(snapDoc.price)) : null;
      const exitPx = priceOf(d.symbol);
      if (!entryPx || !exitPx) continue;
      const retPct = exitPx.minus(entryPx).div(entryPx).mul(100);
      const dec = d.decision;
      const aligned =
        (dec === "LONG" && retPct.gt(0)) ||
        (dec === "SHORT" && retPct.lt(0)) ||
        (dec === "NO_TRADE" && retPct.abs().lt(2)) || // NO TRADE "right to wait"
        dec === "ABSTAIN";
      await db
        .insert(decisionOutcomes)
        .values({
          decisionId: d.id,
          entryRefPrice: entryPx.toFixed(10),
          exitRefPrice: exitPx.toFixed(10),
          horizonReturnPct: retPct.toFixed(6),
          alignedWithDecision: aligned,
          notes: { evaluatedAt: Date.now(), mode: "24h-horizon vs current labeled price" },
        })
        .onConflictDoNothing();
      newlyEvaluated++;
    }

    // --- Aggregate metrics ----------------------------------------------------
    const outcomes = await db
      .select({
        decisionId: decisionOutcomes.decisionId,
        horizonReturnPct: decisionOutcomes.horizonReturnPct,
        alignedWithDecision: decisionOutcomes.alignedWithDecision,
      })
      .from(decisionOutcomes)
      .innerJoin(decisions, eq(decisions.id, decisionOutcomes.decisionId))
      .where(eq(decisions.userId, user.id));

    const allDecisions = await db
      .select()
      .from(decisions)
      .where(eq(decisions.userId, user.id))
      .orderBy(desc(decisions.createdAt))
      .limit(200);

    const directional = allDecisions.filter((d) => d.decision === "LONG" || d.decision === "SHORT");
    const noTrades = allDecisions.filter((d) => d.decision === "NO_TRADE");

    // Gate calibration: when the gate PASSED, did outcomes align?
    const gatePassedDecisions = allDecisions.filter(
      (d) => (d.snapshot as { gate?: { passed?: boolean } })?.gate?.passed === true,
    );
    const gatePassedIds = new Set(gatePassedDecisions.map((d) => d.id));
    const gatePassedOutcomes = outcomes.filter((o) => gatePassedIds.has(o.decisionId));
    const gatePrecision = gatePassedOutcomes.length
      ? gatePassedOutcomes.filter((o) => o.alignedWithDecision).length / gatePassedOutcomes.length
      : null;

    // Directional precision (LONG/SHORT decisions with evaluated outcome).
    const directionalIds = new Set(directional.map((d) => d.id));
    const dirOutcomes = outcomes.filter((o) => directionalIds.has(o.decisionId));
    const dirPrecision = dirOutcomes.length
      ? dirOutcomes.filter((o) => o.alignedWithDecision).length / dirOutcomes.length
      : null;

    // NO-TRADE discipline: share of runs the gate refused conviction.
    const noTradeShare = allDecisions.length ? noTrades.length / allDecisions.length : null;

    // Paper-trading realized expectancy + drawdown.
    const orders = await db
      .select()
      .from(paperOrders)
      .where(and(eq(paperOrders.userId, user.id), gt(paperOrders.realizedPnl, "-999999999999")));
    const realized = orders
      .map((o) => (o.realizedPnl ? parseMoney(o.realizedPnl) : null))
      .filter((v): v is Decimal => v !== null);
    const wins = realized.filter((v) => v.gt(0));
    const losses = realized.filter((v) => v.lt(0));
    let cumulative = new Decimal(0);
    let peak = new Decimal(0);
    let maxDd = new Decimal(0);
    for (const r of realized) {
      cumulative = cumulative.plus(r);
      peak = Decimal.max(peak, cumulative);
      const dd = peak.minus(cumulative);
      if (dd.gt(maxDd)) maxDd = dd;
    }

    return ok({
      outcomesEvaluated: outcomes.length,
      newlyEvaluated,
      decisionsTotal: allDecisions.length,
      directionalCount: directional.length,
      noTradeCount: noTrades.length,
      metrics: {
        directionalPrecision: dirPrecision === null ? null : Number((dirPrecision * 100).toFixed(1)),
        gatePrecision: gatePrecision === null ? null : Number((gatePrecision * 100).toFixed(1)),
        noTradeShare: noTradeShare === null ? null : Number((noTradeShare * 100).toFixed(1)),
        paperTrades: realized.length,
        paperWinRate: realized.length ? Number(((wins.length / realized.length) * 100).toFixed(1)) : null,
        paperExpectancy: realized.length ? cumulative.div(realized.length).toFixed(2) : null,
        paperNetRealized: cumulative.toFixed(2),
        paperMaxDrawdown: maxDd.toFixed(2),
      },
      disclosure: {
        horizon: "Decision outcomes are evaluated once per decision against the labeled price ≥24h later.",
        sampleWarning:
          outcomes.length < 10
            ? "Sample size is small — treat percentages as indicative only."
            : `Sample size ${outcomes.length} evaluated outcomes.`,
        backtest: "Backtests are historical simulations, not performance guarantees.",
        noGuarantee: "Past behavior never implies future results.",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
