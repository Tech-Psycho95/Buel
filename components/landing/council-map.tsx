"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui";

/*
 * AGENT COUNCIL — signature interactive map (landing edition).
 *
 * Geometry contract: every edge is computed from the actual node rects —
 * horizontal flows leave the source's right edge and land on the target's
 * left edge; same-column flows (judge → gate) run straight down the node's
 * center. Two animation layers per edge: a draw-in base path (framer
 * pathLength) plus a separate flowing-dash overlay (CSS) that fades in after
 * the draw completes — the two never fight over the same dasharray.
 * Hover a node to trace its relationships. Illustrative demo trace.
 */

type N = {
  id: string;
  x: number; // left edge of the node rect
  y: number; // top edge of the node rect
  label: string;
  sub: string;
  color: string;
};

const NODE_W = 120;
const NODE_H = 44;

const EVIDENCE: N[] = [
  { id: "ev1", x: 90, y: 60, label: "24H MOMENTUM", sub: "+2.41%", color: "#3fe1ff" },
  { id: "ev2", x: 90, y: 150, label: "PRICE VS SMA24", sub: "+1.84%", color: "#3fe1ff" },
  { id: "ev3", x: 90, y: 240, label: "HOURLY VOL", sub: "0.132%/h", color: "#3fe1ff" },
  { id: "ev4", x: 90, y: 330, label: "FUNDING", sub: "0.0042%/h", color: "#3fe1ff" },
];

const AGENTS: N[] = [
  { id: "bull", x: 330, y: 70, label: "BULL", sub: "LONG · 72%", color: "#2fe0a2" },
  { id: "bear", x: 330, y: 165, label: "BEAR", sub: "SHORT · 41%", color: "#ff6b7d" },
  { id: "risk", x: 330, y: 260, label: "RISK", sub: "NEUTRAL · 55%", color: "#ffc757" },
  { id: "analyst", x: 330, y: 350, label: "ANALYST", sub: "NEUTRAL · 63%", color: "#a78bfa" },
];

const CHALLENGES: N[] = [
  { id: "ch1", x: 560, y: 110, label: "HIGH CHALLENGE", sub: "vs BULL", color: "#fb7185" },
  { id: "ch2", x: 560, y: 300, label: "MISSING INPUT", sub: "vs ANALYST", color: "#fb7185" },
];

const JUDGE: N = { id: "judge", x: 760, y: 190, label: "JUDGE", sub: "LONG · 72%", color: "#3fe1ff" };
const GATE: N = { id: "gate", x: 760, y: 330, label: "GATE", sub: "6/6 PASS", color: "#2fe0a2" };

const AGENT_CITES: Record<string, string[]> = {
  bull: ["ev1", "ev2"],
  bear: ["ev3"],
  risk: ["ev3"],
  analyst: ["ev1", "ev2", "ev4"],
};

const CHALLENGE_TARGETS: Record<string, string> = {
  ch1: "bull",
  ch2: "analyst",
};

/** Edge geometry derived from node rects — endpoints always touch borders. */
function edgePath(from: N, to: N): { d: string } {
  const sameColumn = Math.abs(from.x - to.x) < 4;

  if (sameColumn) {
    // Vertical flow: bottom-center of source → top-center of target.
    const cx = from.x + NODE_W / 2;
    return { d: `M ${cx} ${from.y + NODE_H + 6} L ${cx} ${to.y - 6}` };
  }

  const x1 = from.x + NODE_W + 6;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x - 6;
  const y2 = to.y + NODE_H / 2;
  const mx = (x1 + x2) / 2;
  return { d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}` };
}

export function CouncilMap() {
  const [hover, setHover] = useState<string | null>(null);
  const [runKey, setRunKey] = useState(0);

  // EVERY node in the map renders — including judge + gate (the earlier
  // build omitted them, leaving edges converging into empty space).
  const nodes: N[] = [...EVIDENCE, ...AGENTS, ...CHALLENGES, JUDGE, GATE];

  const edges: Array<{ from: N; to: N; kind: string }> = [];
  for (const a of AGENTS) {
    for (const e of EVIDENCE) {
      if (AGENT_CITES[a.id]?.includes(e.id)) edges.push({ from: e, to: a, kind: "evidence" });
    }
  }
  for (const c of CHALLENGES) {
    const t = AGENTS.find((a) => a.id === CHALLENGE_TARGETS[c.id]);
    if (t) edges.push({ from: t, to: c, kind: "challenge" });
  }
  for (const a of AGENTS) edges.push({ from: a, to: JUDGE, kind: "verdict" });
  for (const c of CHALLENGES) edges.push({ from: c, to: JUDGE, kind: "challenge" });
  edges.push({ from: JUDGE, to: GATE, kind: "gate" });

  const isEdgeActive = (e: { from: N; to: N }) =>
    !hover || hover === e.from.id || hover === e.to.id;
  const isNodeActive = (id: string) =>
    !hover ||
    hover === id ||
    edges.some(
      (e) =>
        (e.from.id === hover && e.to.id === id) || (e.to.id === hover && e.from.id === id),
    );

  const edgeStroke = (kind: string) =>
    kind === "challenge"
      ? "rgba(251,113,133,0.55)"
      : kind === "gate"
        ? "rgba(47,224,162,0.6)"
        : kind === "verdict"
          ? "rgba(143,127,247,0.45)"
          : "rgba(63,225,255,0.45)";

  return (
    <div className="relative">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-[10px] text-ink-faint">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-accent" /> evidence</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-bull" /> agents</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-redteam" /> challenges</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-violet" /> judge + gate</span>
        </div>
        <button
          onClick={() => setRunKey((k) => k + 1)}
          className="rounded-full border border-accent/35 px-4 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
        >
          ↻ Replay the flow
        </button>
      </div>

      <div className="overflow-x-auto rounded-[16px] border border-line bg-bg-2/70 p-2">
        <svg
          key={runKey}
          viewBox="0 0 900 420"
          className="min-w-[720px]"
          style={{ width: "100%" }}
          role="img"
          aria-label="Agent council intelligence map"
        >
          {/* edges — two layers: draw-in base + flowing-dash overlay */}
          {edges.map((e, i) => {
            const { d } = edgePath(e.from, e.to);
            const active = isEdgeActive(e);
            const stroke = edgeStroke(e.kind);
            return (
              <g key={`${e.from.id}-${e.to.id}-${i}`}>
                {/* draw-in base: solid path animated by framer (no CSS dash on it) */}
                <motion.path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={hover && active ? 1.8 : 1.1}
                  strokeLinecap="round"
                  initial={{ opacity: 0, pathLength: 0 }}
                  animate={{ opacity: active ? 1 : 0.15, pathLength: 1 }}
                  transition={{ duration: 0.8, delay: 0.1 + i * 0.05 }}
                />
                {/* flowing-dash overlay: pure CSS animation, fades in after the draw */}
                <motion.path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={hover && active ? 2.4 : 1.6}
                  strokeDasharray="3 9"
                  strokeLinecap="round"
                  className="flow-edge"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: active ? 0.85 : 0.1 }}
                  transition={{ opacity: { delay: 0.9 + i * 0.05, duration: 0.5 } }}
                />
              </g>
            );
          })}

          {/* nodes */}
          {nodes.map((n, i) => (
            <motion.g
              key={n.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: isNodeActive(n.id) ? 1 : 0.3, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={n.x}
                y={n.y}
                width={NODE_W}
                height={NODE_H}
                rx={10}
                fill={hover === n.id ? "rgba(21,30,51,1)" : "rgba(14,21,36,0.92)"}
                stroke={n.color}
                strokeOpacity={hover === n.id ? 0.95 : 0.5}
              />
              <text x={n.x + 12} y={n.y + 19} fontSize="10.5" fontWeight="700" fill={n.color} style={{ fontFamily: "var(--font-mono)" }}>
                {n.label}
              </text>
              <text x={n.x + 12} y={n.y + 34} fontSize="9" fill="#5f6b85" style={{ fontFamily: "var(--font-mono)" }}>
                {n.sub}
              </text>
            </motion.g>
          ))}
        </svg>
      </div>

      {/* consensus strip */}
      <div className="mt-4 rounded-xl border border-line bg-bg-2/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Council consensus → verdict
          </p>
          <Badge tone="bull" mono>
            LONG · 72% · gate 6/6
          </Badge>
        </div>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full bg-bull/80" style={{ width: "62%" }} />
          <div className="h-full bg-neutral-chip/50" style={{ width: "29%" }} />
          <div className="h-full bg-bear/80" style={{ width: "9%" }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[9px] text-ink-faint">
          <span className="text-bull">weighted long 0.72</span>
          <span>neutral</span>
          <span className="text-bear">weighted short 0.11</span>
        </div>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
        Illustrative trace on demo data — in the workspace this map renders any stored decision
        from its immutable snapshot.
      </p>
    </div>
  );
}
