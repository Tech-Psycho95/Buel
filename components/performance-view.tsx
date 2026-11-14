"use client";

import { useEffect, useState } from "react";
import { Badge, Card, CardHeader, Skeleton, StatCard } from "@/components/ui";

type Perf = {
  outcomesEvaluated: number;
  newlyEvaluated: number;
  decisionsTotal: number;
  directionalCount: number;
  noTradeCount: number;
  metrics: {
    directionalPrecision: number | null;
    gatePrecision: number | null;
    noTradeShare: number | null;
    paperTrades: number;
    paperWinRate: number | null;
    paperExpectancy: string | null;
    paperNetRealized: string | null;
    paperMaxDrawdown: string | null;
  };
  disclosure: Record<string, string>;
};

const usd = (s: string) =>
  `${Number(s) < 0 ? "-" : ""}$${Math.abs(Number(s)).toLocaleString("en-US")}`;

export function PerformanceView() {
  const [d, setD] = useState<Perf | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/performance")
      .then((r) => r.json())
      .then((x) => (x?.metrics ? setD(x) : setError(x?.error?.message ?? "Failed to load")))
      .catch(() => setError("Failed to load performance data"));
  }, []);

  if (error) {
    return (
      <Card className="border-bear/30">
        <p className="text-sm text-bear">{error}</p>
      </Card>
    );
  }
  if (!d) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Directional precision"
          value={d.metrics.directionalPrecision === null ? "—" : `${d.metrics.directionalPrecision}%`}
          hint={`${d.directionalCount} directional decisions · ${d.outcomesEvaluated} evaluated`}
        />
        <StatCard
          label="Gate precision"
          value={d.metrics.gatePrecision === null ? "—" : `${d.metrics.gatePrecision}%`}
          hint="aligned outcomes when the gate passed"
        />
        <StatCard
          label="NO TRADE discipline"
          value={d.metrics.noTradeShare === null ? "—" : `${d.metrics.noTradeShare}%`}
          hint={`${d.noTradeCount} of ${d.decisionsTotal} runs refused conviction`}
        />
        <StatCard
          label="Paper win rate"
          value={d.metrics.paperWinRate === null ? "—" : `${d.metrics.paperWinRate}%`}
          hint={`${d.metrics.paperTrades} realized paper trades`}
          tone={d.metrics.paperWinRate !== null && d.metrics.paperWinRate >= 50 ? "bull" : "neutral"}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Paper expectancy / trade"
          value={d.metrics.paperExpectancy === null ? "—" : usd(d.metrics.paperExpectancy)}
        />
        <StatCard
          label="Net realized (paper)"
          value={d.metrics.paperNetRealized === null ? "—" : usd(d.metrics.paperNetRealized)}
          tone={d.metrics.paperNetRealized !== null && Number(d.metrics.paperNetRealized) >= 0 ? "bull" : "bear"}
        />
        <StatCard
          label="Max drawdown (realized)"
          value={d.metrics.paperMaxDrawdown === null ? "—" : usd(d.metrics.paperMaxDrawdown)}
          hint="from cumulative realized P&L"
        />
      </div>

      <Card>
        <CardHeader title="Method & limitations" subtitle="Shown with every metric — transparency over vanity" />
        <ul className="space-y-1.5 text-xs leading-relaxed text-ink-dim">
          {Object.entries(d.disclosure).map(([k, v]) => (
            <li key={k} className="flex gap-2">
              <span className="text-ink-faint">•</span>
              <span>
                <span className="font-medium text-ink capitalize">{k}:</span> {v}
              </span>
            </li>
          ))}
          {d.newlyEvaluated > 0 && (
            <li className="flex gap-2">
              <Badge tone="accent">{d.newlyEvaluated} outcomes evaluated this load</Badge>
            </li>
          )}
        </ul>
      </Card>

      {d.outcomesEvaluated === 0 && (
        <Card className="py-8 text-center">
          <p className="text-sm font-semibold text-ink">No evaluated outcomes yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-ink-faint">
            Run decisions in the Agent Council. Outcomes are evaluated against the labeled price at
            least 24 hours after each decision — calibration data appears here automatically.
          </p>
        </Card>
      )}
    </div>
  );
}
