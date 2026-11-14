import { Decimal, parseOrZero, sum, fmtUsd, fmtUsdCompact } from "@/lib/money";
import type { RawFill, RawFunding, RawLedgerUpdate } from "@/lib/market-data/types";

/*
 * Wallet accounting (data-integrity Rule 3, Safeguard 4).
 *
 * THE FORMULA (exact, tested):
 *   Net Trading PnL = Realized PnL − SignedFeeTotal + SignedNetFunding
 *
 *  - Realized PnL      = Σ fill.closedPnl                (authoritative)
 *  - SignedFeeTotal    = Σ fill.fee  (positive = cost, negative = rebate)
 *  - SignedNetFunding  = Σ funding.usdc (positive = received, negative = paid)
 *
 * Deposits, withdrawals and transfers are reported SEPARATELY and never enter
 * trading PnL. Builder fees are never double-counted: fill.fee already
 * includes them and is used as-is. Fees are aggregated into a single USDC
 * total ONLY for fills whose fee denomination is verified-supported (USDC, or
 * absent — perps settle in USDC by default); any other denomination is
 * reported separately and excluded from the aggregate.
 */

export const SUPPORTED_FEE_TOKEN = "USDC";

export type FeeByDenomination = {
  token: string;
  total: string; // signed, decimal-exact string
  fillCount: number;
  includedInAggregate: boolean;
};

export type CashFlow = {
  type: string;
  totalUsdc: string;
  count: number;
  /** Non-USDC-denominated flows are reported per coin, excluded from totals. */
  otherDenominations: Array<{ coin: string; total: string; count: number }>;
};

export type WalletAccounting = {
  realizedPnl: string;
  signedFeeTotalUsdc: string;
  signedNetFunding: string;
  netTradingPnl: string;
  feeDenominations: FeeByDenomination[];
  unsupportedFeeTokens: string[];
  fundingPaid: string; // magnitude of funding with usdc < 0
  fundingReceived: string; // magnitude of funding with usdc > 0
  deposits: string;
  withdrawals: string;
  transfers: string;
  otherFlows: CashFlow[];
  /** Fills whose closedPnl contributed to realizedPnl. */
  realizedPnlFillCount: number;
  fundingEventCount: number;
  ledgerEventCount: number;
};

export function computeAccounting(
  perpFills: RawFill[],
  funding: RawFunding[],
  ledger: RawLedgerUpdate[],
): WalletAccounting {
  // --- Realized PnL: authoritative Σ closedPnl ----------------------------
  const realizedPnl = sum(perpFills.map((f) => parseOrZero(f.closedPnl)));
  const realizedPnlFillCount = perpFills.filter((f) =>
    parseOrZero(f.closedPnl).abs().gt(0),
  ).length;

  // --- Signed fees, split by denomination ----------------------------------
  const byToken = new Map<string, { total: Decimal; count: number }>();
  for (const f of perpFills) {
    const token = (f.feeToken ?? SUPPORTED_FEE_TOKEN).toUpperCase();
    const entry = byToken.get(token) ?? { total: new Decimal(0), count: 0 };
    entry.total = entry.total.plus(parseOrZero(f.fee));
    entry.count++;
    byToken.set(token, entry);
  }
  const feeDenominations: FeeByDenomination[] = [...byToken.entries()].map(
    ([token, v]) => ({
      token,
      total: v.total.toFixed(10),
      fillCount: v.count,
      includedInAggregate: token === SUPPORTED_FEE_TOKEN,
    }),
  );
  const unsupportedFeeTokens = feeDenominations
    .filter((d) => !d.includedInAggregate)
    .map((d) => d.token);
  const signedFeeTotalUsdc = byToken.get(SUPPORTED_FEE_TOKEN)?.total ?? new Decimal(0);

  // --- Signed net funding --------------------------------------------------
  let fundingPos = new Decimal(0);
  let fundingNeg = new Decimal(0);
  for (const f of funding) {
    const v = parseOrZero(f.usdc);
    if (v.gt(0)) fundingPos = fundingPos.plus(v);
    else fundingNeg = fundingNeg.plus(v.abs());
  }
  const signedNetFunding = fundingPos.minus(fundingNeg);

  // --- Cash flows: deposits / withdrawals / transfers (SEPARATE) -----------
  const flowTotals = new Map<string, { usdc: Decimal; count: number; other: Map<string, { total: Decimal; count: number }> }>();
  for (const e of ledger) {
    const type = e.delta.type ?? "unknown";
    const entry =
      flowTotals.get(type) ?? { usdc: new Decimal(0), count: 0, other: new Map() };
    entry.count++;
    const coin = e.delta.coin;
    const usdc = e.delta.usdc !== undefined ? parseOrZero(e.delta.usdc) : null;
    if (usdc !== null) {
      entry.usdc = entry.usdc.plus(usdc);
    } else if (coin) {
      const o = entry.other.get(coin) ?? { total: new Decimal(0), count: 0 };
      const amt = e.delta.amount !== undefined ? parseOrZero(String(e.delta.amount)) : new Decimal(0);
      o.total = o.total.plus(amt);
      o.count++;
      entry.other.set(coin, o);
    }
    flowTotals.set(type, entry);
  }
  const deposits = flowTotals.get("deposit")?.usdc ?? new Decimal(0);
  const withdrawals = flowTotals.get("withdraw")?.usdc ?? new Decimal(0);
  const transfers = flowTotals.get("transfer")?.usdc ?? new Decimal(0);
  const otherFlows: CashFlow[] = [...flowTotals.entries()]
    .filter(([type]) => !["deposit", "withdraw", "transfer"].includes(type))
    .map(([type, v]) => ({
      type,
      totalUsdc: v.usdc.toFixed(10),
      count: v.count,
      otherDenominations: [...v.other.entries()].map(([coin, o]) => ({
        coin,
        total: o.total.toFixed(10),
        count: o.count,
      })),
    }));

  // --- THE FORMULA ---------------------------------------------------------
  const netTradingPnl = realizedPnl.minus(signedFeeTotalUsdc).plus(signedNetFunding);

  return {
    realizedPnl: realizedPnl.toFixed(10),
    signedFeeTotalUsdc: signedFeeTotalUsdc.toFixed(10),
    signedNetFunding: signedNetFunding.toFixed(10),
    netTradingPnl: netTradingPnl.toFixed(10),
    feeDenominations,
    unsupportedFeeTokens,
    fundingPaid: fundingNeg.toFixed(10),
    fundingReceived: fundingPos.toFixed(10),
    deposits: deposits.toFixed(10),
    withdrawals: withdrawals.toFixed(10),
    transfers: transfers.toFixed(10),
    otherFlows,
    realizedPnlFillCount,
    fundingEventCount: funding.length,
    ledgerEventCount: ledger.length,
  };
}

/** Formatted view for the UI. */
export function formatAccounting(a: WalletAccounting) {
  return {
    realizedPnl: fmtUsd(a.realizedPnl),
    signedFeeTotalUsdc: fmtUsd(a.signedFeeTotalUsdc),
    signedNetFunding: fmtUsd(a.signedNetFunding),
    netTradingPnl: fmtUsd(a.netTradingPnl),
    netTradingPnlCompact: fmtUsdCompact(a.netTradingPnl),
    deposits: fmtUsd(a.deposits),
    withdrawals: fmtUsd(a.withdrawals),
    transfers: fmtUsd(a.transfers),
    fundingPaid: fmtUsd(a.fundingPaid),
    fundingReceived: fmtUsd(a.fundingReceived),
  };
}
