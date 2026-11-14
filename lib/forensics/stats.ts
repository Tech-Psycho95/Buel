import { Decimal, parseMoney, parseOrZero, sum, mean } from "@/lib/money";
import type { CompletedTrade } from "./trades";

/*
 * Deterministic wallet statistics — every number in the product comes from
 * here (never from the LLM). Each metric carries machine-readable evidence
 * references the narrative layer must cite (validated downstream).
 *
 * All trade-level statistics use COMPLETED trades only (incomplete lifecycles
 * excluded — data-integrity Rule 4). "Post-Loss Size Escalation" (renamed from
 * the tilt metric) is a descriptive statistical observation about position
 * sizes following completed losses — it makes no claims about psychology.
 */

export type EvidenceRef = {
  id: string;
  kind: "trades" | "coin" | "day" | "hour" | "weekday" | "streak" | "week" | "fills" | "funding" | "ledger";
  label: string;
  count: number;
  from?: number;
  to?: number;
};

export type EvidenceRegistry = Record<string, EvidenceRef>;

function ref(evidence: EvidenceRegistry, r: EvidenceRef): string {
  evidence[r.id] = r;
  return r.id;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export type Overview = {
  tradeCount: number;
  winRate: Decimal;
  avgWin: Decimal;
  avgLoss: Decimal;
  profitFactor: Decimal; // grossWin / |grossLoss|; ∞ → -1 sentinel? use 0 when no losses
  expectancy: Decimal; // avg PnL per completed trade
  bestTradePnl: Decimal;
  worstTradePnl: Decimal;
  avgTradeDurationMin: Decimal;
  grossProfit: Decimal;
  grossLoss: Decimal;
};

export function computeOverview(trades: CompletedTrade[]): Overview {
  const wins = trades.filter((t) => t.realizedPnl.gt(0));
  const losses = trades.filter((t) => t.realizedPnl.lt(0));
  const grossProfit = sum(wins.map((t) => t.realizedPnl));
  const grossLoss = sum(losses.map((t) => t.realizedPnl.abs()));
  const durations = trades.map((t) => Math.max(0, t.closedAt - t.openedAt) / 60000);

  return {
    tradeCount: trades.length,
    winRate: trades.length ? new Decimal(wins.length).div(trades.length) : new Decimal(0),
    avgWin: wins.length ? grossProfit.div(wins.length) : new Decimal(0),
    avgLoss: losses.length ? grossLoss.div(losses.length) : new Decimal(0),
    profitFactor: grossLoss.gt(0) ? grossProfit.div(grossLoss) : grossProfit.gt(0) ? new Decimal(99) : new Decimal(0),
    expectancy: trades.length ? sum(trades.map((t) => t.realizedPnl)).div(trades.length) : new Decimal(0),
    bestTradePnl: trades.length ? trades.reduce((m, t) => Decimal.max(m, t.realizedPnl), trades[0].realizedPnl) : new Decimal(0),
    worstTradePnl: trades.length ? trades.reduce((m, t) => Decimal.min(m, t.realizedPnl), trades[0].realizedPnl) : new Decimal(0),
    avgTradeDurationMin: durations.length ? mean(durations) : new Decimal(0),
    grossProfit,
    grossLoss,
  };
}

// ---------------------------------------------------------------------------
// Per-coin breakdown
// ---------------------------------------------------------------------------

export type CoinBreakdown = {
  coin: string;
  trades: number;
  wins: number;
  realizedPnl: Decimal;
  fees: Decimal;
  winRate: Decimal;
  evidenceId: string;
};

export function computeCoinBreakdown(
  trades: CompletedTrade[],
  evidence: EvidenceRegistry,
): CoinBreakdown[] {
  const byCoin = new Map<string, CompletedTrade[]>();
  for (const t of trades) {
    const arr = byCoin.get(t.coin) ?? [];
    arr.push(t);
    byCoin.set(t.coin, arr);
  }
  return [...byCoin.entries()]
    .map(([coin, list]) => {
      const wins = list.filter((t) => t.realizedPnl.gt(0)).length;
      return {
        coin,
        trades: list.length,
        wins,
        realizedPnl: sum(list.map((t) => t.realizedPnl)),
        fees: sum(list.map((t) => t.fees)),
        winRate: new Decimal(wins).div(list.length),
        evidenceId: ref(evidence, {
          id: `ev:coin:${coin}`,
          kind: "coin",
          label: `All completed ${coin} trades`,
          count: list.length,
          from: Math.min(...list.map((t) => t.openedAt)),
          to: Math.max(...list.map((t) => t.closedAt)),
        }),
      };
    })
    .sort((a, b) => b.realizedPnl.comparedTo(a.realizedPnl));
}

// ---------------------------------------------------------------------------
// Activity / overtrading
// ---------------------------------------------------------------------------

export type ActivityStats = {
  activeDays: number;
  tradesPerActiveDay: Decimal;
  topDays: Array<{ dateUtc: string; count: number; evidenceId: string }>;
  dayCounts: Array<{ dateUtc: string; count: number }>;
};

const dateKeyUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function computeActivity(
  trades: CompletedTrade[],
  evidence: EvidenceRegistry,
): ActivityStats {
  const byDay = new Map<string, CompletedTrade[]>();
  for (const t of trades) {
    const k = dateKeyUtc(t.closedAt);
    const arr = byDay.get(k) ?? [];
    arr.push(t);
    byDay.set(k, arr);
  }
  const dayCounts = [...byDay.entries()]
    .map(([dateUtc, list]) => ({ dateUtc, count: list.length }))
    .sort((a, b) => b.count - a.count);
  const topDays = dayCounts.slice(0, 5).map((d) => ({
    ...d,
    evidenceId: ref(evidence, {
      id: `ev:day:${d.dateUtc}`,
      kind: "day" as const,
      label: `Completed trades closed on ${d.dateUtc} (UTC)`,
      count: d.count,
    }),
  }));
  const totalTrades = trades.length;
  const activeDays = byDay.size;
  return {
    activeDays,
    tradesPerActiveDay: activeDays ? new Decimal(totalTrades).div(activeDays) : new Decimal(0),
    topDays,
    dayCounts: [...dayCounts].sort((a, b) => a.dateUtc.localeCompare(b.dateUtc)),
  };
}

// ---------------------------------------------------------------------------
// Fee drag
// ---------------------------------------------------------------------------

export type FeeDrag = {
  totalFees: Decimal;
  grossProfit: Decimal;
  feesAsPctOfGrossProfit: Decimal | null; // null when grossProfit == 0
  winnersWithFeeOver30Pct: number;
  winnerCount: number;
  evidenceId: string;
};

export function computeFeeDrag(
  trades: CompletedTrade[],
  evidence: EvidenceRegistry,
): FeeDrag {
  const totalFees = sum(trades.map((t) => t.fees.abs()));
  const winners = trades.filter((t) => t.realizedPnl.gt(0));
  const grossProfit = sum(winners.map((t) => t.realizedPnl));
  const heavy = winners.filter((t) => t.fees.abs().gt(t.realizedPnl.mul(0.3)));
  const evidenceId = ref(evidence, {
    id: "ev:fee-drag",
    kind: "trades",
    label: "Fee drag across all completed trades",
    count: trades.length,
    from: trades.length ? Math.min(...trades.map((t) => t.openedAt)) : undefined,
    to: trades.length ? Math.max(...trades.map((t) => t.closedAt)) : undefined,
  });
  return {
    totalFees,
    grossProfit,
    feesAsPctOfGrossProfit: grossProfit.gt(0) ? totalFees.div(grossProfit) : null,
    winnersWithFeeOver30Pct: heavy.length,
    winnerCount: winners.length,
    evidenceId,
  };
}

// ---------------------------------------------------------------------------
// Post-Loss Size Escalation (descriptive statistical observation only)
// ---------------------------------------------------------------------------

export type PostLossEscalation = {
  baselineAvgOpeningNotional: Decimal;
  baselineTradeCount: number;
  afterN: Array<{
    consecutiveLosses: "1" | "2" | "3+";
    avgOpeningNotional: Decimal;
    ratioVsBaseline: Decimal | null;
    sampleSize: number;
    evidenceId: string;
  }>;
};

export function computePostLossEscalation(
  trades: CompletedTrade[],
  evidence: EvidenceRegistry,
): PostLossEscalation {
  const chrono = [...trades].sort((a, b) => a.closedAt - b.closedAt);
  const baseline = chrono.length ? mean(chrono.map((t) => t.openingNotional)) : new Decimal(0);

  const buckets: Record<"1" | "2" | "3+", CompletedTrade[]> = { "1": [], "2": [], "3+": [] };
  let streak = 0;
  for (const t of chrono) {
    const bucket =
      streak === 0 ? null : streak === 1 ? "1" : streak === 2 ? "2" : ("3+" as const);
    if (bucket) buckets[bucket].push(t);
    // Update streak AFTER categorizing this trade by the losses BEFORE it.
    streak = t.realizedPnl.lt(0) ? streak + 1 : 0;
  }

  const afterN = (["1", "2", "3+"] as const).map((k) => {
    const list = buckets[k];
    const avg = list.length ? mean(list.map((t) => t.openingNotional)) : new Decimal(0);
    const evidenceId = ref(evidence, {
      id: `ev:streak:${k}`,
      kind: "streak",
      label: `Completed trades following ${k} consecutive completed loss${k === "1" ? "" : "es"}`,
      count: list.length,
      from: list.length ? Math.min(...list.map((t) => t.openedAt)) : undefined,
      to: list.length ? Math.max(...list.map((t) => t.closedAt)) : undefined,
    });
    return {
      consecutiveLosses: k,
      avgOpeningNotional: avg,
      ratioVsBaseline: baseline.gt(0) && list.length ? avg.div(baseline) : null,
      sampleSize: list.length,
      evidenceId,
    };
  });

  return {
    baselineAvgOpeningNotional: baseline,
    baselineTradeCount: chrono.length,
    afterN,
  };
}

// ---------------------------------------------------------------------------
// Size creep over time (weekly average opening notional)
// ---------------------------------------------------------------------------

export type SizeCreep = {
  weekly: Array<{ weekStartUtc: string; avgOpeningNotional: Decimal; trades: number }>;
  firstHalfAvg: Decimal | null;
  secondHalfAvg: Decimal | null;
  changePct: Decimal | null;
};

function isoWeekStartUtc(ms: number): string {
  const d = new Date(ms);
  const day = d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

export function computeSizeCreep(trades: CompletedTrade[]): SizeCreep {
  const byWeek = new Map<string, CompletedTrade[]>();
  for (const t of trades) {
    const k = isoWeekStartUtc(t.openedAt);
    const arr = byWeek.get(k) ?? [];
    arr.push(t);
    byWeek.set(k, arr);
  }
  const weekly = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStartUtc, list]) => ({
      weekStartUtc,
      avgOpeningNotional: mean(list.map((t) => t.openingNotional)),
      trades: list.length,
    }));

  const half = Math.floor(weekly.length / 2);
  const firstHalfAvg = half > 0 ? mean(weekly.slice(0, half).map((w) => w.avgOpeningNotional)) : null;
  const secondHalfAvg =
    weekly.length > half ? mean(weekly.slice(half).map((w) => w.avgOpeningNotional)) : null;
  const changePct =
    firstHalfAvg && secondHalfAvg && firstHalfAvg.gt(0)
      ? secondHalfAvg.minus(firstHalfAvg).div(firstHalfAvg).mul(100)
      : null;

  return { weekly, firstHalfAvg, secondHalfAvg, changePct };
}

// ---------------------------------------------------------------------------
// Time-of-day / weekday patterns (UTC)
// ---------------------------------------------------------------------------

export type TimePattern = {
  buckets: Array<{ key: string; label: string; trades: number; pnl: Decimal; winRate: Decimal; evidenceId: string }>;
  bestKey: string | null;
  worstKey: string | null;
};

function patternBy<T extends string>(
  trades: CompletedTrade[],
  keyOf: (t: CompletedTrade) => T,
  labelOf: (k: T) => string,
  evidence: EvidenceRegistry,
  kind: EvidenceRef["kind"],
  idPrefix: string,
): TimePattern {
  const byKey = new Map<T, CompletedTrade[]>();
  for (const t of trades) {
    const k = keyOf(t);
    const arr = byKey.get(k) ?? [];
    arr.push(t);
    byKey.set(k, arr);
  }
  const buckets = [...byKey.entries()].map(([k, list]) => {
    const wins = list.filter((t) => t.realizedPnl.gt(0)).length;
    return {
      key: k,
      label: labelOf(k),
      trades: list.length,
      pnl: sum(list.map((t) => t.realizedPnl)),
      winRate: new Decimal(wins).div(list.length),
      evidenceId: ref(evidence, {
        id: `${idPrefix}:${k}`,
        kind,
        label: `Completed trades closed ${labelOf(k)} (UTC)`,
        count: list.length,
      }),
    };
  });
  const sorted = [...buckets].sort((a, b) => b.pnl.comparedTo(a.pnl));
  return {
    buckets: buckets.sort((a, b) => a.key.localeCompare(b.key)),
    bestKey: sorted.length ? sorted[0].key : null,
    worstKey: sorted.length ? sorted[sorted.length - 1].key : null,
  };
}

export function computeHourPatterns(
  trades: CompletedTrade[],
  evidence: EvidenceRegistry,
): TimePattern {
  return patternBy(
    trades,
    (t) => String(new Date(t.closedAt).getUTCHours()).padStart(2, "0"),
    (k) => `${k}:00h`,
    evidence,
    "hour",
    "ev:hour",
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function computeWeekdayPatterns(
  trades: CompletedTrade[],
  evidence: EvidenceRegistry,
): TimePattern {
  return patternBy(
    trades,
    (t) => WEEKDAYS[(new Date(t.closedAt).getUTCDay() + 6) % 7],
    (k) => k,
    evidence,
    "weekday",
    "ev:weekday",
  );
}

// Re-export helpers used by report assembly.
export { sum, mean, parseMoney, parseOrZero };
