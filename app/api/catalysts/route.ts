import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { catalysts } from "@/lib/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { ok, unauthorized, handleError } from "@/lib/http/respond";
import { CATALYST_SEEDS } from "@/fixtures/catalysts";

/** Seeds the clearly-labeled demo catalyst fixture once, then serves it. */
async function ensureSeeded(): Promise<void> {
  const db = await getDb();
  const existing = await db.select({ id: catalysts.id }).from(catalysts).limit(1);
  if (existing.length > 0) return;
  const now = Date.now();
  await db
    .insert(catalysts)
    .values(
      CATALYST_SEEDS.map((c) => ({
        title: c.title,
        body: c.body,
        source: c.source,
        sourceUrl: null,
        status: c.status,
        assets: c.assets,
        occurredAt: new Date(now - c.daysAgo * 86400000),
        isDemo: true,
      })),
    )
    .onConflictDoNothing();
}

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    await ensureSeeded();
    const db = await getDb();
    const rows = await db.select().from(catalysts).orderBy(desc(catalysts.occurredAt)).limit(50);
    return ok({
      catalysts: rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        source: r.source,
        status: r.status,
        assets: r.assets,
        occurredAt: r.occurredAt,
        isDemo: r.isDemo,
      })),
      disclosure:
        "Catalyst records in this build are a clearly-labeled demo fixture — no live news feed is integrated, and nothing here is presented as a real-time event.",
    });
  } catch (e) {
    return handleError(e);
  }
}
