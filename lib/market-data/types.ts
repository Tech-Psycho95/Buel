import { createHash } from "node:crypto";

/*
 * Hyperliquid domain types. Raw API payloads keep numbers as strings — they
 * are parsed with Decimal (lib/money.ts) at computation time, never with
 * Number().
 */

export type DataMode = "live" | "demo";

export type Freshness = {
  source: "hyperliquid" | "seed";
  fetchedAt: number; // epoch ms
  ageSec: number;
  stale: boolean;
};

/** Raw fill as returned by userFills / userFillsByTime. */
export type RawFill = {
  coin: string;
  px: string;
  sz: string;
  side: "B" | "A"; // B = buy, A = sell (taker side)
  time: number;
  dir: string; // "Open Long", "Close Long", etc.
  closedPnl: string;
  fee: string; // signed — rebates may arrive negative
  feeToken?: string;
  startPosition: string;
  tid?: number; // native trade id — primary identity key
  hash?: string;
  oid?: number;
  crossed?: boolean;
};

export type RawFunding = {
  time: number;
  coin: string;
  usdc: string; // signed: positive = received, negative = paid
  fundingRate?: string;
  szi?: string;
};

export type RawLedgerUpdate = {
  time: number;
  hash?: string;
  nonce?: number;
  delta: {
    type: string; // 'deposit' | 'withdraw' | 'transfer' | ...
    coin?: string;
    usdc?: string;
    [k: string]: unknown;
  };
};

export type RawCandle = {
  t: number; // open time ms
  T: number; // close time ms
  s: string; // symbol
  i: string; // interval
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n?: number;
};

export type PerpAssetMeta = {
  name: string;
  dex: string | null; // HIP-3 builder-deployed markets carry their dex name
  maxLeverage: number;
};

export type AssetContext = {
  fundingRate: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  markPx: string;
};

export type MarketSnapshot = {
  freshness: Freshness;
  mode: DataMode;
  assets: Array<
    PerpAssetMeta & {
      ctx?: AssetContext;
      classification: MarketClassification;
    }
  >;
};

export type MarketClassification = "perp" | "hip3" | "spot" | "unknown";

// ---------------------------------------------------------------------------
// Event identity — endpoint-specific keys (Safeguard 2)
// ---------------------------------------------------------------------------

/**
 * Stable fingerprint over the COMPLETE normalized event payload, used where no
 * native unique identifier exists (funding, ledger updates). Canonical
 * serialization: keys sorted, string values trimmed. Identical legitimate
 * events share a fingerprint — dedup reconciles by multiplicity, never by
 * collapsing distinct occurrences.
 */
export function payloadFingerprint(evt: unknown): string {
  const canonical = canonicalJson(evt);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 40);
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

export function fillEventKey(f: RawFill): string {
  // Native trade id when present; composite fingerprint otherwise. A
  // transaction hash alone is never assumed unique.
  if (f.tid !== undefined && f.tid !== null) return `tid:${f.tid}`;
  return `fp:${payloadFingerprint({
    coin: f.coin,
    px: f.px.trim(),
    sz: f.sz.trim(),
    side: f.side,
    time: f.time,
    dir: f.dir,
    closedPnl: f.closedPnl.trim(),
    fee: f.fee.trim(),
    startPosition: f.startPosition.trim(),
    oid: f.oid ?? null,
  })}`;
}

export function fundingEventKey(f: RawFunding): string {
  return `fp:${payloadFingerprint({
    time: f.time,
    coin: f.coin,
    usdc: (f.usdc ?? "0").trim(),
    fundingRate: f.fundingRate?.trim() ?? null,
    szi: f.szi?.trim() ?? null,
  })}`;
}

export function ledgerEventKey(e: RawLedgerUpdate): string {
  if (e.nonce !== undefined && e.nonce !== null) return `nonce:${e.nonce}`;
  return `fp:${payloadFingerprint({
    time: e.time,
    hash: e.hash ?? null,
    type: e.delta.type,
    coin: e.delta.coin ?? null,
    usdc: e.delta.usdc?.trim() ?? null,
  })}`;
}
