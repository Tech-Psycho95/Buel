import { z } from "zod";
import { requireApiUser } from "@/lib/auth/guard";
import { validateOrigin, allowMissingOrigin } from "@/lib/http/origin";
import { rateLimit } from "@/lib/http/rate-limit";
import { ok, unauthorized, badRequest, tooMany, handleError } from "@/lib/http/respond";
import { getDb } from "@/lib/db/client";
import { getPortfolio, placeOrder } from "@/lib/simulation/service";

const orderSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  side: z.enum(["long", "short"]),
  intent: z.enum(["entry", "exit"]),
  qty: z.union([z.string(), z.number()]).transform((v) => String(v)),
  stopPrice: z.union([z.string(), z.number()]).optional().nullable(),
  takeProfitPrice: z.union([z.string(), z.number()]).optional().nullable(),
  sourceDecisionId: z.string().uuid().optional().nullable(),
});

export const maxDuration = 30;

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!user) return unauthorized();
    const portfolio = await getPortfolio(user.id);
    return ok(portfolio);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    validateOrigin(req.headers, { allowMissingOrigin: allowMissingOrigin() });
    const user = await requireApiUser();
    if (!user) return unauthorized();

    const db = await getDb();
    const rl = await rateLimit(db, "paper:order", user.id, 60, 15 * 60 * 1000);
    if (!rl.allowed) return tooMany(rl);

    const input = orderSchema.parse(await req.json());
    const result = await placeOrder(user.id, {
      symbol: input.symbol,
      side: input.side,
      intent: input.intent,
      qty: input.qty,
      stopPrice: input.stopPrice ? String(input.stopPrice) : null,
      takeProfitPrice: input.takeProfitPrice ? String(input.takeProfitPrice) : null,
      sourceDecisionId: input.sourceDecisionId ?? null,
    });

    if (!result.ok) return badRequest(result.reason);
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
