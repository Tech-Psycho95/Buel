import { describe, it, expect } from "vitest";
import { computeAccounting } from "@/lib/forensics/accounting";
import type { RawFill, RawFunding, RawLedgerUpdate } from "@/lib/market-data/types";
import { Decimal } from "@/lib/money";

const fill = (over: Partial<RawFill>): RawFill => ({
  coin: "BTC",
  px: "100",
  sz: "1",
  side: "B",
  time: 1000,
  dir: "Close Long",
  closedPnl: "0",
  fee: "0.045",
  startPosition: "0",
  tid: Math.floor(Math.random() * 1e9),
  ...over,
});

const funding = (usdc: string, time = 1000): RawFunding => ({
  time,
  coin: "BTC",
  usdc,
  fundingRate: "0.0001",
  szi: "1",
});

const ledger = (type: string, usdc: string, time = 1000, nonce?: number): RawLedgerUpdate => ({
  time,
  hash: `0x${type}${time}`,
  nonce,
  delta: { type, usdc },
});

describe("wallet accounting — the exact formula", () => {
  it("Net Trading PnL = Realized PnL − SignedFeeTotal + SignedNetFunding", () => {
    const fills = [
      fill({ closedPnl: "500", fee: "1.5", tid: 1 }),
      fill({ closedPnl: "-200.25", fee: "0.75", tid: 2, side: "A" }),
    ];
    const fund = [funding("-10.5"), funding("3.25", 2000)];
    const acc = computeAccounting(fills, fund, []);

    // realized = 299.75; fees = 2.25; funding = -7.25
    expect(acc.realizedPnl).toBe("299.7500000000");
    expect(acc.signedFeeTotalUsdc).toBe("2.2500000000");
    expect(acc.signedNetFunding).toBe("-7.2500000000");

    const expected = new Decimal("299.75").minus("2.25").plus("-7.25");
    expect(new Decimal(acc.netTradingPnl).eq(expected)).toBe(true);
  });

  it("fee rebates (negative fees) reduce costs — sign preserved", () => {
    const fills = [
      fill({ closedPnl: "100", fee: "-0.5", tid: 1 }), // rebate
      fill({ closedPnl: "0", fee: "1.0", tid: 2 }),
    ];
    const acc = computeAccounting(fills, [], []);
    expect(acc.signedFeeTotalUsdc).toBe("0.5000000000"); // 1.0 − 0.5
    // net = 100 − 0.5 = 99.5 (rebate increases net PnL)
    expect(new Decimal(acc.netTradingPnl).eq("99.5")).toBe(true);
  });

  it("deposits, withdrawals and transfers NEVER enter trading PnL", () => {
    const fills = [fill({ closedPnl: "10", fee: "1", tid: 1 })];
    const ledgerEvents = [
      ledger("deposit", "1000000", 1000, 1),
      ledger("withdraw", "500000", 2000, 2),
      ledger("transfer", "250000", 3000, 3),
    ];
    const acc = computeAccounting(fills, [], ledgerEvents);

    // Trading PnL is independent of the cash flows:
    expect(new Decimal(acc.netTradingPnl).eq("9")).toBe(true); // 10 − 1 + 0
    expect(new Decimal(acc.deposits).eq("1000000")).toBe(true);
    expect(new Decimal(acc.withdrawals).eq("500000")).toBe(true);
    expect(new Decimal(acc.transfers).eq("250000")).toBe(true);
  });

  it("never double-counts builder fees (fill.fee already includes them)", () => {
    // A fill with a $10 total fee (base + builder). The builder portion is not
    // reported separately by the API — the fee field is the whole cost.
    const fills = [fill({ closedPnl: "100", fee: "10", tid: 1 })];
    const acc = computeAccounting(fills, [], []);
    expect(new Decimal(acc.signedFeeTotalUsdc).eq("10")).toBe(true);
    expect(new Decimal(acc.netTradingPnl).eq("90")).toBe(true);
  });

  it("aggregates fees only across verified denominations (USDC)", () => {
    const fills = [
      fill({ closedPnl: "50", fee: "2", tid: 1 }),
      fill({ closedPnl: "30", fee: "1.5", feeToken: "XYZ", tid: 2 }),
    ];
    const acc = computeAccounting(fills, [], []);
    // USDC aggregate contains only the USDC fee:
    expect(new Decimal(acc.signedFeeTotalUsdc).eq("2")).toBe(true);
    expect(acc.unsupportedFeeTokens).toEqual(["XYZ"]);
    const xyz = acc.feeDenominations.find((d) => d.token === "XYZ")!;
    expect(xyz.includedInAggregate).toBe(false);
    expect(new Decimal(xyz.total).eq("1.5")).toBe(true);
  });

  it("reports funding paid and received magnitudes separately", () => {
    const fund = [funding("-100"), funding("-20", 2000), funding("50", 3000)];
    const acc = computeAccounting([], fund, []);
    expect(new Decimal(acc.fundingPaid).eq("120")).toBe(true);
    expect(new Decimal(acc.fundingReceived).eq("50")).toBe(true);
    expect(new Decimal(acc.signedNetFunding).eq("-70")).toBe(true);
  });
});
