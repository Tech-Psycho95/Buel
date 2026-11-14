import { Decimal, parseMoney, parseOrZero, sum } from "@/lib/money";
import { fillEventKey, type RawFill } from "@/lib/market-data/types";

/*
 * Per-coin position reconstruction state machine (data-integrity Rule 4).
 *
 * CRITICAL DIVISION OF LABOR (Rule 3):
 *  - Realized PnL is ONLY ever Σ fill.closedPnl (authoritative source).
 *  - This state machine exists solely to GROUP fills into completed trades for
 *    trade-level statistics (win rate, avg win/loss, post-loss size
 *    escalation). Trade realizedPnl is the sum of its member fills'
 *    closedPnl — never an independently recomputed px-diff number.
 *
 * States per coin: flat → long/short. Transitions: open, add (avg entry
 * update), partial exit (fractional realization), full close, reversal
 * (close-and-open in one fill).
 *
 * History boundaries: the FIRST observed fill of a coin carries
 * `startPosition` — the position held before the window began. It seeds the
 * state machine so the first fill is processed against reality (a close or
 * add, not a phantom open). Lifecycles seeded this way are marked
 * "open_at_history_start"; positions still held at the window end are marked
 * "open_at_window_end". Both are EXCLUDED from completed-trade statistics —
 * but their fills' closedPnl still counts toward realized PnL (authoritative).
 */

export type TradeSide = "long" | "short";

export type CompletedTrade = {
  id: string; // stable: coin:closeEventKey
  coin: string;
  side: TradeSide;
  openedAt: number;
  closedAt: number;
  /** Indices into the analyzed fill array, chronological. */
  fillIndices: number[];
  /** Σ closedPnl of member fills — authoritative, not recomputed. */
  realizedPnl: Decimal;
  /** Σ signed fees of ALL member fills. */
  fees: Decimal;
  /** Peak absolute position size during the trade (coin units). */
  maxQty: Decimal;
  /** Opening notional estimate: avgEntry × peak qty. */
  openingNotional: Decimal;
  /** Number of fills that added to the position after the initial open. */
  additions: number;
  /** Number of partial exits before the final close. */
  partialExits: number;
  wasReversed: boolean;
};

export type IncompleteLifecycle = {
  coin: string;
  kind: "open_at_history_start" | "open_at_window_end";
  /** Position still open at window end (signed). Null for start-boundary. */
  remainingQty: Decimal | null;
  fillCount: number;
};

export type ReconstructionResult = {
  completedTrades: CompletedTrade[];
  incomplete: IncompleteLifecycle[];
  /** Fills that belong to incomplete lifecycles (disclosure count). */
  fillsInIncompleteLifecycles: number;
  reversalCount: number;
};

type CoinState = {
  position: Decimal; // signed: + long, - short
  avgEntry: Decimal | null; // unknown for positions seeded at history start
  openFillIndices: number[];
  /** Σ closedPnl across all member fills so far (partial exits included). */
  closedPnlAcc: Decimal;
  openedAt: number | null;
  startedMidPosition: boolean;
  maxQty: Decimal;
  additions: number;
  partialExits: number;
};

export function reconstructTrades(fills: RawFill[]): ReconstructionResult {
  const states = new Map<string, CoinState>();
  const completed: CompletedTrade[] = [];
  const incomplete: IncompleteLifecycle[] = [];
  let reversalCount = 0;

  // Caller passes chronological fills; enforce a stable secondary order.
  const ordered = [...fills]
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.time - b.f.time || (fillEventKey(a.f) < fillEventKey(b.f) ? -1 : 1));

  for (const { f, i } of ordered) {
    let st = states.get(f.coin);
    if (!st) {
      // Seed with the pre-existing position at the history boundary.
      const seedPos = parseOrZero(f.startPosition);
      st = {
        position: seedPos,
        avgEntry: null,
        openFillIndices: [],
        closedPnlAcc: new Decimal(0),
        openedAt: null,
        startedMidPosition: seedPos.abs().gt(0),
        maxQty: seedPos.abs(),
        additions: 0,
        partialExits: 0,
      };
      states.set(f.coin, st);
    }

    const qty = parseOrZero(f.sz).abs();
    const px = parseOrZero(f.px);
    const signedQty = f.side === "B" ? qty : qty.neg();

    if (st.position.eq(0)) {
      // Fresh open.
      st.position = signedQty;
      st.avgEntry = px;
      st.openFillIndices = [i];
      st.closedPnlAcc = parseOrZero(f.closedPnl);
      st.openedAt = f.time;
      st.maxQty = qty;
      st.additions = 0;
      st.partialExits = 0;
      states.set(f.coin, st);
      continue;
    }

    const sameDirection =
      (st.position.gt(0) && signedQty.gt(0)) || (st.position.lt(0) && signedQty.lt(0));

    if (sameDirection) {
      // ADD: weighted average entry (estimated when seeded entry unknown).
      const newSize = st.position.plus(signedQty);
      st.avgEntry = st.avgEntry
        ? st.avgEntry.mul(st.position.abs()).plus(px.mul(qty)).div(newSize.abs())
        : px;
      st.position = newSize;
      st.openFillIndices.push(i);
      st.closedPnlAcc = st.closedPnlAcc.plus(parseOrZero(f.closedPnl)); // always 0 on adds
      st.additions++;
      st.maxQty = Decimal.max(st.maxQty, newSize.abs());
      states.set(f.coin, st);
      continue;
    }

    // Opposite direction: closes (part or all); remainder = reversal.
    const closeQty = Decimal.min(qty, st.position.abs());
    const remainder = qty.minus(closeQty);
    st.openFillIndices.push(i);

    const willFlatten = closeQty.eq(st.position.abs());

    if (willFlatten) {
      // FULL CLOSE — possibly with a reversal remainder in the same fill.
      const fees = sum(st.openFillIndices.map((idx) => parseOrZero(ordered[idx].f.fee)));
      const wasIncompleteStart = st.startedMidPosition;
      if (!wasIncompleteStart) {
        completed.push({
          id: `${f.coin}:${fillEventKey(f)}`,
          coin: f.coin,
          side: st.position.gt(0) ? "long" : "short",
          openedAt: st.openedAt ?? ordered[st.openFillIndices[0]].f.time,
          closedAt: f.time,
          fillIndices: [...st.openFillIndices],
          realizedPnl: st.closedPnlAcc.plus(parseOrZero(f.closedPnl)),
          fees,
          maxQty: st.maxQty,
          openingNotional: (st.avgEntry ?? px).mul(st.maxQty),
          additions: st.additions,
          partialExits: st.partialExits,
          wasReversed: remainder.gt(0),
        });
      } else {
        // Seeded mid-position lifecycle that closed inside the window: its
        // fills' closedPnl counts toward realized PnL, but it is not a
        // completed trade (its opening was never observed).
        incomplete.push({
          coin: f.coin,
          kind: "open_at_history_start",
          remainingQty: null,
          fillCount: st.openFillIndices.length,
        });
      }
      reversalCount += remainder.gt(0) ? 1 : 0;

      if (remainder.gt(0)) {
        // REVERSAL: this fill also opens the opposite side.
        st.position = remainder.mul(signedQty.gt(0) ? 1 : -1);
        st.avgEntry = px;
        st.openFillIndices = [i];
        st.closedPnlAcc = new Decimal(0);
        st.openedAt = f.time;
        st.maxQty = remainder;
        st.additions = 0;
        st.partialExits = 0;
        st.startedMidPosition = false;
      } else {
        st.position = new Decimal(0);
        st.avgEntry = null;
        st.openFillIndices = [];
        st.closedPnlAcc = new Decimal(0);
        st.openedAt = null;
        st.maxQty = new Decimal(0);
        st.additions = 0;
        st.partialExits = 0;
        st.startedMidPosition = false;
      }
      states.set(f.coin, st);
      continue;
    }

    // PARTIAL EXIT.
    st.position = st.position.plus(signedQty); // signedQty opposes position
    st.partialExits++;
    // Partial-exit closedPnl belongs to this trade (Rule 3: Σ member fills).
    st.closedPnlAcc = st.closedPnlAcc.plus(parseOrZero(f.closedPnl));
    st.maxQty = Decimal.max(st.maxQty, st.position.abs());
    states.set(f.coin, st);
  }

  // Positions still open at the window end → incomplete at the end boundary.
  for (const [coin, st] of states) {
    if (st.position.abs().gt(0)) {
      incomplete.push({
        coin,
        kind: "open_at_window_end",
        remainingQty: st.position,
        fillCount: st.openFillIndices.length,
      });
    }
  }

  // Total fills belonging to incomplete lifecycles (disclosure metric).
  const fillsInIncomplete = incomplete.reduce((acc, x) => acc + x.fillCount, 0);

  return {
    completedTrades: completed,
    incomplete,
    fillsInIncompleteLifecycles: fillsInIncomplete,
    reversalCount,
  };
}
