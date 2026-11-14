import { describe, it, expect } from "vitest";
import { reconstructTrades } from "@/lib/forensics/trades";
import type { RawFill } from "@/lib/market-data/types";
import { Decimal } from "@/lib/money";

let tid = 1;
function mkFill(p: Partial<RawFill> & { coin: string; time: number; side: "B" | "A"; sz: string }): RawFill {
  return {
    px: "100",
    dir: p.side === "B" ? "Open Long" : "Close Long",
    closedPnl: "0",
    fee: "0.5",
    startPosition: "0",
    tid: tid++,
    ...p,
  } as RawFill;
}

describe("per-coin position state machine", () => {
  it("open + full close → one completed trade, realized PnL = closedPnl (authoritative)", () => {
    const fills = [
      mkFill({ coin: "BTC", time: 1000, side: "B", sz: "2", px: "100", startPosition: "0" }),
      mkFill({ coin: "BTC", time: 2000, side: "A", sz: "2", px: "110", closedPnl: "20.5", fee: "0.6" }),
    ];
    const res = reconstructTrades(fills);
    expect(res.completedTrades).toHaveLength(1);
    const t = res.completedTrades[0];
    expect(t.coin).toBe("BTC");
    expect(t.side).toBe("long");
    expect(t.realizedPnl.toFixed(4)).toBe("20.5000"); // NOT px-diff recomputed
    expect(t.fees.toFixed(2)).toBe("1.10"); // both fills' fees
    expect(t.openingNotional.toFixed(2)).toBe("200.00"); // 100 × 2
    expect(t.additions).toBe(0);
  });

  it("additions update the average entry and stay one trade", () => {
    const fills = [
      mkFill({ coin: "ETH", time: 1000, side: "B", sz: "1", px: "100" }),
      mkFill({ coin: "ETH", time: 1500, side: "B", sz: "3", px: "200" }), // avg → 175
      mkFill({ coin: "ETH", time: 2000, side: "A", sz: "4", px: "180", closedPnl: "20" }),
    ];
    const res = reconstructTrades(fills);
    expect(res.completedTrades).toHaveLength(1);
    const t = res.completedTrades[0];
    expect(t.additions).toBe(1);
    expect(t.maxQty.toFixed(1)).toBe("4.0");
    expect(t.openingNotional.toFixed(2)).toBe("700.00"); // avg 175 × 4
  });

  it("partial exits realize fractionally and still complete one trade", () => {
    const fills = [
      mkFill({ coin: "SOL", time: 1000, side: "B", sz: "10", px: "50" }),
      mkFill({ coin: "SOL", time: 1500, side: "A", sz: "4", px: "55", closedPnl: "20" }),
      mkFill({ coin: "SOL", time: 2500, side: "A", sz: "6", px: "60", closedPnl: "55" }),
    ];
    const res = reconstructTrades(fills);
    expect(res.completedTrades).toHaveLength(1);
    const t = res.completedTrades[0];
    expect(t.partialExits).toBe(1);
    // Trade PnL = Σ member fills' closedPnl (authoritative grouping, Rule 3)
    expect(t.realizedPnl.toFixed(3)).toBe("75.000");
  });

  it("reversals close-and-open in a single fill", () => {
    const fills = [
      mkFill({ coin: "BTC", time: 1000, side: "B", sz: "2", px: "100" }),
      mkFill({ coin: "BTC", time: 2000, side: "A", sz: "5", px: "120", closedPnl: "40" }),
      mkFill({ coin: "BTC", time: 3000, side: "B", sz: "3", px: "115", closedPnl: "-15" }),
    ];
    const res = reconstructTrades(fills);
    // Trade 1: long 2 closed by 2 of the sell-5 (PnL 40); reversal opens short 3.
    // Trade 2: short 3 closed by buy-3 (PnL -15).
    expect(res.completedTrades).toHaveLength(2);
    expect(res.reversalCount).toBe(1);
    expect(res.completedTrades[0].realizedPnl.toFixed(1)).toBe("40.0");
    expect(res.completedTrades[0].wasReversed).toBe(true);
    expect(res.completedTrades[1].side).toBe("short");
    expect(res.completedTrades[1].realizedPnl.toFixed(1)).toBe("-15.0");
  });

  it("lifecycle starting mid-position (startPosition ≠ 0) is excluded from completed trades", () => {
    const fills = [
      // Seeded: wallet already long 1.0 BTC before the window begins.
      mkFill({ coin: "BTC", time: 1000, side: "A", sz: "0.5", px: "110", closedPnl: "5", startPosition: "1.0" }),
      mkFill({ coin: "BTC", time: 2000, side: "A", sz: "0.5", px: "120", closedPnl: "5", startPosition: "0.5" }),
      // A fresh, fully-observed trade afterwards.
      mkFill({ coin: "BTC", time: 3000, side: "B", sz: "1", px: "100" }),
      mkFill({ coin: "BTC", time: 4000, side: "A", sz: "1", px: "105", closedPnl: "5" }),
    ];
    const res = reconstructTrades(fills);
    // Only the fully-observed trade counts as completed.
    expect(res.completedTrades).toHaveLength(1);
    expect(res.completedTrades[0].openedAt).toBe(3000);
    expect(res.incomplete.some((x) => x.kind === "open_at_history_start" && x.coin === "BTC")).toBe(true);
    // Fills of the incomplete lifecycle are disclosed.
    expect(res.fillsInIncompleteLifecycles).toBeGreaterThanOrEqual(2);
  });

  it("positions still open at the window end are flagged incomplete", () => {
    const fills = [
      mkFill({ coin: "ETH", time: 1000, side: "B", sz: "2", px: "100" }),
      mkFill({ coin: "ETH", time: 1500, side: "B", sz: "1", px: "110" }),
    ];
    const res = reconstructTrades(fills);
    expect(res.completedTrades).toHaveLength(0);
    const open = res.incomplete.find((x) => x.kind === "open_at_window_end");
    expect(open).toBeTruthy();
    expect(open!.remainingQty!.toFixed(1)).toBe("3.0");
  });

  it("per-coin isolation: BTC and ETH reconstruct independently", () => {
    const fills = [
      mkFill({ coin: "BTC", time: 1000, side: "B", sz: "1", px: "100" }),
      mkFill({ coin: "ETH", time: 1100, side: "A", sz: "1", px: "50" }), // ETH short open (no PnL on opens)
      mkFill({ coin: "BTC", time: 1200, side: "A", sz: "1", px: "101", closedPnl: "1" }),
      mkFill({ coin: "ETH", time: 1300, side: "B", sz: "1", px: "48", closedPnl: "2" }),
    ];
    const res = reconstructTrades(fills);
    expect(res.completedTrades).toHaveLength(2);
    const btc = res.completedTrades.find((t) => t.coin === "BTC")!;
    const eth = res.completedTrades.find((t) => t.coin === "ETH")!;
    expect(btc.realizedPnl.toFixed(1)).toBe("1.0");
    expect(eth.side).toBe("short");
    expect(eth.realizedPnl.toFixed(1)).toBe("2.0");
  });

  it("keeps PnL amounts as exact Decimals (no float drift)", () => {
    const fills = [
      mkFill({ coin: "BTC", time: 1000, side: "B", sz: "1", px: "0.1" }),
      mkFill({ coin: "BTC", time: 2000, side: "A", sz: "1", px: "0.2", closedPnl: "0.3000000001" }),
    ];
    const res = reconstructTrades(fills);
    expect(res.completedTrades[0].realizedPnl instanceof Decimal).toBe(true);
    expect(res.completedTrades[0].realizedPnl.toFixed(10)).toBe("0.3000000001");
  });
});
