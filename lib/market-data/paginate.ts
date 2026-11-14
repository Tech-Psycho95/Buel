/*
 * Time-range pagination engine for Hyperliquid history endpoints.
 *
 * Invariants (per the data-integrity rules):
 *  1. INCLUSIVE timestamp boundaries with deliberate overlap: the next request
 *     re-fetches the boundary timestamp (cursor = the oldest time seen on the
 *     previous page). No +1 ms cursor — same-millisecond records can never be
 *     skipped, and a page cap that splits a same-timestamp batch is detected
 *     as suspected truncation rather than silently skipped.
 *  2. Endpoint-specific identity keys (native tid / nonce when available,
 *     complete-payload fingerprint otherwise). Identical legitimate events are
 *     PRESERVED: per-key multiplicity is reconciled as the max count observed
 *     within any single page, so overlap duplicates are removed while genuine
 *     identical occurrences survive.
 *  3. A stalled cursor (no new unique records) is NEVER auto-classified as
 *     complete. Completeness requires observed evidence: the window floor was
 *     observed on a sub-cap page (nothing was cut off), or an empty page inside
 *     the range, or a short (sub-cap) final page that provably returned
 *     everything remaining in range. A full-cap page that stalls is marked as
 *     suspected boundary truncation → Partial Coverage.
 *
 * The engine is endpoint-agnostic: callers supply fetchPage, identity keys and
 * time extraction, making it fully unit-testable without network.
 */

export type PaginateResult<T> = {
  /** Deduplicated records, multiplicity preserved, sorted (time asc, key asc). */
  items: T[];
  /** Total record count including preserved identical occurrences. */
  totalCount: number;
  /** Distinct event identities. */
  uniqueCount: number;
  pagesFetched: number;
  observedWindow: { earliest: number; latest: number } | null;
  /** Window floor (requested startMs) was actually observed in the data. */
  startObserved: boolean;
  /** A full-cap final page stalled → records may be missing at the boundary. */
  truncatedSuspected: boolean;
  /** Page or total-item cap was hit. */
  capHit: boolean;
  /** "empty_page" | "short_final_page" | "floor_observed" | "stall" | "cap" */
  termination: "empty_page" | "short_final_page" | "floor_observed" | "stall" | "cap";
};

export type PaginateArgs<T> = {
  startMs: number;
  endMs: number;
  /** Documented max items per response for this endpoint (truncation signal). */
  pageSizeHint: number;
  maxPages: number;
  maxTotalItems: number;
  fetchPage: (startMs: number, endMs: number) => Promise<T[]>;
  eventKeyOf: (item: T) => string;
  timeOf: (item: T) => number;
};

export async function collectPaginated<T>(
  args: PaginateArgs<T>,
): Promise<PaginateResult<T>> {
  const { startMs, endMs, pageSizeHint, maxPages, maxTotalItems } = args;

  const counts = new Map<string, number>();
  const representative = new Map<string, T>();

  let cursor = endMs; // inclusive upper bound for the next request
  let pagesFetched = 0;
  let earliest = Infinity;
  let latest = -Infinity;
  let startObserved = false;
  let capHit = false;
  let termination: PaginateResult<T>["termination"] = "stall";
  let truncatedSuspected = false;
  // Disclosed probes below blocked same-timestamp batches. A probe happens
  // ONLY after a full-cap page stalls (proof that the batch may exceed the
  // page size); the walk then reports Partial Coverage — never silent skip.
  let probes = 0;
  const MAX_PROBES = 5;

  walking: while (pagesFetched < maxPages) {
    const page = await args.fetchPage(startMs, cursor);
    pagesFetched++;

    if (page.length === 0) {
      // Nothing at/below the cursor within the requested floor: everything
      // available has been seen.
      termination = "empty_page";
      break;
    }

    // Per-page multiplicity per identity key.
    const pageCounts = new Map<string, number>();
    let pageMin = Infinity;
    for (const item of page) {
      const key = args.eventKeyOf(item);
      const t = args.timeOf(item);
      if (t < pageMin) pageMin = t;
      if (t < earliest) earliest = t;
      if (t > latest) latest = t;
      if (t <= startMs) startObserved = true;
      pageCounts.set(key, (pageCounts.get(key) ?? 0) + 1);
      if (!representative.has(key)) representative.set(key, item);
    }

    let grew = false;
    for (const [key, c] of pageCounts) {
      const prev = counts.get(key) ?? 0;
      if (c > prev) {
        counts.set(key, c);
        grew = true;
      }
    }

    const totalSoFar = [...counts.values()].reduce((a, b) => a + b, 0);
    if (totalSoFar >= maxTotalItems) {
      capHit = true;
      termination = "cap";
      break;
    }

    // A sub-cap page that has already observed the floor proves the whole
    // window is covered (a full-cap page could have split floor-timestamp
    // records across the boundary — keep walking to verify).
    if (startObserved && page.length < pageSizeHint) {
      termination = "floor_observed";
      break;
    }

    // Inclusive overlap: re-request from the oldest time seen on this page.
    const nextCursor = pageMin;

    if (!grew && nextCursor >= cursor) {
      // Stall: no new identities and the cursor did not move backward.
      if (page.length >= pageSizeHint) {
        // Full-cap page → cannot exclude boundary truncation (the batch at
        // this timestamp may exceed the page size). Mark it, then make a
        // disclosed probe below the blocked batch to recover any older,
        // reachable records. The suspected truncation keeps coverage Partial
        // and is explained in the UI — never a silent skip.
        truncatedSuspected = true;
        if (probes < MAX_PROBES && nextCursor > startMs) {
          probes++;
          cursor = nextCursor - 1;
          continue walking;
        }
        termination = "stall";
        break;
      } else {
        // Short final page: the API returned everything it holds in
        // [startMs, cursor] — no boundary truncation signal.
        termination = "short_final_page";
        break;
      }
    }

    cursor = nextCursor;
    continue walking;
  }

  if (pagesFetched >= maxPages && termination === "stall") {
    capHit = true;
    termination = "cap";
  }

  // Materialize with multiplicity preserved: identical legitimate events stay
  // as separate records (they are payload-identical, hence one representative).
  const items: T[] = [];
  for (const [key, count] of counts) {
    const rep = representative.get(key)!;
    for (let i = 0; i < count; i++) items.push(rep);
  }
  items.sort((a, b) => {
    const ta = args.timeOf(a);
    const tb = args.timeOf(b);
    if (ta !== tb) return ta - tb;
    return args.eventKeyOf(a) < args.eventKeyOf(b) ? -1 : 1;
  });

  const totalCount = [...counts.values()].reduce((a, b) => a + b, 0);

  return {
    items,
    totalCount,
    uniqueCount: counts.size,
    pagesFetched,
    observedWindow: earliest === Infinity ? null : { earliest, latest },
    startObserved,
    truncatedSuspected,
    capHit,
    termination,
  };
}
