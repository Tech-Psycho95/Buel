import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { forensicsReports } from "@/lib/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { validateOrigin, allowMissingOrigin } from "@/lib/http/origin";
import { rateLimit } from "@/lib/http/rate-limit";
import { ok, unauthorized, badRequest, tooMany, handleError } from "@/lib/http/respond";
import { buildWalletReport, InvalidAddressError } from "@/lib/forensics/report";
import { generateAutopsy } from "@/lib/forensics/autopsy";
import { llmConfigured, llmModel } from "@/lib/agents/llm";

const analyzeSchema = z.object({
  address: z.string().trim().min(6).max(80),
  windowDays: z.number().int().min(7).max(365).optional(),
});

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    validateOrigin(req.headers, { allowMissingOrigin: allowMissingOrigin() });
    const user = await requireApiUser();
    if (!user) return unauthorized();

    const db = await getDb();
    const rl = await rateLimit(db, "forensics:analyze", user.id, 12, 60 * 60 * 1000);
    if (!rl.allowed) return tooMany(rl);

    const input = analyzeSchema.parse(await req.json());

    let report;
    try {
      report = await buildWalletReport(input.address, {
        windowDays: input.windowDays ?? 180,
      });
    } catch (e) {
      if (e instanceof InvalidAddressError) {
        return badRequest(
          "That does not look like a Hyperliquid address. Paste the 0x master or sub-account address that actually traded — an agent (API) wallet address often returns no trading history because fills are recorded under the master account.",
        );
      }
      throw e;
    }

    const autopsy = await generateAutopsy(report);

    const inserted = await db
      .insert(forensicsReports)
      .values({
        userId: user.id,
        address: report.address,
        params: { windowDays: input.windowDays ?? 180 },
        report,
        narrative: autopsy,
        modelMeta: {
          llmConfigured: llmConfigured(),
          model: autopsy.generatedBy === "llm" ? (autopsy.model ?? llmModel()) : null,
          narrativeMode: autopsy.generatedBy,
          validationNote: autopsy.validationNote ?? null,
        },
      })
      .returning({ id: forensicsReports.id });

    return ok({
      reportId: inserted[0].id,
      report,
      narrative: autopsy,
      modelMeta: {
        llmConfigured: llmConfigured(),
        narrativeMode: autopsy.generatedBy,
        validationNote: autopsy.validationNote ?? null,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
