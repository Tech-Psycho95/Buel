import type { PaginateResult } from "./paginate";

/*
 * Coverage classification. Safeguard 1: a stalled cursor never yields
 * "complete"; every non-complete state carries a plain-language explanation.
 */

export type CoverageBadge = "complete_api_available" | "partial";

export type Coverage = {
  badge: CoverageBadge;
  /** "Complete API-Available Coverage" | "Partial Coverage" */
  label: string;
  reasons: string[]; // human-readable, shown in the Data Coverage panel
  windowStartMs: number;
  windowEndMs: number;
  observedWindow: { earliest: number; latest: number } | null;
  totalRecords: number;
  uniqueRecords: number;
  pagesFetched: number;
};

export const COVERAGE_LABELS: Record<CoverageBadge, string> = {
  complete_api_available: "Complete API-Available Coverage",
  partial: "Partial Coverage",
};

export function classifyCoverage<T>(
  result: PaginateResult<T>,
  window: { startMs: number; endMs: number },
): Coverage {
  const reasons: string[] = [];
  // Default to the honest outcome; completeness must be EARNED by the checks
  // below (Safeguard 1: stalls are never auto-completed).
  let badge: CoverageBadge = "partial";

  if (result.capHit) {
    reasons.push(
      "The configured history cap was reached before the wallet's earliest available record — older activity exists but was not fetched.",
    );
  }
  if (result.truncatedSuspected) {
    reasons.push(
      "A full page of records stalled at a timestamp boundary — records sharing that timestamp may exceed the API's per-response limit, so some same-timestamp events are excluded from this analysis.",
    );
  }

  if (!reasons.length) {
    if (result.termination === "floor_observed" || result.termination === "empty_page") {
      badge = "complete_api_available";
      reasons.push(
        result.termination === "floor_observed"
          ? "The walk reached the earliest record inside the requested window — all API-available history in the window was fetched."
          : "No records remain inside the requested window — all API-available history in the window was fetched.",
      );
    } else {
      // short_final_page: provably nothing more in range; startObserved may be
      // false only when the wallet simply has no records near the floor.
      badge = "complete_api_available";
      reasons.push(
        "The final API page returned fewer than its maximum size with no further records — all API-available history in the window was fetched.",
      );
    }
  }

  return {
    badge,
    label: COVERAGE_LABELS[badge],
    reasons,
    windowStartMs: window.startMs,
    windowEndMs: window.endMs,
    observedWindow: result.observedWindow,
    totalRecords: result.totalCount,
    uniqueRecords: result.uniqueCount,
    pagesFetched: result.pagesFetched,
  };
}
