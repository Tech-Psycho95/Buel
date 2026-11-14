import type { MarketClassification, PerpAssetMeta } from "./types";

/*
 * Market classification (Safeguard 3).
 *
 * v1 supports CORE PERPETUALS. HIP-3 markets ARE perpetuals (builder-deployed
 * dexes) but are explicitly out of v1 scope — they are classified as
 * "Unsupported HIP-3 markets", never mislabeled "non-perpetual". Spot pairs
 * and unknown symbols get their own categories. Classification uses the DEX
 * metadata from the `meta` endpoint.
 */

const SPOT_INDEX_RE = /^@\d+$/;

export type MarketUniverse = {
  /** Core perps: supported in v1. */
  perps: Set<string>;
  /** HIP-3 builder-deployed perpetual markets: out of v1 scope. */
  hip3: Map<string, string>; // coin -> dex name
  /** Spot pairs (e.g. "PURR/USDC", "@107"). */
  spots: Set<string>;
};

export function buildUniverse(assets: PerpAssetMeta[]): MarketUniverse {
  const perps = new Set<string>();
  const hip3 = new Map<string, string>();
  for (const a of assets) {
    if (a.dex && a.dex.length > 0) {
      hip3.set(a.name, a.dex);
    } else {
      perps.add(a.name);
    }
  }
  return { perps, hip3, spots: new Set() };
}

export function classifyCoin(
  coin: string,
  universe: MarketUniverse,
): MarketClassification {
  if (universe.perps.has(coin)) return "perp";
  if (universe.hip3.has(coin)) return "hip3";
  // Spot pairs: "PURR/USDC" style names and "@N" index pairs.
  if (coin.includes("/") || SPOT_INDEX_RE.test(coin)) return "spot";
  return "unknown";
}

export const CLASSIFICATION_LABELS: Record<MarketClassification, string> = {
  perp: "Perpetual (supported)",
  hip3: "Unsupported HIP-3 market",
  spot: "Spot pair",
  unknown: "Unknown market",
};
