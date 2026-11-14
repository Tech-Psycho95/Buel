import {
  collectPaginated,
  type PaginateResult,
} from "./paginate";
import { classifyCoverage, type Coverage } from "./coverage";
import { createRequestGate, backoffDelays, sleep, type RequestGate } from "./limiter";
import { TtlCache } from "./cache";
import {
  fillEventKey,
  fundingEventKey,
  ledgerEventKey,
  type Freshness,
  type MarketClassification,
  type MarketSnapshot,
  type PerpAssetMeta,
  type RawCandle,
  type RawFill,
  type RawFunding,
  type RawLedgerUpdate,
} from "./types";
import { buildUniverse, classifyCoin, type MarketUniverse } from "./classify";
import * as seed from "./seed";

/*
 * Hyperliquid public-info adapter.
 *
 * All calls are server-side, governed by the weighted token bucket + bounded
 * concurrency, retried with backoff, and cached with TTL. Demo mode (env or
 * API failure fallback) routes to the deterministic seed generator and is
 * always clearly labeled.
 */

const HL_URL = "https://api.hyperliquid.xyz/info";

// Documented per-response caps (verify against current docs when adjusting).
const FILLS_PAGE_HINT = 2000;
const FUNDING_PAGE_HINT = 500;
const LEDGER_PAGE_HINT = 500;

// History walk limits — honest caps, surfaced in the UI, never silent.
export const HISTORY_MAX_PAGES = 50;
export const HISTORY_MAX_ITEMS = 20000;

export function isDemoDataRequested(): boolean {
  return process.env.SENTISEL_DEMO_DATA === "1";
}

const gate: RequestGate = createRequestGate();
const metaCache = new TtlCache<MarketSnapshot>(20_000);
const dexMetaCache = new TtlCache<MarketUniverse>(5 * 60_000);
const candleCache = new TtlCache<RawCandle[]>(10_000);

async function hlRequest<T>(
  type: string,
  payload: Record<string, unknown>,
  expectedItems = 0,
): Promise<T> {
  const body = JSON.stringify({ type, ...payload });
  const delays = backoffDelays(4);
  let lastError: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await sleep(delays[attempt - 1]);
    try {
      return await gate.run(type, expectedItems, async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        try {
          const res = await fetch(HL_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal: controller.signal,
          });
          if (res.status === 429 || res.status >= 500) {
            throw new Error(`HL_${res.status}`);
          }
          if (!res.ok) {
            throw new Error(`HL_HTTP_${res.status}`);
          }
          return (await res.json()) as T;
        } finally {
          clearTimeout(timer);
        }
      });
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = msg.startsWith("HL_429") || msg.startsWith("HL_5") || msg.includes("abort");
      if (!retryable) throw e;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Market metadata
// ---------------------------------------------------------------------------

function withFreshness(snap: MarketSnapshot, ageMs: number): MarketSnapshot {
  const freshness: Freshness = {
    source: snap.freshness.source,
    fetchedAt: snap.freshness.fetchedAt,
    ageSec: Math.round(ageMs / 1000),
    stale: ageMs > 60_000,
  };
  return { ...snap, freshness };
}

// The two-request variant actually used (kept separate for clarity):
async function getMetaAndCtxs(): Promise<MarketSnapshot> {
  if (isDemoDataRequested()) return seed.marketSnapshot();

  const cached = metaCache.get("metaAndAssetCtxs:v2");
  if (cached) return withFreshness(cached.value, cached.ageMs);

  type MetaResp = { universe: Array<{ name: string; maxLeverage: number; dex?: string }> };
  type CtxsResp = [MetaResp, Array<Record<string, string>>];
  const fetchedAt = Date.now();
  const resp = await hlRequest<CtxsResp>("metaAndAssetCtxs", {}, 0);
  const [meta, ctxArr] = resp;

  const universe = await getUniverse();

  const assets = meta.universe.map((a, i) => {
    const base: PerpAssetMeta = {
      name: a.name,
      dex: a.dex ?? null,
      maxLeverage: a.maxLeverage,
    };
    const ctxRaw = ctxArr[i];
    const classification: MarketClassification = classifyCoin(a.name, universe);
    return {
      ...base,
      classification,
      ctx: ctxRaw
        ? {
            fundingRate: String(ctxRaw.funding ?? "0"),
            openInterest: String(ctxRaw.openInterest ?? "0"),
            prevDayPx: String(ctxRaw.prevDayPx ?? "0"),
            dayNtlVlm: String(ctxRaw.dayNtlVlm ?? "0"),
            markPx: String(ctxRaw.markPx ?? "0"),
          }
        : undefined,
    };
  });

  const snap: MarketSnapshot = {
    freshness: { source: "hyperliquid", fetchedAt, ageSec: 0, stale: false },
    mode: "live",
    assets,
  };
  metaCache.set("metaAndAssetCtxs:v2", snap);
  return snap;
}

export { getMetaAndCtxs as getMarketSnapshot };

/** DEX-metadata-driven classification universe (core + HIP-3 builder dexes). */
export async function getUniverse(): Promise<MarketUniverse> {
  if (isDemoDataRequested()) return seed.universe();

  const cached = dexMetaCache.get("universe");
  if (cached) return cached.value;

  const core = await hlRequest<{ universe: Array<{ name: string; maxLeverage: number; dex?: string }> }>(
    "meta",
    {},
    0,
  );
  const assets: PerpAssetMeta[] = core.universe.map((a) => ({
    name: a.name,
    dex: a.dex ?? null,
    maxLeverage: a.maxLeverage,
  }));

  // HIP-3 builder dexes: enumerate and classify via their own meta.
  let dexNames: string[] = [];
  try {
    const dexs = await hlRequest<Array<{ name?: string; full_name?: string }>>("perpDexs", {}, 0);
    dexNames = (dexs ?? [])
      .map((d) => d.name ?? d.full_name ?? "")
      .filter((n) => n.length > 0)
      .slice(0, 10);
  } catch {
    dexNames = []; // perpDexs unavailable → HIP-3 coins fall into "unknown"
  }

  for (const dex of dexNames) {
    try {
      const dm = await hlRequest<{ universe: Array<{ name: string; maxLeverage: number }> }>(
        "meta",
        { dex },
        0,
      );
      for (const a of dm.universe) {
        assets.push({ name: a.name, dex, maxLeverage: a.maxLeverage });
      }
    } catch {
      // Skip unreachable dexes; classification stays honest via "unknown".
    }
  }

  const universe = buildUniverse(assets);
  dexMetaCache.set("universe", universe);
  return universe;
}

// ---------------------------------------------------------------------------
// Candles
// ---------------------------------------------------------------------------

export async function getCandles(
  symbol: string,
  interval: string,
  startMs: number,
  endMs: number,
  mode: "live" | "demo" = isDemoDataRequested() ? "demo" : "live",
): Promise<{ candles: RawCandle[]; freshness: Freshness; mode: "live" | "demo" }> {
  if (mode === "demo") {
    return seed.candles(symbol, interval, startMs, endMs);
  }
  const key = `${symbol}:${interval}:${startMs}:${endMs}`;
  const cached = candleCache.get(key);
  if (cached) {
    return {
      candles: cached.value,
      freshness: {
        source: "hyperliquid",
        fetchedAt: Date.now() - cached.ageMs,
        ageSec: Math.round(cached.ageMs / 1000),
        stale: false,
      },
      mode: "live",
    };
  }
  const fetchedAt = Date.now();
  const candles = await hlRequest<RawCandle[]>(
    "candleSnapshot",
    { req: { coin: symbol, interval, startTime: startMs, endTime: endMs } },
    1000,
  );
  candleCache.set(key, candles);
  return {
    candles,
    freshness: { source: "hyperliquid", fetchedAt, ageSec: 0, stale: false },
    mode: "live",
  };
}

// ---------------------------------------------------------------------------
// Account-scoped history (paginated walks)
// ---------------------------------------------------------------------------

export type WalletHistory = {
  fills: PaginateResult<RawFill> & { coverage: Coverage };
  funding: PaginateResult<RawFunding> & { coverage: Coverage };
  ledger: PaginateResult<RawLedgerUpdate> & { coverage: Coverage };
};

/**
 * Full history walk for one address within [startMs, endMs]. Inclusive
 * boundaries, overlap pagination, endpoint-specific identity, honest coverage.
 */
export async function fetchWalletHistory(
  address: string,
  startMs: number,
  endMs: number,
): Promise<WalletHistory> {
  if (isDemoDataRequested()) return seed.walletHistory(address, startMs, endMs);

  const [fills, funding, ledger] = await Promise.all([
    collectPaginated<RawFill>({
      startMs,
      endMs,
      pageSizeHint: FILLS_PAGE_HINT,
      maxPages: HISTORY_MAX_PAGES,
      maxTotalItems: HISTORY_MAX_ITEMS,
      fetchPage: async (s, e) => {
        const raw = await hlRequest<RawFill[]>(
          "userFillsByTime",
          { user: address, startTime: s, endTime: e },
          FILLS_PAGE_HINT,
        );
        return (raw ?? []).filter((f) => f.time >= s && f.time <= e);
      },
      eventKeyOf: fillEventKey,
      timeOf: (f) => f.time,
    }),
    collectPaginated<RawFunding>({
      startMs,
      endMs,
      pageSizeHint: FUNDING_PAGE_HINT,
      maxPages: HISTORY_MAX_PAGES,
      maxTotalItems: HISTORY_MAX_ITEMS,
      fetchPage: async (s, e) => {
        // The live API wraps funding fields in a `delta` envelope
        // ({time, hash, delta: {type:"funding", coin, usdc, ...}}); older doc
        // examples show a flat shape. Normalize both into RawFunding.
        type LiveFunding = { time: number; coin?: string; usdc?: string; fundingRate?: string; szi?: string; delta?: { type?: string; coin?: string; usdc?: string; fundingRate?: string; szi?: string } };
        const raw = await hlRequest<LiveFunding[]>(
          "userFunding",
          { user: address, startTime: s, endTime: e },
          FUNDING_PAGE_HINT,
        );
        return (raw ?? [])
          .map((r) => {
            const inner = r.delta ?? r;
            return {
              time: r.time,
              coin: inner.coin ?? "",
              usdc: inner.usdc ?? "0",
              fundingRate: inner.fundingRate,
              szi: inner.szi,
            } as RawFunding;
          })
          .filter((f) => f.time >= s && f.time <= e);
      },
      eventKeyOf: fundingEventKey,
      timeOf: (f) => f.time,
    }),
    collectPaginated<RawLedgerUpdate>({
      startMs,
      endMs,
      pageSizeHint: LEDGER_PAGE_HINT,
      maxPages: HISTORY_MAX_PAGES,
      maxTotalItems: HISTORY_MAX_ITEMS,
      fetchPage: async (s, e) => {
        // Normalize flat/missing-delta shapes defensively (live API uses the
        // delta envelope; hashes may be all-zero — never treated as identity).
        type LiveLedger = { time: number; hash?: string; nonce?: number; delta?: RawLedgerUpdate["delta"] } & Partial<RawLedgerUpdate["delta"]>;
        const raw = await hlRequest<LiveLedger[]>(
          "userNonFundingLedgerUpdates",
          { user: address, startTime: s, endTime: e },
          LEDGER_PAGE_HINT,
        );
        return (raw ?? [])
          .map((r) => ({
            time: r.time,
            hash: r.hash,
            nonce: r.nonce,
            delta: r.delta ?? { type: r.type ?? "unknown", coin: r.coin, usdc: r.usdc },
          }))
          .filter((f) => f.time >= s && f.time <= e);
      },
      eventKeyOf: ledgerEventKey,
      timeOf: (f) => f.time,
    }),
  ]);

  const win = { startMs, endMs };
  return {
    fills: { ...fills, coverage: classifyCoverage(fills, win) },
    funding: { ...funding, coverage: classifyCoverage(funding, win) },
    ledger: { ...ledger, coverage: classifyCoverage(ledger, win) },
  };
}

export type ClearinghouseState = {
  marginSummary: { accountValue: string; totalNtlPos: string; totalRawUsd: string };
  withdrawable: string;
  assetPositions: Array<{
    position: {
      coin: string;
      szi: string;
      entryPx: string | null;
      positionValue: string;
      unrealizedPnl: string;
      leverage: { type: string; value: number };
      liquidationPx: string | null;
      marginUsed: string;
    };
    type: "oneWay" | "twoWay";
  }>;
};

export async function getClearinghouseState(
  address: string,
): Promise<{ state: ClearinghouseState; freshness: Freshness; mode: "live" | "demo" }> {
  if (isDemoDataRequested()) return seed.clearinghouseState(address);
  const fetchedAt = Date.now();
  const state = await hlRequest<ClearinghouseState>(
    "clearinghouseState",
    { user: address },
    0,
  );
  return {
    state,
    freshness: { source: "hyperliquid", fetchedAt, ageSec: 0, stale: false },
    mode: "live",
  };
}

/** Associated accounts provide context only — never merged into an analysis. */
export async function getAssociatedAccounts(
  address: string,
): Promise<string[] | null> {
  if (isDemoDataRequested()) return [];
  try {
    const res = await hlRequest<Array<{ user?: string; role?: string }>>(
      "userAssociatedAccounts",
      { user: address },
      0,
    );
    return (res ?? []).map((a) => a.user ?? "").filter(Boolean);
  } catch {
    return null; // endpoint unavailable — disclosed, never fabricated
  }
}
