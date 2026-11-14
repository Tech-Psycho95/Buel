// Verifies the Neon schema: tables, indexes, row counts. Reads .env.local;
// prints ONLY structural info (never connection values).
import { readFileSync } from "node:fs";
import postgres from "postgres";

const envText = readFileSync(".env.local", "utf8");
const url = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) throw new Error("DATABASE_URL missing");

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });

const tables = await sql`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' ORDER BY tablename`;
console.log("tables:", tables.map((t) => t.tablename).join(", "));

const indexes = await sql`
  SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = 'public'`;
console.log("indexes:", indexes[0].n);

const migrations = await sql`
  SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
console.log("applied migrations:", migrations[0].n);

const expected = [
  "users", "sessions", "password_resets", "watchlists", "watchlist_items",
  "risk_preferences", "paper_accounts", "paper_positions", "paper_orders",
  "decisions", "agent_runs", "decision_outcomes", "forensics_reports",
  "market_memory", "catalysts", "rate_limits",
];
const present = new Set(tables.map((t) => t.tablename));
const missing = expected.filter((t) => !present.has(t));
console.log("expected tables present:", missing.length === 0 ? "ALL 16 ✓" : `MISSING: ${missing.join(", ")}`);

await sql.end();
