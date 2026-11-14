"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Badge, Button, Card, CardHeader, DataModeBadge, Select, TextInput } from "@/components/ui";
import { ThinkingDots as Dots } from "@/components/motion";

type AgentOutput = {
  agent: string;
  stance: "long" | "short" | "neutral";
  confidence: number;
  thesis: string;
  evidenceIds: string[];
  assumptions: string[];
  horizon: string;
  invalidation: string[];
};

type Snapshot = {
  runId: string;
  symbol: string;
  dataMode: "live" | "demo";
  createdAt: number;
  price: string;
  evidence: {
    items: Array<{ id: string; label: string; display: string; score: number }>;
    freshness: { source: string; ageSec: number; stale: boolean };
    candleCount: number;
  };
  agents: AgentOutput[];
  redTeam: {
    leadingThesis: string;
    verdict: string;
    challenges: Array<{ target: string; attack: string; evidenceIds: string[]; severity: string }>;
    missingInputs: string[];
    weakAssumptions: string[];
  };
  judge: {
    decision: string;
    confidence: number;
    rationale: string;
    weightedLong: number;
    weightedShort: number;
    disagreement: number;
    riskReward: number | null;
    invalidation: string[];
  };
  gate: {
    passed: boolean;
    checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
    finalDecision: string;
    downgradedFrom: string | null;
    explanation: string;
  };
};

const agentAccent: Record<string, string> = {
  bull: "#2fe0a2",
  bear: "#ff6b7d",
  risk: "#ffc757",
  analyst: "#a78bfa",
};

const agentTone: Record<string, "bull" | "bear" | "warn" | "analyst"> = {
  bull: "bull",
  bear: "bear",
  risk: "warn",
  analyst: "analyst",
};

const stanceBadge = (s: string) =>
  s === "long" ? (
    <Badge tone="bull">LONG</Badge>
  ) : s === "short" ? (
    <Badge tone="bear">SHORT</Badge>
  ) : (
    <Badge tone="neutral">NEUTRAL</Badge>
  );

const RUN_STAGES = [
  "Computing market evidence…",
  "Bull / Bear / Risk / Analyst deliberating…",
  "Red-Team attacking the leading thesis…",
  "Judge weighing the council…",
  "Quality Gate evaluating checks…",
];

export function CouncilWorkbench({ defaultSymbol }: { defaultSymbol: string }) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [decisionId, setDecisionId] = useState<string | null>(null);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setStage(0);
    const ticker = setInterval(
      () => setStage((s) => Math.min(s + 1, RUN_STAGES.length - 1)),
      900,
    );
    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message ?? "Run failed.");
        return;
      }
      setSnap(data.snapshot);
      setDecisionId(data.decisionId);
    } catch {
      setError("Network error during the council run.");
    } finally {
      clearInterval(ticker);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          eyebrow="Council run"
          title="Run the council"
          subtitle="Evidence → Bull/Bear/Risk/Analyst → Red-Team → Judge → Quality Gate. Fully deterministic — the Judge and Gate are pure code."
        />
        <form onSubmit={run} className="flex flex-wrap gap-2">
          <TextInput
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="w-40 font-mono"
            aria-label="Symbol"
          />
          <Select aria-label="Quick pick" onChange={(e) => e.target.value && setSymbol(e.target.value)} value="">
            <option value="">Quick pick…</option>
            {["BTC", "ETH", "SOL", "ARB", "AVAX", "LINK", "DOGE", "OP"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={busy || !symbol.trim()}>
            {busy ? "Council deliberating…" : "Run council"}
          </Button>
        </form>
        {error && (
          <p className="mt-3 rounded-lg border border-bear/30 bg-bear-soft/50 px-3 py-2 text-xs text-bear">{error}</p>
        )}
      </Card>

      {busy && (
        <Card>
          <div className="space-y-2.5">
            {RUN_STAGES.map((s, i) => (
              <div key={s} className="flex items-center gap-2.5 text-xs">
                {i < stage ? (
                  <span className="text-bull">✓</span>
                ) : i === stage ? (
                  <Dots />
                ) : (
                  <span className="text-ink-faint/40">○</span>
                )}
                <span className={i <= stage ? "text-ink-dim" : "text-ink-faint/50"}>{s}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="shimmer h-28 rounded-xl" />
            ))}
          </div>
        </Card>
      )}

      <AnimatePresence>
        {snap && !busy && (
          <motion.div
            key={snap.runId}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            <Card>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-lg font-semibold tracking-tight text-ink">{snap.symbol}</span>
                <span className="tabular text-lg text-ink-dim">
                  @ ${Number(snap.price).toLocaleString("en-US")}
                </span>
                <DataModeBadge mode={snap.dataMode} />
                {snap.evidence.freshness.stale ? (
                  <Badge tone="warn" mono>
                    stale {snap.evidence.freshness.ageSec}s
                  </Badge>
                ) : (
                  <Badge tone="neutral" mono>
                    fresh {snap.evidence.freshness.ageSec}s
                  </Badge>
                )}
                {decisionId && <Badge tone="accent">saved to ledger</Badge>}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {snap.evidence.items.map((i) => (
                  <div
                    key={i.id}
                    className="rounded-lg border border-line bg-bg-2/70 px-3 py-2 transition-colors hover:border-line-strong"
                  >
                    <p className="text-[10px] text-ink-faint">{i.label}</p>
                    <p className="tabular text-sm font-medium text-ink">{i.display}</p>
                  </div>
                ))}
              </div>
            </Card>


            {/* Verdict banner */}
            <div
              className={`relative overflow-hidden rounded-[12px] border p-4 ${
                snap.gate.passed
                  ? "border-bull/30 bg-bull-soft/25"
                  : snap.gate.finalDecision === "ABSTAIN"
                    ? "border-line bg-surface/70"
                    : "border-warn/30 bg-warn-soft/25"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-xl border text-sm font-bold ${
                      snap.judge.decision === "LONG"
                        ? "border-bull/40 bg-bull-soft text-bull"
                        : snap.judge.decision === "SHORT"
                          ? "border-bear/40 bg-bear-soft text-bear"
                          : "border-line bg-surface-3 text-ink-dim"
                    }`}
                  >
                    {snap.judge.decision === "LONG" ? "↑" : snap.judge.decision === "SHORT" ? "↓" : "■"}
                  </span>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                      Judge verdict · gate {snap.gate.passed ? "passed" : "refused"}
                    </p>
                    <p className="text-lg font-semibold tracking-tight text-ink">
                      {snap.gate.finalDecision.replace("_", " ")}{" "}
                      <span className="text-sm font-normal text-ink-dim">
                        on {snap.symbol} · confidence {(snap.judge.confidence * 100).toFixed(0)}%
                      </span>
                    </p>
                  </div>
                </div>
                <div className="w-48">
                  <p className="mb-1 flex justify-between text-[10px] text-ink-faint">
                    <span>council consensus</span>
                    <span className="tabular text-ink-dim">{(snap.judge.disagreement * 100).toFixed(0)}% disagreement</span>
                  </p>
                  <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full bg-bull/80"
                      style={{ width: `${Math.round(snap.judge.weightedLong * 100)}%` }}
                    />
                    <div
                      className="h-full bg-neutral-chip/50"
                      style={{ width: `${Math.round(Math.max(0, 100 - snap.judge.weightedLong * 100 - snap.judge.weightedShort * 100))}%` }}
                    />
                    <div
                      className="h-full bg-bear/80"
                      style={{ width: `${Math.round(snap.judge.weightedShort * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 flex justify-between text-[9px] text-ink-faint">
                    <span className="text-bull">long {snap.judge.weightedLong.toFixed(2)}</span>
                    <span className="text-bear">short {snap.judge.weightedShort.toFixed(2)}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {snap.agents.map((a, idx) => (
                <motion.div
                  key={a.agent}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * idx, duration: 0.4 }}
                >
                  <Card
                    className="h-full"
                    variant="default"
                  >
                    <div
                      className="absolute inset-x-0 top-0 h-[2px] rounded-t-[12px]"
                      style={{ background: `linear-gradient(90deg, ${agentAccent[a.agent]}, transparent 70%)` }}
                      aria-hidden
                    />
                    <div className="mb-3 flex items-center justify-between pt-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="grid h-6 w-6 place-items-center rounded-md border text-[10px] font-bold"
                          style={{ borderColor: `${agentAccent[a.agent]}44`, color: agentAccent[a.agent], background: `${agentAccent[a.agent]}14` }}
                        >
                          {a.agent[0].toUpperCase()}
                        </span>
                        <Badge tone={agentTone[a.agent]} mono>
                          {a.agent.toUpperCase()}
                        </Badge>
                        {stanceBadge(a.stance)}
                      </div>
                      <span className="tabular text-xs text-ink-dim">
                        confidence {(a.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <motion.div
                        className={`h-full rounded-full ${
                          a.stance === "long"
                            ? "bg-gradient-to-r from-bull/60 to-bull"
                            : a.stance === "short"
                              ? "bg-gradient-to-r from-bear/60 to-bear"
                              : "bg-neutral-chip/50"
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(a.confidence * 100)}%` }}
                        transition={{ delay: 0.2 + idx * 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                    <p className="text-[13px] leading-relaxed text-ink-dim">{a.thesis}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {a.evidenceIds.slice(0, 4).map((id) => (
                        <Badge key={id} tone="neutral" mono>
                          {id.replace(/^ev:/, "")}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-3 space-y-1 border-t border-line pt-3 text-[11px] text-ink-faint">
                      <p>
                        <span className="font-medium text-ink-dim">Horizon:</span> {a.horizon}
                      </p>
                      <p>
                        <span className="font-medium text-ink-dim">Invalidation:</span> {a.invalidation.join(" · ")}
                      </p>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>

            <Card className="border-redteam/25" variant="elevated">
              <CardHeader
                title="Red-Team challenge"
                subtitle="Adversarial review of the leading thesis — not another directional card"
                right={<Badge tone="redteam" mono>ADVERSARIAL</Badge>}
              />
              <p className="text-sm text-ink-dim">
                <span className="font-medium text-ink">Target:</span> {snap.redTeam.leadingThesis}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-redteam">{snap.redTeam.verdict}</p>
              {snap.redTeam.challenges.length > 0 && (
                <div className="mt-4 space-y-2 border-l-2 border-redteam/30 pl-4">
                  {snap.redTeam.challenges.map((c, i) => (
                    <div key={i} className="rounded-lg border border-redteam/20 bg-redteam-soft/20 p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge tone={c.severity === "high" ? "bear" : c.severity === "medium" ? "warn" : "neutral"}>
                          {c.severity.toUpperCase()}
                        </Badge>
                        <span className="text-[11px] text-ink-faint">vs {c.target}</span>
                      </div>
                      <p className="text-[13px] leading-relaxed text-ink-dim">{c.attack}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 grid gap-4 text-[11px] text-ink-faint sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 font-semibold uppercase tracking-wider text-ink-dim">
                    Missing inputs (disclosed, never fabricated)
                  </p>
                  <ul className="list-disc space-y-1 pl-4">
                    {snap.redTeam.missingInputs.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1.5 font-semibold uppercase tracking-wider text-ink-dim">Weak assumptions</p>
                  <ul className="list-disc space-y-1 pl-4">
                    {snap.redTeam.weakAssumptions.slice(0, 3).map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card variant="elevated">
                <CardHeader
                  title="Judge"
                  subtitle="Weighted council verdict — pure code"
                  right={
                    <Badge
                      tone={
                        snap.judge.decision === "LONG"
                          ? "bull"
                          : snap.judge.decision === "SHORT"
                            ? "bear"
                            : snap.judge.decision === "NO_TRADE"
                              ? "warn"
                              : "neutral"
                      }
                      mono
                    >
                      {snap.judge.decision.replace("_", " ")}
                    </Badge>
                  }
                />
                <p className="text-[13px] leading-relaxed text-ink-dim">{snap.judge.rationale}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-bg-2/70 px-3 py-2">
                    <span className="text-ink-faint">Weighted long:</span>{" "}
                    <span className="tabular text-ink">{snap.judge.weightedLong.toFixed(2)}</span>
                  </div>
                  <div className="rounded-lg bg-bg-2/70 px-3 py-2">
                    <span className="text-ink-faint">Weighted short:</span>{" "}
                    <span className="tabular text-ink">{snap.judge.weightedShort.toFixed(2)}</span>
                  </div>
                  <div className="rounded-lg bg-bg-2/70 px-3 py-2">
                    <span className="text-ink-faint">Disagreement:</span>{" "}
                    <span className="tabular text-ink">{snap.judge.disagreement.toFixed(2)}</span>
                  </div>
                  <div className="rounded-lg bg-bg-2/70 px-3 py-2">
                    <span className="text-ink-faint">R/R:</span>{" "}
                    <span className="tabular text-ink">{snap.judge.riskReward?.toFixed(2) ?? "—"}</span>
                  </div>
                </div>
                {snap.judge.invalidation.length > 0 && (
                  <p className="mt-3 border-t border-line pt-3 text-[11px] text-ink-faint">
                    <span className="font-medium text-ink-dim">Invalidation:</span>{" "}
                    {snap.judge.invalidation.join(" · ")}
                  </p>
                )}
              </Card>

              <Card variant="elevated">
                <CardHeader
                  title="Signal Quality Gate"
                  subtitle="Only a passing gate allows a directional decision"
                  right={
                    <Badge
                      tone={snap.gate.passed ? "bull" : snap.gate.finalDecision === "ABSTAIN" ? "neutral" : "warn"}
                      mono
                    >
                      {snap.gate.finalDecision.replace("_", " ")}
                    </Badge>
                  }
                />
                <div className="space-y-1.5">
                  {snap.gate.checks.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start gap-2.5 rounded-lg border border-line bg-bg-2/70 px-3 py-2"
                    >
                      <span className={`mt-0.5 text-sm ${c.passed ? "text-bull" : "text-bear"}`}>
                        {c.passed ? "✓" : "✗"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-ink">{c.label}</p>
                        <p className="text-[11px] leading-relaxed text-ink-dim">{c.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className={`mt-3 text-xs ${snap.gate.passed ? "text-bull" : "text-warn"}`}>
                  {snap.gate.explanation}
                </p>
                {snap.gate.downgradedFrom && (
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Downgraded from {snap.gate.downgradedFrom} by the gate — the Judge does not
                    override quality checks.
                  </p>
                )}
              </Card>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!snap && !busy && !error && (
        <Card className="halo py-14 text-center">
          <p className="text-sm font-semibold text-ink">Run the council on a symbol to begin</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-faint">
            Four agents publish evidence-linked theses, the Red-Team attacks the leading one, and
            the Judge + Quality Gate decide whether anything survives. A low-quality signal
            legitimately ends in NO TRADE.
          </p>
        </Card>
      )}
    </div>
  );
}
