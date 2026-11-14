import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { watchlists, watchlistItems } from "@/lib/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { validateOrigin, allowMissingOrigin } from "@/lib/http/origin";
import { ok, unauthorized, badRequest, handleError } from "@/lib/http/respond";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const db = await getDb();
    const lists = await db.select().from(watchlists).where(eq(watchlists.userId, user.id));
    const items = lists.length
      ? await db.select().from(watchlistItems).where(eq(watchlistItems.watchlistId, lists[0].id))
      : [];
    return ok({ lists, items });
  } catch (e) {
    return handleError(e);
  }
}

const addSchema = z.object({ symbol: z.string().trim().min(1).max(20) });

export async function POST(req: Request) {
  try {
    validateOrigin(req.headers, { allowMissingOrigin: allowMissingOrigin() });
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const db = await getDb();
    const { symbol } = addSchema.parse(await req.json());
    const wl = (
      await db
        .select()
        .from(watchlists)
        .where(and(eq(watchlists.userId, user.id), eq(watchlists.isDefault, true)))
        .limit(1)
    )[0];
    if (!wl) return badRequest("No default watchlist exists for this account.");
    await db
      .insert(watchlistItems)
      .values({ watchlistId: wl.id, symbol: symbol.toUpperCase() })
      .onConflictDoNothing();
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

const removeSchema = z.object({ symbol: z.string().trim().min(1).max(20) });

export async function DELETE(req: Request) {
  try {
    validateOrigin(req.headers, { allowMissingOrigin: allowMissingOrigin() });
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const db = await getDb();
    const { symbol } = removeSchema.parse(await req.json());
    const wl = (
      await db
        .select()
        .from(watchlists)
        .where(and(eq(watchlists.userId, user.id), eq(watchlists.isDefault, true)))
        .limit(1)
    )[0];
    if (wl) {
      await db
        .delete(watchlistItems)
        .where(and(eq(watchlistItems.watchlistId, wl.id), eq(watchlistItems.symbol, symbol.toUpperCase())));
    }
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
