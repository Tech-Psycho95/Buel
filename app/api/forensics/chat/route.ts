import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { forensicsReports } from "@/lib/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { validateOrigin, allowMissingOrigin } from "@/lib/http/origin";
import { rateLimit } from "@/lib/http/rate-limit";
import { ok, unauthorized, badRequest, tooMany, handleError } from "@/lib/http/respond";
import { answerChat } from "@/lib/forensics/autopsy";
import type { WalletForensicsReport } from "@/lib/forensics/report";

const chatSchema = z.object({
  reportId: z.string().uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
});

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    validateOrigin(req.headers, { allowMissingOrigin: allowMissingOrigin() });
    const user = await requireApiUser();
    if (!user) return unauthorized();

    const db = await getDb();
    const rl = await rateLimit(db, "forensics:chat", user.id, 40, 15 * 60 * 1000);
    if (!rl.allowed) return tooMany(rl);

    const input = chatSchema.parse(await req.json());

    // Ownership check: a user may only chat over THEIR OWN stored report.
    const rows = await db
      .select()
      .from(forensicsReports)
      .where(
        and(eq(forensicsReports.id, input.reportId), eq(forensicsReports.userId, user.id)),
      )
      .limit(1);
    const stored = rows[0];
    if (!stored) return badRequest("Report not found for this account.");

    const report = stored.report as WalletForensicsReport;
    const answer = await answerChat(report, input.messages);

    return ok({ answer: answer.answer, generatedBy: answer.generatedBy });
  } catch (e) {
    return handleError(e);
  }
}
