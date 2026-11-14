import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import path from "node:path";
import * as schema from "./schema";

/*
 * Database client.
 *
 * Production / deployment (Vercel): DATABASE_URL → PostgreSQL (Neon/Supabase)
 * via postgres-js. This is the only supported production persistence.
 *
 * Local development without DATABASE_URL: embedded PostgreSQL (PGlite, the
 * real Postgres engine compiled to WASM) persisted under .data/pglite. This is
 * a development convenience — NOT a JSON/file database — and is never selected
 * when NODE_ENV=production.
 *
 * Tests: createTestDb() → in-memory PGlite, deterministic, isolated.
 *
 * Both drivers expose the same drizzle query API; the canonical application
 * type is the postgres-js flavor, with the PGlite instance adapted at this
 * single boundary (raw db.execute() result shapes differ and are normalized
 * at their call sites).
 */

export type SentiselDb = PostgresJsDatabase<typeof schema>;

type Driver =
  | { kind: "postgres"; client: postgres.Sql }
  | { kind: "pglite"; client: PGlite };

function createDriver(): Driver {
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    // postgres-js manages its own pool; max 1 connection plays nicely with
    // serverless deployments and Neon's connection limits.
    // Neon's POOLED endpoint (PgBouncer, host contains "-pooler") does not
    // support prepared statements — disable them for those hosts. The direct
    // endpoint keeps them enabled.
    let host = "";
    try {
      host = new URL(url).host;
    } catch {
      throw new Error(
        "DATABASE_URL is not a valid connection string. Expected a postgres:// URL, e.g. the pooled Neon endpoint (ep-...-pooler.<region>.aws.neon.tech).",
      );
    }
    const pooled = host.includes("pooler");
    const client = postgres(url, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: !pooled,
    });
    return { kind: "postgres", client };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is required in production. Configure a PostgreSQL database " +
        "(Neon or Supabase) via the DATABASE_URL environment variable.",
    );
  }

  const memory = process.env.SENTISEL_PG_MEMORY === "1";
  const client = new PGlite(
    memory ? undefined : path.join(process.cwd(), ".data", "pglite"),
  );
  return { kind: "pglite", client };
}

function migrationsFolder(): string {
  return path.join(process.cwd(), "drizzle");
}

function createDb(): { driver: Driver; db: SentiselDb } {
  const driver = createDriver();
  if (driver.kind === "postgres") {
    return { driver, db: drizzlePg(driver.client, { schema }) };
  }
  return {
    driver,
    db: drizzlePglite(driver.client, { schema }) as unknown as SentiselDb,
  };
}

// Global singleton survives Next.js dev hot reloads.
const globalStore = globalThis as unknown as {
  __sentiselDb?: ReturnType<typeof createDb>;
  __sentiselMigrated?: boolean;
};

function getRaw(): ReturnType<typeof createDb> {
  if (!globalStore.__sentiselDb) globalStore.__sentiselDb = createDb();
  return globalStore.__sentiselDb;
}

/** Apply Drizzle migrations (idempotent). PGlite paths always migrate. */
async function ensureMigrated(): Promise<void> {
  const raw = getRaw();
  if (globalStore.__sentiselMigrated) return;
  const folder = migrationsFolder();
  if (raw.driver.kind === "pglite") {
    await migratePglite(raw.db as unknown as never, { migrationsFolder: folder });
  } else if (process.env.SENTISEL_AUTO_MIGRATE === "1") {
    // Opt-in for single-instance deployments; on Vercel prefer `drizzle-kit migrate`.
    await migratePg(raw.db, { migrationsFolder: folder });
  }
  globalStore.__sentiselMigrated = true;
}

/** Request-scoped DB accessor: always migrated, always the same instance. */
export async function getDb() {
  await ensureMigrated();
  return getRaw().db;
}

/** For tests: a fully isolated in-memory Postgres. */
export async function createTestDb() {
  const client = new PGlite(); // in-memory
  const db = drizzlePglite(client, { schema }) as unknown as SentiselDb;
  await migratePglite(db as unknown as never, { migrationsFolder: migrationsFolder() });
  return { db, client, schema };
}

export { schema };
