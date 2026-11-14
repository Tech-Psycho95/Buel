import { z } from "zod";
import { requireApiUser } from "@/lib/auth/guard";
import { validateOrigin, allowMissingOrigin } from "@/lib/http/origin";
import { rateLimit } from "@/lib/http/rate-limit";
import { ok, unauthorized, badRequest, tooMany, handleError } from "@/lib/http/respond";
import { getDb } from "@/lib/db/client";
import { runScenario } from "@/lib/simulation/scenarios";

const scenarioSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  priceShockPct: z.number().min(-90).max(90),
  volumeMultiplier: z.number().min(0.1).max(10),
  volatilityMultiplier: z.number().min(0.1).max(10),
});

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    validateOrigin(req.headers, { allowMissingOrigin: allowMissingOrigin() });
    const user = await requireApiUser();
    if (!user) return unauthorized();

    const db = await getDb();
    const rl = await rateLimit(db, "scenario:run", user.id, 10, 15 * 60 * 1000);
    if (!rl.allowed) return tooMany(rl);

    const input = scenarioSchema.parse(await req.json());
    const runId = crypto.randomUUID();
    const result = await runScenario(input.symbol, {
      priceShockPct: input.priceShockPct,
      volumeMultiplier: input.volumeMultiplier,
      volatilityMultiplier: input.volatilityMultiplier,
    }, runId);
    if (!result.ok) return badRequest(result.error);
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
