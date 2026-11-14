"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Badge, Card, CardHeader, DataModeBadge, Skeleton } from "@/components/ui";
import { MotionDrawer } from "@/components/motion";

/*
 * Evidence Graph — interactive provenance visualization for a stored decision.
 * source data → market observations → agent claims → red-team challenges →
 * judge → quality gate. Nodes and edges derive from the immutable snapshot;
 * hover highlights relationships, click opens the detail drawer. Restrained
 * entrance animation; nothing is fabricated.
 */

type Decision = {
  id: string;
  symbol: string;
  decision: string;
  confidence: string;
  dataMode: string;
  createdAt: string;
  snapshot: {
    evidence: { items: Array<{ id: string; label: string; display: string }> };
    agents: Array<{ agent: string; stance: string; confidence: number; evidenceIds: string[]; thesis?: string }>;
    redTeam: {
      leadingThesis: string;
      verdict: string;
      challenges: Array<{ target: string; attack: string; evidenceIds: string[]; severity: string }>;
    };
    judge: { decision: string; confidence: number; rationale: string };
    gate: {
      finalDecision: string;
      passed: boolean;
      downgradedFrom: string | null;
      checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
    };
    price: string;
  };
};

type GraphNode = {
  key: string;
  col: number;
  row: number;
  label: string;
  sub?: string;
  color: string;
  detail: { kind: string; title: string; body: string; chips?: string[] };
};

const COL_X = [70, 265, 470, 675, 880];
const ROW_H = 62;
const TOP = 46;

const AGENT_COLORS: Record<string, string> = {
  bull: "#2fe0a2",
  bear: "#ff6b7d",
  risk: "#ffc757",
  analyst: "#a78bfa",
};

function buildGraph(d: Decision) {
  const s = d.snapshot;
  const dataMode = d.dataMode;
  const nodes: GraphNode[] = [];
  const edges: Array<{ from: string; to: string }> = [];

  const obsItems = s.evidence.items.slice(0, 6);
  const obsRows = obsItems.length;
  const agentRows = Math.max(s.agents.length, 1);
  const chRows = Math.max(s.redTeam.challenges.length, 1);
  const height = Math.max(obsRows, agentRows, chRows, 4) * ROW_H + TOP + 40;

  // Column 0: source
  nodes.push({
    key: "src",
    col: 0,
    row: 0,
    label: "SOURCE DATA",
    sub: `${dataMode === "demo" ? "demo seed" : "Hyperliquid API"} · $${Number(s.price).toLocaleString("en-US")}`,
    color: "#8b9ab5",
    detail: {
      kind: "Source data",
      title: `${d.symbol} @ $${Number(s.price).toLocaleString("en-US")}`,
      body: `${obsItems.length} computed evidence items derived from ${dataMode === "demo" ? "the labeled demo seed generator" : "the Hyperliquid public API"}. Every downstream claim references these observations.`,
      chips: [`run ${d.id.slice(0, 8)}`],
    },
  });

  // Column 1: observations
  obsItems.forEach((it, i) => {
    nodes.push({
      key: `obs:${i}`,
      col: 1,
      row: i,
      label: it.label,
      sub: it.display,
      color: "#3fe1ff",
      detail: {
        kind: "Market observation",
        title: it.label,
        body: `Computed value: ${it.display}. Evidence ID: ${it.id}.`,
        chips: [it.id],
      },
    });
    edges.push({ from: "src", to: `obs:${i}` });
  });

  // Column 2: agent claims
  s.agents.forEach((a) => {
    nodes.push({
      key: `agent:${a.agent}`,
      col: 2,
      row: s.agents.indexOf(a),
      label: `${a.agent.toUpperCase()} · ${a.stance.toUpperCase()}`,
      sub: `conf ${(a.confidence * 100).toFixed(0)}%`,
      color: AGENT_COLORS[a.agent] ?? "#8b9ab5",
      detail: {
        kind: "Agent claim",
        title: `${a.agent.toUpperCase()} — ${a.stance} @ ${(a.confidence * 100).toFixed(0)}%`,
        body: a.thesis ?? "Structured claim derived from the evidence set.",
        chips: a.evidenceIds.slice(0, 4),
      },
    });
    // link observations cited by this agent (fallback: all observations)
    const cited = obsItems.filter((o) => a.evidenceIds.includes(o.id));
    const links = cited.length ? cited : obsItems;
    links.forEach((o) => edges.push({ from: `obs:${obsItems.indexOf(o)}`, to: `agent:${a.agent}` }));
  });

  // Column 3: red-team challenges
  s.redTeam.challenges.slice(0, 5).forEach((c, i) => {
    nodes.push({
      key: `chal:${i}`,
      col: 3,
      row: i,
      label: `${c.severity.toUpperCase()} CHALLENGE`,
      sub: `vs ${c.target}`,
      color: "#fb7185",
      detail: {
        kind: "Red-team challenge",
        title: `${c.severity.toUpperCase()} vs ${c.target}`,
        body: c.attack,
        chips: c.evidenceIds.slice(0, 3),
      },
    });
    const targetIdx = s.agents.findIndex((a) => a.agent === c.target);
    edges.push({
      from: `agent:${targetIdx >= 0 ? s.agents[targetIdx].agent : s.agents[0]?.agent ?? "src"}`,
      to: `chal:${i}`,
    });
  });
  if (s.redTeam.challenges.length === 0) {
    nodes.push({
      key: "chal:none",
      col: 3,
      row: 0,
      label: "NO CHALLENGE",
      sub: "clean pass",
      color: "#fb7185",
      detail: {
        kind: "Red-team challenge",
        title: "No challenge raised",
        body: s.redTeam.verdict,
        chips: [],
      },
    });
    edges.push({ from: `agent:${s.agents[0]?.agent ?? "src"}`, to: "chal:none" });
  }

  // Column 4: judge + gate
  nodes.push({
    key: "judge",
    col: 4,
    row: 0,
    label: `JUDGE · ${s.judge.decision}`,
    sub: `conf ${(s.judge.confidence * 100).toFixed(0)}%`,
    color: "#3fe1ff",
    detail: { kind: "Judge verdict", title: s.judge.decision, body: s.judge.rationale, chips: [] },
  });
  nodes.push({
    key: "gate",
    col: 4,
    row: 1.4,
    label: `GATE · ${s.gate.finalDecision.replace("_", " ")}`,
    sub: `${s.gate.checks.filter((c) => c.passed).length}/${s.gate.checks.length} checks`,
    color: s.gate.passed ? "#2fe0a2" : "#ffc757",
    detail: {
      kind: "Quality gate",
      title: `${s.gate.finalDecision.replace("_", " ")}${s.gate.downgradedFrom ? ` (downgraded from ${s.gate.downgradedFrom})` : ""}`,
      body: s.gate.checks.map((c) => `${c.passed ? "PASS" : "FAIL"} — ${c.label}: ${c.detail}`).join("\n\n"),
      chips: [],
    },
  });
  s.agents.forEach((a) => edges.push({ from: `agent:${a.agent}`, to: "judge" }));
  s.redTeam.challenges.slice(0, 5).forEach((_, i) => edges.push({ from: `chal:${i}`, to: "judge" }));
  edges.push({ from: "judge", to: "gate" });

  return { nodes, edges, height };
}

export function EvidenceGraphView() {
  const [decisions, setDecisions] = useState<
    Array<{ id: string; symbol: string; decision: string; createdAt: string; dataMode: string }>
  | null>(null);
  const [selected, setSelected] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [drawerNode, setDrawerNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    fetch("/api/decisions?limit=20")
      .then((r) => r.json())
      .then((d) => {
        if (d?.decisions) setDecisions(d.decisions);
        else setError(d?.error?.message ?? "Failed to load");
      })
      .catch(() => setError("Failed to load decisions"));
  }, []);

  async function open(id: string) {
    const res = await fetch(`/api/decisions?id=${id}`);
    const d = await res.json();
    if (res.ok) setSelected(d.decision);
  }

  const graph = useMemo(() => (selected ? buildGraph(selected) : null), [selected]);

  if (error) {
    return (
      <Card className="border-bear/30">
        <p className="text-sm text-bear">{error}</p>
      </Card>
    );
  }
  if (!decisions) return <Skeleton />;
  if (decisions.length === 0) {
    return (
      <Card className="halo py-12 text-center">
        <p className="text-sm font-semibold text-ink">No decisions yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-faint">
          Run the Agent Council first — the evidence graph renders the full provenance chain of a
          stored decision.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Select a decision" subtitle="Every stored run has a full, replayable trace" />
        <div className="flex flex-wrap gap-2">
          {decisions.map((d) => (
            <button
              key={d.id}
              onClick={() => open(d.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                selected?.id === d.id
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-line text-ink-dim hover:border-accent/40 hover:text-accent"
              }`}
            >
              {d.symbol} · {d.decision.replace("_", " ")} ·{" "}
              {new Date(d.createdAt).toISOString().slice(5, 16).replace("T", " ")}
            </button>
          ))}
        </div>
      </Card>

      {selected && graph && (
        <Card variant="elevated" className="halo overflow-hidden">
          <CardHeader
            eyebrow="Provenance chain"
            title={`Evidence trace — ${selected.symbol}`}
            subtitle="Source data → market observations → agent claims → red-team challenges → judge → gate. Hover to trace relationships; click a node for details."
            right={<DataModeBadge mode={selected.dataMode === "demo" ? "demo" : "live"} />}
          />
          <div className="overflow-x-auto rounded-xl border border-line bg-bg-2/60">
            <svg
              viewBox={`0 0 960 ${graph.height}`}
              className="min-w-[760px]"
              style={{ width: "100%", height: graph.height }}
              role="img"
              aria-label={`Evidence graph for ${selected.symbol}`}
            >
              {/* edges */}
              {graph.edges.map((e, i) => {
                const a = graph.nodes.find((n) => n.key === e.from);
                const b = graph.nodes.find((n) => n.key === e.to);
                if (!a || !b) return null;
                const x1 = COL_X[a.col] + 52;
                const y1 = TOP + a.row * ROW_H + 18;
                const x2 = COL_X[b.col] - 52;
                const y2 = TOP + b.row * ROW_H + 18;
                const mx = (x1 + x2) / 2;
                const active = !hover || hover === e.from || hover === e.to;
                return (
                  <motion.path
                    key={i}
                    d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke={active ? "rgba(146,178,255,0.4)" : "rgba(146,178,255,0.1)"}
                    strokeWidth={hover && active ? 1.8 : 1.1}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.7, delay: 0.15 + i * 0.05 }}
                  />
                );
              })}

              {/* nodes */}
              {graph.nodes.map((n, i) => {
                const x = COL_X[n.col];
                const y = TOP + n.row * ROW_H;
                const dim =
                  hover !== null &&
                  hover !== n.key &&
                  !graph.edges.some(
                    (e) => (e.from === hover && e.to === n.key) || (e.to === hover && e.from === n.key),
                  );
                return (
                  <motion.g
                    key={n.key}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: dim ? 0.35 : 1, scale: 1 }}
                    transition={{ delay: 0.05 + i * 0.06, duration: 0.35 }}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHover(n.key)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setDrawerNode(n)}
                  >
                    <rect
                      x={x - 52}
                      y={y - 2}
                      width={104}
                      height={36}
                      rx={9}
                      fill={n.key === hover ? "rgba(21,30,51,1)" : "rgba(14,21,36,0.9)"}
                      stroke={n.color}
                      strokeOpacity={n.key === hover ? 0.9 : 0.45}
                    />
                    <text
                      x={x}
                      y={y + 12}
                      textAnchor="middle"
                      fontSize="8.5"
                      fontWeight="700"
                      fill={n.color}
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {n.label.length > 16 ? `${n.label.slice(0, 15)}…` : n.label}
                    </text>
                    <text
                      x={x}
                      y={y + 25}
                      textAnchor="middle"
                      fontSize="8"
                      fill="#5f6b85"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {(n.sub ?? "").length > 20 ? `${(n.sub ?? "").slice(0, 19)}…` : n.sub}
                    </text>
                  </motion.g>
                );
              })}
            </svg>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-ink-faint">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-neutral-chip" /> source
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-accent" /> observations
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-bull" /> claims
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-redteam" /> challenges
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-violet" /> judge + gate
            </span>
            <span className="ml-auto">click any node for full detail</span>
          </div>
        </Card>
      )}

      {selected && (
        <Card>
          <CardHeader title="Full provenance chain" subtitle="Textual trace of the same stored snapshot" />
          <Pipeline
            stage="1 · SOURCE DATA"
            detail={`${selected.snapshot.evidence.items.length} computed evidence items from ${selected.dataMode === "demo" ? "demo seed" : "Hyperliquid API"} @ price $${Number(selected.snapshot.price).toLocaleString("en-US")}`}
            tone="neutral"
          />
          <Pipeline
            stage="2 · MARKET OBSERVATIONS"
            detail={selected.snapshot.evidence.items.map((i) => `${i.label}: ${i.display}`).join(" · ")}
            tone="neutral"
          />
          {selected.snapshot.agents.map((a) => (
            <Pipeline
              key={a.agent}
              stage={`3 · CLAIM — ${a.agent.toUpperCase()} (${a.stance}, ${(a.confidence * 100).toFixed(0)}%)`}
              detail={a.evidenceIds.join(", ")}
              tone={a.stance === "long" ? "bull" : a.stance === "short" ? "bear" : "neutral"}
            />
          ))}
          {selected.snapshot.redTeam.challenges.map((c, i) => (
            <Pipeline key={i} stage={`4 · CHALLENGE (${c.severity.toUpperCase()})`} detail={c.attack} tone="redteam" />
          ))}
          {selected.snapshot.redTeam.challenges.length === 0 && (
            <Pipeline stage="4 · CHALLENGE" detail={selected.snapshot.redTeam.verdict} tone="redteam" />
          )}
          <Pipeline
            stage="5 · JUDGE"
            detail={`${selected.snapshot.judge.decision} @ ${(selected.snapshot.judge.confidence * 100).toFixed(0)}% — ${selected.snapshot.judge.rationale}`}
            tone="accent"
          />
          <Pipeline
            stage="6 · QUALITY GATE"
            detail={`${selected.snapshot.gate.finalDecision} — ${selected.snapshot.gate.checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.label}`).join(" · ")}`}
            tone={selected.snapshot.gate.passed ? "bull" : "warn"}
          />
        </Card>
      )}

      <MotionDrawer open={drawerNode !== null} onClose={() => setDrawerNode(null)} title={drawerNode?.detail.kind}>
        {drawerNode && (
          <div className="space-y-4">
            <div>
              <Badge tone="accent" mono>
                {drawerNode.label}
              </Badge>
              <h4 className="mt-3 text-base font-semibold text-ink">{drawerNode.detail.title}</h4>
            </div>
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-dim">{drawerNode.detail.body}</p>
            {drawerNode.detail.chips && drawerNode.detail.chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-line pt-4">
                {drawerNode.detail.chips.map((c) => (
                  <Badge key={c} tone="neutral" mono>
                    {c}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-[10px] leading-relaxed text-ink-faint">
              Rendered from the immutable stored snapshot — not regenerated.
            </p>
          </div>
        )}
      </MotionDrawer>
    </div>
  );
}

function Pipeline({ stage, detail, tone }: { stage: string; detail: string; tone: string }) {
  const dot =
    tone === "bull"
      ? "bg-bull"
      : tone === "bear"
        ? "bg-bear"
        : tone === "redteam"
          ? "bg-redteam"
          : tone === "accent"
            ? "bg-accent"
            : tone === "warn"
              ? "bg-warn"
              : "bg-neutral-chip";
  return (
    <div className="mb-2 flex gap-3">
      <div className="flex flex-col items-center">
        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${dot}`} />
        <span className="w-px flex-1 bg-line" />
      </div>
      <div className="pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">{stage}</p>
        <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-ink-faint">{detail}</p>
      </div>
    </div>
  );
}
