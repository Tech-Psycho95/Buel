"use client";

import { useEffect, useState } from "react";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui";

type Catalyst = {
  id: string;
  title: string;
  body: string;
  source: string;
  status: string;
  assets: string[];
  occurredAt: string;
  isDemo: boolean;
};

export function CatalystsView() {
  const [rows, setRows] = useState<Catalyst[] | null>(null);
  const [disclosure, setDisclosure] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/catalysts")
      .then((r) => r.json())
      .then((d) => {
        if (d?.catalysts) {
          setRows(d.catalysts);
          setDisclosure(d.disclosure);
        } else setError(d?.error?.message ?? "Failed to load");
      })
      .catch(() => setError("Failed to load catalysts"));
  }, []);

  if (error) {
    return (
      <Card className="border-bear/30">
        <p className="text-sm text-bear">{error}</p>
      </Card>
    );
  }
  if (!rows) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-warn/30 bg-warn-soft/20">
        <p className="text-xs leading-relaxed text-warn">{disclosure}</p>
      </Card>
      {rows.map((c) => (
        <Card key={c.id}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={c.status === "confirmed" ? "bull" : "warn"}>
              {c.status === "confirmed" ? "CONFIRMED EVENT" : "HYPOTHESIS / UNVERIFIED"}
            </Badge>
            {c.isDemo && <Badge tone="warn">DEMO FIXTURE</Badge>}
            <span className="tabular text-[11px] text-ink-faint">
              {new Date(c.occurredAt).toISOString().slice(0, 10)}
            </span>
            <div className="flex gap-1">
              {c.assets.map((a) => (
                <Badge key={a} tone="neutral">
                  {a}
                </Badge>
              ))}
            </div>
          </div>
          <p className="text-sm font-semibold text-ink">{c.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-dim">{c.body}</p>
          <p className="mt-2 text-[11px] text-ink-faint">Source: {c.source}</p>
        </Card>
      ))}
    </div>
  );
}
