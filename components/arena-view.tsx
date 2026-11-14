"use client";

import { useState } from "react";
import { Badge, Button, Card, CardHeader, DataTable, Select, Skeleton, TextInput } from "@/components/ui";

type ArenaResult = {
  strategy: string;
  label: string;
  finalEquity: string;
  returnPct: string;
  maxDrawdownPct: string;
  winRate: string;
  tradeCount: number;
  avgTradePnl: string;
  sampleSize: number;
  windowStartIso: string;
  windowEndIso: string;
  equityCurve: Array<{ t: number; equity: string }>;
};

type ArenaResponse = {
  symbol: string;
  mode: "live" | "demo";
  candleCount: number;
  results: ArenaResult[];
  assumptions: Record<string, string>;
};

const pct = (s: string) => `${Number(s) >= 0 ? "+" : ""}${Number(s).toFixed(2)}%`;
const usd = (s: string) => `$${Number(s).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ArenaView() {
  const [symbol, setSymbol] = useState("BTC");
  const [windowDays, setWindowDays] = useState("90");
  const [data, setData] = useState<ArenaResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/arena/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, windowDays: Number(windowDays) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error?.message ?? "Arena run failed.");
        return;
      }
      setData(d);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Run the arena"
          subtitle="Four strategies, identical starting capital, identical fees, slippage, warm-up and window. Signals fire on bar close; fills occur at the NEXT bar open — no look-ahead."
        />
        <form onSubmit={run} className="flex flex-wrap gap-2">
          <TextInput value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="w-32 font-mono" aria-label="Symbol" />
          <Select value={windowDays} onChange={(e) => setWindowDays(e.target.value)} aria-label="Window">
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">365 days</option>
          </Select>
          <Button type="submit" disabled={busy}>{busy ? "Backtesting…" : "Run backtests"}</Button>
        </form>
        {error && <p className="mt-3 rounded-lg border border-bear/30 bg-bear-soft/50 px-3 py-2 text-xs text-bear">{error}</p>}
      </Card>

      {busy && <Card><Skeleton /></Card>}

      {data && !busy && (
        <>
          <Card padded={false}>
            <CardHeader
              title={`Results — ${data.symbol}`}
              subtitle={`${data.candleCount} candles · ${data.mode === "demo" ? "DEMO DATA" : "live data"} · equal constraints across all strategies`}
            />
            <DataTable head={["Strategy", "Return", "Max drawdown", "Win rate", "Trades", "Avg trade", "Final equity"]}>
              {data.results.map((r) => (
                <tr key={r.strategy} className="text-ink-dim">
                  <td className="px-3 py-2">
                    <p className="font-medium text-ink">{r.strategy.replace("_", " ")}</p>
                    <p className="text-[10px] text-ink-faint">{r.label}</p>
                  </td>
                  <td className={`tabular px-3 py-2 ${Number(r.returnPct) >= 0 ? "text-bull" : "text-bear"}`}>{pct(r.returnPct)}</td>
                  <td className="tabular px-3 py-2 text-warn">{pct("-" + r.maxDrawdownPct)}</td>
                  <td className="tabular px-3 py-2">{Number(r.winRate).toFixed(1)}%</td>
                  <td className="tabular px-3 py-2">{r.tradeCount}</td>
                  <td className="tabular px-3 py-2">{usd(r.avgTradePnl)}</td>
                  <td className="tabular px-3 py-2">{usd(r.finalEquity)}</td>
                </tr>
              ))}
            </DataTable>
          </Card>

          <Card>
            <CardHeader title="Equity curves" subtitle="Warm-up bars excluded; identical capital and costs" />
            <EquityCurves results={data.results} />
          </Card>

          <Card>
            <CardHeader title="Backtest assumptions & limitations" subtitle="Read before interpreting any number above" />
            <ul className="space-y-1.5 text-xs leading-relaxed text-ink-dim">
              {Object.entries(data.assumptions).map(([k, v]) => (
                <li key={k} className="flex gap-2"><span className="text-ink-faint">•</span><span><span className="font-medium text-ink">{k}:</span> {v}</span></li>
              ))}
              {data.results.map((r) => (
                <li key={r.strategy} className="flex gap-2">
                  <span className="text-ink-faint">•</span>
                  <span className="tabular"><span className="font-medium text-ink">{r.strategy} sample:</span> {r.sampleSize} bars, {r.windowStartIso.slice(0, 10)} → {r.windowEndIso.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {!data && !busy && (
        <Card className="py-10 text-center">
          <p className="text-sm font-semibold text-ink">Choose a symbol and run the arena</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-faint">
            Every strategy trades the same candles with the same costs. The point is relative
            robustness, not a performance guarantee — backtests are historical simulations.
          </p>
        </Card>
      )}
    </div>
  );
}

function EquityCurves({ results }: { results: ArenaResult[] }) {
  const colors: Record<string, string> = {
    momentum: "#38d9f0",
    mean_reversion: "#a78bfa",
    breakout: "#34d399",
    defensive: "#fbbf24",
  };
  const all = results.flatMap((r) => r.equityCurve.map((p) => Number(p.equity)));
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 1);
  const range = max - min || 1;
  const w = 800;
  const h = 220;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full" preserveAspectRatio="none">
        {results.map((r) => {
          const pts = r.equityCurve
            .map((p, i) => `${(i / Math.max(1, r.equityCurve.length - 1)) * w},${h - ((Number(p.equity) - min) / range) * (h - 16) - 8}`)
            .join(" ");
          return <polyline key={r.strategy} points={pts} fill="none" stroke={colors[r.strategy] ?? "#94a3b8"} strokeWidth="1.8" />;
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-ink-dim">
        {results.map((r) => (
          <span key={r.strategy} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded" style={{ background: colors[r.strategy] ?? "#94a3b8" }} />
            {r.strategy.replace("_", " ")}
          </span>
        ))}
      </div>
    </div>
  );
}
