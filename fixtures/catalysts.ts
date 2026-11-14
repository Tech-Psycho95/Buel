/*
 * Deterministic catalyst fixture — clearly labeled DEMO seed data. The product
 * NEVER fabricates live events: until a trusted news feed is integrated, every
 * catalyst row is labeled as a demonstration record with facts-vs-hypotheses
 * flags preserved.
 */

export type CatalystSeed = {
  title: string;
  body: string;
  source: string;
  status: "confirmed" | "unverified";
  assets: string[];
  daysAgo: number;
  isDemo: true;
};

export const CATALYST_SEEDS: CatalystSeed[] = [
  {
    title: "Exchange publishes monthly proof-of-reserves update",
    body: "Routine attestation cycle. Markets often watch these for reserve health signals; reaction historically muted unless discrepancies appear.",
    source: "Exchange announcements (demo fixture)",
    status: "confirmed",
    assets: ["BTC", "ETH"],
    daysAgo: 3,
    isDemo: true,
  },
  {
    title: "Layer-2 protocol schedules mainnet upgrade",
    body: "Upgrade includes fee-market changes. Hypothesis: reduced L2 fees could shift activity from L1 to L2 — unverified until observed on-chain.",
    source: "Protocol governance forum (demo fixture)",
    status: "unverified",
    assets: ["ETH", "ARB", "OP"],
    daysAgo: 6,
    isDemo: true,
  },
  {
    title: "Perps DEX adjusts funding-interval parameters",
    body: "Funding mechanics change how crowded positioning is priced. Hypothesis: funding extremes may become less mean-reverting — requires observation.",
    source: "DEX docs changelog (demo fixture)",
    status: "confirmed",
    assets: ["BTC", "ETH", "SOL"],
    daysAgo: 10,
    isDemo: true,
  },
  {
    title: "Macro data release window (CPI)",
    body: "Scheduled macro print. Hypothesis: volatility clusters around release time — treat any pre-positioning narrative as unverified.",
    source: "Economic calendar (demo fixture)",
    status: "unverified",
    assets: ["BTC", "ETH"],
    daysAgo: 1,
    isDemo: true,
  },
  {
    title: "Stablecoin issuer discloses quarterly attestation",
    body: "Routine disclosure; historical reaction small. Marked confirmed as a scheduled event.",
    source: "Issuer transparency page (demo fixture)",
    status: "confirmed",
    assets: ["ETH"],
    daysAgo: 14,
    isDemo: true,
  },
];
