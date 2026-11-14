"use client";

import { useState } from "react";
import { TextInput, Button, Badge } from "@/components/ui";

const SUGGESTED = ["BTC", "ETH", "SOL", "ARB", "AVAX", "LINK", "DOGE", "OP"];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [symbols, setSymbols] = useState<string[]>(["BTC", "ETH", "SOL"]);
  const [symbolInput, setSymbolInput] = useState("");
  const [startingBalance, setStartingBalance] = useState("100000");
  const [maxPositionPct, setMaxPositionPct] = useState(20);
  const [maxDailyLossPct, setMaxDailyLossPct] = useState(10);
  const [maxOpenPositions, setMaxOpenPositions] = useState(6);
  const [maxLeverageX, setMaxLeverageX] = useState(5);
  const [maxConcentrationPct, setMaxConcentrationPct] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addSymbol(s: string) {
    const v = s.trim().toUpperCase();
    if (!v || symbols.includes(v) || symbols.length >= 30) return;
    setSymbols([...symbols, v]);
    setSymbolInput("");
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watchlistSymbols: symbols,
          startingBalance,
          risk: { maxPositionPct, maxDailyLossPct, maxOpenPositions, maxLeverageX, maxConcentrationPct },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setError(data?.error?.message ?? data?.error ?? "Could not save onboarding — try again.");
        return;
      }
      window.location.href = "/command-center";
    } finally {
      setBusy(false);
    }
  }

  const stepTitles = ["Your watchlist", "Paper portfolio", "Risk limits"];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-10">
      <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">BUEL onboarding</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
        {stepTitles[step]} <span className="text-ink-faint">({step + 1}/3)</span>
      </h1>
      <p className="mt-1 text-sm text-ink-dim">
        Every preference below is editable later in Settings / Risk Preferences.
      </p>

      <div className="mt-6 rounded-[14px] border border-line bg-surface/85 p-7 panel-sheen backdrop-blur">
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-ink-dim">
              Tokens you want on your Command Center and Market Pulse. Skip to use the defaults.
            </p>
            <div className="flex flex-wrap gap-2">
              {symbols.map((s) => (
                <button
                  key={s}
                  onClick={() => setSymbols(symbols.filter((x) => x !== s))}
                  className="rounded-md border border-accent/30 bg-accent-soft px-2 py-1 text-xs font-medium text-accent hover:bg-bear-soft hover:text-bear hover:border-bear/30"
                >
                  {s} ×
                </button>
              ))}
              {symbols.length === 0 && <span className="text-xs text-ink-faint">No symbols yet.</span>}
            </div>
            <div className="flex gap-2">
              <TextInput
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSymbol(symbolInput))}
                placeholder="Add a symbol (e.g. HYPE)"
                aria-label="Add symbol"
              />
              <Button variant="subtle" onClick={() => addSymbol(symbolInput)}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.filter((s) => !symbols.includes(s)).map((s) => (
                <button
                  key={s}
                  onClick={() => addSymbol(s)}
                  className="rounded-md border border-line px-2 py-1 text-xs text-ink-dim hover:border-accent/40 hover:text-accent"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-ink-dim">
              Your simulated starting balance. This is play money in every sense — nothing here touches
              real funds, ever.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-lg text-ink-dim">$</span>
              <TextInput
                type="number"
                min="100"
                max="10000000"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                aria-label="Paper starting balance"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {["10000", "50000", "100000", "500000"].map((v) => (
                <button
                  key={v}
                  onClick={() => setStartingBalance(v)}
                  className={`rounded-md border px-3 py-1.5 text-xs ${
                    startingBalance === v
                      ? "border-accent/40 bg-accent-soft text-accent"
                      : "border-line text-ink-dim hover:text-ink"
                  }`}
                >
                  ${Number(v).toLocaleString("en-US")}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {(
              [
                ["Max position size (% of portfolio)", maxPositionPct, setMaxPositionPct, 1, 100],
                ["Max daily loss (%)", maxDailyLossPct, setMaxDailyLossPct, 1, 100],
                ["Max open positions", maxOpenPositions, setMaxOpenPositions, 1, 50],
                ["Max leverage (×)", maxLeverageX, setMaxLeverageX, 1, 50],
                ["Max concentration in one asset (%)", maxConcentrationPct, setMaxConcentrationPct, 1, 100],
              ] as Array<[string, number, (v: number) => void, number, number]>
            ).map(([label, value, setter, min, max]) => (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-ink-dim">{label}</label>
                  <span className="tabular text-xs text-ink">{value}</span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={value}
                  onChange={(e) => setter(Number(e.target.value))}
                  className="w-full accent-[#38d9f0]"
                  aria-label={label}
                />
              </div>
            ))}
            <p className="text-[11px] text-ink-faint">
              Portfolio Guardian enforces these limits on every simulated order and explains any breach.
            </p>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-bear/30 bg-bear-soft/50 px-3 py-2 text-xs text-bear">{error}</p>
        )}

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={() => (step === 0 ? setStep(0) : setStep(step - 1))} disabled={busy}>
            {step === 0 ? "Reset" : "Back"}
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)}>Continue</Button>
          ) : (
            <Button onClick={finish} disabled={busy}>
              {busy ? "Saving…" : "Enter Command Center"}
            </Button>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] text-ink-faint">
        <Badge tone="warn">PAPER TRADING ONLY</Badge>{" "}
        No private keys. No wallet connection. No real-money execution.
      </p>
    </main>
  );
}
