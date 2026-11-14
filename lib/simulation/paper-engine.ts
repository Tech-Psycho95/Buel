import { Decimal, parseMoney, sum } from "@/lib/money";

/*
 * Paper-trading execution engine — SIMULATION ONLY.
 *
 * Model (v1, disclosed in the UI): full-collateral simulated perpetuals. An
 * entry consumes cash equal to its notional; leverage margining and
 * liquidations are out of scope and labeled as such. Every fill applies:
 *   - slippage: adverse fill price vs reference (long pays up, short sells down)
 *   - fee: signed taker fee on notional (positive = cost), 0.045% default
 * All arithmetic is decimal-exact.
 */

export const TAKER_FEE_RATE = new Decimal("0.00045"); // 0.045%
export const SLIPPAGE_RATE = new Decimal("0.0005"); // 0.05% adverse

export type Side = "long" | "short";

export type SimPosition = {
  symbol: string;
  side: Side;
  qty: Decimal;
  avgEntryPrice: Decimal;
  stopPrice: Decimal | null;
  takeProfitPrice: Decimal | null;
};

export type SimFill = {
  fillPrice: Decimal;
  qty: Decimal;
  fee: Decimal; // signed
  slippageCost: Decimal;
  realizedPnl: Decimal; // exits only
};

export type SimResult =
  | { ok: true; fill: SimFill; cashAfter: Decimal; positionAfter: SimPosition | null }
  | { ok: false; reason: string };

export function simulateEntry(
  cash: Decimal,
  refPrice: Decimal,
  qty: Decimal,
  side: Side,
): SimResult {
  if (qty.lte(0)) return { ok: false, reason: "Quantity must be positive." };
  if (refPrice.lte(0)) return { ok: false, reason: "Reference price must be positive." };

  const adverse = Decimal(1).plus(side === "long" ? SLIPPAGE_RATE : SLIPPAGE_RATE.neg());
  const fillPrice = refPrice.mul(adverse);
  const notional = fillPrice.mul(qty);
  const fee = notional.mul(TAKER_FEE_RATE); // signed: positive cost
  const totalCost = notional.plus(fee);

  if (totalCost.gt(cash)) {
    return {
      ok: false,
      reason: `Insufficient simulated cash: order costs $${totalCost.toFixed(2)} (notional + fee) but only $${cash.toFixed(2)} is available. Full-collateral simulation — no leverage in v1.`,
    };
  }

  const slip = fillPrice.minus(refPrice).abs().mul(qty);
  return {
    ok: true,
    fill: { fillPrice, qty, fee, slippageCost: slip, realizedPnl: new Decimal(0) },
    cashAfter: cash.minus(totalCost),
    positionAfter: null, // caller merges with existing position
  };
}

export function simulateExit(
  position: SimPosition,
  refPrice: Decimal,
  qty: Decimal,
): SimResult {
  if (qty.lte(0)) return { ok: false, reason: "Quantity must be positive." };
  const closeQty = Decimal.min(qty, position.qty);
  if (closeQty.lte(0)) return { ok: false, reason: "No open position to close." };

  // Exit slippage is adverse for the closer: a long exit sells (down), a short exit buys (up).
  const adverse = Decimal(1).plus(position.side === "long" ? SLIPPAGE_RATE.neg() : SLIPPAGE_RATE);
  const fillPrice = refPrice.mul(adverse);
  const notional = fillPrice.mul(closeQty);
  const fee = notional.mul(TAKER_FEE_RATE);

  // Authoritative simulated PnL: (fill − avgEntry) × qty × direction − fee.
  const dir = position.side === "long" ? Decimal(1) : Decimal(-1);
  const realizedPnl = fillPrice.minus(position.avgEntryPrice).mul(closeQty).mul(dir).minus(fee);

  const cashReleased = notional.minus(fee); // collateral back (fee deducted)
  return {
    ok: true,
    fill: { fillPrice, qty: closeQty, fee, slippageCost: fillPrice.minus(refPrice).abs().mul(closeQty), realizedPnl },
    cashAfter: cashReleased, // caller ADDS this to cash
    positionAfter: position.qty.gt(closeQty)
      ? { ...position, qty: position.qty.minus(closeQty) }
      : null,
  };
}

/** Unrealized PnL at a mark price (decimal-exact). */
export function unrealizedPnl(position: SimPosition, markPrice: Decimal): Decimal {
  const dir = position.side === "long" ? Decimal(1) : Decimal(-1);
  return markPrice.minus(position.avgEntryPrice).mul(position.qty).mul(dir);
}

export type MarkedPosition = {
  position: SimPosition;
  markPrice: Decimal;
  notional: Decimal;
  unrealized: Decimal;
};

export function markPortfolio(
  positions: SimPosition[],
  prices: Record<string, Decimal>,
): { marked: MarkedPosition[]; unrealizedTotal: Decimal; notionalTotal: Decimal } {
  const marked: MarkedPosition[] = [];
  for (const p of positions) {
    const px = prices[p.symbol];
    if (!px) continue;
    marked.push({
      position: p,
      markPrice: px,
      notional: px.mul(p.qty),
      unrealized: unrealizedPnl(p, px),
    });
  }
  return {
    marked,
    unrealizedTotal: sum(marked.map((m) => m.unrealized)),
    notionalTotal: sum(marked.map((m) => m.notional)),
  };
}

/**
 * Stop / take-profit processing against a set of current prices. Returns the
 * exit results for triggered levels. Called on every market-data refresh so
 * simulated protective orders behave predictably (event-driven on view/refresh
 * — disclosed in the UI; a scheduler would drive this in production).
 */
export function processStops(
  cash: Decimal,
  positions: SimPosition[],
  prices: Record<string, Decimal>,
): { cash: Decimal; positions: SimPosition[]; triggered: Array<{ symbol: string; level: "stop" | "take_profit"; fill: SimFill }> } {
  let cashNow = cash;
  const remaining: SimPosition[] = [];
  const triggered: Array<{ symbol: string; level: "stop" | "take_profit"; fill: SimFill }> = [];

  for (const p of positions) {
    const px = prices[p.symbol];
    if (!px) {
      remaining.push(p);
      continue;
    }
    const stopHit =
      p.stopPrice !== null &&
      ((p.side === "long" && px.lte(p.stopPrice)) || (p.side === "short" && px.gte(p.stopPrice)));
    const tpHit =
      p.takeProfitPrice !== null &&
      ((p.side === "long" && px.gte(p.takeProfitPrice)) || (p.side === "short" && px.lte(p.takeProfitPrice)));

    if (stopHit || tpHit) {
      const res = simulateExit(p, px, p.qty);
      if (res.ok) {
        cashNow = cashNow.plus(res.cashAfter);
        triggered.push({
          symbol: p.symbol,
          level: stopHit ? "stop" : "take_profit",
          fill: res.fill,
        });
        continue;
      }
    }
    remaining.push(p);
  }

  return { cash: cashNow, positions: remaining, triggered };
}

export { parseMoney };
