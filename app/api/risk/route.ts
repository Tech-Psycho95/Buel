import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { riskPreferences } from "@/lib/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { validateOrigin, allowMissingOrigin } from "@/lib/http/origin";
import { ok, unauthorized, handleError } from "@/lib/http/respond";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const db = await getDb();
    const rows = await db.select().from(riskPreferences).where(eq(riskPreferences.userId, user.id)).limit(1);
    return ok({ preferences: rows[0] ?? null });
  } catch (e) {
    return handleError(e);
  }
}

const putSchema = z.object({
  maxPositionPct: z.number().min(1).max(100),
  maxDailyLossPct: z.number().min(1).max(100),
  maxOpenPositions: z.number().int().min(1).max(50),
  maxLeverageX: z.number().min(1).max(50),
  maxConcentrationPct: z.number().min(1).max(100),
});

export async function PUT(req: Request) {
  try {
    validateOrigin(req.headers, { allowMissingOrigin: allowMissingOrigin() });
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const db = await getDb();
    const input = putSchema.parse(await req.json());
    await db
      .insert(riskPreferences)
      .values({
        userId: user.id,
        maxPositionPct: input.maxPositionPct.toString(),
        maxDailyLossPct: input.maxDailyLossPct.toString(),
        maxOpenPositions: input.maxOpenPositions,
        maxLeverageX: input.maxLeverageX.toString(),
        maxConcentrationPct: input.maxConcentrationPct.toString(),
      })
      .onConflictDoUpdate({
        target: riskPreferences.userId,
        set: {
          maxPositionPct: input.maxPositionPct.toString(),
          maxDailyLossPct: input.maxDailyLossPct.toString(),
          maxOpenPositions: input.maxOpenPositions,
          maxLeverageX: input.maxLeverageX.toString(),
          maxConcentrationPct: input.maxConcentrationPct.toString(),
          updatedAt: new Date(),
        },
      });
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
