import { evidenceBias, type EvidenceItem, type MarketEvidence } from "./evidence";

/*
 * Agent personas — Bull, Bear, Risk, Analyst. Each produces a STRUCTURED,
 * evidence-linked thesis. Thesis prose is template-generated from computed
 * evidence (the optional LLM narrative layer annotates but can never alter
 * structure, confidence, evidence IDs or invalidation conditions — Rule 7).
 */

export type Stance = "long" | "short" | "neutral";

export type AgentOutput = {
  agent: "bull" | "bear" | "risk" | "analyst";
  stance: Stance;
  confidence: number; // 0..1
  thesis: string;
  evidenceIds: string[];
  assumptions: string[];
  horizon: string;
  invalidation: string[];
};

function item(items: EvidenceItem[], prefix: string): EvidenceItem | null {
  return items.find((i) => i.id.includes(prefix)) ?? null;
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function runAgent(
  agent: AgentOutput["agent"],
  ev: MarketEvidence,
): AgentOutput {
  const bias = evidenceBias(ev.items);
  const mom24 = item(ev.items, "ev:mom:24h");
  const mom7 = item(ev.items, "ev:mom:7d");
  const vol = item(ev.items, "ev:vol");
  const fund = item(ev.items, "ev:funding");
  const regime = item(ev.items, "ev:regime");

  const evidenceIds = ev.items.slice(0, 6).map((i) => i.id);
  const thin = ev.candleCount < 30;

  switch (agent) {
    case "bull": {
      const conf = thin ? 0.25 : Math.max(0.1, Math.min(0.9, 0.5 + bias * 0.5));
      const stance: Stance = bias > 0.15 ? "long" : bias < -0.25 ? "neutral" : "neutral";
      return {
        agent,
        stance,
        confidence: stance === "long" ? conf : Math.min(conf, 0.4),
        thesis: thin
          ? `Thin data (${ev.candleCount} candles). ${mom24 ? `24h change ${mom24.display}. ` : ""}Not enough history for a high-conviction constructive case.`
          : `Constructive case: ${mom24 ? `24h momentum ${mom24.display}; ` : ""}${mom7 ? `7d ${mom7.display}. ` : ""}${fund ? `Funding ${fund.display} ${Number(fund.display.replace("%", "").split(" ")[0]) < 0 ? "means shorts are paying longs — a supportive carry setup" : "shows longs are paying, a mild cost"}. ` : ""}${regime ? `Regime: ${regime.display}.` : ""}`,
        evidenceIds,
        assumptions: ["Recent momentum persists over the stated horizon", "No exogenous catalyst reverses the trend within the horizon"],
        horizon: "24-72h",
        invalidation: [
          mom24 ? `24h momentum turns below ${(Number(mom24.display.replace("%", "")) * 0.5).toFixed(1)}%` : "24h momentum flips negative",
          fund ? `Funding rises above ${(Number(fund.display.replace("%", "").split(" ")[0]) * 4).toFixed(3)}% (crowded longs)` : "Funding turns sharply positive",
          "Close below SMA24 on rising volume",
        ],
      };
    }
    case "bear": {
      const conf = thin ? 0.25 : Math.max(0.1, Math.min(0.9, 0.5 - bias * 0.5));
      const stance: Stance = bias < -0.15 ? "short" : "neutral";
      return {
        agent,
        stance,
        confidence: stance === "short" ? conf : Math.min(conf, 0.4),
        thesis: thin
          ? `Thin data (${ev.candleCount} candles). ${mom24 ? `24h change ${mom24.display}. ` : ""}Not enough history for a high-conviction skeptical case.`
          : `Skeptical case: ${mom24 ? `24h momentum ${mom24.display}; ` : ""}${mom7 ? `7d ${mom7.display}. ` : ""}${fund ? `Funding ${fund.display} ${Number(fund.display.replace("%", "").split(" ")[0]) > 0 ? "shows longs are paying — crowded positioning risk" : "shows shorts are paying, reducing downside pressure"}. ` : ""}${regime ? `Regime: ${regime.display}.` : ""}`,
        evidenceIds,
        assumptions: ["Recent momentum mean-reverts or extends downward", "Funding-driven positioning unwinds are plausible"],
        horizon: "24-72h",
        invalidation: [
          mom7 ? `7d momentum resumes above ${Math.abs(Number(mom7.display.replace("%", "")) * 0.5).toFixed(1)}%` : "7d momentum flips positive",
          "Reclaim of SMA168 with volume",
          fund ? "Funding flips deeply negative (shorts overcrowd)" : "Funding flips deeply negative",
        ],
      };
    }
    case "risk": {
      const volNum = vol ? Number(vol.display.replace("% per hour", "")) : 0;
      const risky = volNum > 0.4 || ev.freshness.stale || thin;
      return {
        agent: "risk",
        stance: "neutral",
        confidence: risky ? 0.7 : 0.45,
        thesis: `Risk view: ${vol ? `hourly volatility ${vol.display}` : "volatility unavailable"}; ${ev.freshness.stale ? "data is STALE — freshness gate should veto conviction; " : ""}${thin ? `only ${ev.candleCount} candles of history — sample-size risk is elevated; ` : ""}${ev.freshness.source === "seed" ? "demo seed data — not live market truth." : "live exchange data."} Sizing must respect stop distance implied by volatility.`,
        evidenceIds,
        assumptions: ["Volatility persistence is the dominant risk over 24-72h"],
        horizon: "24-72h",
        invalidation: [
          "Volatility regime shifts by more than 2× within the horizon",
          "Data freshness degrades beyond the gate threshold",
        ],
      };
    }
    case "analyst": {
      return {
        agent: "analyst",
        stance: "neutral",
        confidence: thin ? 0.3 : 0.6,
        thesis: `Synthesis: evidence bias ${(bias * 100).toFixed(0)}/100 across ${ev.items.length} computed items. ${mom24 ? `24h ${mom24.display}, ` : ""}${mom7 ? `7d ${mom7.display}, ` : ""}${regime ? `regime ${regime.display}, ` : ""}${vol ? `hourly vol ${vol.display}.` : ""} The evidence set is ${ev.items.length < 4 ? "thin — treat any signal as low quality" : "sufficient for a directional lean but not for conviction sizing"}.`,
        evidenceIds,
        assumptions: ["Computed evidence reflects the market at the freshness timestamp"],
        horizon: "24-72h",
        invalidation: ["Any material input changes (price, funding, volume) beyond the observed ranges"],
      };
    }
  }
}

export function runCouncil(ev: MarketEvidence): AgentOutput[] {
  return (["bull", "bear", "risk", "analyst"] as const).map((a) => runAgent(a, ev));
}
