import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { paperAccounts, riskPreferences, watchlistItems, watchlists } from "@/lib/db/schema";
import { markOnboarded } from "@/lib/auth/accounts";
import { parseMoney } from "@/lib/money";
import { requireApiUser } from "@/lib/auth/guard";
import { validateOrigin, allowMissingOrigin } from "@/lib/http/origin";
import { ok, unauthorized, handleError } from "@/lib/http/respond";

const onboardingSchema = z.object({
  watchlistSymbols: z.array(z.string().trim().min(1).max(20)).max(30).default([]),
  preferredQuote: z.enum(["USDC", "USDT"]).default("USDC"),
  startingBalance: z.union([z.string(), z.number()]).transform((v) => v.toString()),
  risk: z.object({
    maxPositionPct: z.number().min(1).max(100),
    maxDailyLossPct: z.number().min(1).max(100),
    maxOpenPositions: z.number().int().min(1).max(50),
    maxLeverageX: z.number().min(1).max(50),
    maxConcentrationPct: z.number().min(1).max(100),
  }),
});

export async function POST(req: Request) {
  try {
    validateOrigin(req.headers, { allowMissingOrigin: allowMissingOrigin() });
    const user = await requireApiUser();
    if (!user) return unauthorized();

    const body = onboardingSchema.parse(await req.json());

    // Paper starting balance: positive, sane bounds. This is a SIMULATION
    // balance only — nothing here touches real money.
    const starting = parseMoney(body.startingBalance);
    if (starting.lte(0) || starting.gt(10_000_000)) {
      return ok({ ok: false, error: "starting_balance_out_of_range" }, { status: 400 });
    }

    const db = await getDb();

    // Watchlist: add symbols to the default list (idempotent).
    const wl = (
      await db
        .select()
        .from(watchlists)
        .where(and(eq(watchlists.userId, user.id), eq(watchlists.isDefault, true)))
        .limit(1)
    )[0];
    if (body.watchlistSymbols.length > 0 && wl) {
      await db
        .insert(watchlistItems)
        .values(body.watchlistSymbols.map((symbol) => ({ watchlistId: wl.id, symbol })))
        .onConflictDoNothing();
    }

    await db
      .insert(riskPreferences)
      .values({
        userId: user.id,
        maxPositionPct: body.risk.maxPositionPct.toString(),
        maxDailyLossPct: body.risk.maxDailyLossPct.toString(),
        maxOpenPositions: body.risk.maxOpenPositions,
        maxLeverageX: body.risk.maxLeverageX.toString(),
        maxConcentrationPct: body.risk.maxConcentrationPct.toString(),
      })
      .onConflictDoUpdate({
        target: riskPreferences.userId,
        set: {
          maxPositionPct: body.risk.maxPositionPct.toString(),
          maxDailyLossPct: body.risk.maxDailyLossPct.toString(),
          maxOpenPositions: body.risk.maxOpenPositions,
          maxLeverageX: body.risk.maxLeverageX.toString(),
          maxConcentrationPct: body.risk.maxConcentrationPct.toString(),
          updatedAt: new Date(),
        },
      });

    await db
      .insert(paperAccounts)
      .values({
        userId: user.id,
        cash: starting.toFixed(10),
        startingBalance: starting.toFixed(10),
      })
      .onConflictDoNothing(); // never reset an existing paper balance

    await markOnboarded(db, user.id);

    return ok({ ok: true, next: "/command-center" });
  } catch (e) {
    return handleError(e);
  }
}
