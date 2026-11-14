"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardHeader, DataTable, Skeleton, TextInput, DataModeBadge } from "@/components/ui";

type Memory = {
  symbol: string;
  mode: "live" | "demo";
  currentFeatures: Record<string, string>;
  analogues: Array<{
    dateIso: string;
    trend24h: string;
    volatility: string;
    volumeVsMean: string;
    forwardReturnPct: number;
    similarity: number;
  }>;
  bucketsCompared: number;
  summary: string;
  disclosure: Record<string, string>;
};

export function MemoryView() {
  const [symbol, setSymbol] = useState("BTC");
  const [d, setD] = useState<Memory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (sym: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/memory?symbol=${encodeURIComponent(sym)}`);
      const x = await res.json();
      if (res.ok) setD(x);
      else setError(x?.error?.message ?? "Failed to load memory");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load("BTC");
  }, [load]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Find historical analogues"
          subtitle="Feature-vector similarity over hourly candles: 24h trend, hourly volatility, volume vs its 168h mean."
          right={d ? <DataModeBadge mode={d.mode} /> : undefined}
        />
        <div className="flex flex-wrap gap-2">
          <TextInput
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="w-32 font-mono"
            aria-label="Symbol"
          />
          <Button onClick={() => load(symbol)} disabled={busy}>
            {busy ? "Comparing…" : "Find analogues"}
          </Button>
        </div>
        {error && (
          <p className="mt-3 rounded-lg border border-bear/30 bg-bear-soft/50 px-3 py-2 text-xs text-bear">{error}</p>
        )}
      </Card>

      {busy && <Skeleton />}
      {d && !busy && (
        <>
          <Card>
            <CardHeader title={`Current setup — ${d.symbol}`} subtitle={`${d.bucketsCompared} historical buckets compared`} />
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(d.currentFeatures).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                  <p className="text-[11px] capitalize text-ink-faint">{k.replace(/([A-Z])/g, " $1").trim()}</p>
                  <p className="tabular text-sm font-medium text-ink">{v}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-ink-dim">{d.summary}</p>
          </Card>

          <Card padded={false}>
            <CardHeader title="Nearest historical analogues" subtitle="Sorted by feature similarity" />
            <DataTable head={["Date", "Trend 24h", "Volatility", "Volume vs mean", "Forward 24h", "Similarity"]}>
              {d.analogues.map((a) => (
                <tr key={a.dateIso} className="text-ink-dim">
                  <td className="tabular px-3 py-2">{a.dateIso}</td>
                  <td className={`tabular px-3 py-2 ${Number(a.trend24h) >= 0 ? "text-bull" : "text-bear"}`}>{a.trend24h}</td>
                  <td className="tabular px-3 py-2">{a.volatility}</td>
                  <td className="tabular px-3 py-2">{a.volumeVsMean}</td>
                  <td className={`tabular px-3 py-2 ${a.forwardReturnPct >= 0 ? "text-bull" : "text-bear"}`}>
                    {a.forwardReturnPct >= 0 ? "+" : ""}
                    {a.forwardReturnPct}%
                  </td>
                  <td className="tabular px-3 py-2">{a.similarity}%</td>
                </tr>
              ))}
              {d.analogues.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-5 text-center text-xs text-ink-faint">
                    No analogues available.
                  </td>
                </tr>
              )}
            </DataTable>
          </Card>

          <Card>
            <CardHeader title="Method & limitations" />
            <ul className="space-y-1.5 text-xs leading-relaxed text-ink-dim">
              {Object.entries(d.disclosure).map(([k, v]) => (
                <li key={k} className="flex gap-2">
                  <span className="text-ink-faint">•</span>
                  <span>
                    <span className="font-medium text-ink capitalize">{k}:</span> {v}
                  </span>
                </li>
              ))}
            </ul>
            <Badge tone="warn" className="mt-3">
              ANALOGUES ≠ PREDICTIONS
            </Badge>
          </Card>
        </>
      )}
    </div>
  );
}
