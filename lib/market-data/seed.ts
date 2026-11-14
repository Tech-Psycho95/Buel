import {
  classifyCoverage,
  type Coverage,
} from "./coverage";
import { collectPaginated } from "./paginate";
import { buildUniverse, classifyCoin } from "./classify";
import {
  fillEventKey,
  fundingEventKey,
  ledgerEventKey,
  type MarketClassification,
  type MarketSnapshot,
  type RawCandle,
  type RawFill,
  type RawFunding,
  type RawLedgerUpdate,
} from "./types";

/*
 * Deterministic demo data — the labeled fallback for SENTISEL_DEMO_DATA=1 and
 * for live-API failure in dev. Seeded PRNG (mulberry32 over a string hash) so
 * every render and every Playwright run sees byte-identical data. EVERYTHING
 * produced here is labeled DEMO at the UI layer.
 */

// ---------------------------------------------------------------------------
// Deterministic PRNG
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seedNum: number): () => number {
  let a = seedNum;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Market metadata + universe
// ---------------------------------------------------------------------------

const SEED_ASSETS = [
  { name: "BTC", mark: 104250, funding: 0.000012, vol: 0.9 },
  { name: "ETH", mark: 3980, funding: 0.000021, vol: 1.1 },
  { name: "SOL", mark: 214.5, funding: 0.000034, vol: 1.6 },
  { name: "ARB", mark: 0.86, funding: -0.000008, vol: 1.8 },
  { name: "DOGE", mark: 0.312, funding: 0.000041, vol: 2.2 },
  { name: "AVAX", mark: 41.2, funding: 0.000017, vol: 1.5 },
  { name: "LINK", mark: 26.4, funding: 0.000015, vol: 1.4 },
  { name: "OP", mark: 1.72, funding: -0.000011, vol: 1.9 },
];

// HIP-3 builder-dex example + spot examples for honest classification demos.
const SEED_HIP3 = [{ name: "abc:PERP-A", dex: "abc" }];
const SEED_SPOT = ["PURR/USDC", "@107"];

export function universe() {
  const assets = [
    ...SEED_ASSETS.map((a) => ({ name: a.name, dex: null as string | null, maxLeverage: 20 })),
    ...SEED_HIP3.map((a) => ({ name: a.name, dex: a.dex, maxLeverage: 10 })),
  ];
  return buildUniverse(assets);
}

export function marketSnapshot(): MarketSnapshot {
  const uni = universe();
  const now = Date.now();
  const assets = SEED_ASSETS.map((a) => {
    const rnd = mulberry32(hashString(a.name) ^ (now / 60000 | 0));
    const drift = (rnd() - 0.5) * 0.04;
    const markPx = a.mark * (1 + drift);
    return {
      name: a.name,
      dex: null,
      maxLeverage: 20,
      classification: classifyCoin(a.name, uni) as MarketClassification,
      ctx: {
        fundingRate: (a.funding * (0.8 + rnd() * 0.4)).toFixed(9),
        openInterest: (a.mark * 1000 * (0.5 + rnd())).toFixed(2),
        prevDayPx: a.mark.toFixed(2),
        dayNtlVlm: (a.mark * 1e6 * (0.3 + rnd())).toFixed(2),
        markPx: markPx.toFixed(a.mark < 5 ? 6 : 2),
      },
    };
  });

  return {
    freshness: { source: "seed", fetchedAt: now, ageSec: 0, stale: false },
    mode: "demo",
    assets,
  };
}

// ---------------------------------------------------------------------------
// Candles — deterministic random walk with trend regimes
// ---------------------------------------------------------------------------

export function candles(
  symbol: string,
  interval: string,
  startMs: number,
  endMs: number,
): { candles: RawCandle[]; freshness: { source: "seed"; fetchedAt: number; ageSec: number; stale: boolean }; mode: "demo" } {
  const asset = SEED_ASSETS.find((a) => a.name === symbol) ?? SEED_ASSETS[0];
  const stepMs = interval === "1h" ? 3600_000 : interval === "15m" ? 900_000 : interval === "4h" ? 4 * 3600_000 : 3600_000;
  const rnd = mulberry32(hashString(`${symbol}:${interval}:${Math.floor(startMs / stepMs)}`));

  const out: RawCandle[] = [];
  // Regime: mild trend + noise, mean-reverting drift.
  let price = asset.mark * (0.95 + rnd() * 0.1);
  let trend = (rnd() - 0.5) * 0.0008;
  for (let t = Math.floor(startMs / stepMs) * stepMs; t <= endMs; t += stepMs) {
    if (rnd() < 0.03) trend = (rnd() - 0.5) * 0.0012;
    const noise = (rnd() - 0.5) * asset.vol * 0.006;
    const open = price;
    const close = Math.max(0.0001, open * (1 + trend + noise));
    const high = Math.max(open, close) * (1 + rnd() * asset.vol * 0.003);
    const low = Math.min(open, close) * (1 - rnd() * asset.vol * 0.003);
    out.push({
      t,
      T: t + stepMs - 1,
      s: symbol,
      i: interval,
      o: open.toFixed(6),
      c: close.toFixed(6),
      h: high.toFixed(6),
      l: low.toFixed(6),
      v: (1000 * (0.5 + rnd())).toFixed(2),
    });
    price = close;
  }
  return {
    candles: out,
    freshness: { source: "seed", fetchedAt: Date.now(), ageSec: 0, stale: false },
    mode: "demo",
  };
}

// ---------------------------------------------------------------------------
// Demo wallet — engineered to exhibit the behaviors the product diagnoses
// (post-loss size escalation, fee drag, funding bleed, overtrading days).
// Address prefix selects between two deterministic personas.
// ---------------------------------------------------------------------------

export type SeedWallet = {
  fills: RawFill[];
  funding: RawFunding[];
  ledger: RawLedgerUpdate[];
};

export function seedWallet(address: string, startMs: number, endMs: number): SeedWallet {
  const persona = address.toLowerCase().endsWith("1") ? "disciplined" : "escalating";
  const rnd = mulberry32(hashString(`wallet:${address.toLowerCase()}`));
  const fills: RawFill[] = [];
  const funding: RawFunding[] = [];
  const ledger: RawLedgerUpdate[] = [];

  const coins = ["BTC", "ETH", "SOL", "ARB", "DOGE", "PURR/USDC", "abc:PERP-A"];
  const prices: Record<string, number> = {
    BTC: 104250, ETH: 3980, SOL: 214.5, ARB: 0.86, DOGE: 0.312,
    "PURR/USDC": 0.12, "abc:PERP-A": 5.55,
  };

  let t = Math.max(startMs, endMs - 90 * 24 * 3600_000);
  let cumulativeLosses = 0;
  let sizeMult = 1;
  let tid = 1_000_000;

  // Deposits first (kept SEPARATE from trading PnL everywhere downstream).
  ledger.push({
    time: t,
    hash: `0xdep${(tid++).toString(16)}`,
    nonce: 5001,
    delta: { type: "deposit", usdc: "50000" },
  });
  ledger.push({
    time: t + 30 * 24 * 3600_000,
    hash: `0xwit${(tid++).toString(16)}`,
    nonce: 5002,
    delta: { type: "withdraw", usdc: "5000" },
  });

  while (t < endMs) {
    // Some days are quiet (weekend gaps), some are overtraded.
    const dayOfWeek = new Date(t).getUTCDay();
    const tradesToday = dayOfWeek === 0 || dayOfWeek === 6 ? 1 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 6);

    for (let i = 0; i < tradesToday && t < endMs; i++) {
      const coin = coins[Math.floor(rnd() * coins.length)];
      const isSpot = coin.includes("/") || coin.startsWith("@");
      const isHip3 = coin.includes(":");
      const base = prices[coin] ?? 1;
      const goLong = rnd() < 0.55;
      const sizeMultNow = persona === "escalating" ? sizeMult : 1;

      // Open fill (spot/HIP-3 coins have zero closedPnl by construction — they
      // are excluded from perp stats downstream).
      const openPx = base * (0.98 + rnd() * 0.04);
      const qty = ((500 * sizeMultNow) / base) * (0.5 + rnd());
      fills.push({
        coin,
        px: openPx.toFixed(6),
        sz: qty.toFixed(6),
        side: goLong ? "B" : "A",
        time: t,
        dir: "Open Long",
        closedPnl: "0",
        fee: (0.045 * (500 * sizeMultNow) * 0.0001 * 100).toFixed(6),
        startPosition: "0",
        tid: tid++,
      });
      t += 60_000 + Math.floor(rnd() * 4 * 3600_000);

      // Close fill — perp only PnL; win probability fades as size escalates.
      const closePx = base * (0.97 + rnd() * 0.06);
      const win = rnd() < (persona === "escalating" && sizeMultNow > 1 ? 0.34 : 0.52);
      const move = (closePx - openPx) / openPx;
      const signedMove = goLong ? move : -move;
      const pnl = win
        ? Math.abs(signedMove) * 500 * sizeMultNow * (0.8 + rnd() * 1.5) + 20
        : -Math.abs(signedMove) * 500 * sizeMultNow * (0.8 + rnd() * 1.2) - 8;
      if (!isSpot && !isHip3) {
        if (win) cumulativeLosses = 0;
        else cumulativeLosses++;
        if (persona === "escalating") {
          sizeMult = cumulativeLosses >= 3 ? Math.min(4, 1 + cumulativeLosses * 0.6) : 1;
        }
      }
      fills.push({
        coin,
        px: closePx.toFixed(6),
        sz: qty.toFixed(6),
        side: goLong ? "A" : "B",
        time: t,
        dir: goLong ? "Close Long" : "Close Short",
        closedPnl: pnl.toFixed(6),
        fee: (0.045 * (500 * sizeMultNow) * 0.0001 * 100).toFixed(6),
        startPosition: "0",
        tid: tid++,
      });
      t += 60_000 + Math.floor(rnd() * 3 * 3600_000);
    }
    // Hourly funding on held coins (small signed amounts).
    for (let h = 0; h < 24 && t < endMs; h++) {
      const coin = coins[Math.floor(rnd() * 5)];
      funding.push({
        time: t + h * 3600_000,
        coin,
        usdc: ((rnd() - 0.42) * 3).toFixed(6),
        fundingRate: ((rnd() - 0.45) * 0.0002).toFixed(9),
        szi: (rnd() < 0.5 ? -1 : 1).toFixed(4),
      });
    }
    t += 24 * 3600_000;
  }

  return { fills, funding, ledger };
}

function coverageOf<T>(
  items: T[],
  keyOf: (i: T) => string,
  startMs: number,
  endMs: number,
): Coverage {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(keyOf(it), (counts.get(keyOf(it)) ?? 0) + 1);
  const times = items.map((i) => (i as RawFill).time);
  return {
    badge: "complete_api_available",
    label: "Complete API-Available Coverage",
    reasons: ["Deterministic demo dataset — complete by construction."],
    windowStartMs: startMs,
    windowEndMs: endMs,
    observedWindow: times.length
      ? { earliest: Math.min(...times), latest: Math.max(...times) }
      : null,
    totalRecords: items.length,
    uniqueRecords: counts.size,
    pagesFetched: 1,
  };
}

export function walletHistory(
  address: string,
  startMs: number,
  endMs: number,
): {
  fills: { items: RawFill[]; totalCount: number; uniqueCount: number; pagesFetched: number; observedWindow: { earliest: number; latest: number } | null; startObserved: boolean; truncatedSuspected: boolean; capHit: boolean; termination: "floor_observed"; coverage: Coverage };
  funding: { items: RawFunding[]; totalCount: number; uniqueCount: number; pagesFetched: number; observedWindow: { earliest: number; latest: number } | null; startObserved: boolean; truncatedSuspected: boolean; capHit: boolean; termination: "floor_observed"; coverage: Coverage };
  ledger: { items: RawLedgerUpdate[]; totalCount: number; uniqueCount: number; pagesFetched: number; observedWindow: { earliest: number; latest: number } | null; startObserved: boolean; truncatedSuspected: boolean; capHit: boolean; termination: "floor_observed"; coverage: Coverage };
} {
  const w = seedWallet(address, startMs, endMs);
  const mk = <T>(items: T[], keyOf: (i: T) => string, timeOf: (i: T) => number) => ({
    items: [...items].sort((a, b) => timeOf(a) - timeOf(b)),
    totalCount: items.length,
    uniqueCount: new Set(items.map(keyOf)).size,
    pagesFetched: 1,
    observedWindow: items.length
      ? { earliest: Math.min(...items.map(timeOf)), latest: Math.max(...items.map(timeOf)) }
      : null,
    startObserved: true,
    truncatedSuspected: false,
    capHit: false,
    termination: "floor_observed" as const,
    coverage: coverageOf(items, keyOf, startMs, endMs),
  });
  return {
    fills: mk(w.fills, fillEventKey, (f) => f.time),
    funding: mk(w.funding, fundingEventKey, (f) => f.time),
    ledger: mk(w.ledger, ledgerEventKey, (f) => f.time),
  };
}

export async function clearinghouseState(address: string) {
  const rnd = mulberry32(hashString(`ch:${address.toLowerCase()}`));
  const accountValue = 45000 + rnd() * 20000;
  return {
    state: {
      marginSummary: {
        accountValue: accountValue.toFixed(2),
        totalNtlPos: (accountValue * 0.4 * rnd()).toFixed(2),
        totalRawUsd: (accountValue * 0.25 * rnd()).toFixed(2),
      },
      withdrawable: (accountValue * 0.7).toFixed(2),
      assetPositions: [],
    },
    freshness: { source: "seed" as const, fetchedAt: Date.now(), ageSec: 0, stale: false },
    mode: "demo" as const,
  };
}

// Re-export coverage helpers for callers that paginate seed data directly.
export { collectPaginated, classifyCoverage };
