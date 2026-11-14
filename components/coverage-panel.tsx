import { Badge, Card } from "@/components/ui";

/*
 * Data Coverage & exclusions panel — the honest-disclosure surface required by
 * the data-integrity rules. Used by Wallet Forensics (and reusable elsewhere).
 */

export type CoveragePanelData = {
  dataset: string;
  badge: string;
  label: string;
  reasons: string[];
  totalRecords: number;
  uniqueRecords: number;
  pagesFetched: number;
  observedWindow: { earliest: number; latest: number } | null;
};

export function CoveragePanel({
  panels,
  completenessLabel,
  completenessReasons,
  analyzedFillCount,
  seenFillCount,
  caps,
  exclusions,
  compact = false,
}: {
  panels: CoveragePanelData[];
  completenessLabel: string;
  completenessReasons: string[];
  analyzedFillCount?: number;
  seenFillCount?: number;
  caps?: { maxPages: number; maxItems: number };
  exclusions?: Array<{ label: string; fills: number; coins: string[] }>;
  compact?: boolean;
}) {
  const partial = completenessLabel.toLowerCase().includes("partial");
  return (
    <Card className={compact ? "p-4" : ""} variant="elevated">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-ink">Data Coverage &amp; exclusions</p>
        <Badge tone={partial ? "warn" : "bull"}>{completenessLabel}</Badge>
      </div>
      <ul className="mb-3 space-y-1 text-xs text-ink-dim">
        {completenessReasons.map((r, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-ink-faint">•</span>
            <span>{r}</span>
          </li>
        ))}
        {analyzedFillCount !== undefined && seenFillCount !== undefined && (
          <li className="flex gap-1.5">
            <span className="text-ink-faint">•</span>
            <span className="tabular">
              {analyzedFillCount.toLocaleString("en-US")} of {seenFillCount.toLocaleString("en-US")} seen fills
              were perpetual-market fills included in the statistics.
            </span>
          </li>
        )}
        {caps && (
          <li className="flex gap-1.5">
            <span className="text-ink-faint">•</span>
            <span className="tabular">
              History walk limits: max {caps.maxPages.toLocaleString("en-US")} pages /{" "}
              {caps.maxItems.toLocaleString("en-US")} records per dataset.
            </span>
          </li>
        )}
      </ul>

      <div className="grid gap-2 sm:grid-cols-3">
        {panels.map((p) => (
          <div key={p.dataset} className="rounded-lg border border-line bg-surface-2 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-medium capitalize text-ink">{p.dataset}</p>
              <Badge tone={p.badge === "partial" ? "warn" : "bull"}>
                {p.badge === "partial" ? "Partial" : "Complete"}
              </Badge>
            </div>
            <p className="tabular text-[11px] text-ink-dim">
              {p.totalRecords.toLocaleString("en-US")} records · {p.pagesFetched} page
              {p.pagesFetched === 1 ? "" : "s"}
            </p>
            {p.observedWindow && (
              <p className="tabular mt-0.5 text-[11px] text-ink-faint">
                {new Date(p.observedWindow.earliest).toISOString().slice(0, 10)} →{" "}
                {new Date(p.observedWindow.latest).toISOString().slice(0, 10)}
              </p>
            )}
          </div>
        ))}
      </div>

      {exclusions && exclusions.some((e) => e.fills > 0) && (
        <div className="mt-3 rounded-lg border border-warn/25 bg-warn-soft/30 p-3">
          <p className="mb-1 text-xs font-medium text-warn">Excluded from perpetual statistics</p>
          <ul className="space-y-0.5 text-[11px] text-ink-dim">
            {exclusions
              .filter((e) => e.fills > 0)
              .map((e) => (
                <li key={e.label} className="tabular">
                  {e.fills.toLocaleString("en-US")} fills — {e.label}
                  {e.coins.length > 0 && (
                    <span className="text-ink-faint"> ({e.coins.slice(0, 4).join(", ")}{e.coins.length > 4 ? "…" : ""})</span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Coverage reflects what the Hyperliquid API returns. Partial coverage is
        never presented as lifetime performance.
      </p>
    </Card>
  );
}
