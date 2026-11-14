import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentRuns, decisions } from "@/lib/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { validateOrigin, allowMissingOrigin } from "@/lib/http/origin";
import { rateLimit } from "@/lib/http/rate-limit";
import { ok, unauthorized, badRequest, tooMany, handleError } from "@/lib/http/respond";
import { runCouncilPipeline } from "@/lib/agents/council";
import { newId } from "@/lib/auth/password";
import { llmConfigured, llmModel } from "@/lib/agents/llm";

const runSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
});

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    validateOrigin(req.headers, { allowMissingOrigin: allowMissingOrigin() });
    const user = await requireApiUser();
    if (!user) return unauthorized();

    const db = await getDb();
    const rl = await rateLimit(db, "agents:run", user.id, 30, 15 * 60 * 1000);
    if (!rl.allowed) return tooMany(rl);

    const { symbol } = runSchema.parse(await req.json());
    const runId = newId();

    await db.insert(agentRuns).values({ id: runId, userId: user.id, symbol, status: "running" });

    const result = await runCouncilPipeline(symbol, runId);
    if (!result.ok) {
      await db
        .update(agentRuns)
        .set({ status: "failed", error: result.error, finishedAt: new Date() })
        .where(eq(agentRuns.id, runId));
      return badRequest(result.error, { reason: result.reason });
    }

    const snap = result.snapshot;

    // Immutable decision snapshot — replay renders exactly this document.
    const inserted = await db
      .insert(decisions)
      .values({
        userId: user.id,
        runId,
        symbol: snap.symbol,
        decision: snap.gate.finalDecision,
        confidence: snap.judge.confidence.toFixed(4),
        snapshot: snap,
        modelMeta: {
          engine: "deterministic-v1",
          llmConfigured: llmConfigured(),
          llmModel: llmModel(),
          note: "Judge and Quality Gate are pure code; agents and red-team are deterministic over computed evidence.",
        },
        dataMode: snap.dataMode,
      })
      .returning({ id: decisions.id });

    await db
      .update(agentRuns)
      .set({ status: "completed", finishedAt: new Date() })
      .where(eq(agentRuns.id, runId));

    return ok({ decisionId: inserted[0].id, snapshot: snap });
  } catch (e) {
    return handleError(e);
  }
}
