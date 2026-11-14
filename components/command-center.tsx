"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Badge, Card, CardHeader, DataTable, Skeleton, Sparkline, StatCard } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";

/*
 * Command Center — the intelligence cockpit.
 * Asymmetric bento composition: status/decision tiles, watchlist table with
 * change micro-bars, movers feed, and the decisions ledger strip. All data is
 * real (market adapter + decision ledger); demo/live is always labeled.
 */

type MarketResponse = {
  freshness: { source: string; ageSec: number; stale: boolean };
  mode: "live" | "demo";
  watchSymbols: string[];
  assets: Array<{ name: string; ctx?: { markPx: string; prevDayPx: string; dayNtlVlm: string; fundingRate: string } }>;
};

type DecisionsResponse = {
  decisions?: Array<{
    id: string;
    symbol: string;
    decision: string;
    confidence: string;
    createdAt: string;
    dataMode: string;
    snapshot?: { gate?: { passed?: boolean; finalDecision?: string } };
  }>;
};

const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

function chgOf(a: NonNullable<MarketResponse["assets"]>[number]): number {
  return a.ctx && Number(a.ctx.prevDayPx) > 0
    ? Number(a.ctx.markPx) / Number(a.ctx.prevDayPx) - 1
    : 0;
}

/** Deterministic pseudo-sparkline from the asset name + change (visual only, honest shape). */
function microShape(seedName: string, chg: number): number[] {
  let h = 0;
  for (let i = 0; i < seedName.length; i++) h = (h * 31 + seedName.charCodeAt(i)) | 0;
  const pts: number[] = [];
  for (let i = 0; i < 12; i++) {
    pts.push(50 + Math.sin(((h >> (i % 7)) & 7) + i * 1.1) * 8 + chg * 260 * (i / 11));
  }
  return pts;
}

export function CommandCenterView({ displayName }: { displayName: string }) {
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [decisions, setDecisions] = useState<DecisionsResponse["decisions"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/market").then((r) => r.json()),
      fetch("/api/decisions?limit=6").then((r) => r.json()),
    ])
      .then(([m, d]) => {
        if (m?.assets) setMarket(m);
        if (d?.decisions) setDecisions(d.decisions);
        if (!m?.assets && m?.error?.message) setError(m.error.message);
      })
      .catch(() =>
        setError("Could not load workspace data — check that the market adapter is reachable."),
      );
  }, []);

  const watch = market?.assets.filter((a) => market.watchSymbols.includes(a.name)).slice(0, 6) ?? [];
  const movers = market
    ? [...market.assets].filter((a) => a.ctx).sort((a, b) => chgOf(b) - chgOf(a)).slice(0, 6)
    : [];
  const latest = decisions?.[0];
  const topMover = movers[0];
  // Greeting computed client-side only (render-phase Date.now() is impure
  // and would risk hydration mismatch).

  const decisionTone = (d: string) =>
    d === "LONG" ? "bull" : d === "SHORT" ? "bear" : d === "NO_TRADE" ? "warn" : "neutral";

  return (
    <div className="space-y-5">
      {error && (
        <Card className="border-bear/30 bg-bear-soft/30">
          <p className="text-sm text-bear">{error}</p>
        </Card>
      )}

      {/* Cockpit row — asymmetric bento */}
      <div className="grid gap-3 lg:grid-cols-12">
        {/* Data mode tile */}
        <StaggerItem className="lg:col-span-3">
          <Card className="h-full">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
              Intelligence feed
            </p>
            {market ? (
              <>
                <div className="mt-2.5 flex items-center gap-2">
                  {market.mode === "demo" ? (
                    <Badge tone="warn">DEMO DATA</Badge>
                  ) : (
                    <Badge tone="accent">
                      <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-bull" /> LIVE DATA
                    </Badge>
                  )}
                  <Badge tone="neutral" mono>
                    {market.freshness.ageSec}s
                  </Badge>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                  source: <span className="font-mono text-ink-dim">{market.freshness.source}</span> ·{" "}
                  {market.assets.length} supported perps in view
                </p>
              </>
            ) : (
              <Skeleton className="mt-2.5 h-12 w-full" />
            )}
          </Card>
        </StaggerItem>

        {/* Latest decision tile */}
        <StaggerItem className="lg:col-span-5">
          <Card className="h-full">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
              Latest gated decision
            </p>
            {latest ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2.5 flex items-end justify-between gap-3"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl font-semibold tracking-tight text-ink">{latest.symbol}</span>
                  <Badge tone={decisionTone(latest.decision)} mono>
                    {latest.decision.replace("_", " ")}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="tabular text-lg font-semibold text-ink">
                    {(Number(latest.confidence) * 100).toFixed(0)}%
                  </p>
                  <p className="text-[10px] text-ink-faint">judge confidence</p>
                </div>
              </motion.div>
            ) : (
              <p className="mt-2.5 text-sm text-ink-faint">run the council</p>
            )}
            {latest && (
              <p className="mt-2.5 flex items-center gap-2 text-[11px] text-ink-faint">
                {latest.snapshot?.gate?.passed ? (
                  <span className="text-bull">● gate passed</span>
                ) : (
                  <span className="text-warn">● gate refused</span>
                )}
                ·{" "}
                <Link href="/decision-ledger" className="text-accent hover:underline">
                  replay in ledger →
                </Link>
              </p>
            )}
          </Card>
        </StaggerItem>

        {/* Regime-ish tile: strongest mover */}
        <StaggerItem className="lg:col-span-4">
          <Card className="h-full">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
              Strongest mover (24h)
            </p>
            {topMover ? (
              <div className="mt-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl font-semibold text-ink">{topMover.name}</span>
                  <span
                    className={`tabular text-sm font-medium ${chgOf(topMover) >= 0 ? "text-bull" : "text-bear"}`}
                  >
                    {pct(chgOf(topMover))}
                  </span>
                </div>
                <Sparkline points={microShape(topMover.name, chgOf(topMover))} className="h-9 w-28" />
              </div>
            ) : (
              <Skeleton className="mt-2.5 h-12 w-full" />
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              Shape is illustrative from the 24h change; exact candles live in{" "}
              <Link href="/market-pulse" className="text-accent/90 hover:underline">
                Market Pulse
              </Link>
              .
            </p>
          </Card>
        </StaggerItem>
      </div>

      {/* Watchlist + movers asymmetric row */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader
            title="Watchlist"
            subtitle="Your tracked symbols — live or demo, always labeled"
            right={
              <Link href="/market-pulse" className="text-xs text-accent transition-colors hover:underline">
                Market Pulse →
              </Link>
            }
          />
          {market ? (
            <DataTable head={["Symbol", "Mark", "24h", "", "Funding/h"]}>
              {watch.map((a) => {
                const chg = chgOf(a);
                return (
                  <tr key={a.name} className="group text-ink-dim transition-colors hover:bg-surface-2/60">
                    <td className="px-3 py-2.5 font-medium text-ink">{a.name}</td>
                    <td className="tabular px-3 py-2.5">
                      ${Number(a.ctx?.markPx ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 })}
                    </td>
                    <td className={`tabular px-3 py-2.5 ${chg >= 0 ? "text-bull" : "text-bear"}`}>{pct(chg)}</td>
                    <td className="px-3 py-1">
                      <Sparkline points={microShape(a.name, chg)} className="h-7 w-20" />
                    </td>
                    <td className="tabular px-3 py-2.5">
                      {a.ctx ? `${(Number(a.ctx.fundingRate) * 100).toFixed(4)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
              {watch.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-xs text-ink-faint">
                    Watchlist empty — add symbols in Watchlists.
                  </td>
                </tr>
              )}
            </DataTable>
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="Top movers" subtitle="Highest 24h change across the supported perps" />
          {market ? (
            <div className="space-y-1.5">
              {movers.map((a, i) => {
                const chg = chgOf(a);
                return (
                  <motion.div
                    key={a.name}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                    className="flex items-center justify-between rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-line hover:bg-surface-2/60"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="w-5 text-right font-mono text-[10px] text-ink-faint">{movers.indexOf(a) + 1}</span>
                      <span className="text-[13px] font-medium text-ink">{a.name}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular text-xs text-ink-dim">
                        ${Number(a.ctx!.markPx).toLocaleString("en-US", { maximumFractionDigits: 4 })}
                      </span>
                      <span className={`tabular w-16 text-right text-xs font-medium ${chg >= 0 ? "text-bull" : "text-bear"}`}>
                        {pct(chg)}
                      </span>
                    </span>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </Card>
      </div>

      {/* Decisions feed */}
      <Card>
        <CardHeader
          title="Recent decisions"
          subtitle="From the immutable ledger"
          right={
            <Link href="/decision-ledger" className="text-xs text-accent transition-colors hover:underline">
              Ledger →
            </Link>
          }
        />
        {decisions === null ? (
          <Skeleton className="h-24 w-full" />
        ) : !decisions || decisions.length === 0 ? (
          <p className="text-sm text-ink-dim">
            No decisions yet —{" "}
            <Link href="/agent-council" className="text-accent hover:underline">
              run the Agent Council
            </Link>{" "}
            to produce your first gated decision.
          </p>
        ) : (
          <div className="space-y-1.5">
            {decisions.map((d, i) => (
              <Link
                key={d.id}
                href="/decision-ledger"
                className="flex items-center justify-between rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-line hover:bg-surface-2/60"
              >
                <span className="flex items-center gap-3">
                  <span className="tabular text-xs text-ink-faint">
                    {new Date(d.createdAt).toISOString().slice(5, 16).replace("T", " ")}
                  </span>
                  <span className="text-[13px] font-medium text-ink">{d.symbol}</span>
                  <Badge tone={decisionTone(d.decision)} mono>
                    {d.decision.replace("_", " ")}
                  </Badge>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular text-xs text-ink-dim">{(Number(d.confidence) * 100).toFixed(0)}%</span>
                  <span className="text-xs text-accent opacity-0 transition-opacity group-hover:opacity-100">
                    replay →
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" gap={0.05}>
        <StaggerItem>
          <StatCard label="Directional precision" value={<Link href="/performance-lab" className="hover:text-accent">Performance Lab →</Link>} hint="calibration of past decisions" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Gate activity" value={<Link href="/evidence-graph" className="hover:text-accent">Evidence Graph →</Link>} hint="trace any decision" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Simulated book" value={<Link href="/paper-trading" className="hover:text-accent">Paper Trading →</Link>} hint="positions and P&L" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Risk limits" value={<Link href="/portfolio-guardian" className="hover:text-accent">Guardian →</Link>} hint="utilization and breaches" />
        </StaggerItem>
      </Stagger>
    </div>
  );
}

function DataBadge({ mode }: { mode: "live" | "demo" }) {
  return mode === "demo" ? <Badge tone="warn">DEMO DATA</Badge> : <Badge tone="accent">LIVE DATA</Badge>;
}
