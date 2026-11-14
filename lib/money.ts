import Decimal from "decimal.js";

/*
 * Financial arithmetic core.
 *
 * Rule: NO JavaScript floating-point arithmetic on financial values anywhere in
 * this codebase. Every monetary/quantity computation goes through Decimal.
 * Hyperliquid numbers arrive as strings — parse them here, never with Number().
 */

Decimal.set({
  // 40 significant digits comfortably exceeds any realistic financial need.
  precision: 40,
  // Banker-neutral display rounding happens at format time; calculations keep
  // full precision. HALF_UP matches conventional money display.
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -21,
  toExpPos: 33,
});

export { Decimal };

export class MoneyParseError extends Error {
  constructor(
    message: string,
    public readonly raw: unknown,
  ) {
    super(message);
    this.name = "MoneyParseError";
  }
}

/**
 * Strict parse. Accepts strings/numbers/Decimal. Rejects NaN/Infinity/empty/
 * non-numeric strings — anything ambiguous throws rather than silently zeroing.
 */
export function parseMoney(value: string | number | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new MoneyParseError(`Non-finite number: ${String(value)}`, value);
    }
    // Number path exists for typed literals only; convert via exact string.
    return new Decimal(String(value));
  }
  const s = String(value).trim();
  if (s.length === 0) {
    throw new MoneyParseError("Empty numeric string", value);
  }
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) {
    throw new MoneyParseError(`Not a decimal number: "${s}"`, value);
  }
  return new Decimal(s);
}

/** Lenient parse for optional fields: null/undefined/empty → zero. */
export function parseOrZero(
  value: string | number | Decimal | null | undefined,
): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  const s = typeof value === "string" ? value.trim() : value;
  if (s === "") return new Decimal(0);
  return parseMoney(s);
}

/** Decimal-exact sum. Floats are rejected at parse time. */
export function sum(values: Iterable<string | number | Decimal>): Decimal {
  let acc = new Decimal(0);
  for (const v of values) acc = acc.plus(parseMoney(v));
  return acc;
}

/** Decimal-exact mean. Returns 0 for an empty list. */
export function mean(values: Iterable<string | number | Decimal>): Decimal {
  const arr = [...values];
  if (arr.length === 0) return new Decimal(0);
  return sum(arr).div(arr.length);
}

export function maxOf(values: Iterable<string | number | Decimal>): Decimal {
  const arr = [...values];
  if (arr.length === 0) return new Decimal(0);
  return arr.reduce<Decimal>(
    (m, v) => Decimal.max(m, parseMoney(v)),
    parseMoney(arr[0]),
  );
}

export function minOf(values: Iterable<string | number | Decimal>): Decimal {
  const arr = [...values];
  if (arr.length === 0) return new Decimal(0);
  return arr.reduce<Decimal>(
    (m, v) => Decimal.min(m, parseMoney(v)),
    parseMoney(arr[0]),
  );
}

// ---------------------------------------------------------------------------
// Deterministic formatting (never locale-dependent: tests and UI stay stable)
// ---------------------------------------------------------------------------

const GROUP_RE = /\B(?=(\d{3})+(?!\d))/g;

function fixedString(d: Decimal, decimals: number): string {
  // Decimal.toFixed never uses exponent notation for reasonable ranges.
  return d.toFixed(decimals, Decimal.ROUND_HALF_UP);
}

/** "1234567.891" → "1,234,567.89" with fixed decimals. */
export function fmtNum(
  value: string | number | Decimal,
  decimals = 2,
): string {
  const s = fixedString(parseMoney(value), decimals);
  const [int, frac] = s.split(".");
  const grouped = int.replace("-", "").replace(GROUP_RE, ",");
  return (int.startsWith("-") ? "-" : "") + grouped + (frac ? `.${frac}` : "");
}

/** Signed USD: "-$310.25" / "$1,240.00" / "+$12.00" when `showPlus`. */
export function fmtUsd(
  value: string | number | Decimal,
  opts: { decimals?: number; showPlus?: boolean } = {},
): string {
  const { decimals = 2, showPlus = false } = opts;
  const d = parseMoney(value);
  const prefix = d.isNegative() ? "-" : showPlus ? "+" : "";
  return `${prefix}$${fmtNum(d.abs(), decimals)}`;
}

/** Signed percentage: "+2.10%" / "-1.35%". */
export function fmtPct(
  value: string | number | Decimal,
  opts: { decimals?: number; showPlus?: boolean } = {},
): string {
  const { decimals = 2, showPlus = true } = opts;
  const d = parseMoney(value);
  const prefix = d.isNegative() ? "-" : showPlus ? "+" : "";
  return `${prefix}${fmtNum(d.abs(), decimals)}%`;
}

/** Ratio like 0.6357 → "63.6%" (no sign logic — wins rates are 0..1). */
export function fmtRatio(value: string | number | Decimal, decimals = 1): string {
  return `${fmtNum(parseMoney(value).mul(100), decimals)}%`;
}

/** Compact display for large USD amounts: $1.24M, $310.5K. */
export function fmtUsdCompact(value: string | number | Decimal): string {
  const d = parseMoney(value);
  const abs = d.abs();
  const sign = d.isNegative() ? "-" : "";
  if (abs.gte(1_000_000)) return `${sign}$${fmtNum(abs.div(1_000_000), 2)}M`;
  if (abs.gte(1_000)) return `${sign}$${fmtNum(abs.div(1_000), 1)}K`;
  return `${sign}$${fmtNum(abs, 2)}`;
}

/**
 * Convert a Decimal to a JSON-safe number ONLY at the presentation boundary.
 * Internally everything stays Decimal; serialization rounds to a fixed number
 * of decimals to avoid float artifacts.
 */
export function toNumber(d: Decimal, decimals = 8): number {
  return Number(fixedString(d, decimals));
}

/** Store into numeric() columns as a plain string with bounded precision. */
export function toDbString(d: Decimal, decimals = 18): string {
  return fixedString(d, decimals);
}
