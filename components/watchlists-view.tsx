"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardHeader, DataTable, Skeleton, TextInput } from "@/components/ui";

type WatchlistData = {
  lists: Array<{ id: string; name: string; isDefault: boolean }>;
  items: Array<{ id: string; symbol: string; addedAt: string }>;
};

export function WatchlistsView() {
  const [data, setData] = useState<WatchlistData | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/watchlists");
    const d = await res.json();
    if (res.ok) setData(d);
    else setError(d?.error?.message ?? "Failed to load watchlists");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: input.trim() }),
      });
      setInput("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(symbol: string) {
    setBusy(true);
    try {
      await fetch("/api/watchlists", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Card className="border-bear/30">
        <p className="text-sm text-bear">{error}</p>
      </Card>
    );
  }
  if (!data) return <Skeleton />;

  const defaultList = data.lists.find((l) => l.isDefault);

  return (
    <Card>
      <CardHeader
        title={defaultList?.name ?? "Watchlist"}
        subtitle="Symbols tracked across Command Center and Market Pulse. Add supported perpetual symbols."
        right={<Badge tone="accent">{data.items.length} symbols</Badge>}
      />
      <form onSubmit={add} className="mb-4 flex gap-2">
        <TextInput
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="Add symbol (e.g. HYPE)"
          className="w-56"
          aria-label="Symbol to add"
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          Add
        </Button>
      </form>
      <DataTable head={["Symbol", "Added", ""]}>
        {data.items.map((i) => (
          <tr key={i.id} className="text-ink-dim">
            <td className="px-3 py-2 font-medium text-ink">{i.symbol}</td>
            <td className="tabular px-3 py-2">{new Date(i.addedAt).toISOString().slice(0, 10)}</td>
            <td className="px-3 py-2 text-right">
              <button onClick={() => remove(i.symbol)} disabled={busy} className="text-xs text-bear hover:underline">
                remove
              </button>
            </td>
          </tr>
        ))}
        {data.items.length === 0 && (
          <tr>
            <td colSpan={3} className="px-3 py-5 text-center text-xs text-ink-faint">
              Empty watchlist — add symbols above or during onboarding.
            </td>
          </tr>
        )}
      </DataTable>
    </Card>
  );
}
