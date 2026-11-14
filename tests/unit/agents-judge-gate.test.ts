import { describe, it, expect } from "vitest";
import { runJudge, runQualityGate, type JudgeOutput } from "@/lib/decision-policy/judge-gate";
import { runCouncil } from "@/lib/agents/personas";
import { runRedTeam } from "@/lib/agents/redteam";
import { buildEvidence, type EvidenceItem } from "@/lib/agents/evidence";
import type { AgentOutput } from "@/lib/agents/personas";

const ev = (
  items: Array<[id: string, score: number, display: string]>,
  opts?: { stale?: boolean; candleCount?: number },
) => {
  const full: EvidenceItem[] = items.map(([id, score, display]) => ({
    id,
    kind: id.includes("mom") ? "momentum" : id.includes("fund") ? "funding" : "volatility",
    label: id,
    score,
    display,
    sampleSize: 24,
  }));
  return {
    symbol: "BTC",
    items: full,
    freshness: { source: "hyperliquid", fetchedAt: Date.now() - (opts?.stale ? 600_000 : 1000), ageSec: opts?.stale ? 600 : 1, stale: Boolean(opts?.stale) },
    candleCount: opts?.candleCount ?? 168,
  };
};

const agent = (over: Partial<AgentOutput>): AgentOutput => ({
  agent: "bull",
  stance: "neutral",
  confidence: 0.5,
  thesis: "t",
  evidenceIds: [],
  assumptions: [],
  horizon: "24-72h",
  invalidation: [],
  ...over,
});

describe("Judge (deterministic)", () => {
  it("returns LONG when long-side conviction clears the threshold", () => {
    const agents = [
      agent({ agent: "bull", stance: "long", confidence: 0.8 }),
      agent({ agent: "analyst", stance: "neutral", confidence: 0.6 }),
      agent({ agent: "risk", stance: "neutral", confidence: 0.5 }),
      agent({ agent: "bear", stance: "short", confidence: 0.1 }),
    ];
    const rt = runRedTeam(agents, ev([["ev:mom:24h:BTC", 0.5, "2.5%"]]));
    const j = runJudge(agents, rt);
    // Long-side mean confidence = 0.8 ≥ 0.45 and > short side (0.1).
    expect(j.decision).toBe("LONG");
    expect(j.weightedLong).toBeCloseTo(0.8, 2);
  });

  it("clears LONG when long mass is strong and disagreement low", () => {
    const agents = [
      agent({ agent: "bull", stance: "long", confidence: 0.95 }),
      agent({ agent: "analyst", stance: "long", confidence: 0.9 }),
      agent({ agent: "risk", stance: "neutral", confidence: 0.5 }),
      agent({ agent: "bear", stance: "neutral", confidence: 0.4 }),
    ];
    const rt = runRedTeam(agents, ev([["ev:mom:24h:BTC", 0.6, "3.0%"]]));
    const j = runJudge(agents, rt);
    // weightedLong = (0.95+0.9)/4 = 0.4625 ≥ 0.45
    expect(j.decision).toBe("LONG");
    expect(j.confidence).toBeGreaterThan(0.45);
    expect(j.riskReward).not.toBeNull();
  });

  it("NO_TRADE when both sides are strong (high disagreement)", () => {
    const agents = [
      agent({ agent: "bull", stance: "long", confidence: 0.9 }),
      agent({ agent: "bear", stance: "short", confidence: 0.9 }),
      agent({ agent: "risk", stance: "neutral", confidence: 0.5 }),
      agent({ agent: "analyst", stance: "neutral", confidence: 0.5 }),
    ];
    const rt = runRedTeam(agents, ev([]));
    const j = runJudge(agents, rt);
    expect(j.decision).toBe("NO_TRADE");
    expect(j.disagreement).toBeGreaterThan(0.4);
  });

  it("reduces confidence for high-severity red-team challenges", () => {
    const agents = [
      agent({ agent: "bull", stance: "long", confidence: 0.95 }),
      agent({ agent: "analyst", stance: "long", confidence: 0.9 }),
      agent({ agent: "risk", stance: "neutral", confidence: 0.5 }),
      agent({ agent: "bear", stance: "neutral", confidence: 0.4 }),
    ];
    const rt = runRedTeam(agents, ev([["ev:mom:24h:BTC", -0.5, "-2.5%"]], { stale: true }));
    const j = runJudge(agents, rt);
    // Contradictory momentum + stale data produce high-severity challenges.
    expect(rt.challenges.some((c) => c.severity === "high")).toBe(true);
    // Baseline (no challenges) vs challenged — reduction must be meaningful.
    const clean = runJudge(agents, runRedTeam(agents, ev([["ev:mom:24h:BTC", 0.5, "2.5%"]])));
    expect(j.confidence).toBeLessThan(clean.confidence);
    expect(clean.confidence - j.confidence).toBeGreaterThanOrEqual(0.1);
  });
});

describe("Quality Gate", () => {
  const baseJudge: JudgeOutput = {
    decision: "LONG",
    confidence: 0.6,
    rationale: "test",
    weightedLong: 0.6,
    weightedShort: 0.1,
    disagreement: 0.2,
    riskReward: 2.0,
    invalidation: [],
  };

  it("passes a clean, fresh, liquid signal", () => {
    const g = runQualityGate(baseJudge, {
      evidenceItemCount: 6,
      evidenceStale: false,
      symbolSupported: true,
      dataMode: "live",
      volumeUsd: 50_000_000,
    });
    expect(g.passed).toBe(true);
    expect(g.finalDecision).toBe("LONG");
    expect(g.downgradedFrom).toBeNull();
    expect(g.checks.every((c) => c.passed)).toBe(true);
  });

  it("downgrades to NO_TRADE on stale data with a plain-language reason", () => {
    const g = runQualityGate(baseJudge, {
      evidenceItemCount: 6,
      evidenceStale: true,
      symbolSupported: true,
      dataMode: "live",
      volumeUsd: 50_000_000,
    });
    expect(g.finalDecision).toBe("NO_TRADE");
    expect(g.downgradedFrom).toBe("LONG");
    expect(g.explanation).toMatch(/freshness/i);
  });

  it("downgrades to NO_TRADE when R/R is below minimum", () => {
    const g = runQualityGate({ ...baseJudge, riskReward: 1.0 }, {
      evidenceItemCount: 6,
      evidenceStale: false,
      symbolSupported: true,
      dataMode: "live",
      volumeUsd: 50_000_000,
    });
    expect(g.finalDecision).toBe("NO_TRADE");
    expect(g.explanation).toMatch(/Risk \/ reward/i);
  });

  it("blocks unsupported or illiquid tokens", () => {
    const g = runQualityGate(baseJudge, {
      evidenceItemCount: 6,
      evidenceStale: false,
      symbolSupported: false,
      dataMode: "live",
      volumeUsd: 10,
    });
    expect(g.finalDecision).toBe("NO_TRADE");
    expect(g.checks.find((c) => c.id === "token_safety")!.passed).toBe(false);
  });

  it("ABSTAIN when everything is thin", () => {
    const g = runQualityGate({ ...baseJudge, decision: "ABSTAIN" }, {
      evidenceItemCount: 1,
      evidenceStale: true,
      symbolSupported: false,
      dataMode: "live",
      volumeUsd: 0,
    });
    expect(g.finalDecision).toBe("ABSTAIN");
  });
});

describe("council over real evidence", () => {
  it("produces four structured agents and a coherent pipeline", () => {
    const candles = Array.from({ length: 100 }, (_, i) => ({
      t: i * 3600_000,
      T: i * 3600_000 + 3599_000,
      s: "BTC",
      i: "1h",
      o: String(100 + i * 0.5),
      c: String(100.5 + i * 0.5),
      h: String(101 + i * 0.5),
      l: String(99 + i * 0.5),
      v: "1000",
    }));
    const evidence = buildEvidence("BTC", candles, {
      markPx: "150",
      fundingRate: "0.0001",
      openInterest: "100000",
      dayNtlVlm: "500000000",
      prevDayPx: "145",
    }, { source: "hyperliquid", fetchedAt: Date.now(), ageSec: 1, stale: false });

    const agents = runCouncil(evidence);
    expect(agents).toHaveLength(4);
    for (const a of agents) {
      expect(a.evidenceIds.length).toBeGreaterThan(0);
      expect(a.invalidation.length).toBeGreaterThan(0);
      expect(a.confidence).toBeGreaterThanOrEqual(0);
      expect(a.confidence).toBeLessThanOrEqual(1);
    }
    // Steady uptrend → bull stance long, bear neutral/short.
    const bull = agents.find((a) => a.agent === "bull")!;
    expect(bull.stance).toBe("long");

    const rt = runRedTeam(agents, evidence);
    expect(rt.verdict.length).toBeGreaterThan(10);

    const judge = runJudge(agents, rt);
    const gate = runQualityGate(judge, {
      evidenceItemCount: evidence.items.length,
      evidenceStale: false,
      symbolSupported: true,
      dataMode: "live",
      volumeUsd: 500_000_000,
    });
    expect(["LONG", "SHORT", "NO_TRADE", "ABSTAIN"]).toContain(gate.finalDecision);
  });
});
