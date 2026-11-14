"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardHeader, TextInput } from "@/components/ui";

type Prefs = {
  maxPositionPct: string;
  maxDailyLossPct: string;
  maxOpenPositions: number;
  maxLeverageX: string;
  maxConcentrationPct: string;
};

const FIELDS: Array<{ key: keyof Prefs; label: string; min: number; max: number; hint: string }> = [
  { key: "maxPositionPct", label: "Max order size (% of equity)", min: 1, max: 100, hint: "A single order above this share of equity is rejected." },
  { key: "maxDailyLossPct", label: "Daily loss cap (% of equity)", min: 1, max: 100, hint: "Guardian evaluates realized P&L against this cap." },
  { key: "maxOpenPositions", label: "Max open positions", min: 1, max: 20, hint: "Orders that would exceed this count are rejected." },
  { key: "maxLeverageX", label: "Max notional leverage (×)", min: 1, max: 20, hint: "Total notional / equity may not exceed this multiple." },
  { key: "maxConcentrationPct", label: "Max single-asset concentration (%)", min: 1, max: 100, hint: "One asset may not exceed this share of equity." },
];

export function RiskPrefsView() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/risk")
      .then((r) => r.json())
      .then((d) => {
        if (d?.preferences) setPrefs(d.preferences);
        else {
          // Defaults mirror onboarding defaults.
          setPrefs({ maxPositionPct: "20", maxDailyLossPct: "10", maxOpenPositions: 6, maxLeverageX: "5", maxConcentrationPct: "50" });
        }
      })
      .catch(() => setError("Failed to load preferences"));
  }, []);

  async function save() {
    if (!prefs) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/risk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxPositionPct: Number(prefs.maxPositionPct),
          maxDailyLossPct: Number(prefs.maxDailyLossPct),
          maxOpenPositions: Number(prefs.maxOpenPositions),
          maxLeverageX: Number(prefs.maxLeverageX),
          maxConcentrationPct: Number(prefs.maxConcentrationPct),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error?.message ?? "Save failed");
        return;
      }
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  if (!prefs) return <Card><div className="h-64 animate-pulse rounded-lg bg-surface-3" /></Card>;

  return (
    <Card>
      <CardHeader
        title="Simulated-trading risk limits"
        subtitle="Portfolio Guardian enforces these on every paper order and explains any breach. They constrain SIMULATED trading only."
      />
      <div className="space-y-5">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="mb-1 flex items-center justify-between text-xs font-medium text-ink-dim">
              <span>{f.label}</span>
              <span className="tabular text-ink">{prefs[f.key]}</span>
            </label>
            <input
              type="range"
              min={f.min}
              max={f.max}
              value={Number(prefs[f.key])}
              onChange={(e) => setPrefs({ ...prefs, [f.key]: e.target.value })}
              className="w-full accent-[#38d9f0]"
              aria-label={f.label}
            />
            <p className="mt-1 text-[11px] text-ink-faint">{f.hint}</p>
          </div>
        ))}
      </div>
      {error && <p className="mt-4 rounded-lg border border-bear/30 bg-bear-soft/50 px-3 py-2 text-xs text-bear">{error}</p>}
      {saved && <p className="mt-4 rounded-lg border border-bull/30 bg-bull-soft/40 px-3 py-2 text-xs text-bull">Limits saved — Guardian uses them immediately.</p>}
      <div className="mt-5">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save limits"}
        </Button>
      </div>
    </Card>
  );
}
