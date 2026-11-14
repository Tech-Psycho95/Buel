/*
 * Outbound request governance for the Hyperliquid public API:
 *  1. Weighted token bucket — endpoint-specific request weights including a
 *     returned-item cost component, per a per-client weighted budget.
 *  2. Bounded concurrency — a hard cap on in-flight requests.
 *  3. Retry with exponential backoff + jitter on 429/5xx.
 *
 * Weights mirror the documented info-request weight table (base weight per
 * request type plus a size component for large responses). They are config,
 * not code, so they can be tuned without touching call sites.
 */

export type WeightSpec = {
  /** Base weight charged per request regardless of response size. */
  base: number;
  /** Additional weight per 1000 returned items (returned-item cost). */
  perKiloItems?: number;
  /** Cap on the total charged weight for a single request. */
  max?: number;
};

// Base weights from the Hyperliquid rate-limit documentation (info endpoint
// families). Weights are deliberately stored as data — verify against current
// docs when adjusting.
export const ENDPOINT_WEIGHTS: Record<string, WeightSpec> = {
  meta: { base: 2 },
  metaAndAssetCtxs: { base: 2 },
  candleSnapshot: { base: 40 },
  clearinghouseState: { base: 2 },
  userFills: { base: 2, perKiloItems: 8, max: 40 },
  userFillsByTime: { base: 2, perKiloItems: 8, max: 40 },
  userFunding: { base: 2, perKiloItems: 8, max: 40 },
  userNonFundingLedgerUpdates: { base: 2, perKiloItems: 8, max: 40 },
  userRole: { base: 2 },
  userAssociatedAccounts: { base: 2 },
  spotMeta: { base: 2 },
};

export function computeWeight(type: string, itemCount: number): number {
  const spec = ENDPOINT_WEIGHTS[type] ?? { base: 2 };
  let w = spec.base;
  if (spec.perKiloItems) w += Math.ceil(itemCount / 1000) * spec.perKiloItems;
  return Math.min(w, spec.max ?? w);
}

export class WeightedTokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  private refill(): void {
    const t = this.now();
    const elapsed = (t - this.lastRefill) / 1000;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
      this.lastRefill = t;
    }
  }

  /** Try to consume `weight` immediately. */
  tryConsume(weight: number): boolean {
    this.refill();
    if (this.tokens >= weight) {
      this.tokens -= weight;
      return true;
    }
    return false;
  }

  /** Milliseconds until `weight` becomes available (0 if available now). */
  msUntilAvailable(weight: number): number {
    this.refill();
    if (this.tokens >= weight) return 0;
    const deficit = weight - this.tokens;
    return Math.ceil((deficit / this.refillPerSec) * 1000);
  }
}

export class Semaphore {
  private active = 0;
  private waiters: Array<() => void> = [];
  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
    return () => this.release();
  }

  private release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }
}

export class HlRateLimitError extends Error {
  constructor(
    public readonly retryAfterMs: number,
    message = "Hyperliquid rate limit exceeded",
  ) {
    super(message);
    this.name = "HlRateLimitError";
  }
}

export type RequestGate = {
  /** Runs `fn` under concurrency + weighted-budget governance. */
  run<T>(type: string, expectedItems: number, fn: () => Promise<T>): Promise<T>;
};

export function createRequestGate(opts?: {
  capacity?: number;
  refillPerSec?: number;
  maxConcurrent?: number;
  now?: () => number;
}): RequestGate {
  const bucket = new WeightedTokenBucket(
    opts?.capacity ?? 400,
    opts?.refillPerSec ?? 80,
    opts?.now,
  );
  const sem = new Semaphore(opts?.maxConcurrent ?? 4);

  return {
    async run<T>(type: string, expectedItems: number, fn: () => Promise<T>): Promise<T> {
      const weight = computeWeight(type, expectedItems);
      const waitMs = bucket.msUntilAvailable(weight);
      if (waitMs > 0) await sleep(waitMs);
      if (!bucket.tryConsume(weight)) {
        throw new HlRateLimitError(bucket.msUntilAvailable(weight));
      }
      const release = await sem.acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Exponential backoff with jitter for retryable failures. */
export function backoffDelays(attempts = 4): number[] {
  const delays: number[] = [];
  let d = 400;
  for (let i = 0; i < attempts; i++) {
    delays.push(d + Math.floor(Math.random() * d * 0.3));
    d *= 2;
  }
  return delays;
}
