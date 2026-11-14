import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { decisions } from "@/lib/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { ok, unauthorized, badRequest, handleError } from "@/lib/http/respond";

/** Decision list for the ledger — always scoped to the requesting user. */
export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const db = await getDb();

    const url = new URL(req.url);
    const decisionId = url.searchParams.get("id");

    if (decisionId) {
      // Replay: return the stored snapshot exactly as persisted.
      const rows = await db
        .select()
        .from(decisions)
        .where(and(eq(decisions.id, decisionId), eq(decisions.userId, user.id)))
        .limit(1);
      if (!rows[0]) return badRequest("Decision not found for this account.");
      return ok({ decision: rows[0] });
    }

    const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 25));
    const rows = await db
      .select({
        id: decisions.id,
        symbol: decisions.symbol,
        decision: decisions.decision,
        confidence: decisions.confidence,
        dataMode: decisions.dataMode,
        createdAt: decisions.createdAt,
        snapshot: decisions.snapshot,
      })
      .from(decisions)
      .where(eq(decisions.userId, user.id))
      .orderBy(desc(decisions.createdAt))
      .limit(limit);

    return ok({ decisions: rows });
  } catch (e) {
    return handleError(e);
  }
}
