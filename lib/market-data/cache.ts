type Entry<T> = { value: T; expiresAt: number };

/*
 * Small TTL cache for Hyperliquid responses. Freshness metadata is attached by
 * the adapter at read time (age vs TTL), so the UI can always show how stale a
 * number is. Cache is in-memory per server instance — appropriate for public,
 * unauthenticated market data.
 */
export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string): { value: T; ageMs: number } | null {
    const e = this.store.get(key);
    if (!e) return null;
    const now = Date.now();
    if (now >= e.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return { value: e.value, ageMs: now - (e.expiresAt - this.ttlMs) };
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      // Drop the oldest entry (Map preserves insertion order).
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
  }
}
