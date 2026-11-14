"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui";

/*
 * Pipeline storytelling — each stage gets its own composition and mini
 * demonstration. Every number/label is illustrative demo data, clearly
 * marked. The demos visualize the real pipeline semantics without fabricating
 * live activity.
 */

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];

function StageShell({
  num,
  name,
  copy,
  viz,
  flip = false,
}: {
  num: string;
  name: string;
  copy: string;
  viz: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div className="relative py-14 md:py-20">
      <p
        aria-hidden
        className={`font-display pointer-events-none absolute top-0 select-none text-[7rem] font-bold leading-none text-ink/[0.045] md:text-[11rem] ${
          flip ? "right-0" : "left-0"
        }`}
      >
        {num}
      </p>
      <div className={`relative grid items-center gap-10 md:grid-cols-12`}>
        <div className={`md:col-span-5 ${flip ? "md:order-2" : ""}`}>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, ease }}
            className="font-mono text-[11px] font-bold tracking-[0.2em] text-accent"
          >
            STAGE {num} — {name.toUpperCase()}
          </motion.p>
          <motion.h3
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, delay: 0.05, ease }}
            className="font-display mt-3 text-3xl font-bold tracking-tight text-ink md:text-4xl"
          >
            {name}
          </motion.h3>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, delay: 0.1, ease }}
            className="mt-4 max-w-md text-[13px] leading-relaxed text-ink-dim md:text-sm"
          >
            {copy}
          </motion.p>
        </div>
        <div className={`md:col-span-7 ${flip ? "md:order-1" : ""}`}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.65, delay: 0.12, ease }}
            className="rounded-[16px] border border-line bg-surface/70 p-5 panel-sheen"
          >
            {viz}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- 01 DETECT ----------------------------- */

function DetectViz() {
  const pts = "0,118 40,110 80,114 120,96 160,102 200,84 240,90 280,70 320,76 360,58 400,64 440,48 480,52 520,34 560,42 600,28";
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink">BTC · perpetual · supported</p>
        <Badge tone="accent" mono>
          SIGNAL DETECTED
        </Badge>
      </div>
      <svg viewBox="0 0 600 140" className="mt-3 w-full" aria-hidden>
        <polyline points={pts} fill="none" stroke="rgba(146,178,255,0.35)" strokeWidth="1.4" />
        <motion.polyline
          points={pts}
          fill="none"
          stroke="#3fe1ff"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.6, ease }}
        />
        <motion.circle
          cx="440"
          cy="48"
          r="5"
          fill="none"
          stroke="#3fe1ff"
          initial={{ scale: 0, opacity: 0 }}
          whileInView={{ scale: [0, 1.6, 1], opacity: [0, 1, 0.9] }}
          viewport={{ once: true }}
          transition={{ delay: 1.5, duration: 0.9 }}
        />
        <motion.g
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 1.9, duration: 0.4 }}
        >
          <line x1="440" y1="56" x2="440" y2="122" stroke="rgba(63,225,255,0.4)" strokeDasharray="2 3" />
          <rect x="376" y="122" width="128" height="15" rx="4" fill="rgba(63,225,255,0.12)" stroke="rgba(63,225,255,0.4)" />
          <text x="440" y="133" textAnchor="middle" fontSize="8.5" fill="#3fe1ff" style={{ fontFamily: "var(--font-mono)" }}>
            freshness ✓ · liquidity ✓ · perp ✓
          </text>
        </motion.g>
      </svg>
      <p className="mt-2 text-[10px] text-ink-faint">Illustrative demo data.</p>
    </div>
  );
}

/* ----------------------------- 02 DEBATE ----------------------------- */

function DebateViz() {
  const agents = [
    { name: "BULL", color: "#2fe0a2", stance: "LONG", conf: 72 },
    { name: "BEAR", color: "#ff6b7d", stance: "SHORT", conf: 41 },
    { name: "RISK", color: "#ffc757", stance: "NEUTRAL", conf: 55 },
    { name: "ANALYST", color: "#a78bfa", stance: "NEUTRAL", conf: 63 },
  ];
  return (
    <div>
      <p className="text-xs font-medium text-ink">
        Same evidence set → four independent conclusions
      </p>
      <div className="mt-3.5 space-y-2.5">
        {agents.map((a, i) => (
          <div key={a.name} className="rounded-lg border border-line bg-bg-2/70 px-3 py-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono font-bold" style={{ color: a.color }}>
                {a.name}
              </span>
              <span style={{ color: a.color }}>{a.stance}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className="h-full rounded-full"
                style={{ background: a.color }}
                initial={{ width: 0 }}
                whileInView={{ width: `${a.conf}%` }}
                viewport={{ once: true }}
                transition={{ delay: 0.25 + i * 0.14, duration: 0.9, ease }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-ink-faint">
              <span>evidence {4 + i} items cited</span>
              <span className="tabular">confidence {a.conf}%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg border border-line bg-bg-2/70 px-3 py-2">
        <span className="text-[10px] text-ink-faint">disagreement index</span>
        <span className="tabular text-xs font-semibold text-warn">0.18</span>
      </div>
      <p className="mt-2 text-[10px] text-ink-faint">Illustrative demo data.</p>
    </div>
  );
}

/* ----------------------------- 03 ATTACK ----------------------------- */

function AttackViz() {
  const assumptions = [
    { t: "Momentum persists over the horizon", verdict: "survives", sev: null },
    { t: "No exogenous catalyst reverses the trend", verdict: "unverified", sev: "missing input" },
    { t: "Funding stays below crowded-long levels", verdict: "contradicted", sev: "HIGH" },
  ];
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink">Red-Team vs the leading thesis</p>
        <Badge tone="redteam" mono>
          ADVERSARIAL PASS
        </Badge>
      </div>
      <div className="mt-3.5 space-y-2.5">
        {assumptions.map((a, i) => (
          <div key={a.t} className="relative rounded-lg border border-line bg-bg-2/70 px-3 py-2.5">
            <p className={`text-[12px] leading-relaxed ${a.verdict === "contradicted" ? "text-ink-faint" : "text-ink-dim"}`}>
              <span className="mr-1.5 font-mono text-[9px] text-ink-faint">A{i + 1}</span>
              &ldquo;{a.t}&rdquo;
            </p>
            {a.verdict === "contradicted" && (
              <motion.div
                className="absolute left-8 right-6 top-[26px] h-[1.5px] origin-left bg-redteam"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.7 + i * 0.2, duration: 0.45, ease }}
              />
            )}
            <div className="mt-1.5 flex items-center justify-between">
              <span className="font-mono text-[9px] text-ink-faint">assumption A{i + 1}</span>
              {a.sev ? (
                <motion.span
                  initial={{ opacity: 0, scale: 0.7, rotate: -6 }}
                  whileInView={{ opacity: 1, scale: 1, rotate: -3 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.85 + i * 0.2, duration: 0.3 }}
                  className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                    a.sev === "HIGH" ? "border-redteam/50 text-redteam" : "border-warn/50 text-warn"
                  }`}
                >
                  {a.sev.toUpperCase()}
                </motion.span>
              ) : (
                <span className="text-[9px] text-bull">✓ holds</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-ink-faint">
        Illustrative challenge trace — real runs cite computed evidence IDs.
      </p>
    </div>
  );
}

/* ----------------------------- 04 DECIDE ----------------------------- */

function DecideViz() {
  const checks = [
    ["Evidence threshold", true],
    ["Data freshness", true],
    ["Token safety", true],
    ["Disagreement ≤ cap", true],
    ["Confidence floor", true],
    ["Risk / reward ≥ 1.2", true],
  ];
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink">Judge → weighted verdict → Quality Gate</p>
        <Badge tone="bull" mono>
          LONG · 72%
        </Badge>
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <div className="rounded-lg border border-line bg-bg-2/70 p-3">
          <p className="text-[9px] uppercase tracking-wider text-ink-faint">weighted long</p>
          <p className="tabular text-lg font-semibold text-bull">0.72</p>
        </div>
        <div className="rounded-lg border border-line bg-bg-2/70 p-3">
          <p className="text-[9px] uppercase tracking-wider text-ink-faint">weighted short</p>
          <p className="tabular text-lg font-semibold text-ink-dim">0.11</p>
        </div>
      </div>
      <div className="mt-2.5 space-y-1.5">
        {checks.map(([label, ok], i) => (
          <motion.div
            key={label as string}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.12, duration: 0.35 }}
            className="flex items-center gap-2 rounded-md border border-line bg-bg-2/70 px-2.5 py-1.5"
          >
            <span className={`text-[10px] ${ok ? "text-bull" : "text-bear"}`}>{ok ? "✓" : "✗"}</span>
            <span className="text-[11px] text-ink-dim">{label as string}</span>
            <span className="ml-auto font-mono text-[8px] text-ink-faint">PASS</span>
          </motion.div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-ink-faint">Illustrative verdict — the real Judge is pure code.</p>
    </div>
  );
}

/* ----------------------------- 05 SIMULATE ---------------------------- */

function SimulateViz() {
  // Fan chart: several hypothetical outcome paths from one base point.
  const fans: Array<[string, string, number]> = [
    ["M8 96 C 160 92, 320 60, 592 22", "#2fe0a2", 260],
    ["M8 96 C 160 94, 320 80, 592 62", "#3fe1ff", 300],
    ["M8 96 C 160 97, 320 96, 592 98", "rgba(146,178,255,0.5)", 340],
    ["M8 96 C 160 100, 320 112, 592 132", "#ffc757", 380],
    ["M8 96 C 160 102, 320 124, 592 152", "#ff6b7d", 420],
  ];
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink">Scenario: −10% shock · 2× volatility</p>
        <Badge tone="warn" mono>
          HYPOTHETICAL
        </Badge>
      </div>
      <svg viewBox="0 0 600 180" className="mt-3 w-full" aria-hidden>
        <line x1="0" y1="96" x2="600" y2="96" stroke="rgba(146,178,255,0.18)" strokeDasharray="3 4" />
        {fans.map(([d, color, delay], i) => (
          <motion.path
            key={i}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={i === 2 ? 1.2 : 1.8}
            strokeDasharray={i === 2 ? "4 4" : undefined}
            opacity={i === 2 ? 0.7 : 0.95}
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.3, delay: delay / 1000, ease }}
          />
        ))}
        <motion.circle
          cx="8"
          cy="96"
          r="4"
          fill="#3fe1ff"
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        />
        <text x="600" y="16" textAnchor="end" fontSize="9" fill="#2fe0a2" style={{ fontFamily: "var(--font-mono)" }}>
          bull path
        </text>
        <text x="600" y="168" textAnchor="end" fontSize="9" fill="#ff6b7d" style={{ fontFamily: "var(--font-mono)" }}>
          adverse path
        </text>
      </svg>
      <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">
        Outcome paths are hypothetical transformations of demo candles — not forecasts.
      </p>
    </div>
  );
}

/* ------------------------------ 06 LEARN ------------------------------ */

function LearnViz() {
  const decisions = [
    { d: "LONG", ok: true, t: "11-01" },
    { d: "NO_TRADE", ok: true, t: "11-03" },
    { d: "SHORT", ok: false, t: "11-05" },
    { d: "LONG", ok: true, t: "11-07" },
    { d: "NO_TRADE", ok: true, t: "11-09" },
    { d: "LONG", ok: false, t: "11-11" },
  ];
  return (
    <div>
      <p className="text-xs font-medium text-ink">
        Decision outcomes feed the next analysis
      </p>
      <div className="mt-3.5 flex items-center gap-2.5">
        {decisions.map((d, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.7 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.12, duration: 0.35 }}
            className="flex flex-col items-center gap-1"
          >
            <span
              className={`grid h-9 w-9 place-items-center rounded-full border text-[9px] font-bold ${
                d.ok ? "border-bull/40 bg-bull-soft text-bull" : "border-bear/40 bg-bear-soft text-bear"
              }`}
            >
              {d.d === "LONG" ? "↑" : d.d === "SHORT" ? "↓" : "■"}
            </span>
            <span className="font-mono text-[8px] text-ink-faint">{d.t}</span>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 1.1, duration: 0.4 }}
          className="ml-1 flex flex-col items-center gap-1"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full border border-accent/40 bg-accent-soft text-[10px] font-bold text-accent">
            ↻
          </span>
          <span className="font-mono text-[8px] text-accent">next run</span>
        </motion.div>
      </div>
      <div className="mt-4 rounded-lg border border-line bg-bg-2/70 p-3">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-ink-faint">calibration so far</span>
          <span className="tabular text-ink">4 of 6 aligned · 66.7%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-accent-strong to-accent"
            initial={{ width: 0 }}
            whileInView={{ width: "66.7%" }}
            viewport={{ once: true }}
            transition={{ delay: 0.6, duration: 1, ease }}
          />
        </div>
        <p className="mt-1.5 text-[9px] text-ink-faint">
          sample size shown with every metric — small samples stay honest
        </p>
      </div>
      <p className="mt-2 text-[10px] text-ink-faint">Illustrative demo data.</p>
    </div>
  );
}

const STAGES: Array<{
  num: string;
  name: string;
  copy: string;
  viz: React.ReactNode;
  flip: boolean;
}> = [
  {
    num: "01",
    name: "Detect",
    copy: "Market Pulse watches the supported perpetuals universe and flags material setups — with freshness, liquidity and perp checks visible before anything else happens.",
    viz: <DetectViz />,
    flip: false,
  },
  {
    num: "02",
    name: "Debate",
    copy: "Bull, Bear, Risk and Analyst independently analyze the same evidence set — and are free to disagree. Every thesis cites the computed observations behind it.",
    viz: <DebateViz />,
    flip: true,
  },
  {
    num: "03",
    name: "Attack",
    copy: "The Red-Team treats the leading thesis as a target: contradictory evidence, weak assumptions and missing inputs are exposed with severities — never fabricated.",
    viz: <AttackViz />,
    flip: false,
  },
  {
    num: "04",
    name: "Decide",
    copy: "A deterministic Judge weighs the council, and the Quality Gate evaluates evidence, freshness, safety, disagreement, confidence and risk/reward — in plain language.",
    viz: <DecideViz />,
    flip: true,
  },
  {
    num: "05",
    name: "Simulate",
    copy: "Before anything is believed, counterfactual scenarios and the paper engine explore what the decision would have produced — fees, slippage, stops and all.",
    viz: <SimulateViz />,
    flip: false,
  },
  {
    num: "06",
    name: "Learn",
    copy: "Every decision is snapshotted with its evidence and later evaluated. Outcomes feed calibration, which feeds the next run — the loop is the product.",
    viz: <LearnViz />,
    flip: true,
  },
];

export function PipelineStories() {
  return (
    <div className="mx-auto mt-4 max-w-6xl px-5">
      {STAGES.map((s) => (
        <StageShell key={s.num} {...s} />
      ))}
    </div>
  );
}
