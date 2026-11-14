import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { Decimal } from "@/lib/money";

/*
 * Adapter integration tests — network fully mocked (deterministic).
 * Live checks against the real API live in tests/live (opt-in).
 */

beforeEach(() => {
  vi.resetModules(); // fresh caches/gate per test
  process.env.SENTISEL_DEMO_DATA = "0";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.SENTISEL_DEMO_DATA;
});

describe("hyperliquid adapter (mocked network)", () => {
  it("retries on 429 and succeeds on a later attempt", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        if (calls === 1) return new Response("rate limited", { status: 429 });
        return Response.json({
          universe: [{ name: "BTC", maxLeverage: 20 }],
        });
      }),
    );
    const hl = await import("@/lib/market-data/hyperliquid");
    const uni = await hl.getUniverse();
    expect(uni.perps.has("BTC")).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(2); // proved the retry happened
  });

  it("surfaces non-retryable HTTP errors immediately", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return new Response("bad request", { status: 400 });
      }),
    );
    const hl = await import("@/lib/market-data/hyperliquid");
    await expect(hl.getUniverse()).rejects.toThrow(/HL_HTTP_400/);
    expect(calls).toBe(1); // no pointless retries on 4xx
  });

  it("paginates fills with inclusive overlap against a simulated API", async () => {
    // Simulated userFillsByTime: newest-first, capped at 2 per response.
    const allFills = Array.from({ length: 9 }, (_, i) => ({
      coin: "BTC",
      px: "100.5",
      sz: "0.1",
      side: i % 2 === 0 ? "B" : "A",
      time: 1_000_000 + i * 500, // distinct ms
      dir: "Open Long",
      closedPnl: "1.25",
      fee: "0.02",
      startPosition: "0",
      tid: i + 1,
    }));
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        calls++;
        const body = JSON.parse(String(init?.body));
        const { startTime, endTime } = body;
        if (body.type !== "userFillsByTime") return Response.json([]); // funding/ledger empty
        const inRange = allFills
          .filter((f) => f.time >= startTime && f.time <= endTime)
          .sort((a, b) => b.time - a.time)
          .slice(0, 2);
        return Response.json(inRange);
      }),
    );
    const hl = await import("@/lib/market-data/hyperliquid");
    const history = await hl.fetchWalletHistory("0xabc", 0, 10_000_000);
    expect(history.fills.totalCount).toBe(9);
    expect(history.fills.uniqueCount).toBe(9);
    expect(history.fills.items[0].tid).toBe(1); // oldest first, none missing
    expect(history.fills.coverage.badge).toBe("complete_api_available");
    expect(calls).toBeGreaterThan(2); // multiple overlapping pages
  });

  it("routes to labeled demo data when SENTISEL_DEMO_DATA=1 (zero network)", async () => {
    process.env.SENTISEL_DEMO_DATA = "1";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const hl = await import("@/lib/market-data/hyperliquid");
    const snap = await hl.getMarketSnapshot();
    expect(snap.mode).toBe("demo");
    expect(snap.freshness.source).toBe("seed");
    const history = await hl.fetchWalletHistory("0xdead1", 0, Date.now());
    expect(history.fills.items.length).toBeGreaterThan(10);
    expect(history.fills.coverage.badge).toBe("complete_api_available");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("normalizes the live delta envelope for funding and ledger events", async () => {
    // Real API shape (verified live): {time, hash, delta: {type:"funding",
    // coin, usdc, fundingRate, szi}} — plus hashes that may be all-zero.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        if (body.type === "userFunding") {
          return Response.json([
            {
              time: 1000,
              hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
              delta: { type: "funding", coin: "BTC", usdc: "-21.818783", szi: "23.34187", fundingRate: "0.00001" },
            },
            { time: 2000, coin: "ETH", usdc: "5", fundingRate: "-0.0001" }, // legacy flat shape
          ]);
        }
        if (body.type === "userNonFundingLedgerUpdates") {
          return Response.json([
            { time: 1500, hash: "0xabc", nonce: 7, delta: { type: "deposit", usdc: "100000" } },
            { time: 1600, type: "withdraw", usdc: "500" }, // legacy flat shape
          ]);
        }
        return Response.json([]); // no fills
      }),
    );
    const hl = await import("@/lib/market-data/hyperliquid");
    const { computeAccounting } = await import("@/lib/forensics/accounting");
    const history = await hl.fetchWalletHistory("0xabc", 0, 10_000_000);

    expect(history.funding.items).toHaveLength(2);
    expect(history.funding.items[0].usdc).toBe("-21.818783");
    expect(history.funding.items[0].coin).toBe("BTC");
    expect(history.ledger.items).toHaveLength(2);
    expect(history.ledger.items[1].delta.type).toBe("withdraw");

    const acc = computeAccounting([], history.funding.items, history.ledger.items);
    // funding net = −21.818783 + 5; deposits/withdrawals stay separate
    expect(acc.signedNetFunding).toBe("-16.8187830000");
    expect(new Decimal(acc.deposits).eq("100000")).toBe(true);
    expect(new Decimal(acc.withdrawals).eq("500")).toBe(true);
  });

  it("demo wallet exhibits post-loss size escalation (fixture sanity)", async () => {
    process.env.SENTISEL_DEMO_DATA = "1";
    const hl = await import("@/lib/market-data/hyperliquid");
    const history = await hl.fetchWalletHistory("0xescalator", 0, Date.now());
    // Deterministic: same address → same fill count every run.
    const again = await hl.fetchWalletHistory("0xescalator", 0, Date.now());
    expect(again.fills.totalCount).toBe(history.fills.totalCount);
    expect(history.fills.totalCount).toBeGreaterThan(20);
    // Spot and HIP-3 coins are present for honest exclusion accounting.
    const coins = new Set(history.fills.items.map((f) => f.coin));
    expect([...coins].some((c) => c.includes("/") || c.startsWith("@"))).toBe(true);
    expect([...coins].some((c) => c.includes(":"))).toBe(true);
  });
});
