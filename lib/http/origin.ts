/*
 * Origin/Host validation for state-changing requests (CSRF defense-in-depth
 * alongside SameSite=Lax cookies).
 *
 * - Browsers always send Origin on cross-origin and same-origin POSTs.
 * - A missing Origin from a non-browser client is tolerated only outside
 *   production (so curl-based tests work); in production a state-changing
 *   request without an Origin header that matches the deployment host is
 *   rejected.
 */

export class OriginError extends Error {
  constructor(message = "Origin validation failed") {
    super(message);
    this.name = "OriginError";
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function validateOrigin(
  headers: Headers,
  opts: { allowMissingOrigin: boolean },
): void {
  if (SAFE_METHODS.has(headers.get("x-invoke-method") ?? "")) return;

  const origin = headers.get("origin");
  const host = headers.get("host");

  if (origin === null) {
    if (opts.allowMissingOrigin) return;
    throw new OriginError("Missing Origin header");
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new OriginError("Malformed Origin header");
  }

  if (!host || originHost.toLowerCase() !== host.toLowerCase()) {
    throw new OriginError("Origin does not match Host");
  }
}

/** True for non-production environments (curl/tests) where Origin may be absent. */
export function allowMissingOrigin(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function isStateChanging(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}
