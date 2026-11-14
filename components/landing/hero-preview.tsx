"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui";
import { Logo } from "@/components/logo";

/*
 * Hero product preview — an illustrative dashboard built from the real design
 * language, running on LABELED demo data. Nothing here pretends to be live.
 */

const SAMPLE_PRICES: Array<[string, number, number]> = [
  ["BTC", 104250.5, 2.4],
  ["ETH", 3980.2, 1.1],
  ["SOL", 214.5, -0.8],
  ["ARB", 0.862, 3.6],
  ["AVAX", 41.2, -1.9],
  ["LINK", 26.41, 0.7],
  ["OP", 1.72, -2.4],
  ["DOGE", 0.312, 1.3],
];

const AGENTS = [
  { name: "BULL", stance: "LONG", conf: 78, tone: "#2fe0a2" },
  { name: "BEAR", stance: "SHORT", conf: 41, tone: "#ff6b7d" },
  { name: "RISK", stance: "NEUTRAL", conf: 55, tone: "#ffc757" },
  { name: "ANALYST", stance: "NEUTRAL", conf: 63, tone: "#a78bfa" },
];

const EQUITY = [
  100, 101.2, 100.4, 102.8, 104.1, 103.2, 105.6, 107.2, 106.1, 108.4, 110.2, 109.3, 111.8, 113.9,
  112.6, 114.7, 116.9, 115.8, 118.2, 120.4,
];

export function HeroPreview() {
  const w = 560;
  const h = 150;
  const min = Math.min(...EQUITY);
  const max = Math.max(...EQUITY);
  const range = max - min;
  const pts = EQUITY.map(
    (p, i) => `${(i / (EQUITY.length - 1)) * w},${h - 8 - ((p - min) / range) * (h - 20)}`,
  ).join(" ");

  return (
    <div className="relative overflow-hidden rounded-[16px] border border-line-strong bg-surface/85 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] panel-sheen backdrop-blur">
      {/* Mini topbar */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <Logo size={18} tone="light" />
        <span className="text-xs font-semibold text-ink">Command Center</span>
        <Badge tone="warn" mono className="ml-1">
          DEMO DATA
        </Badge>
        <span className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] text-ink-faint">⌘K</span>
          <span className="grid h-5 w-5 place-items-center rounded-full bg-violet-soft text-[8px] font-bold text-violet">
            SK
          </span>
        </span>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-5">
        {/* Equity chart */}
        <div className="rounded-xl border border-line bg-bg-2/70 p-3 sm:col-span-3">
          <div className="mb-1 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                Simulated equity
              </p>
              <p className="tabular text-xl font-semibold text-ink">
                $120,412 <span className="text-xs font-medium text-bull">+20.4%</span>
              </p>
            </div>
            <Badge tone="bull" mono>
              PAPER
            </Badge>
          </div>
          <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3fe1ff" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#3fe1ff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.polygon
              points={`0,${h} ${pts} ${w},${h}`}
              fill="url(#heroFill)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0, duration: 0.8 }}
            />
            <motion.polyline
              points={pts}
              fill="none"
              stroke="#3fe1ff"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.6, ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
            />
          </svg>
        </div>

        {/* Latest decision */}
        <div className="rounded-xl border border-line bg-bg-2/70 p-3 sm:col-span-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Latest gated decision
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-lg font-semibold text-ink">BTC</span>
            <Badge tone="bull">LONG</Badge>
          </div>
          <div className="mt-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-ink-faint">
              <span>Judge confidence</span>
              <span className="tabular text-ink">72%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-accent-strong to-accent"
                initial={{ width: 0 }}
                animate={{ width: "72%" }}
                transition={{ delay: 0.8, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-ink-faint">
              <span>Disagreement</span>
              <span className="tabular text-ink">0.18</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className="h-full rounded-full bg-warn/70"
                initial={{ width: 0 }}
                animate={{ width: "18%" }}
                transition={{ delay: 1.0, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <p className="pt-1 text-[9px] leading-relaxed text-ink-faint">
              Gate: <span className="text-bull">6/6 checks passed</span> — evidence, freshness,
              liquidity, disagreement, confidence, R/R
            </p>
          </div>
        </div>
      </div>

      {/* Agent debate strip */}
      <div className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-4">
        {AGENTS.map((a, i) => (
          <motion.div
            key={a.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.14, duration: 0.5 }}
            className="rounded-xl border border-line bg-bg-2/70 p-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] font-bold" style={{ color: a.tone }}>
                {a.name}
              </span>
              <span className="text-[9px] font-medium" style={{ color: a.tone }}>
                {a.stance}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className="h-full rounded-full"
                style={{ background: a.tone }}
                initial={{ width: 0 }}
                animate={{ width: `${a.conf}%` }}
                transition={{ delay: 0.7 + i * 0.14, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <p className="tabular mt-1 text-[9px] text-ink-faint">conf {a.conf}%</p>
          </motion.div>
        ))}
      </div>

      {/* Ticker */}
      <div className="overflow-hidden border-t border-line bg-bg-2/50 py-2" aria-hidden>
        <div className="ticker-track flex w-max items-center gap-6 px-4">
          {[...SAMPLE_PRICES, ...SAMPLE_PRICES].map(([sym, px, chg], i) => (
            <span key={i} className="flex items-center gap-2 whitespace-nowrap font-mono text-[10px]">
              <span className="font-semibold text-ink-dim">{sym}</span>
              <span className="tabular text-ink">
                ${px.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </span>
              <span className={chg >= 0 ? "text-bull" : "text-bear"}>
                {chg >= 0 ? "+" : ""}
                {chg}%
              </span>
            </span>
          ))}
        </div>
      </div>

      <p className="border-t border-line bg-bg-2/70 px-4 py-1.5 text-center text-[9px] text-ink-faint">
        Illustrative preview on labeled demo data — not a live market or a performance record.
      </p>
    </div>
  );
}
