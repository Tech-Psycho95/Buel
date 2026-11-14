import { getCandles, getMarketSnapshot, isDemoDataRequested } from "@/lib/market-data/hyperliquid";
import { classifyCoin, type MarketUniverse } from "@/lib/market-data/classify";
import { buildEvidence, type MarketEvidence } from "./evidence";
import { runCouncil, type AgentOutput } from "./personas";
import { runRedTeam, type RedTeamOutput } from "./redteam";
import { runJudge, runQualityGate, type GateOutput, type JudgeOutput } from "@/lib/decision-policy/judge-gate";

/*
 * Council run orchestrator: data → evidence → agents → red-team → judge →
 * quality gate. Everything below is deterministic; no LLM participates in any
 * decision (Rule 7). The result is a complete, replayable snapshot.
 */

export type DecisionSnapshot = {
  runId: string;
  symbol: string;
  dataMode: "live" | "demo";
  createdAt: number;
  evidence: MarketEvidence;
  agents: AgentOutput[];
  redTeam: RedTeamOutput;
  judge: JudgeOutput;
  gate: GateOutput;
  price: string;
};

export type CouncilRunResult =
  | { ok: true; snapshot: DecisionSnapshot; universe: MarketUniverse }
  | { ok: false; error: string; reason: "unsupported_symbol" | "data_error" };

export async function runCouncilPipeline(
  symbolRaw: string,
  runId: string,
): Promise<CouncilRunResult> {
  const symbol = symbolRaw.trim().toUpperCase();
  const [snap, universe] = await Promise.all([getMarketSnapshot(), (async () => {
    const { getUniverse } = await import("@/lib/market-data/hyperliquid");
    return getUniverse();
  })()]);

  const asset = snap.assets.find((a) => a.name === symbol);
  if (!asset || classifyCoin(symbol, universe) !== "perp") {
    return {
      ok: false,
      error: `${symbol} is not a supported core perpetual market.`,
      reason: "unsupported_symbol",
    };
  }

  const endMs = Date.now();
  const startMs = endMs - 8 * 24 * 3600_000;
  const { candles, freshness } = await getCandles(symbol, "1h", startMs, endMs);
  if (!candles.length) {
    return { ok: false, error: `No candle data returned for ${symbol}.`, reason: "data_error" };
  }

  const evidence = buildEvidence(
    symbol,
    candles,
    asset.ctx
      ? {
          markPx: asset.ctx.markPx,
          fundingRate: asset.ctx.fundingRate,
          openInterest: asset.ctx.openInterest,
          dayNtlVlm: asset.ctx.dayNtlVlm,
          prevDayPx: asset.ctx.prevDayPx,
        }
      : null,
    {
      source: freshness.source,
      fetchedAt: freshness.fetchedAt,
      ageSec: freshness.ageSec,
      stale: Date.now() - freshness.fetchedAt > 5 * 60_000,
    },
  );

  const agents = runCouncil(evidence);
  const redTeam = runRedTeam(agents, evidence);
  const judge = runJudge(agents, redTeam);
  const gate = runQualityGate(judge, {
    evidenceItemCount: evidence.items.length,
    evidenceStale: evidence.freshness.stale,
    symbolSupported: classifyCoin(symbol, universe) === "perp",
    dataMode: isDemoDataRequested() ? "demo" : snap.mode,
    volumeUsd: asset.ctx ? Number(asset.ctx.dayNtlVlm) : 0,
  });

  const snapshot: DecisionSnapshot = {
    runId,
    symbol,
    dataMode: isDemoDataRequested() ? "demo" : snap.mode,
    createdAt: endMs,
    evidence,
    agents,
    redTeam,
    judge,
    gate,
    price: asset.ctx?.markPx ?? candles[candles.length - 1].c,
  };

  return { ok: true, snapshot, universe };
}
