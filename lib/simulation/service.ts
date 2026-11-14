import { and, desc, eq } from "drizzle-orm";
import { Decimal, parseMoney } from "@/lib/money";
import { getDb, type SentiselDb } from "@/lib/db/client";
import { paperAccounts, paperOrders, paperPositions, riskPreferences } from "@/lib/db/schema";
import { getMarketSnapshot } from "@/lib/market-data/hyperliquid";
import { classifyCoin, type MarketUniverse } from "@/lib/market-data/classify";
import { getUniverse } from "@/lib/market-data/hyperliquid";
import {
  simulateEntry,
  simulateExit,
  markPortfolio,
  processStops,
  type SimPosition,
} from "./paper-engine";
import { evaluateGuardian, type RiskLimits } from "@/lib/portfolio/guardian";

/*
 * Paper-trading service — the ONLY execution path in the product. Every order
 * here touches simulated balances exclusively; there is no bridge to any real
 * exchange, broker, wallet or key material anywhere in this codebase.
 */

export type PaperOrderRequest = {
  symbol: string;
  side: "long" | "short";
  intent: "entry" | "exit";
  qty: string;
  stopPrice?: string | null;
  takeProfitPrice?: string | null;
  sourceDecisionId?: string | null;
};

export type PaperOrderResult =
  | {
      ok: true;
      orderId: string;
      fillPrice: string;
      fee: string;
      realizedPnl: string | null;
      cash: string;
      guardian: { passed: boolean; checks: Array<{ id: string; label: string; passed: boolean; detail: string }> } | null;
    }
  | { ok: false; reason: string };

async function getOrCreateAccount(userId: string) {
  const db = await getDb();
  const existing = (
    await db.select().from(paperAccounts).where(eq(paperAccounts.userId, userId)).limit(1)
  )[0];
  if (existing) return existing;
  const created = (
    await db
      .insert(paperAccounts)
      .values({ userId, cash: "100000", startingBalance: "100000" })
      .returning()
  )[0];
  return created;
}

async function loadLimits(db: SentiselDb, userId: string): Promise<RiskLimits> {
  const rows = await db.select().from(riskPreferences).where(eq(riskPreferences.userId, userId)).limit(1);
  const r = rows[0];
  return r
    ? {
        maxPositionPct: Number(r.maxPositionPct),
        maxDailyLossPct: Number(r.maxDailyLossPct),
        maxOpenPositions: r.maxOpenPositions,
        maxLeverageX: Number(r.maxLeverageX),
        maxConcentrationPct: Number(r.maxConcentrationPct),
      }
    : { maxPositionPct: 20, maxDailyLossPct: 10, maxOpenPositions: 6, maxLeverageX: 5, maxConcentrationPct: 50 };
}

async function loadPositions(db: SentiselDb, accountId: string): Promise<SimPosition[]> {
  const rows = await db.select().from(paperPositions).where(eq(paperPositions.accountId, accountId));
  return rows.map((r) => ({
    symbol: r.symbol,
    side: r.side as "long" | "short",
    qty: parseMoney(r.qty),
    avgEntryPrice: parseMoney(r.avgEntryPrice),
    stopPrice: r.stopPrice ? parseMoney(r.stopPrice) : null,
    takeProfitPrice: r.takeProfitPrice ? parseMoney(r.takeProfitPrice) : null,
  }));
}

async function priceMap(): Promise<Record<string, Decimal>> {
  const snap = await getMarketSnapshot();
  const out: Record<string, Decimal> = {};
  for (const a of snap.assets) {
    if (a.ctx) out[a.name] = parseMoney(a.ctx.markPx);
  }
  return out;
}

export async function getPortfolio(userId: string) {
  const db = await getDb();
  const account = await getOrCreateAccount(userId);
  const positions = await loadPositions(db, account.id);
  const prices = await priceMap();

  // Process protective orders against current prices (event-driven; disclosed).
  const stops = processStops(parseMoney(account.cash), positions, prices);
  const cash = stops.cash;
  const livePositions = stops.positions;
  for (const t of stops.triggered) {
    await recordOrder(db, account.id, userId, {
      symbol: t.symbol,
      side: "long",
      intent: "exit",
      qty: t.fill.qty.toFixed(10),
      status: "filled",
      referencePrice: prices[t.symbol]?.toFixed(10) ?? null,
      fillPrice: t.fill.fillPrice.toFixed(10),
      fee: t.fill.fee.toFixed(10),
      slippageCost: t.fill.slippageCost.toFixed(10),
      realizedPnl: t.fill.realizedPnl.toFixed(10),
    }, t.level === "stop" ? "stop triggered" : "take-profit triggered");
  }
  if (stops.triggered.length > 0) {
    await db.update(paperAccounts).set({ cash: cash.toFixed(10), updatedAt: new Date() }).where(eq(paperAccounts.id, account.id));
  }

  const marked = markPortfolio(livePositions, prices);
  const equity = cash.plus(marked.unrealizedTotal);

  const limits = await loadLimits(db, userId);
  const notionalBySymbol: Record<string, Decimal> = {};
  for (const m of marked.marked) notionalBySymbol[m.position.symbol] = m.notional;
  const guardian = evaluateGuardian(limits, equity, notionalBySymbol);

  const orders = await db
    .select()
    .from(paperOrders)
    .where(eq(paperOrders.userId, userId))
    .orderBy(desc(paperOrders.createdAt))
    .limit(50);

  return {
    account: {
      cash: cash.toFixed(2),
      startingBalance: account.startingBalance,
      equity: equity.toFixed(2),
      totalPnl: equity.minus(parseMoney(account.startingBalance)).toFixed(2),
    },
    positions: marked.marked.map((m) => ({
      symbol: m.position.symbol,
      side: m.position.side,
      qty: m.position.qty.toFixed(6),
      avgEntryPrice: m.position.avgEntryPrice.toFixed(4),
      markPrice: m.markPrice.toFixed(4),
      notional: m.notional.toFixed(2),
      unrealized: m.unrealized.toFixed(2),
      stopPrice: m.position.stopPrice?.toFixed(4) ?? null,
      takeProfitPrice: m.position.takeProfitPrice?.toFixed(4) ?? null,
    })),
    guardian: {
      limits,
      utilization: guardian.utilization,
      checks: guardian.checks,
    },
    orders: orders.map((o) => ({
      id: o.id,
      symbol: o.symbol,
      side: o.side,
      intent: o.intent,
      status: o.status,
      rejectReason: o.rejectReason,
      fillPrice: o.fillPrice,
      fee: o.fee,
      realizedPnl: o.realizedPnl,
      createdAt: o.createdAt,
    })),
  };
}

async function recordOrder(
  db: SentiselDb,
  accountId: string,
  userId: string,
  o: {
    symbol: string;
    side: string;
    intent: string;
    qty: string;
    status: string;
    rejectReason?: string | null;
    referencePrice?: string | null;
    fillPrice?: string | null;
    fee?: string | null;
    slippageCost?: string | null;
    realizedPnl?: string | null;
  },
  note?: string,
) {
  await db.insert(paperOrders).values({
    userId,
    accountId,
    symbol: o.symbol,
    side: o.side,
    intent: o.intent,
    qty: o.qty,
    status: o.status,
    rejectReason: o.rejectReason ?? (note ?? null),
    referencePrice: o.referencePrice ?? null,
    fillPrice: o.fillPrice ?? null,
    fee: o.fee ?? null,
    slippageCost: o.slippageCost ?? null,
    realizedPnl: o.realizedPnl ?? null,
    filledAt: o.status === "filled" ? new Date() : null,
  });
}

export async function placeOrder(userId: string, req: PaperOrderRequest): Promise<PaperOrderResult> {
  const db = await getDb();
  const account = await getOrCreateAccount(userId);
  const symbol = req.symbol.trim().toUpperCase();
  const qty = parseMoney(req.qty);
  const universe: MarketUniverse = await getUniverse();

  if (classifyCoin(symbol, universe) !== "perp") {
    return { ok: false, reason: `${symbol} is not a supported core perpetual — paper orders are restricted to supported perps.` };
  }
  if (qty.lte(0)) return { ok: false, reason: "Quantity must be positive." };

  const snap = await getMarketSnapshot();
  const asset = snap.assets.find((a) => a.name === symbol);
  const refPrice = asset?.ctx ? parseMoney(asset.ctx.markPx) : null;
  if (!refPrice) return { ok: false, reason: `No live/seed price available for ${symbol} right now.` };

  const positions = await loadPositions(db, account.id);
  const cash = parseMoney(account.cash);
  const limits = await loadLimits(db, userId);
  const prices = await priceMap();
  const marked = markPortfolio(positions, prices);
  const equity = cash.plus(marked.unrealizedTotal);

  if (req.intent === "entry") {
    const existing = positions.find((p) => p.symbol === symbol);
    if (existing) {
      return { ok: false, reason: `An existing ${existing.side} position on ${symbol} is open. Close it before opening a new one (v1 supports one position per symbol).` };
    }

    // Guardian pre-trade checks — a breach REJECTS the order with explanations.
    const notionalBySymbol: Record<string, Decimal> = {};
    for (const m of marked.marked) notionalBySymbol[m.position.symbol] = m.notional;
    const refPriceClean = parseMoney(asset!.ctx!.markPx);
    const guardian = evaluateGuardian(limits, equity, notionalBySymbol, {
      symbol,
      notional: refPriceClean.mul(qty),
    });
    if (!guardian.passed) {
      await recordOrder(db, account.id, userId, {
        symbol,
        side: req.side,
        intent: "entry",
        qty: qty.toFixed(10),
        status: "rejected",
        rejectReason: `Portfolio Guardian: ${guardian.checks.filter((c) => !c.passed).map((c) => c.detail).join(" | ")}`,
        referencePrice: refPrice.toFixed(10),
      });
      return {
        ok: false,
        reason: `Portfolio Guardian refused this order: ${guardian.checks.filter((c) => !c.passed).map((c) => c.detail).join(" | ")}`,
      };
    }

    const sim = simulateEntry(cash, refPrice, qty, req.side);
    if (!sim.ok) {
      await recordOrder(db, account.id, userId, {
        symbol,
        side: req.side,
        intent: "entry",
        qty: qty.toFixed(10),
        status: "rejected",
        rejectReason: sim.reason,
        referencePrice: refPrice.toFixed(10),
      });
      return { ok: false, reason: sim.reason };
    }

    const position: SimPosition = {
      symbol,
      side: req.side,
      qty,
      avgEntryPrice: sim.fill.fillPrice,
      stopPrice: req.stopPrice ? parseMoney(req.stopPrice) : null,
      takeProfitPrice: req.takeProfitPrice ? parseMoney(req.takeProfitPrice) : null,
    };
    await db
      .insert(paperPositions)
      .values({
        accountId: account.id,
        symbol,
        side: req.side,
        qty: qty.toFixed(10),
        avgEntryPrice: sim.fill.fillPrice.toFixed(10),
        stopPrice: position.stopPrice?.toFixed(10) ?? null,
        takeProfitPrice: position.takeProfitPrice?.toFixed(10) ?? null,
      })
      .onConflictDoUpdate({
        target: [paperPositions.accountId, paperPositions.symbol],
        set: {
          qty: qty.toFixed(10),
          avgEntryPrice: sim.fill.fillPrice.toFixed(10),
          stopPrice: position.stopPrice?.toFixed(10) ?? null,
          takeProfitPrice: position.takeProfitPrice?.toFixed(10) ?? null,
          updatedAt: new Date(),
        },
      });
    await db.update(paperAccounts).set({ cash: sim.cashAfter.toFixed(10), updatedAt: new Date() }).where(eq(paperAccounts.id, account.id));
    await recordOrder(db, account.id, userId, {
      symbol,
      side: req.side,
      intent: "entry",
      qty: qty.toFixed(10),
      status: "filled",
      referencePrice: refPrice.toFixed(10),
      fillPrice: sim.fill.fillPrice.toFixed(10),
      fee: sim.fill.fee.toFixed(10),
      slippageCost: sim.fill.slippageCost.toFixed(10),
    });

    return {
      ok: true,
      orderId: "entry",
      fillPrice: sim.fill.fillPrice.toFixed(4),
      fee: sim.fill.fee.toFixed(2),
      realizedPnl: null,
      cash: sim.cashAfter.toFixed(2),
      guardian: { passed: true, checks: guardian.checks },
    };
  }

  // EXIT
  const existing = positions.find((p) => p.symbol === symbol);
  if (!existing) return { ok: false, reason: `No open position on ${symbol}.` };
  const sim = simulateExit(existing, refPrice, qty);
  if (!sim.ok) return { ok: false, reason: sim.reason };

  if (sim.positionAfter) {
    await db
      .update(paperPositions)
      .set({ qty: sim.positionAfter.qty.toFixed(10), updatedAt: new Date() })
      .where(and(eq(paperPositions.accountId, account.id), eq(paperPositions.symbol, symbol)));
  } else {
    await db
      .delete(paperPositions)
      .where(and(eq(paperPositions.accountId, account.id), eq(paperPositions.symbol, symbol)));
  }
  await db.update(paperAccounts).set({ cash: cash.plus(sim.cashAfter).toFixed(10), updatedAt: new Date() }).where(eq(paperAccounts.id, account.id));
  await recordOrder(db, account.id, userId, {
    symbol,
    side: existing.side,
    intent: "exit",
    qty: sim.fill.qty.toFixed(10),
    status: "filled",
    referencePrice: refPrice.toFixed(10),
    fillPrice: sim.fill.fillPrice.toFixed(10),
    fee: sim.fill.fee.toFixed(10),
    slippageCost: sim.fill.slippageCost.toFixed(10),
    realizedPnl: sim.fill.realizedPnl.toFixed(10),
  });

  return {
    ok: true,
    orderId: "exit",
    fillPrice: sim.fill.fillPrice.toFixed(4),
    fee: sim.fill.fee.toFixed(2),
    realizedPnl: sim.fill.realizedPnl.toFixed(2),
    cash: cash.plus(sim.cashAfter).toFixed(2),
    guardian: null,
  };
}
