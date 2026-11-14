"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardHeader, DataTable, Select, StatCard, TextInput, PnL } from "@/components/ui";

type Portfolio = {
  account: { cash: string; startingBalance: string; equity: string; totalPnl: string };
  positions: Array<{
    symbol: string; side: string; qty: string; avgEntryPrice: string; markPrice: string;
    notional: string; unrealized: string; stopPrice: string | null; takeProfitPrice: string | null;
  }>;
  guardian: {
    limits: { maxPositionPct: number; maxDailyLossPct: number; maxOpenPositions: number; maxLeverageX: number; maxConcentrationPct: number };
    utilization: { equity: string; notionalTotal: string; leverageX: string; concentrationPct: string; openPositions: number };
    checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  };
  orders: Array<{ id: string; symbol: string; side: string; intent: string; status: string; rejectReason: string | null; fillPrice: string | null; fee: string | null; realizedPnl: string | null; createdAt: string }>;
};

const usd = (s: string | null | undefined) =>
  s === null || s === undefined ? "—" : `${Number(s) < 0 ? "-" : ""}$${Math.abs(Number(s)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaperTradingView({ defaultSymbol }: { defaultSymbol: string }) {
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    symbol: defaultSymbol,
    side: "long",
    qty: "0.1",
    stopPrice: "",
    takeProfitPrice: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/paper");
      const d = await res.json();
      if (res.ok) setPf(d);
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  async function submit(intent: "entry" | "exit", override?: Partial<typeof form>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const f = { ...form, ...override };
    try {
      const res = await fetch("/api/paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: f.symbol,
          side: f.side,
          intent,
          qty: f.qty,
          stopPrice: f.stopPrice || null,
          takeProfitPrice: f.takeProfitPrice || null,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setError(d?.error?.message ?? d?.reason ?? "Order failed.");
        return;
      }
      setNotice(
        intent === "entry"
          ? `Filled ${f.side} ${f.qty} ${f.symbol} @ ${d.fillPrice} (fee ${usd(d.fee)})`
          : `Closed @ ${d.fillPrice} — realized P&L ${d.realizedPnl}`,
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-warn/30 bg-warn-soft/20 halo">
        <p className="text-sm font-medium text-warn">
          PAPER TRADING — every balance, order and fill below is simulated. There is no real-money
          execution path in this product: no keys, no wallet signing, no broker connectivity.
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Equity (simulated)" value={pf ? usd(pf.account.equity) : "—"} hint={pf ? `cash ${usd(pf.account.cash)}` : "loading"} />
        <StatCard label="Total P&L" value={pf ? usd(pf.account.totalPnl) : "—"} tone={pf && Number(pf.account.totalPnl) >= 0 ? "bull" : "bear"} hint={pf ? `from ${usd(pf.account.startingBalance)} start` : ""} />
        <StatCard label="Open positions" value={pf?.positions.length ?? 0} hint={pf ? `limits: max ${pf.guardian.limits.maxOpenPositions}` : ""} />
        <StatCard label="Leverage utilization" value={pf ? `${pf.guardian.utilization.leverageX}×` : "—"} hint={pf ? `cap ${pf.guardian.limits.maxLeverageX}× · full-collateral v1` : ""} />
      </div>

      <Card>
        <CardHeader title="Simulated order" subtitle="Market orders fill at the current labeled price with slippage + fee. Guardian checks run before every order." />
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] text-ink-faint">Symbol</label>
            <TextInput value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} className="w-28 font-mono" aria-label="Symbol" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-faint">Side</label>
            <Select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })} aria-label="Side">
              <option value="long">Long</option>
              <option value="short">Short</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-faint">Quantity</label>
            <TextInput value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className="w-24" aria-label="Quantity" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-faint">Stop (optional)</label>
            <TextInput value={form.stopPrice} onChange={(e) => setForm({ ...form, stopPrice: e.target.value })} className="w-24" placeholder="—" aria-label="Stop price" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-faint">Take-profit (optional)</label>
            <TextInput value={form.takeProfitPrice} onChange={(e) => setForm({ ...form, takeProfitPrice: e.target.value })} className="w-24" placeholder="—" aria-label="Take profit price" />
          </div>
          <Button onClick={() => submit("entry")} disabled={busy}>{busy ? "Working…" : "Simulate entry"}</Button>
          <Button variant="ghost" onClick={() => submit("exit")} disabled={busy}>Close position</Button>
        </div>
        {notice && <p className="mt-3 rounded-lg border border-bull/30 bg-bull-soft/40 px-3 py-2 text-xs text-bull">{notice}</p>}
        {error && <p className="mt-3 rounded-lg border border-bear/30 bg-bear-soft/50 px-3 py-2 text-xs text-bear">{error}</p>}
        <p className="mt-3 text-[11px] text-ink-faint">
          Protective orders evaluate against current prices on refresh (event-driven in v1 — disclosed).
          No leverage margining or liquidation modeling in this version.
        </p>
      </Card>


      {pf && pf.orders.filter((o) => o.realizedPnl !== null).length > 0 && (
        <Card variant="elevated">
          <CardHeader
            eyebrow="Simulation performance"
            title="Cumulative realized P&L (paper)"
            subtitle="From closing fills only — entries are never counted as profit."
          />
          <PnlCurve orders={pf.orders.filter((o) => o.realizedPnl !== null).slice().reverse()} />
        </Card>
      )}

      {pf && (
        <>
          <Card padded={false}>
            <CardHeader title="Open positions (simulated)" />
            <DataTable head={["Symbol", "Side", "Qty", "Avg entry", "Mark", "Notional", "Unrealized", "Stop", "TP"]}>
              {pf.positions.map((p) => (
                <tr key={p.symbol} className="text-ink-dim">
                  <td className="px-3 py-2 font-medium text-ink">{p.symbol}</td>
                  <td className="px-3 py-2"><Badge tone={p.side === "long" ? "bull" : "bear"}>{p.side.toUpperCase()}</Badge></td>
                  <td className="tabular px-3 py-2">{p.qty}</td>
                  <td className="tabular px-3 py-2">${Number(p.avgEntryPrice).toLocaleString("en-US")}</td>
                  <td className="tabular px-3 py-2">${Number(p.markPrice).toLocaleString("en-US")}</td>
                  <td className="tabular px-3 py-2">{usd(p.notional)}</td>
                  <td className="px-3 py-2"><PnL value={p.unrealized} formatted={usd(p.unrealized)} /></td>
                  <td className="tabular px-3 py-2">{p.stopPrice ? `$${Number(p.stopPrice).toLocaleString("en-US")}` : "—"}</td>
                  <td className="tabular px-3 py-2">{p.takeProfitPrice ? `$${Number(p.takeProfitPrice).toLocaleString("en-US")}` : "—"}</td>
                </tr>
              ))}
              {pf.positions.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-5 text-center text-xs text-ink-faint">No open simulated positions.</td></tr>
              )}
            </DataTable>
          </Card>

          <Card padded={false}>
            <CardHeader title="Order history" subtitle="Filled and Guardian-rejected orders alike — full audit trail" />
            <DataTable head={["When", "Symbol", "Intent", "Status", "Fill", "Fee", "Realized", "Note"]}>
              {pf.orders.map((o) => (
                <tr key={o.id} className="text-ink-dim">
                  <td className="tabular px-3 py-2">{new Date(o.createdAt).toISOString().slice(5, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2 font-medium text-ink">{o.symbol}</td>
                  <td className="px-3 py-2">{o.intent}</td>
                  <td className="px-3 py-2"><Badge tone={o.status === "filled" ? "bull" : "bear"}>{o.status}</Badge></td>
                  <td className="tabular px-3 py-2">{o.fillPrice ? `$${Number(o.fillPrice).toLocaleString("en-US")}` : "—"}</td>
                  <td className="tabular px-3 py-2">{o.fee ? usd(o.fee) : "—"}</td>
                  <td className="px-3 py-2">{o.realizedPnl ? <PnL value={o.realizedPnl} formatted={usd(o.realizedPnl)} /> : "—"}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-[11px] text-ink-faint" title={o.rejectReason ?? undefined}>{o.rejectReason ?? "—"}</td>
                </tr>
              ))}
              {pf.orders.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-5 text-center text-xs text-ink-faint">No orders yet.</td></tr>
              )}
            </DataTable>
          </Card>
        </>
      )}

      {!pf && <Card><Skeleton /></Card>}
    </div>
  );
}

function Skeleton() {
  return <div className="h-24 w-full animate-pulse rounded-lg bg-surface-3" />;
}

function PnlCurve({ orders }: { orders: Array<{ realizedPnl: string | null }> }) {
  const vals = orders.map((o) => Number(o.realizedPnl));
  const cum: number[] = [];
  let acc = 0;
  for (const v of vals) {
    acc += v;
    cum.push(acc);
  }
  if (cum.length < 2) return null;
  const min = Math.min(...cum, 0);
  const max = Math.max(...cum, 1);
  const range = max - min || 1;
  const w = 800;
  const h = 160;
  const pts = cum
    .map((c, i) => `${(i / (cum.length - 1)) * w},${h - 10 - ((c - min) / range) * (h - 24)}`)
    .join(" ");
  const up = cum[cum.length - 1] >= 0;
  const stroke = up ? "#2fe0a2" : "#ff6b7d";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1={h - 10 - ((0 - min) / range) * (h - 24)} x2={w} y2={h - 10 - ((0 - min) / range) * (h - 24)} stroke="rgba(146,178,255,0.2)" strokeDasharray="3 4" />
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#pnlFill)" />
      <polyline
        className="draw-line"
        style={{ "--draw-len": 1200 } as React.CSSProperties}
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
