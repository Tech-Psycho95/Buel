import { describe, it, expect } from "vitest";
import {
  Decimal,
  MoneyParseError,
  parseMoney,
  parseOrZero,
  sum,
  mean,
  fmtNum,
  fmtUsd,
  fmtPct,
  fmtRatio,
  fmtUsdCompact,
  toNumber,
  toDbString,
} from "@/lib/money";

describe("parseMoney", () => {
  it("parses Hyperliquid-style numeric strings exactly", () => {
    expect(parseMoney("1234.56").toString()).toBe("1234.56");
    expect(parseMoney("0.00001234").toString()).toBe("0.00001234");
    expect(parseMoney("-310.25").toString()).toBe("-310.25");
    expect(parseMoney("1e-5").toString()).toBe("0.00001");
    expect(parseMoney("2.1E+3").toString()).toBe("2100");
    expect(parseMoney(" .5 ").toString()).toBe("0.5");
    expect(parseMoney("12.").toString()).toBe("12");
  });

  it("rejects non-numeric and non-finite input", () => {
    expect(() => parseMoney("abc")).toThrow(MoneyParseError);
    expect(() => parseMoney("")).toThrow(MoneyParseError);
    expect(() => parseMoney("12,34")).toThrow(MoneyParseError);
    expect(() => parseMoney(NaN)).toThrow(MoneyParseError);
    expect(() => parseMoney(Infinity)).toThrow(MoneyParseError);
    expect(() => parseMoney({} as unknown as string)).toThrow(MoneyParseError);
  });

  it("parseOrZero treats null/undefined/empty as zero", () => {
    expect(parseOrZero(null).toString()).toBe("0");
    expect(parseOrZero(undefined).toString()).toBe("0");
    expect(parseOrZero("").toString()).toBe("0");
    expect(parseOrZero("  ").toString()).toBe("0");
    expect(parseOrZero("1.5").toString()).toBe("1.5");
  });
});

describe("exact arithmetic", () => {
  it("sums without float drift (0.1 + 0.2 === 0.3)", () => {
    expect(sum(["0.1", "0.2"]).toString()).toBe("0.3");
    expect(sum([0.1, 0.2]).toString()).toBe("0.3");
  });

  it("sums long mixed lists exactly", () => {
    const fills = ["0.07", "1.6", "0.00001234", "-0.5", "1e-7"];
    expect(sum(fills).toString()).toBe("1.17001244");
  });

  it("computes means with full precision", () => {
    expect(mean(["1", "2"]).toString()).toBe("1.5");
    expect(mean([]).toString()).toBe("0");
  });

  it("float comparison shows why Decimal is mandatory", () => {
    // The float failure mode this module exists to prevent:
    expect(0.1 + 0.2).not.toBe(0.3);
  });
});

describe("formatting", () => {
  it("groups thousands deterministically", () => {
    expect(fmtNum("1234567.891", 2)).toBe("1,234,567.89");
    expect(fmtNum("999.999", 2)).toBe("1,000.00"); // HALF_UP at display
    expect(fmtNum("-1234.5", 1)).toBe("-1,234.5");
    expect(fmtNum("0.00001234", 8)).toBe("0.00001234");
  });

  it("formats signed USD", () => {
    expect(fmtUsd("-310.25")).toBe("-$310.25");
    expect(fmtUsd("1240")).toBe("$1,240.00");
    expect(fmtUsd("12", { showPlus: true })).toBe("+$12.00");
  });

  it("formats signed percentages and ratios", () => {
    expect(fmtPct("2.1")).toBe("+2.10%");
    expect(fmtPct("-1.35", { showPlus: false })).toBe("-1.35%");
    expect(fmtRatio("0.6357", 1)).toBe("63.6%");
  });

  it("compacts large amounts", () => {
    expect(fmtUsdCompact("1240000")).toBe("$1.24M");
    expect(fmtUsdCompact("310500")).toBe("$310.5K");
    expect(fmtUsdCompact("-1250")).toBe("-$1.3K");
    expect(fmtUsdCompact("-1240000")).toBe("-$1.24M");
  });
});

describe("serialization boundaries", () => {
  it("toNumber rounds to fixed decimals to avoid float artifacts", () => {
    expect(toNumber(new Decimal("0.000000123456789"), 8)).toBe(0.00000012);
    expect(toNumber(new Decimal("0.000000001"), 8)).toBe(0);
    expect(toNumber(new Decimal("1.9999999999"), 2)).toBe(2);
  });

  it("toDbString is a fixed-precision string for numeric() columns", () => {
    expect(toDbString(new Decimal("310.25"))).toBe("310.250000000000000000");
  });
});
