import { Decimal, parseOrZero, sum, fmtUsd, fmtRatio, fmtNum, toNumber } from "@/lib/money";
import { fetchWalletHistory, getUniverse, getClearinghouseState, getAssociatedAccounts, HISTORY_MAX_PAGES, HISTORY_MAX_ITEMS, isDemoDataRequested } from "@/lib/market-data/hyperliquid";
import { classifyCoin, CLASSIFICATION_LABELS, type MarketUniverse } from "@/lib/market-data/classify";
import type { Coverage } from "@/lib/market-data/coverage";
import type { RawFill, RawFunding, RawLedgerUpdate } from "@/lib/market-data/types";
import { reconstructTrades, type ReconstructionResult } from "./trades";
import { computeAccounting, formatAccounting } from "./accounting";
import {
  computeOverview,
  computeCoinBreakdown,
  computeActivity,
  computeFeeDrag,
  computePostLossEscalation,
  computeSizeCreep,
  computeHourPatterns,
  computeWeekdayPatterns,
  type EvidenceRegistry,
} from "./stats";

/*
 * Report assembly — the single deterministic source of truth for the Wallet
 * Forensics module. Output is JSON-safe (numbers as exact strings + display
 * strings); the LLM narrative layer consumes ONLY this document and its
 * evidence registry, validated by zod before any narrative is rendered.
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export class InvalidAddressError extends Error {
  constructor(public readonly raw: string) {
    super(
      "Not a valid Hyperliquid address. Expect a 0x-prefixed 42-character hex address (the master or sub-account address that actually traded).",
    );
    this.name = "InvalidAddressError";
  }
}

export type CoveragePanel = {
  dataset: "fills" | "funding" | "ledger";
  badge: "complete_api_available" | "partial";
  label: string;
  reasons: string[];
  totalRecords: number;
  uniqueRecords: number;
  pagesFetched: number;
  observedWindow: { earliest: number; latest: number } | null;
};

export type MarketExclusions = {
  categories: Array<{
    classification: string;
    label: string;
    fills: number;
    closedPnl: string;
    coins: string[];
  }>;
  analyzedPerpFills: number;
};

export type WalletForensicsReport = {
  address: string;
  addressKind: string; // 'master_or_sub_account' — scope disclosure
  analyzedAt: number;
  window: { startMs: number; endMs: number };
  mode: "live" | "demo";
  dataModeLabel: string;
  scopeDisclosure: string[];
  associatedAccounts: string[] | null;
  analyzedFillCount: number;
  seenFillCount: number;
  completeness: "complete_api_available" | "partial";
  completenessLabel: string;
  completenessReasons: string[];
  caps: { maxPages: number; maxItems: number };
  coveragePanels: CoveragePanel[];
  exclusions: MarketExclusions;
  reconstruction: {
    completedTrades: number;
    incompleteLifecycles: Array<{ coin: string; kind: string; remainingQty: string | null; fillCount: number }>;
    fillsInIncompleteLifecycles: number;
    reversals: number;
  };
  accounting: ReturnType<typeof formatAccounting> & {
    raw: {
      realizedPnl: string;
      signedFeeTotalUsdc: string;
      signedNetFunding: string;
      netTradingPnl: string;
      deposits: string;
      withdrawals: string;
      transfers: string;
    };
    feeDenominations: Array<{ token: string; total: string; fillCount: number; includedInAggregate: boolean }>;
    unsupportedFeeTokens: string[];
  };
  overview: {
    tradeCount: number;
    winRate: string;
    avgWin: string;
    avgLoss: string;
    profitFactor: string;
    expectancy: string;
    bestTradePnl: string;
    worstTradePnl: string;
    avgTradeDurationMin: string;
  };
  coins: Array<{ coin: string; trades: number; wins: number; winRate: string; realizedPnl: string; fees: string; evidenceId: string }>;
  activity: {
    activeDays: number;
    tradesPerActiveDay: string;
    topDays: Array<{ dateUtc: string; count: number; evidenceId: string }>;
  };
  feeDrag: {
    totalFees: string;
    feesAsPctOfGrossProfit: string | null;
    winnersWithFeeOver30Pct: number;
    winnerCount: number;
    evidenceId: string;
  };
  postLossEscalation: {
    baselineAvgOpeningNotional: string;
    baselineTradeCount: number;
    afterN: Array<{ consecutiveLosses: string; avgOpeningNotional: string; ratioVsBaseline: string | null; sampleSize: number; evidenceId: string }>;
    framing: string;
  };
  sizeCreep: {
    weekly: Array<{ weekStartUtc: string; avgOpeningNotional: string; trades: number }>;
    changePct: string | null;
  };
  hours: { buckets: Array<{ key: string; label: string; trades: number; pnl: string; winRate: string; evidenceId: string }>; bestKey: string | null; worstKey: string | null };
  weekdays: { buckets: Array<{ key: string; label: string; trades: number; pnl: string; winRate: string; evidenceId: string }>; bestKey: string | null; worstKey: string | null };
  evidence: EvidenceRegistry;
};

export async function buildWalletReport(
  addressRaw: string,
  opts?: { windowDays?: number; endMs?: number },
): Promise<WalletForensicsReport> {
  const address = addressRaw.trim();
  if (!ADDRESS_RE.test(address)) {
    throw new InvalidAddressError(addressRaw);
  }

  const endMs = opts?.endMs ?? Date.now();
  const startMs = endMs - (opts?.windowDays ?? 180) * 24 * 3600_000;

  const [history, universe, chState, associated] = await Promise.all([
    fetchWalletHistory(address, startMs, endMs),
    getUniverse(),
    getClearinghouseState(address),
    getAssociatedAccounts(address),
  ]);

  const mode = isDemoDataRequested() ? "demo" : chState.mode;

  // --- Market classification of every seen fill -----------------------------
  const allFills = history.fills.items;
  const perpFills: RawFill[] = [];
  const excluded: Map<string, { fills: RawFill[]; coins: Set<string> }> = new Map([
    ["perp", { fills: [], coins: new Set() }],
    ["hip3", { fills: [], coins: new Set() }],
    ["spot", { fills: [], coins: new Set() }],
    ["unknown", { fills: [], coins: new Set() }],
  ]);
  for (const f of allFills) {
    const cls = classifyCoin(f.coin, universe);
    const bucket = excluded.get(cls)!;
    bucket.fills.push(f);
    bucket.coins.add(f.coin);
  }
  perpFills.push(...excluded.get("perp")!.fills);

  // --- Position reconstruction (perp fills only) -----------------------------
  const recon: ReconstructionResult = reconstructTrades(perpFills);

  // --- Accounting (the exact formula) ----------------------------------------
  const funding: RawFunding[] = history.funding.items;
  const ledger: RawLedgerUpdate[] = history.ledger.items;
  const accounting = computeAccounting(perpFills, funding, ledger);

  // --- Deterministic statistics ----------------------------------------------
  const evidence: EvidenceRegistry = {};
  const trades = recon.completedTrades;
  const overview = computeOverview(trades);
  const coins = computeCoinBreakdown(trades, evidence);
  const activity = computeActivity(trades, evidence);
  const feeDrag = computeFeeDrag(trades, evidence);
  const postLoss = computePostLossEscalation(trades, evidence);
  const sizeCreep = computeSizeCreep(trades);
  const hours = computeHourPatterns(trades, evidence);
  const weekdays = computeWeekdayPatterns(trades, evidence);

  // --- Coverage + honest disclosure ------------------------------------------
  const coveragePanels: CoveragePanel[] = (
    [
      ["fills", history.fills.coverage],
      ["funding", history.funding.coverage],
      ["ledger", history.ledger.coverage],
    ] as Array<[CoveragePanel["dataset"], Coverage]>
  ).map(([dataset, c]) => ({
    dataset,
    badge: c.badge,
    label: c.label,
    reasons: c.reasons,
    totalRecords: c.totalRecords,
    uniqueRecords: c.uniqueRecords,
    pagesFetched: c.pagesFetched,
    observedWindow: c.observedWindow,
  }));

  const fillCoverageWorst = coveragePanels.find((p) => p.dataset === "fills")!;
  const completeness = fillCoverageWorst.badge;

  const scopeDisclosure = [
    `This analysis covers exactly the address provided: ${address}.`,
    "A master-account analysis does not include sub-account activity, and a sub-account analysis does not include the master or sibling accounts. Associated addresses are shown for context only and are never merged.",
    "Only perpetual markets are analyzed. HIP-3 builder markets, spot pairs and unknown symbols are excluded and counted separately.",
    "History coverage is bounded by what the Hyperliquid API returns — see the coverage badges. Partial coverage is never presented as lifetime performance.",
  ];

  const report: WalletForensicsReport = {
    address,
    addressKind: "master_or_sub_account",
    analyzedAt: endMs,
    window: { startMs, endMs },
    mode,
    dataModeLabel: mode === "demo" ? "DEMO DATA" : "LIVE DATA",
    scopeDisclosure,
    associatedAccounts: associated,
    analyzedFillCount: perpFills.length,
    seenFillCount: allFills.length,
    completeness,
    completenessLabel: fillCoverageWorst.label,
    completenessReasons: fillCoverageWorst.reasons,
    caps: { maxPages: HISTORY_MAX_PAGES, maxItems: HISTORY_MAX_ITEMS },
    coveragePanels,
    exclusions: {
      categories: (["hip3", "spot", "unknown"] as const).map((cls) => {
        const b = excluded.get(cls)!;
        return {
          classification: cls,
          label: CLASSIFICATION_LABELS[cls as keyof typeof CLASSIFICATION_LABELS],
          fills: b.fills.length,
          closedPnl: sum(b.fills.map((f) => parseOrZero(f.closedPnl))).toFixed(10),
          coins: [...b.coins].sort(),
        };
      }),
      analyzedPerpFills: perpFills.length,
    },
    reconstruction: {
      completedTrades: trades.length,
      incompleteLifecycles: recon.incomplete.map((x) => ({
        coin: x.coin,
        kind: x.kind,
        remainingQty: x.remainingQty ? x.remainingQty.toFixed(10) : null,
        fillCount: x.fillCount,
      })),
      fillsInIncompleteLifecycles: recon.fillsInIncompleteLifecycles,
      reversals: recon.reversalCount,
    },
    accounting: {
      ...formatAccounting(accounting),
      raw: {
        realizedPnl: accounting.realizedPnl,
        signedFeeTotalUsdc: accounting.signedFeeTotalUsdc,
        signedNetFunding: accounting.signedNetFunding,
        netTradingPnl: accounting.netTradingPnl,
        deposits: accounting.deposits,
        withdrawals: accounting.withdrawals,
        transfers: accounting.transfers,
      },
      feeDenominations: accounting.feeDenominations,
      unsupportedFeeTokens: accounting.unsupportedFeeTokens,
    },
    overview: {
      tradeCount: overview.tradeCount,
      winRate: overview.winRate.toFixed(6),
      avgWin: overview.avgWin.toFixed(10),
      avgLoss: overview.avgLoss.toFixed(10),
      profitFactor: overview.profitFactor.toFixed(6),
      expectancy: overview.expectancy.toFixed(10),
      bestTradePnl: overview.bestTradePnl.toFixed(10),
      worstTradePnl: overview.worstTradePnl.toFixed(10),
      avgTradeDurationMin: overview.avgTradeDurationMin.toFixed(2),
    },
    coins: coins.map((c) => ({
      coin: c.coin,
      trades: c.trades,
      wins: c.wins,
      winRate: c.winRate.toFixed(6),
      realizedPnl: c.realizedPnl.toFixed(10),
      fees: c.fees.toFixed(10),
      evidenceId: c.evidenceId,
    })),
    activity: {
      activeDays: activity.activeDays,
      tradesPerActiveDay: activity.tradesPerActiveDay.toFixed(4),
      topDays: activity.topDays,
    },
    feeDrag: {
      totalFees: feeDrag.totalFees.toFixed(10),
      feesAsPctOfGrossProfit:
        feeDrag.feesAsPctOfGrossProfit === null ? null : feeDrag.feesAsPctOfGrossProfit.mul(100).toFixed(4),
      winnersWithFeeOver30Pct: feeDrag.winnersWithFeeOver30Pct,
      winnerCount: feeDrag.winnerCount,
      evidenceId: feeDrag.evidenceId,
    },
    postLossEscalation: {
      baselineAvgOpeningNotional: postLoss.baselineAvgOpeningNotional.toFixed(10),
      baselineTradeCount: postLoss.baselineTradeCount,
      afterN: postLoss.afterN.map((x) => ({
        consecutiveLosses: x.consecutiveLosses,
        avgOpeningNotional: x.avgOpeningNotional.toFixed(10),
        ratioVsBaseline: x.ratioVsBaseline === null ? null : x.ratioVsBaseline.toFixed(4),
        sampleSize: x.sampleSize,
        evidenceId: x.evidenceId,
      })),
      framing:
        "Descriptive statistical observation only: average opening notional of completed trades that follow completed losses, compared with the all-trades baseline. This is not a claim about the trader's psychological state.",
    },
    sizeCreep: {
      weekly: sizeCreep.weekly.map((w) => ({
        weekStartUtc: w.weekStartUtc,
        avgOpeningNotional: w.avgOpeningNotional.toFixed(10),
        trades: w.trades,
      })),
      changePct: sizeCreep.changePct === null ? null : sizeCreep.changePct.toFixed(4),
    },
    hours: {
      buckets: hours.buckets.map((b) => ({
        key: b.key,
        label: b.label,
        trades: b.trades,
        pnl: b.pnl.toFixed(10),
        winRate: b.winRate.toFixed(6),
        evidenceId: b.evidenceId,
      })),
      bestKey: hours.bestKey,
      worstKey: hours.worstKey,
    },
    weekdays: {
      buckets: weekdays.buckets.map((b) => ({
        key: b.key,
        label: b.label,
        trades: b.trades,
        pnl: b.pnl.toFixed(10),
        winRate: b.winRate.toFixed(6),
        evidenceId: b.evidenceId,
      })),
      bestKey: weekdays.bestKey,
      worstKey: weekdays.worstKey,
    },
    evidence,
  };

  return report;
}

// Formatting helpers shared with the UI layer.
export const reportFormatters = {
  usd: (v: string | null) => (v === null ? "—" : fmtUsd(v)),
  pct: (v: string | null) => (v === null ? "—" : `${fmtNum(v, 1)}%`),
  ratio: (v: string) => fmtRatio(v, 1),
  num: (v: string, d = 2) => fmtNum(v, d),
  decimalToNumber: (d: Decimal, dec = 8) => toNumber(d, dec),
};
