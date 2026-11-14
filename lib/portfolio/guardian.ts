import { Decimal } from "@/lib/money";
import type { SimPosition } from "@/lib/simulation/paper-engine";

/*
 * Portfolio Guardian — deterministic risk-limit evaluation for the SIMULATED
 * portfolio. Every breach explains itself in plain language. No LLM involved.
 */

export type RiskLimits = {
  maxPositionPct: number; // % of equity for a single order
  maxDailyLossPct: number; // % equity daily realized loss cap
  maxOpenPositions: number;
  maxLeverageX: number; // total notional / equity
  maxConcentrationPct: number; // single-asset notional / equity
};

export type GuardianCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type GuardianReport = {
  passed: boolean;
  checks: GuardianCheck[];
  utilization: {
    equity: string;
    notionalTotal: string;
    leverageX: string;
    concentrationPct: string;
    openPositions: number;
  };
};

export function evaluateGuardian(
  limits: RiskLimits,
  equity: Decimal, // cash + unrealized (or cash when flat)
  existingNotionalBySymbol: Record<string, Decimal>,
  proposed?: { symbol: string; notional: Decimal },
  dailyRealizedPnl?: Decimal,
): GuardianReport {
  const checks: GuardianCheck[] = [];
  const notionalTotal = Object.values(existingNotionalBySymbol).reduce<Decimal>(
    (acc, v) => acc.plus(v),
    new Decimal(0),
  );
  const proposedSymbolNotional = (existingNotionalBySymbol[proposed?.symbol ?? ""] ?? new Decimal(0)).plus(proposed?.notional ?? 0);
  const totalAfter = notionalTotal.plus(proposed?.notional ?? 0);

  // 1. Order size vs equity.
  if (proposed) {
    const orderPct = equity.gt(0) ? proposed.notional.div(equity).mul(100) : new Decimal(999);
    checks.push({
      id: "order_size",
      label: "Order size limit",
      passed: orderPct.lte(limits.maxPositionPct),
      detail: `Order notional $${proposed.notional.toFixed(2)} = ${orderPct.toFixed(1)}% of equity ($${equity.toFixed(2)}); limit ${limits.maxPositionPct}%.`,
    });
  }

  // 2. Open positions count.
  const openAfter = Object.keys(existingNotionalBySymbol).length + (proposed && !(proposed.symbol in existingNotionalBySymbol) ? 1 : 0);
  checks.push({
    id: "open_positions",
    label: "Open position count",
    passed: openAfter <= limits.maxOpenPositions,
    detail: `${openAfter} open position(s) after this order; limit ${limits.maxOpenPositions}.`,
  });

  // 3. Concentration in a single asset.
  const concPct = equity.gt(0) ? proposedSymbolNotional.div(equity).mul(100) : new Decimal(0);
  checks.push({
    id: "concentration",
    label: "Single-asset concentration",
    passed: concPct.lte(limits.maxConcentrationPct),
    detail: `${proposed?.symbol ?? "largest holding"} would be ${concPct.toFixed(1)}% of equity; limit ${limits.maxConcentrationPct}%.`,
  });

  // 4. Leverage utilization (notional / equity).
  const levX = equity.gt(0) ? totalAfter.div(equity) : new Decimal(999);
  checks.push({
    id: "leverage",
    label: "Leverage utilization",
    passed: levX.lte(limits.maxLeverageX),
    detail: `Total notional $${totalAfter.toFixed(2)} = ${levX.toFixed(2)}× equity; limit ${limits.maxLeverageX}×.`,
  });

  // 5. Daily loss cap (evaluated on realized PnL today, when provided).
  if (dailyRealizedPnl !== undefined) {
    const lossPct = dailyRealizedPnl.lt(0) && equity.gt(0)
      ? dailyRealizedPnl.abs().div(equity).mul(100)
      : new Decimal(0);
    checks.push({
      id: "daily_loss",
      label: "Daily loss cap",
      passed: lossPct.lt(limits.maxDailyLossPct),
      detail: `Realized PnL today ${dailyRealizedPnl.toFixed(2)} (${lossPct.toFixed(1)}% of equity); cap −${limits.maxDailyLossPct}%.`,
    });
  }

  const failed = checks.filter((c) => !c.passed);
  return {
    passed: failed.length === 0,
    checks,
    utilization: {
      equity: equity.toFixed(2),
      notionalTotal: totalAfter.toFixed(2),
      leverageX: levX.toFixed(2),
      concentrationPct: concPct.toFixed(2),
      openPositions: openAfter,
    },
  };
}
