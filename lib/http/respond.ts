import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { OriginError } from "./origin";
import type { RateLimitResult } from "./rate-limit";

/*
 * Uniform API responses so every handler returns the same error shape:
 * { error: { code, message, details? } }
 */

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function err(
  status: number,
  code: string,
  message: string,
  details?: unknown,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status, headers },
  );
}

export function unauthorized(message = "Authentication required"): NextResponse {
  return err(401, "unauthorized", message);
}

export function forbidden(message = "Forbidden"): NextResponse {
  return err(403, "forbidden", message);
}

export function badRequest(message: string, details?: unknown): NextResponse {
  return err(400, "bad_request", message, details);
}

export function tooMany(result: RateLimitResult): NextResponse {
  return err(
    429,
    "rate_limited",
    "Too many requests — slow down and retry shortly.",
    undefined,
    { "Retry-After": String(result.retryAfterSec) },
  );
}

/** Map common thrown errors to responses inside handlers. */
export function handleError(e: unknown): NextResponse {
  if (e instanceof ZodError) {
    return badRequest("Invalid request payload", e.flatten());
  }
  if (e instanceof OriginError) {
    return forbidden(e.message);
  }
  const message = e instanceof Error ? e.message : "Internal error";
  // Never leak internals; log server-side.
  console.error("[api]", e);
  return err(500, "internal_error", message);
}
