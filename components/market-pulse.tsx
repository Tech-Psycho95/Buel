"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Card, CardHeader, DataTable, Skeleton, TextInput, DataModeBadge } from "@/components/ui";

type Asset = {
  name: string;
  classification: string;
  ctx?: { markPx: string; fundingRate: string; openInterest: string; dayNtlVlm: string; prevDayPx: string };
};

type MarketResponse = {
  freshness: { source: string; ageSec: number; stale: boolean };
  mode: "live" | "demo";
  watchSymbols: string[];
  assets: Asset[];
  totalMarkets: number;
};

type Detail = {
  interval?: string;
  asset: Asset;
  candles: Array<{ t: number; c: string; o: string; h: string; l: string; v: string }>;
  intervalParam?: string;
  freshness: { source: string; ageSec: number; stale: boolean };
  mode: "live" | "demo";
};

const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

export function MarketPulseView() {
  const [data, setData] = useState<MarketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [interval_, setInterval_] = useState("1h");
  const [onlyWatchlist, setOnlyWatchlist] = useState(false);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/market");
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message ?? "Failed to load markets");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load markets");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  async function openDetail(symbol: string, iv = interval_) {
    setSelected(symbol);
    setDetail(null);
    setDetailBusy(true);
    try {
      const res = await fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&interval=${iv}`);
      const d = await res.json();
      if (res.ok) setDetail(d);
    } finally {
      setDetailBusy(false);
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.assets.filter(
      (a) =>
        (!onlyWatchlist || data.watchSymbols.includes(a.name)) &&
        a.name.toLowerCase().includes(query.trim().toLowerCase()),
    );
  }, [data, query, onlyWatchlist]);

  if (error) {
    return (
      <Card className="border-bear/30 bg-bear-soft/30">
        <p className="text-sm text-bear">{error}</p>
        <button onClick={load} className="mt-2 text-xs text-accent underline">Retry</button>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DataModeBadge mode={data.mode} />
        {data.freshness.stale ? <Badge tone="warn">stale · {data.freshness.ageSec}s</Badge> : <Badge tone="neutral">fresh · {data.freshness.ageSec}s</Badge>}
        <Badge tone="neutral">{data.totalMarkets} markets in universe</Badge>
        <span className="ml-auto flex items-center gap-2">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol…"
            className="w-44"
            aria-label="Search symbol"
          />
          <button
            onClick={() => setOnlyWatchlist(!onlyWatchlist)}
            className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
              onlyWatchlist ? "border-accent/40 bg-accent-soft text-accent" : "border-line text-ink-dim hover:text-ink"
            }`}
          >
            Watchlist only
          </button>
        </span>
      </div>

      <Card padded={false}>
        <DataTable head={["Symbol", "Mark", "24h", "Volume (24h)", "Funding/h", "Open interest", ""]}>
          {filtered.map((a) => {
            const prev = a.ctx ? Number(a.ctx.prevDayPx) : 0;
            const mark = a.ctx ? Number(a.ctx.markPx) : 0;
            const chg = prev > 0 ? (mark - prev) / prev : 0;
            return (
              <tr key={a.name} className="text-ink-dim hover:bg-surface-2/60">
                <td className="px-3 py-2">
                  <span className="font-medium text-ink">{a.name}</span>
                  {data.watchSymbols.includes(a.name) && <Badge tone="accent" className="ml-2">watch</Badge>}
                </td>
                <td className="tabular px-3 py-2">${mark.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                <td className={`tabular px-3 py-2 ${chg >= 0 ? "text-bull" : "text-bear"}`}>{pct(chg)}</td>
                <td className="tabular px-3 py-2">${a.ctx ? Number(a.ctx.dayNtlVlm).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}</td>
                <td className="tabular px-3 py-2">{a.ctx ? `${(Number(a.ctx.fundingRate) * 100).toFixed(4)}%` : "—"}</td>
                <td className="tabular px-3 py-2">${a.ctx ? Number(a.ctx.openInterest).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => openDetail(a.name)} className="text-xs text-accent hover:underline">detail</button>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-ink-faint">No symbols match.</td></tr>
          )}
        </DataTable>
      </Card>

      {selected && (
        <Card variant="elevated" className="halo">
          <CardHeader
            eyebrow="Token detail"
            title={`${selected} — ${detail?.interval ?? interval_} candles`}
            subtitle={detail ? `Source: ${detail.freshness.source} · age ${detail.freshness.ageSec}s · ${detail.candles.length} candles` : "Loading…"}
            right={
              <span className="flex items-center gap-2">
                <span className="flex gap-1">
                  {["15m", "1h", "4h", "1d"].map((iv) => (
                    <button
                      key={iv}
                      onClick={() => { setInterval_(iv); openDetail(selected, iv); }}
                      className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                        interval_ === iv ? "border-accent/45 bg-accent-soft text-accent" : "border-line text-ink-dim hover:text-ink"
                      }`}
                    >
                      {iv}
                    </button>
                  ))}
                </span>
                <button onClick={() => setSelected(null)} className="text-xs text-ink-faint transition-colors hover:text-ink">
                  close
                </button>
              </span>
            }
          />
          {detailBusy && <Skeleton className="h-56 w-full" />}
          {detail && <PriceChart candles={detail.candles} />}
          {detail && (
            <p className="mt-3 text-[11px] text-ink-faint">
              Prices are {detail.mode === "demo" ? "deterministic demo data" : "live Hyperliquid candles"}; always
              check the freshness badge before reading any number as current.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function PriceChart({ candles }: { candles: Detail["candles"] }) {
  // Close-price area chart with gradient fill and draw-in (no chart lib needed).
  const closes = candles.map((c) => Number(c.c));
  if (closes.length < 2) return null;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const w = 800;
  const h = 200;
  const pts = closes
    .map((c, i) => `${(i / (closes.length - 1)) * w},${h - 8 - ((c - min) / range) * (h - 24)}`)
    .join(" ");
  const up = closes[closes.length - 1] >= closes[0];
  const stroke = up ? "#2fe0a2" : "#ff6b7d";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-52 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="pulseFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#pulseFill)" />
      <polyline
        className="draw-line"
        style={{ "--draw-len": 1400 } as React.CSSProperties}
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <line x1="0" y1={h - 8 - ((closes[closes.length - 1] - min) / range) * (h - 24)} x2={w} y2={h - 8 - ((closes[closes.length - 1] - min) / range) * (h - 24)} stroke={stroke} strokeOpacity="0.25" strokeDasharray="3 4" />
    </svg>
  );
}
