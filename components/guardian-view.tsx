"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Card, CardHeader, DataTable, Skeleton } from "@/components/ui";

type Portfolio = {
  account: { cash: string; startingBalance: string; equity: string; totalPnl: string };
  positions: Array<{ symbol: string; side: string; qty: string; notional: string; unrealized: string }>;
  guardian: {
    limits: { maxPositionPct: number; maxDailyLossPct: number; maxOpenPositions: number; maxLeverageX: number; maxConcentrationPct: number };
    utilization: { equity: string; notionalTotal: string; leverageX: string; concentrationPct: string; openPositions: number };
    checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  };
};

const usd = (s: string) => `${Number(s) < 0 ? "-" : ""}$${Math.abs(Number(s)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function GuardianView() {
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/paper")
      .then((r) => r.json())
      .then((d) => (d?.guardian ? setPf(d) : setError(d?.error?.message ?? "Failed to load portfolio")))
      .catch(() => setError("Failed to load portfolio"));
  }, []);

  if (error) return <Card className="border-bear/30"><p className="text-sm text-bear">{error}</p></Card>;
  if (!pf) return <Skeleton />;

  const failed = pf.guardian.checks.filter((c) => !c.passed);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-[11px] uppercase tracking-wider text-ink-faint">Equity (simulated)</p><p className="tabular mt-1 text-xl font-semibold">{usd(pf.guardian.utilization.equity)}</p></Card>
        <Card><p className="text-[11px] uppercase tracking-wider text-ink-faint">Total notional</p><p className="tabular mt-1 text-xl font-semibold">{usd(pf.guardian.utilization.notionalTotal)}</p></Card>
        <Card><p className="text-[11px] uppercase tracking-wider text-ink-faint">Leverage</p><p className="tabular mt-1 text-xl font-semibold">{pf.guardian.utilization.leverageX}× <span className="text-xs text-ink-faint">/ {pf.guardian.limits.maxLeverageX}×</span></p></Card>
        <Card><p className="text-[11px] uppercase tracking-wider text-ink-faint">Largest concentration</p><p className="tabular mt-1 text-xl font-semibold">{pf.guardian.utilization.concentrationPct}% <span className="text-xs text-ink-faint">/ {pf.guardian.limits.maxConcentrationPct}%</span></p></Card>
      </div>

      <Card>
        <CardHeader
          title="Risk-limit evaluation (current simulated portfolio)"
          subtitle="Limits come from your Risk Preferences; every check explains its arithmetic."
          right={<Badge tone={failed.length === 0 ? "bull" : "warn"}>{failed.length === 0 ? "ALL CLEAR" : `${failed.length} BREACH${failed.length === 1 ? "" : "ES"}`}</Badge>}
        />
        <div className="space-y-2">
          {pf.guardian.checks.map((c) => (
            <div key={c.id} className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
              <span className={`mt-0.5 text-sm ${c.passed ? "text-bull" : "text-warn"}`}>{c.passed ? "✓" : "!"}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink">{c.label}</p>
                <p className="tabular text-[11px] text-ink-dim">{c.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-ink-faint">
          Proposed orders are checked against these same limits before filling — a breach rejects the
          order with the exact reason (see order history in Paper Trading).{" "}
          <Link href="/risk-preferences" className="text-accent hover:underline">Adjust limits →</Link>
        </p>
      </Card>

      <Card padded={false}>
        <CardHeader title="Exposure by asset (simulated)" />
        <DataTable head={["Symbol", "Side", "Qty", "Notional", "Unrealized"]}>
          {pf.positions.map((p) => (
            <tr key={p.symbol} className="text-ink-dim">
              <td className="px-3 py-2 font-medium text-ink">{p.symbol}</td>
              <td className="px-3 py-2"><Badge tone={p.side === "long" ? "bull" : "bear"}>{p.side.toUpperCase()}</Badge></td>
              <td className="tabular px-3 py-2">{p.qty}</td>
              <td className="tabular px-3 py-2">{usd(p.notional)}</td>
              <td className="tabular px-3 py-2">{usd(p.unrealized)}</td>
            </tr>
          ))}
          {pf.positions.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-5 text-center text-xs text-ink-faint">No simulated exposure — Guardian is monitoring an empty book.</td></tr>
          )}
        </DataTable>
      </Card>
    </div>
  );
}
