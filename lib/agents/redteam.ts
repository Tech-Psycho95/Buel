import type { AgentOutput } from "./personas";
import type { MarketEvidence } from "./evidence";

/*
 * Adversarial Red-Team — attempts to falsify the leading thesis (the
 * highest-confidence directional agent), expose contradictory evidence, weak
 * assumptions and missing inputs. Deterministic, evidence-locked.
 */

export type RedTeamChallenge = {
  target: "bull" | "bear" | "analyst" | "risk";
  attack: string;
  evidenceIds: string[];
  severity: "high" | "medium" | "low";
};

export type RedTeamOutput = {
  leadingThesis: string;
  verdict: string;
  challenges: RedTeamChallenge[];
  missingInputs: string[];
  weakAssumptions: string[];
};

export function runRedTeam(agents: AgentOutput[], ev: MarketEvidence): RedTeamOutput {
  const directional = agents.filter((a) => a.stance !== "neutral");
  const leading = [...directional].sort((a, b) => b.confidence - a.confidence)[0];
  const byId = Object.fromEntries(ev.items.map((i) => [i.id, i]));
  const challenges: RedTeamChallenge[] = [];
  const missingInputs: string[] = [];
  const weakAssumptions: string[] = [];

  if (!leading) {
    return {
      leadingThesis: "No directional thesis to attack — all agents abstained.",
      verdict: "No attack necessary; the council lacks conviction and the gate should reflect that.",
      challenges,
      missingInputs: ev.items.length < 4 ? ["At least one additional independent evidence stream (e.g. spot-flow or catalyst data)"] : [],
      weakAssumptions: [],
    };
  }

  // 1. Contradictory evidence scan.
  const mom = ev.items.find((i) => i.id.includes("ev:mom:24h"));
  const fund = ev.items.find((i) => i.id.includes("ev:funding"));
  if (leading.stance === "long" && mom && mom.score <= 0) {
    challenges.push({
      target: leading.agent,
      attack: `Long thesis cites momentum, but 24h momentum evidence reads ${mom.display} — non-positive. The thesis leans on the 7d window instead; that is cherry-picking risk.`,
      evidenceIds: [mom.id],
      severity: "high",
    });
  }
  if (leading.stance === "long" && fund && fund.score > 0.3) {
    challenges.push({
      target: leading.agent,
      attack: `Funding ${fund.display} is elevated positive — crowded long positioning. Any wobble can cascade via liquidations; the thesis does not model positioning unwinds.`,
      evidenceIds: [fund.id],
      severity: "medium",
    });
  }
  if (leading.stance === "short" && mom && mom.score > 0.3) {
    challenges.push({
      target: leading.agent,
      attack: `Short thesis against positive 24h momentum (${mom.display}) — fighting the tape without a catalyst is weakly supported.`,
      evidenceIds: [mom.id],
      severity: "high",
    });
  }

  // 2. Data-quality attacks.
  if (ev.freshness.stale) {
    challenges.push({
      target: leading.agent,
      attack: "Evidence freshness is stale — every computed number describes an older market state. No directional thesis should pass the gate on stale data.",
      evidenceIds: ev.items.slice(0, 2).map((i) => i.id),
      severity: "high",
    });
  }
  if (ev.candleCount < 60) {
    challenges.push({
      target: leading.agent,
      attack: `Only ${ev.candleCount} candles of history — SMA168-based trend claims are not yet computable and momentum windows are partially filled.`,
      evidenceIds: [],
      severity: "medium",
    });
    missingInputs.push("Longer candle history (≥168 hourly candles) for full trend structure");
  }

  // 3. Missing inputs the thesis ignores (honest disclosure — never fabricated).
  missingInputs.push("Order-flow / taker imbalance data (not available via this API scope)");
  missingInputs.push("Confirmed catalyst calendar (Catalyst Intelligence module, demo-labeled only)");

  // 4. Weak assumption probing.
  weakAssumptions.push(
    ...leading.assumptions.map(
      (a) => `${leading.agent.toUpperCase()} assumes "${a}" — this is an assertion, not evidence; no computed item verifies it.`,
    ),
  );

  const verdict = challenges.some((c) => c.severity === "high")
    ? `The leading ${leading.stance.toUpperCase()} thesis has at least one high-severity contradiction or data-quality failure — the Judge should require the gate to downgrade or veto conviction.`
    : challenges.length > 0
      ? `The leading thesis survives with caveats: ${challenges.length} medium/low-severity challenge(s) — a passing decision should be conditional.`
      : `No high-severity contradiction found in the computed evidence set. The thesis stands or falls on the invalidation conditions it declared.`;

  return {
    leadingThesis: `${leading.agent.toUpperCase()} ${leading.stance} @ confidence ${leading.confidence.toFixed(2)}`,
    verdict,
    challenges,
    missingInputs,
    weakAssumptions,
  };
}
