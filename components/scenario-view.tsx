"use client";

import { useState } from "react";
import { Badge, Button, Card, CardHeader, Select, Skeleton, TextInput } from "@/components/ui";

type ScenarioSide = {
  agents: Array<{ agent: string; stance: string; confidence: number }>;
  judge: { decision: string; confidence: number; disagreement: number };
  gate: { finalDecision: string; downgradedFrom: string | null; explanation: string };
  redTeam: { challenges: Array<{ attack: string; severity: string }> };
  evidence: { items: Array<{ id: string; label: string; display: string }> };
};

type ScenarioResponse = {
  baseline: ScenarioSide;
  shocked: ScenarioSide;
  priceBefore: string;
  priceAfter: string;
};

const decisionTone = (d: string) =>
  d === "LONG" ? "bull" : d === "SHORT" ? "bear" : d === "NO_TRADE" ? "warn" : "neutral";

export function ScenarioView() {
  const [symbol, setSymbol] = useState("SOL");
  const [priceShock, setPriceShock] = useState("-10");
  const [volMult, setVolMult] = useState("2");
  const [data, setData] = useState<ScenarioResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          priceShockPct: Number(priceShock),
          volumeMultiplier: 2,
          volatilityMultiplier: Number(volMult),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error?.message ?? "Scenario failed.");
        return;
      }
      setData(d);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Build a counterfactual"
          subtitle="An instantaneous price shock + volatility scaling applied to recent hourly candles, then the SAME council pipeline runs on the transformed series. Outputs are hypothetical — model sensitivity, not forecasts."
          right={<Badge tone="warn">HYPOTHETICAL</Badge>}
        />
        <form onSubmit={run} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-ink-faint">Symbol</label>
            <TextInput value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="w-28 font-mono" aria-label="Symbol" />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 flex justify-between text-[11px] text-ink-faint"><span>Price shock</span><span className="tabular text-ink">{priceShock}%</span></label>
            <input type="range" min="-50" max="50" step="1" value={priceShock} onChange={(e) => setPriceShock(e.target.value)} className="w-full accent-[#38d9f0]" aria-label="Price shock percent" />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 flex justify-between text-[11px] text-ink-faint"><span>Volatility multiplier</span><span className="tabular text-ink">{volMult}×</span></label>
            <input type="range" min="0.5" max="6" step="0.5" value={volMult} onChange={(e) => setVolMult(e.target.value)} className="w-full accent-[#38d9f0]" aria-label="Volatility multiplier" />
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Simulating…" : "Run scenario"}</Button>
        </form>
        {error && <p className="mt-3 rounded-lg border border-bear/30 bg-bear-soft/50 px-3 py-2 text-xs text-bear">{error}</p>}
      </Card>

      {busy && <Card><Skeleton /></Card>}

      {data && !busy && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Baseline (unshocked)" subtitle={`price $${Number(data.priceBefore).toLocaleString("en-US")}`} right={<Badge tone={decisionTone(data.baseline.gate.finalDecision)}>{data.baseline.gate.finalDecision.replace("_", " ")}</Badge>} />
              <JudgeSummary side={data.baseline} />
            </Card>
            <Card className={data.baseline.gate.finalDecision !== data.shocked.gate.finalDecision ? "border-accent/40" : ""}>
              <CardHeader title="Shocked scenario" subtitle={`price $${Number(data.priceAfter).toLocaleString("en-US")}`} right={<Badge tone={decisionTone(data.shocked.gate.finalDecision)}>{data.shocked.gate.finalDecision.replace("_", " ")}</Badge>} />
              <JudgeSummary side={data.shocked} />
            </Card>
          </div>
          <Card>
            <CardHeader title="What changed" subtitle="Deterministic comparison of the two runs" />
            <ul className="space-y-1.5 text-sm text-ink-dim">
              <li className="tabular">
                Judge decision: {data.baseline.gate.finalDecision.replace("_", " ")} → <span className="text-ink">{data.shocked.gate.finalDecision.replace("_", " ")}</span>
                {data.shocked.gate.downgradedFrom && <span className="text-ink-faint"> (downgraded from {data.shocked.gate.downgradedFrom})</span>}
              </li>
              <li className="tabular">
                Judge confidence: {(data.baseline.judge.confidence * 100).toFixed(0)}% → {(data.shocked.judge.confidence * 100).toFixed(0)}%
              </li>
              <li className="tabular">
                Disagreement: {data.baseline.judge.disagreement.toFixed(2)} → {data.shocked.judge.disagreement.toFixed(2)}
              </li>
              <li className="tabular">Red-team challenges: {data.baseline.redTeam.challenges.length} → {data.shocked.redTeam.challenges.length}</li>
            </ul>
            <p className="mt-3 text-[11px] text-ink-faint">
              Scenario outputs are hypothetical transformations of historical data. They are not
              forecasts, guarantees, or trading signals.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function JudgeSummary({ side }: { side: ScenarioSide }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-surface-2 px-3 py-2"><span className="text-ink-faint">Confidence:</span> <span className="tabular text-ink">{(side.judge.confidence * 100).toFixed(0)}%</span></div>
        <div className="rounded-lg bg-surface-2 px-3 py-2"><span className="text-ink-faint">Disagreement:</span> <span className="tabular text-ink">{side.judge.disagreement.toFixed(2)}</span></div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {side.agents.map((a) => (
          <Badge key={a.agent} tone={a.stance === "long" ? "bull" : a.stance === "short" ? "bear" : "neutral"}>
            {a.agent}: {a.stance} {(a.confidence * 100).toFixed(0)}%
          </Badge>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">{side.gate.explanation}</p>
    </div>
  );
}
