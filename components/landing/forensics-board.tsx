"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui";

/*
 * WALLET FORENSICS — full-width investigation environment (landing edition).
 * Timeline of ledger/fill events, transaction relationships, behavioral
 * patterns and risk indicators, all on labeled demo data.
 */

const TIMELINE = [
  { t: "09-12 · 08:14", kind: "DEPOSIT", detail: "+50,000.00 USDC", color: "#3fe1ff" },
  { t: "09-14 · 11:02", kind: "FILL", detail: "SOL long 240 → 261.8 (closedPnl +522.40)", color: "#2fe0a2" },
  { t: "09-19 · 22:47", kind: "FILL", detail: "DOGE long 3.1K → 0.29 (closedPnl −310.12)", color: "#ff6b7d" },
  { t: "10-02 · 03:31", kind: "FUNDING", detail: "BTC −21.81 (paid)", color: "#ffc757" },
  { t: "10-09 · 17:20", kind: "FILL", detail: "ETH short 12 → 3,962 (closedPnl +489.77)", color: "#2fe0a2" },
  { t: "10-15 · 09:58", kind: "WITHDRAW", detail: "−5,000.00 USDC", color: "#ff6b7d" },
];

const RELATIONS = [
  { coin: "BTC", pnl: 109.34, color: "#ff6b7d", w: 38 },
  { coin: "ETH", pnl: 687.84, color: "#2fe0a2", w: 92 },
  { coin: "SOL", pnl: 522.4, color: "#2fe0a2", w: 78 },
  { coin: "DOGE", pnl: -310.12, color: "#ff6b7d", w: 44 },
  { coin: "ARB", pnl: 214.86, color: "#2fe0a2", w: 58 },
];

const RISKS = [
  ["Post-loss size escalation", "2.4581×", "warn"],
  ["Fee share of gross profit", "2.87%", "bull"],
  ["Winners paying >30% in fees", "0 of 81", "bull"],
  ["Coverage", "Complete API-Available", "bull"],
] as const;

export function ForensicsBoard() {
  return (
    <div className="rounded-[18px] border border-line bg-surface/80 p-5 panel-sheen md:p-7">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-redteam/35 bg-redteam-soft text-redteam">
            ⌕
          </span>
          <div>
            <p className="font-mono text-sm font-semibold text-ink">0xc0ffee…0002</p>
            <p className="text-[10px] text-ink-faint">master account · 180-day window · 456 fills seen</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="warn" mono>DEMO DATA</Badge>
          <Badge tone="bull" mono>COMPLETE API-AVAILABLE COVERAGE</Badge>
          <Badge tone="redteam" mono>INVESTIGATION</Badge>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        {/* Timeline */}
        <div className="lg:col-span-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Investigation timeline
          </p>
          <div className="relative space-y-3 pl-5">
            <span className="absolute bottom-2 left-[6px] top-2 w-px bg-line" aria-hidden />
            {TIMELINE.map((e, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15 + i * 0.08, duration: 0.35 }}
                className="relative"
              >
                <span
                  className="absolute -left-[19px] top-3 h-2 w-2 rounded-full border-2 border-bg"
                  style={{ background: e.color }}
                  aria-hidden
                />
                <p className="font-mono text-[9px] text-ink-faint">{e.t}</p>
                <p className="text-[11px] font-semibold" style={{ color: e.color }}>
                  {e.kind}
                </p>
                <p className="tabular text-[11px] text-ink-dim">{e.detail}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Relationship graph */}
        <div className="lg:col-span-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Transaction relationships · realized PnL by coin
          </p>
          <svg viewBox="0 0 460 260" className="w-full" aria-hidden>
            {/* wallet node */}
            <motion.g
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
            >
              <rect x={10} y={110} width={120} height={40} rx={10} fill="rgba(14,21,36,0.95)" stroke="rgba(146,178,255,0.4)" />
              <text x={70} y={134} textAnchor="middle" fontSize="10" fontWeight="700" fill="#edf1fa" style={{ fontFamily: "var(--font-mono)" }}>
                WALLET
              </text>
            </motion.g>
            {RELATIONS.map((r, i) => {
              const y = 34 + i * 48;
              const cx = 330;
              return (
                <g key={r.coin}>
                  <motion.path
                    d={`M 130 130 C 220 130, 240 ${y}, ${cx - 60} ${y}`}
                    fill="none"
                    stroke={r.color}
                    strokeOpacity="0.45"
                    strokeWidth={Math.max(1.2, r.w / 22)}
                    initial={{ pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, delay: 0.2 + i * 0.1 }}
                  />
                  <motion.rect
                    x={cx - 58}
                    y={y - 16}
                    width={150}
                    height={32}
                    rx={8}
                    fill="rgba(14,21,36,0.95)"
                    stroke={r.color}
                    strokeOpacity="0.55"
                    initial={{ opacity: 0, x: 12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                  />
                  <text x={cx - 44} y={y + 4} fontSize="10.5" fontWeight="700" fill={r.color} style={{ fontFamily: "var(--font-mono)" }}>
                    {r.coin}
                  </text>
                  <text
                    x={cx + 66}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill={r.pnl >= 0 ? "#2fe0a2" : "#ff6b7d"}
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {r.pnl >= 0 ? "+" : "−"}${Math.abs(r.pnl).toLocaleString("en-US")}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="mt-1 text-[10px] leading-relaxed text-ink-faint">
            Edge weight = trading activity; spot & HIP-3 fills are counted and excluded from perp
            statistics.
          </p>
        </div>

        {/* Risk + behavior */}
        <div className="lg:col-span-3">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Behavioral patterns & risk
          </p>
          <div className="space-y-2">
            {RISKS.map(([label, value, tone], i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.08, duration: 0.35 }}
                className="flex items-center justify-between rounded-lg border border-line bg-bg-2/70 px-3 py-2"
              >
                <span className="text-[11px] text-ink-dim">{label}</span>
                <span
                  className={`tabular text-[11px] font-semibold ${
                    tone === "warn" ? "text-warn" : "text-bull"
                  }`}
                >
                  {value}
                </span>
              </motion.div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-line bg-bg-2/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Post-loss size escalation
            </p>
            <div className="mt-2.5 space-y-2">
              {[
                ["after 1 loss", 42],
                ["after 2 losses", 61],
                ["after 3+ losses", 88],
              ].map(([l, w]) => (
                <div key={l as string} className="flex items-center gap-2">
                  <span className="w-20 text-[9px] text-ink-faint">{l as string}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-warn/60 to-bear/80"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${w}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, delay: 0.3 }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-ink-faint">
              Descriptive statistics only — not a claim about psychology.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
