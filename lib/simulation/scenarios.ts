import { Decimal } from "@/lib/money";
import type { RawCandle } from "@/lib/market-data/types";
import { buildEvidence, type MarketEvidence } from "@/lib/agents/evidence";
import { runCouncil, type AgentOutput } from "@/lib/agents/personas";
import { runRedTeam, type RedTeamOutput } from "@/lib/agents/redteam";
import { runJudge, runQualityGate, type GateOutput, type JudgeOutput } from "@/lib/decision-policy/judge-gate";
import { classifyCoin } from "@/lib/market-data/classify";
import { getMarketSnapshot, getCandles, getUniverse, isDemoDataRequested } from "@/lib/market-data/hyperliquid";

/*
 * Counterfactual Scenario Lab — deterministic what-if engine. A scenario is a
 * explicit TRANSFORM of the candle series; the same council pipeline then runs
 * on the transformed data. Outputs are always labeled hypothetical: they show
 * model sensitivity, not forecasts.
 */

export type ScenarioSpec = {
  priceShockPct: number; // e.g. -10 = instant −10% repricing
  volumeMultiplier: number; // e.g. 3 = 3× volume
  volatilityMultiplier: number; // scales per-bar range
};

export type ScenarioRun = {
  spec: ScenarioSpec;
  evidence: MarketEvidence;
  agents: AgentOutput[];
  redTeam: RedTeamOutput;
  judge: JudgeOutput;
  gate: GateOutput;
};

export function transformCandles(candles: RawCandle[], spec: ScenarioSpec): RawCandle[] {
  const shock = 1 + spec.priceShockPct / 100;
  return candles.map((c, idx) => {
    // Shock applies to the LAST bar (an instantaneous repricing); earlier bars
    // get volatility scaling so trend/vol evidence responds coherently.
    const scale = idx === candles.length - 1 ? shock : 1;
    const volScale = spec.volatilityMultiplier;
    const mid = (Number(c.o) + Number(c.c)) / 2;
    const o = mid * scale;
    const cl = mid * scale * (1 + (Number(c.c) / mid - 1) * volScale);
    const h = Math.max(o, cl) * (1 + Math.abs(Number(c.h) / mid - 1) * volScale);
    const l = Math.min(o, cl) * (1 - Math.abs(1 - Number(c.l) / mid) * volScale);
    return {
      ...c,
      o: o.toFixed(8),
      c: cl.toFixed(8),
      h: h.toFixed(8),
      l: l.toFixed(8),
      v: (Number(c.v) * spec.volumeMultiplier).toFixed(2),
    };
  });
}

export async function runScenario(
  symbol: string,
  spec: ScenarioSpec,
  _runId?: string,
): Promise<{ ok: true; baseline: ScenarioRun; shocked: ScenarioRun; priceBefore: string; priceAfter: string } | { ok: false; error: string }> {
  const s = symbol.trim().toUpperCase();
  const [snap, universe] = await Promise.all([getMarketSnapshot(), getUniverse()]);
  const asset = snap.assets.find((a) => a.name === s);
  if (!asset || classifyCoin(s, universe) !== "perp") {
    return { ok: false, error: `${s} is not a supported core perpetual.` };
  }

  const endMs = Date.now();
  const { candles, freshness } = await getCandles(s, "1h", endMs - 8 * 24 * 3600_000, endMs);
  if (candles.length < 30) return { ok: false, error: "Not enough candle history for a scenario run." };

  const makeRun = (candleSet: RawCandle[], markPxOverride: string | null, evStale: boolean): ScenarioRun => {
    const evidence = buildEvidence(
      s,
      candleSet,
      asset.ctx
        ? {
            markPx: markPxOverride ?? asset.ctx.markPx,
            fundingRate: asset.ctx.fundingRate,
            openInterest: asset.ctx.openInterest,
            dayNtlVlm: asset.ctx.dayNtlVlm,
            prevDayPx: asset.ctx.prevDayPx,
          }
        : null,
      { source: freshness.source, fetchedAt: freshness.fetchedAt, ageSec: freshness.ageSec, stale: evStale },
    );
    const agents = runCouncil(evidence);
    const redTeam = runRedTeam(agents, evidence);
    const judge = runJudge(agents, redTeam);
    const gate = runQualityGate(judge, {
      evidenceItemCount: evidence.items.length,
      evidenceStale: evStale,
      symbolSupported: true,
      dataMode: isDemoDataRequested() ? "demo" : snap.mode,
      volumeUsd: asset.ctx ? Number(asset.ctx.dayNtlVlm) : 0,
    });
    return { spec, evidence, agents, redTeam, judge, gate };
  };

  const baseline = makeRun(candles, null, Date.now() - freshness.fetchedAt > 5 * 60_000);
  const transformed = transformCandles(candles, spec);
  const shocked = makeRun(transformed, transformed[transformed.length - 1].c, false);

  return {
    ok: true,
    baseline,
    shocked,
    priceBefore: asset.ctx?.markPx ?? candles[candles.length - 1].c,
    priceAfter: transformed[transformed.length - 1].c,
  };
}

export { Decimal };
