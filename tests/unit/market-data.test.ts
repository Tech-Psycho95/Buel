import { describe, it, expect } from "vitest";
import { collectPaginated } from "@/lib/market-data/paginate";
import { classifyCoverage } from "@/lib/market-data/coverage";
import { buildUniverse, classifyCoin } from "@/lib/market-data/classify";
import {
  computeWeight,
  WeightedTokenBucket,
  ENDPOINT_WEIGHTS,
} from "@/lib/market-data/limiter";
import {
  fillEventKey,
  fundingEventKey,
  ledgerEventKey,
  canonicalJson,
  payloadFingerprint,
  type RawFill,
  type RawFunding,
  type RawLedgerUpdate,
} from "@/lib/market-data/types";

// ---------------------------------------------------------------------------
// Simulated Hyperliquid history endpoint: newest-first, capped page size,
// inclusive [start, end] window — the shape userFillsByTime actually has.
// ---------------------------------------------------------------------------

function makeHlEndpoint<T extends { time: number }>(
  all: T[], // provided oldest-first; API stores all history
  pageSize: number,
) {
  const desc = [...all].sort((a, b) => b.time - a.time);
  return async (startMs: number, endMs: number): Promise<T[]> => {
    return desc.filter((x) => x.time >= startMs && x.time <= endMs).slice(0, pageSize);
  };
}

const pagArgs = <T extends { time: number }>(
  all: T[],
  pageSize: number,
  keyOf: (i: T) => string,
  opts?: Partial<{ startMs: number; endMs: number; maxPages: number; maxTotalItems: number }>,
) => ({
  startMs: opts?.startMs ?? 0,
  endMs: opts?.endMs ?? 10_000_000,
  pageSizeHint: pageSize,
  maxPages: opts?.maxPages ?? 50,
  maxTotalItems: opts?.maxTotalItems ?? 100_000,
  fetchPage: makeHlEndpoint(all, pageSize),
  eventKeyOf: keyOf,
  timeOf: (i: T) => i.time,
});

const fill = (tid: number, time: number, coin = "BTC"): RawFill => ({
  coin,
  px: "100",
  sz: "1",
  side: "B",
  time,
  dir: "Open Long",
  closedPnl: "0",
  fee: "0.01",
  startPosition: "0",
  tid,
});

describe("overlap pagination — completeness and dedup", () => {
  it("returns every record exactly once across page boundaries", async () => {
    // 500 fills, page size 200 → boundaries fall inside distinct times.
    const all = Array.from({ length: 500 }, (_, i) => fill(i + 1, 1_000_000 + i * 1000));
    const res = await collectPaginated(pagArgs(all, 200, (f) => `tid:${f.tid}`));
    expect(res.totalCount).toBe(500);
    expect(res.uniqueCount).toBe(500);
    expect(res.items[0].tid).toBe(1); // sorted oldest first
    expect(res.items[499].tid).toBe(500);
    expect(res.capHit).toBe(false);
    expect(res.truncatedSuspected).toBe(false);
    expect(classifyCoverage(res, { startMs: 0, endMs: 10_000_000 }).badge).toBe("complete_api_available");
  });

  it("handles same-timestamp records straddling a page boundary", async () => {
    // 10 records share one timestamp; page size 4 splits the batch. A pure
    // timestamp cursor cannot page inside the batch, so the engine marks
    // suspected truncation, probes below the blocked batch, and recovers all
    // reachable records — with Partial Coverage and no silent omission.
    const t0 = 5_000_000;
    const all = [
      ...Array.from({ length: 10 }, (_, i) => fill(100 + i, t0)),
      fill(200, t0 - 1000),
      fill(201, t0 - 2000),
    ];
    const res = await collectPaginated(pagArgs(all, 4, (f) => `tid:${f.tid}`));
    expect(res.totalCount).toBe(6); // 4 reachable at t0 + 2 older
    expect(res.uniqueCount).toBe(6);
    expect(res.truncatedSuspected).toBe(true);
    const cov = classifyCoverage(res, { startMs: 0, endMs: 10_000_000 });
    expect(cov.badge).toBe("partial");
    expect(cov.reasons.join(" ")).toMatch(/timestamp/i);
  });

  it("recovers everything when a same-timestamp batch fits the page size", async () => {
    const t0 = 5_000_000;
    const all = [
      ...Array.from({ length: 3 }, (_, i) => fill(300 + i, t0)),
      fill(400, t0 - 1000),
    ];
    const res = await collectPaginated(pagArgs(all, 10, (f) => `tid:${f.tid}`));
    expect(res.totalCount).toBe(4);
    expect(res.truncatedSuspected).toBe(false);
    expect(classifyCoverage(res, { startMs: 0, endMs: 10_000_000 }).badge).toBe(
      "complete_api_available",
    );
  });

  it("preserves identical legitimate events (no native id) across overlap", async () => {
    // Two byte-identical funding events (same time/coin/usdc) — a fingerprint
    // key alone would collapse them; multiplicity reconciliation keeps both.
    const fundingEvt = (time: number, usdc = "-1.5"): RawFunding => ({
      time,
      coin: "BTC",
      usdc,
      fundingRate: "-0.0001",
      szi: "-1.0",
    });
    const all = [fundingEvt(1000), fundingEvt(1000), fundingEvt(2000)];
    const res = await collectPaginated(pagArgs(all, 2, fundingEventKey));
    expect(res.totalCount).toBe(3);
    expect(res.uniqueCount).toBe(2);
    // Larger page (all in one page) → same result:
    const res3 = await collectPaginated(pagArgs(all, 10, fundingEventKey));
    expect(res3.totalCount).toBe(3);
    expect(res3.uniqueCount).toBe(2);
    // Page size 1 cannot observe the second identical occurrence inside any
    // single page — the API-irreducible boundary limitation. The engine
    // discloses suspected truncation rather than claiming completeness.
    const res2 = await collectPaginated(pagArgs(all, 1, fundingEventKey));
    expect(res2.totalCount).toBe(2);
    expect(res2.truncatedSuspected).toBe(true);
    expect(classifyCoverage(res2, { startMs: 0, endMs: 10_000_000 }).badge).toBe("partial");
  });

  it("prefers native keys over fingerprints (fills keep tid identity)", async () => {
    const a = fill(1, 1000);
    const b = { ...fill(1, 1000), fee: "0.99" }; // same tid, different payload
    const all = [a, b];
    const res = await collectPaginated(pagArgs(all, 10, fillEventKey));
    // Same tid → one identity; first representative wins.
    expect(res.uniqueCount).toBe(1);
  });

  it("marks suspected truncation when a full-cap page stalls", async () => {
    // More records than pages allow: the walk ends on a full page.
    const all = Array.from({ length: 50 }, (_, i) => fill(i + 1, 1000 + i));
    const res = await collectPaginated(pagArgs(all, 10, (f) => `tid:${f.tid}`, { maxPages: 4 }));
    expect(res.capHit).toBe(true);
    const cov = classifyCoverage(res, { startMs: 0, endMs: 10_000_000 });
    expect(cov.badge).toBe("partial");
    expect(cov.reasons.join(" ")).toMatch(/cap/i);
  });

  it("never auto-completes on a stall at a full-cap boundary", async () => {
    // Records dense at one timestamp exceeding page size, then nothing below.
    const t0 = 2_000_000;
    const all = Array.from({ length: 6 }, (_, i) => fill(500 + i, t0));
    const res = await collectPaginated(pagArgs(all, 4, (f) => `tid:${f.tid}`));
    // Page 1: 4 records (full). Page 2 from same cursor: same 4 → no growth,
    // full page → suspected boundary truncation, NOT complete.
    expect(res.truncatedSuspected).toBe(true);
    expect(classifyCoverage(res, { startMs: 0, endMs: 10_000_000 }).badge).toBe("partial");
  });

  it("classifies short-final-page stalls as complete", async () => {
    const all = [fill(1, 5000), fill(2, 4000), fill(3, 3000)];
    const res = await collectPaginated(pagArgs(all, 10, (f) => `tid:${f.tid}`));
    expect(classifyCoverage(res, { startMs: 0, endMs: 10_000_000 }).badge).toBe(
      "complete_api_available",
    );
  });

  it("walks to the API's startTime floor → complete via short final page", async () => {
    // The API filters at startTime, so the floor is proven by a short final
    // page that stalls (nothing else exists in the remaining range).
    const all = [fill(1, 9000), fill(2, 8000), fill(3, 100)]; // 100 is below floor
    const res = await collectPaginated(
      pagArgs(all, 2, (f) => `tid:${f.tid}`, { startMs: 1000 }),
    );
    expect(res.termination).toBe("short_final_page");
    expect(res.totalCount).toBe(2);
    expect(classifyCoverage(res, { startMs: 1000, endMs: 10_000_000 }).badge).toBe(
      "complete_api_available",
    );
  });

  it("empty page inside range → complete with zero records", async () => {
    const all: RawFill[] = [];
    const res = await collectPaginated(pagArgs(all, 10, (f) => `tid:${f.tid}`));
    expect(res.totalCount).toBe(0);
    expect(classifyCoverage(res, { startMs: 0, endMs: 10_000_000 }).badge).toBe(
      "complete_api_available",
    );
    expect(res.observedWindow).toBeNull();
  });
});

describe("event identity", () => {
  it("canonicalJson sorts keys and trims undefined", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: 1, c: undefined })).toBe('{"a":1}');
    expect(canonicalJson([3, { z: 1, y: 2 }])).toBe('[3,{"y":2,"z":1}]');
  });

  it("payload fingerprints are stable and order-sensitive", () => {
    const f1 = payloadFingerprint({ a: "1.0", b: 2 });
    const f2 = payloadFingerprint({ b: 2, a: "1.0" });
    const f3 = payloadFingerprint({ b: 2, a: "1.00" });
    expect(f1).toBe(f2);
    expect(f1).not.toBe(f3);
  });

  it("ledger keys prefer nonce and never assume hash uniqueness", () => {
    const e1: RawLedgerUpdate = {
      time: 1000,
      hash: "0xabc",
      nonce: 7,
      delta: { type: "deposit", usdc: "100" },
    };
    const e2: RawLedgerUpdate = {
      time: 1000,
      hash: "0xabc",
      nonce: 8,
      delta: { type: "withdraw", usdc: "100" },
    };
    // Same tx hash, different nonce+type → different identities.
    expect(ledgerEventKey(e1)).not.toBe(ledgerEventKey(e2));
    expect(ledgerEventKey(e1)).toBe("nonce:7");
  });

  it("funding keys include amount and rate (no hash assumption)", () => {
    const f1: RawFunding = { time: 1000, coin: "BTC", usdc: "-1.0", fundingRate: "0.0001" };
    const f2: RawFunding = { time: 1000, coin: "BTC", usdc: "-1.0", fundingRate: "0.0002" };
    const f3: RawFunding = { time: 1000, coin: "ETH", usdc: "-1.0", fundingRate: "0.0001" };
    expect(fundingEventKey(f1)).not.toBe(fundingEventKey(f2));
    expect(fundingEventKey(f1)).not.toBe(fundingEventKey(f3));
  });
});

describe("market classification (Safeguard 3)", () => {
  const uni = buildUniverse([
    { name: "BTC", dex: null, maxLeverage: 20 },
    { name: "abc:PERP-A", dex: "abc", maxLeverage: 10 },
  ]);

  it("classifies core perps, HIP-3, spot pairs and unknown coins distinctly", () => {
    expect(classifyCoin("BTC", uni)).toBe("perp");
    expect(classifyCoin("abc:PERP-A", uni)).toBe("hip3");
    expect(classifyCoin("PURR/USDC", uni)).toBe("spot");
    expect(classifyCoin("@107", uni)).toBe("spot");
    expect(classifyCoin("MADEUP", uni)).toBe("unknown");
  });
});

describe("weighted token bucket + endpoint weights", () => {
  it("charges returned-item cost and respects the max cap", () => {
    expect(computeWeight("meta", 0)).toBe(2);
    expect(computeWeight("userFills", 2000)).toBe(18); // 2 + 2*8
    expect(computeWeight("userFills", 10000)).toBe(40); // capped
    expect(ENDPOINT_WEIGHTS.userFillsByTime.max).toBe(40);
  });

  it("refuses over-capacity consumption and reports wait time", () => {
    let t = 0;
    const bucket = new WeightedTokenBucket(100, 10, () => t);
    expect(bucket.tryConsume(60)).toBe(true);
    expect(bucket.tryConsume(60)).toBe(false);
    t += 3000; // +30 tokens
    expect(bucket.tryConsume(30)).toBe(true);
    expect(bucket.msUntilAvailable(100)).toBeGreaterThan(0);
  });
});
