import { sql } from "drizzle-orm";
import type { SentiselDb } from "@/lib/db/client";

/*
 * Persistent fixed-window rate limiting, backed by the rate_limits table so
 * limits survive across serverless instances (in-memory maps do not).
 *
 * Key format: "<scope>:<identity>:<windowIndex>". A single atomic upsert
 * increments the counter; the caller rejects when the returned count exceeds
 * the limit. The db handle is passed explicitly so tests can use an isolated
 * in-memory Postgres.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

export async function rateLimit(
  db: SentiselDb,
  scope: string,
  identity: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const key = `${scope}:${identity}:${Math.floor(now / windowMs)}`;

  const result: unknown = await db.execute(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, ${windowStart.toISOString()}, 1)
    ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count
  `);
  // Driver-dependent shapes: postgres-js returns {rows}, PGlite returns an array.
  const asWrapper = result as { rows?: Array<{ count: number }> };
  const rows = Array.isArray(result)
    ? (result as Array<{ count: number }>)
    : (asWrapper.rows ?? []);
  const count = Number(rows[0]?.count ?? 1);

  const windowEnd = windowStart.getTime() + windowMs;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSec: Math.max(1, Math.ceil((windowEnd - now) / 1000)),
  };
}

/** Best-effort client identity for API rate limiting. */
export function clientIdentity(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
