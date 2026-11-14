import type { AgentOutput } from "@/lib/agents/personas";
import type { RedTeamOutput } from "@/lib/agents/redteam";

/*
 * Judge + Signal Quality Gate — PURE deterministic code. The Judge weighs the
 * council's structured stances; the Quality Gate decides whether any
 * directional signal may stand. The LLM can never influence either (Rule 7):
 * gate inputs are exclusively the validated agent outputs and evidence facts.
 */

export type JudgeDecision = "LONG" | "SHORT" | "NO_TRADE" | "ABSTAIN";

export type JudgeOutput = {
  decision: JudgeDecision;
  confidence: number; // 0..1
  rationale: string;
  weightedLong: number;
  weightedShort: number;
  disagreement: number; // 0..1
  riskReward: number | null;
  invalidation: string[];
};

export type GateCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type GateOutput = {
  passed: boolean;
  checks: GateCheck[];
  finalDecision: JudgeDecision;
  downgradedFrom: JudgeDecision | null;
  explanation: string;
};

const DIRECTIONAL_MIN_CONFIDENCE = 0.45;
const MIN_EVIDENCE_ITEMS = 3;
const MAX_DISAGREEMENT = 0.55;
const MIN_RISK_REWARD = 1.2;

export function runJudge(
  agents: AgentOutput[],
  redTeam: RedTeamOutput,
  opts?: { atrPct?: number; stopPct?: number; targetPct?: number },
): JudgeOutput {
  const longs = agents.filter((a) => a.stance === "long");
  const shorts = agents.filter((a) => a.stance === "short");
  const neutrals = agents.filter((a) => a.stance === "neutral");

  // Side conviction = MEAN confidence of the agents taking that side. Neutral
  // agents dilute via the disagreement metric, not by crushing the scale —
  // otherwise a single honest bull could never clear any threshold.
  const meanConf = (list: AgentOutput[]) =>
    list.length ? list.reduce((acc, a) => acc + a.confidence, 0) / list.length : 0;
  const weightedLong = meanConf(longs);
  const weightedShort = meanConf(shorts);

  // Disagreement: contested council (both sides active) or neutral mass.
  const directionalMass = weightedLong + weightedShort;
  const contested =
    weightedLong > 0 && weightedShort > 0
      ? 1 - Math.abs(weightedLong - weightedShort) / Math.max(weightedLong, weightedShort)
      : 0;
  const neutralMass = (neutrals.length / agents.length) * 0.4;
  const disagreement = Math.min(1, Math.max(contested, directionalMass > 0 ? neutralMass * 0.5 : neutralMass));

  let decision: JudgeDecision;
  let confidence: number;
  if (weightedLong > weightedShort && weightedLong >= DIRECTIONAL_MIN_CONFIDENCE) {
    decision = "LONG";
    confidence = Math.min(0.95, weightedLong);
  } else if (weightedShort > weightedLong && weightedShort >= DIRECTIONAL_MIN_CONFIDENCE) {
    decision = "SHORT";
    confidence = Math.min(0.95, weightedShort);
  } else if (agents.every((a) => a.confidence < 0.2)) {
    decision = "ABSTAIN";
    confidence = 0.2;
  } else {
    decision = "NO_TRADE";
    confidence = Math.max(weightedLong, weightedShort, 0.2);
  }

  const highSeverity = redTeam.challenges.filter((c) => c.severity === "high").length;
  confidence = Math.max(0.05, confidence - highSeverity * 0.08);

  // Risk/reward heuristic: volatility-scaled stop, 2× stop target.
  const stopPct = opts?.stopPct ?? opts?.atrPct ?? 1.0;
  const targetPct = opts?.targetPct ?? stopPct * 2;
  const riskReward = stopPct > 0 ? targetPct / stopPct : null;

  const rationale =
    decision === "LONG" || decision === "SHORT"
      ? `${decision === "LONG" ? "Long" : "Short"} side conviction ${Math.max(weightedLong, weightedShort).toFixed(2)} ≥ threshold ${DIRECTIONAL_MIN_CONFIDENCE} with disagreement ${disagreement.toFixed(2)}${highSeverity > 0 ? `; confidence reduced by ${highSeverity} high-severity red-team challenge(s)` : ""}.`
      : decision === "ABSTAIN"
        ? "Council confidence too low across all agents — abstain rather than guess."
        : `No side cleared the ${DIRECTIONAL_MIN_CONFIDENCE} conviction threshold (long ${weightedLong.toFixed(2)}, short ${weightedShort.toFixed(2)}).`;

  const invalidation = [
    ...agents.find((a) => a.stance === (decision === "LONG" ? "long" : decision === "SHORT" ? "short" : "neutral"))?.invalidation ?? [],
    ...(redTeam.challenges.some((c) => c.severity === "high")
      ? ["Re-evaluate if any high-severity red-team challenge is resolved by new evidence"]
      : []),
  ];

  return {
    decision,
    confidence,
    rationale,
    weightedLong,
    weightedShort,
    disagreement,
    riskReward,
    invalidation: [...new Set(invalidation)].slice(0, 4),
  };
}

export function runQualityGate(
  judge: JudgeOutput,
  ctx: {
    evidenceItemCount: number;
    evidenceStale: boolean;
    symbolSupported: boolean;
    dataMode: "live" | "demo";
    volumeUsd: number;
    minVolumeUsd?: number;
  },
): GateOutput {
  const checks: GateCheck[] = [];

  checks.push({
    id: "evidence_threshold",
    label: "Evidence threshold",
    passed: ctx.evidenceItemCount >= MIN_EVIDENCE_ITEMS,
    detail:
      ctx.evidenceItemCount >= MIN_EVIDENCE_ITEMS
        ? `${ctx.evidenceItemCount} computed evidence items (needs ≥ ${MIN_EVIDENCE_ITEMS}).`
        : `Only ${ctx.evidenceItemCount} evidence items — below the ≥ ${MIN_EVIDENCE_ITEMS} required for any directional signal.`,
  });

  checks.push({
    id: "freshness",
    label: "Data freshness",
    passed: !ctx.evidenceStale,
    detail: ctx.evidenceStale
      ? "Evidence is stale — numbers describe an older market state."
      : "All evidence is within the freshness window.",
  });

  checks.push({
    id: "token_safety",
    label: "Token safety",
    passed: ctx.symbolSupported && ctx.volumeUsd >= (ctx.minVolumeUsd ?? 1_000_000),
    detail: !ctx.symbolSupported
      ? "Symbol is outside the supported core-perpetuals universe."
      : ctx.volumeUsd < (ctx.minVolumeUsd ?? 1_000_000)
        ? `24h notional volume $${ctx.volumeUsd.toLocaleString("en-US")} is below the liquidity floor.`
        : `Supported core perp with $${ctx.volumeUsd.toLocaleString("en-US")} 24h volume.`,
  });

  checks.push({
    id: "disagreement",
    label: "Council disagreement",
    passed: judge.disagreement <= MAX_DISAGREEMENT,
    detail: `Disagreement ${judge.disagreement.toFixed(2)} (allowed ≤ ${MAX_DISAGREEMENT}).`,
  });

  checks.push({
    id: "confidence_floor",
    label: "Confidence floor",
    passed: judge.decision === "NO_TRADE" || judge.decision === "ABSTAIN" || judge.confidence >= DIRECTIONAL_MIN_CONFIDENCE,
    detail: `Judge confidence ${judge.confidence.toFixed(2)} vs floor ${DIRECTIONAL_MIN_CONFIDENCE}.`,
  });

  checks.push({
    id: "risk_reward",
    label: "Risk / reward",
    passed: judge.decision !== "LONG" && judge.decision !== "SHORT" ? true : (judge.riskReward ?? 0) >= MIN_RISK_REWARD,
    detail:
      judge.decision === "LONG" || judge.decision === "SHORT"
        ? `R/R ${judge.riskReward?.toFixed(2) ?? "n/a"} vs minimum ${MIN_RISK_REWARD}.`
        : "No directional decision — R/R check not applicable.",
  });

  const failed = checks.filter((c) => !c.passed);
  let finalDecision = judge.decision;
  let downgradedFrom: JudgeDecision | null = null;

  if (failed.some((c) => c.id === "freshness" || c.id === "token_safety")) {
    if (finalDecision === "LONG" || finalDecision === "SHORT") {
      downgradedFrom = finalDecision;
      finalDecision = "NO_TRADE";
    } else if (finalDecision === "NO_TRADE") {
      finalDecision = "ABSTAIN";
    }
  } else if (
    failed.length > 0 &&
    (finalDecision === "LONG" || finalDecision === "SHORT")
  ) {
    downgradedFrom = finalDecision;
    finalDecision = "NO_TRADE";
  }

  const passed = finalDecision !== "ABSTAIN" && failed.length === 0;
  const explanation = failed.length
    ? `Gate ${passed ? "passed with warnings" : "REFUSED"}: ${failed.map((f) => `${f.label} — ${f.detail}`).join(" | ")}`
    : "All quality-gate checks passed.";

  return { passed, checks, finalDecision, downgradedFrom, explanation };
}

export { DIRECTIONAL_MIN_CONFIDENCE, MIN_EVIDENCE_ITEMS, MAX_DISAGREEMENT, MIN_RISK_REWARD };
