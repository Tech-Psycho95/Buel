import { describe, it, expect } from "vitest";
import { Decimal } from "@/lib/money";
import { simulateEntry, simulateExit, processStops, unrealizedPnl, markPortfolio, TAKER_FEE_RATE, SLIPPAGE_RATE } from "@/lib/simulation/paper-engine";

const D = (s: string | number) => new Decimal(s);

describe("paper engine — entries", () => {
  it("entry fills adversely (long pays up), charges fee, deducts cash", () => {
    const res = simulateEntry(D("10000"), D("100"), D("10"), "long");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const expectedFill = D("100").mul(D(1).plus(SLIPPAGE_RATE)); // 100.05
    expect(res.fill.fillPrice.eq(expectedFill)).toBe(true);
    const notional = expectedFill.mul(10); // 1000.5
    const fee = notional.mul(TAKER_FEE_RATE); // 0.450225
    expect(res.fill.fee.eq(fee)).toBe(true);
    expect(res.cashAfter.eq(D("10000").minus(notional).minus(fee))).toBe(true);
    expect(res.fill.slippageCost.eq(D("0.05").mul(10))).toBe(true);
  });

  it("short entries fill down", () => {
    const res = simulateEntry(D("10000"), D("100"), D("1"), "short");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fill.fillPrice.lt(D("100"))).toBe(true);
  });

  it("rejects orders costing more than available cash (full-collateral)", () => {
    const res = simulateEntry(D("500"), D("100"), D("10"), "long");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toMatch(/Insufficient simulated cash/);
    expect(res.reason).toMatch(/no leverage in v1/i);
  });

  it("rejects zero/negative quantity and prices", () => {
    expect(simulateEntry(D("1000"), D("100"), D("0"), "long").ok).toBe(false);
    expect(simulateEntry(D("1000"), D("-1"), D("1"), "long").ok).toBe(false);
  });
});

describe("paper engine — exits and P&L", () => {
  it("long exit realizes (fill − entry) × qty − fee, releases collateral", () => {
    const pos = { symbol: "BTC", side: "long" as const, qty: D("2"), avgEntryPrice: D("100"), stopPrice: null, takeProfitPrice: null };
    const res = simulateExit(pos, D("110"), D("2"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // fill = 110 × (1 − 0.0005) = 109.945
    const fill = D("110").mul(D(1).minus(SLIPPAGE_RATE));
    const fee = fill.mul(2).mul(TAKER_FEE_RATE);
    const expected = fill.minus(100).mul(2).minus(fee);
    expect(res.fill.realizedPnl.eq(expected)).toBe(true);
    // Collateral released = notional − fee
    expect(res.cashAfter.eq(fill.mul(2).minus(fee))).toBe(true);
    expect(res.positionAfter).toBeNull();
  });

  it("short exit profits when price falls", () => {
    const pos = { symbol: "ETH", side: "short" as const, qty: D("5"), avgEntryPrice: D("100"), stopPrice: null, takeProfitPrice: null };
    const res = simulateExit(pos, D("90"), D("5"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fill.realizedPnl.gt(0)).toBe(true);
  });

  it("partial exits leave the remainder open", () => {
    const pos = { symbol: "BTC", side: "long" as const, qty: D("10"), avgEntryPrice: D("100"), stopPrice: null, takeProfitPrice: null };
    const res = simulateExit(pos, D("120"), D("4"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.positionAfter).not.toBeNull();
    expect(res.positionAfter!.qty.eq(D("6"))).toBe(true);
    expect(res.positionAfter!.avgEntryPrice.eq(D("100"))).toBe(true); // avg entry unchanged
  });

  it("unrealized PnL marks directionally", () => {
    const long = { symbol: "BTC", side: "long" as const, qty: D("1"), avgEntryPrice: D("100"), stopPrice: null, takeProfitPrice: null };
    const short = { symbol: "ETH", side: "short" as const, qty: D("1"), avgEntryPrice: D("100"), stopPrice: null, takeProfitPrice: null };
    expect(unrealizedPnl(long, D("110")).eq(D("10"))).toBe(true);
    expect(unrealizedPnl(short, D("90")).eq(D("10"))).toBe(true);
    expect(unrealizedPnl(long, D("90")).eq(D("-10"))).toBe(true);
  });
});

describe("paper engine — stops and take-profits", () => {
  const pos = (over: Partial<Parameters<typeof simulateExit>[0]>) => ({
    symbol: "BTC",
    side: "long" as const,
    qty: D("1"),
    avgEntryPrice: D("100"),
    stopPrice: null,
    takeProfitPrice: null,
    ...over,
  });

  it("long stop triggers when mark ≤ stop", () => {
    const r = processStops(D("1000"), [pos({ stopPrice: D("95") })], { BTC: D("94") });
    expect(r.triggered).toHaveLength(1);
    expect(r.triggered[0].level).toBe("stop");
    expect(r.positions).toHaveLength(0);
    // Released collateral = 94 × (1−slip) − fee
    expect(r.cash.gt(D("90"))).toBe(true);
  });

  it("short take-profit triggers when mark ≤ target", () => {
    const r = processStops(D("1000"), [pos({ side: "short", takeProfitPrice: D("95") })], { BTC: D("94.5") });
    expect(r.triggered).toHaveLength(1);
    expect(r.triggered[0].level).toBe("take_profit");
  });

  it("levels inside the current price do not trigger", () => {
    const r = processStops(D("1000"), [pos({ stopPrice: D("95") })], { BTC: D("100") });
    expect(r.triggered).toHaveLength(0);
    expect(r.positions).toHaveLength(1);
  });

  it("marks a portfolio of mixed positions", () => {
    const mp = markPortfolio(
      [pos({ qty: D("2") }), pos({ symbol: "ETH", side: "short" as const, qty: D("3"), avgEntryPrice: D("50") })],
      { BTC: D("110"), ETH: D("45") },
    );
    expect(mp.marked).toHaveLength(2);
    expect(mp.unrealizedTotal.eq(D("20").plus(D("15")))).toBe(true); // BTC +20, ETH short +15
    expect(mp.notionalTotal.eq(D("220").plus(D("135")))).toBe(true);
  });
});
