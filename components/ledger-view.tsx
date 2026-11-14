"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Badge, Card, CardHeader, Select, Skeleton, TextInput } from "@/components/ui";
import { MotionDrawer } from "@/components/motion";

/*
 * Decision Ledger — polished decision history: timeline layout, filters,
 * evidence detail in a drawer. Replay renders the immutable stored snapshot
 * exactly as persisted (never regenerated).
 */

type DecisionRow = {
  id: string;
  symbol: string;
  decision: string;
  confidence: string;
  dataMode: string;
  createdAt: string;
  snapshot: {
    price?: string;
    gate?: { passed?: boolean; finalDecision?: string; downgradedFrom?: string | null; checks?: Array<{ id: string; label: string; passed: boolean; detail: string }> };
    judge?: { confidence?: number; decision?: string };
    evidence?: { items?: Array<{ id: string; label: string; display: string }> };
    agents?: Array<{ agent: string; stance: string; confidence: number }>;
    redTeam?: { challenges?: Array<{ severity: string; attack: string }> };
  };
};

const decisionTone = (d: string) =>
  d === "LONG" ? "bull" : d === "SHORT" ? "bear" : d === "NO_TRADE" ? "warn" : "neutral";

export function LedgerView() {
  const [rows, setRows] = useState<DecisionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState<DecisionRow | null>(null);
  const [symbolFilter, setSymbolFilter] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");

  useEffect(() => {
    fetch("/api/decisions?limit=100")
      .then((r) => r.json())
      .then((d) => (d?.decisions ? setRows(d.decisions) : setError(d?.error?.message ?? "Failed to load")))
      .catch(() => setError("Failed to load decisions"));
  }, []);

  async function openReplay(id: string) {
    const res = await fetch(`/api/decisions?id=${id}`);
    const d = await res.json();
    if (res.ok) setReplay(d.decision);
  }

  const symbols = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.symbol))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter(
      (r) =>
        (!symbolFilter || r.symbol === symbolFilter) &&
        (!decisionFilter || r.decision === decisionFilter),
    );
  }, [rows, symbolFilter, decisionFilter]);

  if (error) {
    return (
      <Card className="border-bear/30">
        <p className="text-sm text-bear">{error}</p>
      </Card>
    );
  }
  if (!rows) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <Card className="halo py-12 text-center">
        <p className="text-sm font-semibold text-ink">No decisions recorded yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-faint">
          Run the Agent Council — every run is snapshotted here with its evidence, agents,
          red-team review, judge output and gate checks. Replay renders the stored snapshot exactly
          as saved.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Filters</span>
        <Select value={symbolFilter} onChange={(e) => setSymbolFilter(e.target.value)} aria-label="Filter by symbol">
          <option value="">All symbols</option>
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-1.5">
          {["", "LONG", "SHORT", "NO_TRADE", "ABSTAIN"].map((d) => (
            <button
              key={d || "all"}
              onClick={() => setDecisionFilter(d)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                decisionFilter === d
                  ? "border-accent/45 bg-accent-soft text-accent"
                  : "border-line text-ink-dim hover:text-ink"
              }`}
            >
              {d ? d.replace("_", " ") : "ALL"}
            </button>
          ))}
        </div>
        <span className="tabular ml-auto text-xs text-ink-faint">
          {filtered.length} of {rows.length} decisions
        </span>
      </Card>

      {/* Timeline */}
      <div className="relative space-y-2.5 pl-6">
        <span className="absolute bottom-4 left-[10px] top-4 w-px bg-line" aria-hidden />
        {filtered.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.4), duration: 0.3 }}
            className="relative"
          >
            <span
              className={`absolute -left-[19px] top-6 h-2.5 w-2.5 rounded-full border-2 border-bg ${
                r.decision === "LONG"
                  ? "bg-bull"
                  : r.decision === "SHORT"
                    ? "bg-bear"
                    : r.decision === "NO_TRADE"
                      ? "bg-warn"
                      : "bg-neutral-chip"
              }`}
              aria-hidden
            />
            <Card className="hover-lift flex flex-wrap items-center justify-between gap-3 py-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="tabular text-xs text-ink-faint">
                  {new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")}Z
                </span>
                <span className="text-sm font-semibold text-ink">{r.symbol}</span>
                <Badge tone={decisionTone(r.decision)} mono>
                  {r.decision.replace("_", " ")}
                </Badge>
                {r.snapshot?.gate?.downgradedFrom && (
                  <span className="text-[10px] text-ink-faint">(downgraded from {r.snapshot.gate.downgradedFrom})</span>
                )}
                {r.snapshot?.price && (
                  <span className="tabular text-[11px] text-ink-faint">
                    @ ${Number(r.snapshot.price).toLocaleString("en-US")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular text-xs text-ink-dim">{(Number(r.confidence) * 100).toFixed(0)}%</span>
                {r.dataMode === "demo" ? <Badge tone="warn">DEMO</Badge> : <Badge tone="accent">LIVE</Badge>}
                <button onClick={() => openReplay(r.id)} className="text-xs text-accent hover:underline">
                  replay
                </button>
              </div>
            </Card>
          </motion.div>
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-faint">No decisions match the filters.</p>
        )}
      </div>

      {/* Replay drawer */}
      <MotionDrawer open={replay !== null} onClose={() => setReplay(null)} title={`Replay — ${replay?.symbol ?? ""}`}>
        {replay && (
          <div className="space-y-5">
            <div className="rounded-xl border border-line bg-bg-2/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-faint">
                  {new Date(replay.createdAt).toISOString().slice(0, 16).replace("T", " ")}Z
                </span>
                <Badge tone={decisionTone(replay.decision)} mono>
                  {replay.decision.replace("_", " ")}
                </Badge>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                Rendered from the immutable stored snapshot — not regenerated.
              </p>
            </div>

            {replay.snapshot?.gate?.checks && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  Quality gate checks
                </p>
                <div className="space-y-1.5">
                  {replay.snapshot.gate.checks.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 rounded-lg border border-line bg-bg-2/70 px-3 py-2">
                      <span className={`mt-0.5 text-xs ${c.passed ? "text-bull" : "text-bear"}`}>
                        {c.passed ? "✓" : "✗"}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-ink">{c.label}</p>
                        <p className="text-[11px] text-ink-dim">{c.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {replay.snapshot?.agents && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  Agent claims
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {replay.snapshot.agents.map((a) => (
                    <Badge
                      key={a.agent}
                      tone={a.stance === "long" ? "bull" : a.stance === "short" ? "bear" : "neutral"}
                    >
                      {a.agent}: {a.stance} {(a.confidence * 100).toFixed(0)}%
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {replay.snapshot?.redTeam?.challenges && replay.snapshot.redTeam.challenges.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  Red-team challenges
                </p>
                <div className="space-y-1.5">
                  {replay.snapshot.redTeam.challenges.map((c, i) => (
                    <div key={i} className="rounded-lg border border-redteam/20 bg-redteam-soft/20 px-3 py-2 text-[11px] leading-relaxed text-ink-dim">
                      <Badge tone={c.severity === "high" ? "bear" : "warn"} className="mb-1">
                        {c.severity.toUpperCase()}
                      </Badge>
                      <br />
                      {c.attack}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <details className="text-xs text-ink-faint">
              <summary className="cursor-pointer select-none hover:text-ink-dim">Raw stored snapshot</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-line bg-surface-2 p-3 text-[10px] leading-relaxed text-ink-dim">
                {JSON.stringify(replay.snapshot, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </MotionDrawer>
    </div>
  );
}
