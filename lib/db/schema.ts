import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * BUEL persistence schema (PostgreSQL via Drizzle).
 *
 * Conventions:
 * - All monetary/quantity columns are numeric() (arbitrary precision, returned
 *   as strings) — parsed with Decimal, never float-typed in application code.
 * - Decision/forensics snapshots are immutable jsonb documents for replay.
 * - jsonb snapshots intentionally duplicate normalized columns: replay must
 *   render exactly what was stored at decision time.
 */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    // Self-describing scrypt hash: "scrypt$N$r$p$salt$hash"
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    // User-chosen handle (unique case-insensitively). Backfilled from
    // display_name by migration 0002; kept in sync when the username changes.
    username: text("username").notNull(),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    uniqueIndex("users_username_unique").on(sql`lower(${t.username})`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // sha256(opaque random token) — the raw token lives only in the cookie.
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("password_resets_token_hash_unique").on(t.tokenHash),
    index("password_resets_user_idx").on(t.userId),
  ],
);

export const watchlists = pgTable(
  "watchlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watchlists_user_name_unique").on(t.userId, t.name)],
);

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    watchlistId: uuid("watchlist_id")
      .notNull()
      .references(() => watchlists.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watchlist_items_unique").on(t.watchlistId, t.symbol)],
);

export const riskPreferences = pgTable("risk_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  maxPositionPct: numeric("max_position_pct", { precision: 7, scale: 4 })
    .notNull()
    .default("20"),
  maxDailyLossPct: numeric("max_daily_loss_pct", { precision: 7, scale: 4 })
    .notNull()
    .default("10"),
  maxOpenPositions: integer("max_open_positions").notNull().default(6),
  maxLeverageX: numeric("max_leverage_x", { precision: 6, scale: 2 })
    .notNull()
    .default("5"),
  maxConcentrationPct: numeric("max_concentration_pct", { precision: 7, scale: 4 })
    .notNull()
    .default("50"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paperAccounts = pgTable(
  "paper_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cash: numeric("cash", { precision: 28, scale: 10 }).notNull(),
    startingBalance: numeric("starting_balance", { precision: 28, scale: 10 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("paper_accounts_user_unique").on(t.userId)],
);

export const paperPositions = pgTable(
  "paper_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => paperAccounts.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    side: text("side").notNull(), // 'long' | 'short'
    qty: numeric("qty", { precision: 38, scale: 10 }).notNull(),
    avgEntryPrice: numeric("avg_entry_price", { precision: 28, scale: 10 }).notNull(),
    stopPrice: numeric("stop_price", { precision: 28, scale: 10 }),
    takeProfitPrice: numeric("take_profit_price", { precision: 28, scale: 10 }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("paper_positions_account_symbol_unique").on(t.accountId, t.symbol)],
);

export const paperOrders = pgTable(
  "paper_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => paperAccounts.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    side: text("side").notNull(), // 'long' | 'short'
    intent: text("intent").notNull(), // 'entry' | 'exit'
    qty: numeric("qty", { precision: 38, scale: 10 }).notNull(),
    status: text("status").notNull(), // 'filled' | 'rejected'
    rejectReason: text("reject_reason"),
    referencePrice: numeric("reference_price", { precision: 28, scale: 10 }),
    fillPrice: numeric("fill_price", { precision: 28, scale: 10 }),
    // Signed USDC fee: positive = cost, negative = rebate. Never re-derived.
    fee: numeric("fee", { precision: 28, scale: 10 }),
    slippageCost: numeric("slippage_cost", { precision: 28, scale: 10 }),
    realizedPnl: numeric("realized_pnl", { precision: 28, scale: 10 }),
    sourceDecisionId: uuid("source_decision_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    filledAt: timestamp("filled_at", { withTimezone: true }),
  },
  (t) => [
    index("paper_orders_user_idx").on(t.userId, t.createdAt),
    index("paper_orders_account_idx").on(t.accountId),
  ],
);

/** Immutable decision snapshots — replay renders this document as stored. */
export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull(),
    symbol: text("symbol").notNull(),
    decision: text("decision").notNull(), // 'LONG'|'SHORT'|'NO_TRADE'|'ABSTAIN'
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    snapshot: jsonb("snapshot").notNull(),
    modelMeta: jsonb("model_meta").notNull(),
    dataMode: text("data_mode").notNull(), // 'live' | 'demo'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("decisions_user_created_idx").on(t.userId, t.createdAt),
    index("decisions_run_idx").on(t.runId),
  ],
);

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  status: text("status").notNull(), // 'completed' | 'failed'
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

/** Later evaluation of a stored decision (LEARN phase) — one per decision. */
export const decisionOutcomes = pgTable(
  "decision_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    decisionId: uuid("decision_id")
      .notNull()
      .references(() => decisions.id, { onDelete: "cascade" }),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
    entryRefPrice: numeric("entry_ref_price", { precision: 28, scale: 10 }).notNull(),
    exitRefPrice: numeric("exit_ref_price", { precision: 28, scale: 10 }).notNull(),
    horizonReturnPct: numeric("horizon_return_pct", { precision: 12, scale: 6 }).notNull(),
    alignedWithDecision: boolean("aligned_with_decision").notNull(),
    notes: jsonb("notes"),
  },
  (t) => [uniqueIndex("decision_outcomes_decision_unique").on(t.decisionId)],
);

export const forensicsReports = pgTable(
  "forensics_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    params: jsonb("params").notNull(),
    report: jsonb("report").notNull(),
    narrative: jsonb("narrative"),
    modelMeta: jsonb("model_meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("forensics_user_created_idx").on(t.userId, t.createdAt)],
);

export const marketMemory = pgTable(
  "market_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").notNull(),
    bucketTs: timestamp("bucket_ts", { withTimezone: true }).notNull(),
    features: jsonb("features").notNull(),
    forwardOutcome: jsonb("forward_outcome"),
    source: text("source").notNull(), // 'demo' | 'live'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("market_memory_symbol_idx").on(t.symbol, t.bucketTs)],
);

export const catalysts = pgTable("catalysts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  source: text("source").notNull(),
  sourceUrl: text("source_url"),
  status: text("status").notNull(), // 'confirmed' | 'unverified'
  assets: jsonb("assets").notNull().$type<string[]>(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  isDemo: boolean("is_demo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});


/**
 * Privy identity mapping — links a Privy DID (did:privy:...) to the internal
 * BUEL user. The internal user id remains the sole ownership key; this
 * table only records how a Privy-authenticated identity maps onto it.
 * Privy DIDs are unique; one internal user may hold multiple identities
 * (e.g. email OTP + Google) — enforced by a non-unique (user, did) pair with
 * a unique constraint on the DID itself.
 */
export const privyIdentities = pgTable(
  "privy_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    privyDid: text("privy_did").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastAuthenticatedAt: timestamp("last_authenticated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadata: jsonb("metadata").$type<{
      email?: string | null;
      loginMethod?: string | null;
      walletAddress?: string | null;
    }>(),
  },
  (t) => [
    uniqueIndex("privy_identities_did_unique").on(t.privyDid),
    index("privy_identities_user_idx").on(t.userId),
  ],
);

/** Persistent fixed-window API rate limiting (per key = ip+route+window). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
