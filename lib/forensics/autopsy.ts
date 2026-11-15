import { z } from "zod";
import { fmtUsd, fmtNum } from "@/lib/money";
import { llmComplete, llmConfigured } from "@/lib/agents/llm";
import type { WalletForensicsReport } from "./report";

/*
 * Autopsy narrative generation with STRICT AI isolation (data-integrity Rule 7):
 *
 *  1. The LLM receives the deterministic report + evidence registry — nothing
 *     else. It may not compute, derive, or invent numbers.
 *  2. Its output must satisfy a zod schema (structure) AND a numeric-content
 *     check: every number token in the narrative must appear in the evidence
 *     payload. Any violation → the narrative is DISCARDED and the
 *     deterministic template narrative is used instead (never a partial fix).
 *  3. Every evidence ID the narrative cites is validated against the registry.
 *  4. The LLM can never override the Judge, the Quality Gate, or any metric —
 *     it only annotates deterministic output.
 */

export const AutopsySchema = z.object({
  summary: z.array(z.string()).min(3).max(3),
  findings: z
    .array(
      z.object({
        title: z.string().min(3).max(160),
        body: z.string().min(10).max(700),
        evidenceIds: z.array(z.string()).max(6),
      }),
    )
    .min(1)
    .max(3),
  observation: z.object({
    body: z.string().min(10).max(700),
    evidenceIds: z.array(z.string()).max(6),
  }),
});

export type Autopsy = {
  summary: string[];
  findings: Array<{ title: string; body: string; evidenceIds: string[] }>;
  observation: { body: string; evidenceIds: string[] };
  generatedBy: "llm" | "template";
  model?: string;
  validationNote?: string;
};

// ---------------------------------------------------------------------------
// Narrative payload: the ONLY data the LLM sees
// ---------------------------------------------------------------------------

export function buildNarrativePayload(report: WalletForensicsReport): string {
  const a = report.accounting;
  return JSON.stringify({
    address: report.address,
    dataMode: report.dataModeLabel,
    completeness: report.completenessLabel,
    completenessReasons: report.completenessReasons,
    windowDays: Math.round((report.window.endMs - report.window.startMs) / 86400000),
    coverage: report.coveragePanels.map((c) => ({
      dataset: c.dataset,
      label: c.label,
      records: c.totalRecords,
    })),
    exclusions: report.exclusions,
    incompleteLifecycles: report.reconstruction.incompleteLifecycles,
    accounting: {
      realizedPnl: a.realizedPnl,
      fees: a.signedFeeTotalUsdc,
      funding: a.signedNetFunding,
      netTradingPnl: a.netTradingPnl,
      deposits: a.deposits,
      withdrawals: a.withdrawals,
      transfers: a.transfers,
      fundingPaid: a.fundingPaid,
      fundingReceived: a.fundingReceived,
      unsupportedFeeTokens: a.unsupportedFeeTokens,
    },
    overview: report.overview,
    coins: report.coins,
    activity: report.activity,
    feeDrag: report.feeDrag,
    postLossEscalation: report.postLossEscalation,
    sizeCreep: report.sizeCreep,
    hoursBest: report.hours.bestKey,
    hoursWorst: report.hours.worstKey,
    weekdayBest: report.weekdays.bestKey,
    weekdayWorst: report.weekdays.worstKey,
    evidence: report.evidence,
  });
}

// ---------------------------------------------------------------------------
// Deterministic template narrative (always available)
// ---------------------------------------------------------------------------

export function templateAutopsy(report: WalletForensicsReport): Autopsy {
  // `report.accounting` fields are ALREADY display-formatted strings; the raw
  // decimal strings live under `report.accounting.raw`. Never re-format.
  const a = report.accounting;
  const best = report.coins[0];
  const worst = report.coins[report.coins.length - 1];
  const esc3 = report.postLossEscalation.afterN.find((x) => x.consecutiveLosses === "3+");

  const findings: Autopsy["findings"] = [];

  findings.push({
    title: "Fee and funding drag",
    body: `Across ${report.overview.tradeCount} completed trades the wallet paid ${a.signedFeeTotalUsdc} in signed fees and ${a.fundingPaid} in funding payments, while receiving ${a.fundingReceived} in funding. Net trading PnL after costs is ${a.netTradingPnl}, versus ${a.realizedPnl} realized before costs.`,
    evidenceIds: [report.feeDrag.evidenceId],
  });

  if (esc3 && esc3.sampleSize > 0 && esc3.ratioVsBaseline) {
    findings.push({
      title: "Post-loss size escalation",
      body: `After 3 or more consecutive completed losses, average opening notional was ${fmtUsd(esc3.avgOpeningNotional)} versus a baseline of ${fmtUsd(report.postLossEscalation.baselineAvgOpeningNotional)} (${esc3.ratioVsBaseline}× baseline; ${esc3.sampleSize} trades in sample). Descriptive statistics only — not a claim about psychology.`,
      evidenceIds: [esc3.evidenceId],
    });
  }

  if (best && worst && best.coin !== worst.coin) {
    findings.push({
      title: "Coin concentration",
      body: `${best.coin} contributed ${fmtUsd(best.realizedPnl)} over ${best.trades} completed trades (win rate ${fmtNum(best.winRate, 1)}); ${worst.coin} contributed ${fmtUsd(worst.realizedPnl)} over ${worst.trades} trades (win rate ${fmtNum(worst.winRate, 1)}).`,
      evidenceIds: [best.evidenceId, worst.evidenceId],
    });
  }

  return {
    summary: [
      `${report.dataModeLabel} analysis of ${report.address} — ${report.completenessLabel} of the API-available history window.`,
      report.overview.tradeCount > 0
        ? `${report.overview.tradeCount} completed trades reconstructed: win rate ${fmtNum(report.overview.winRate, 1)}, net trading PnL ${a.netTradingPnl}.`
        : "No completed trades were reconstructable from the available history — the dataset is too thin for behavioral statistics.",
      `Cash flows (deposits ${a.deposits}, withdrawals ${a.withdrawals}) are reported separately and are never counted as trading performance.`,
    ],
    findings: findings.slice(0, 3),
    observation: {
      body:
        report.overview.tradeCount > 0
          ? `You averaged ${fmtNum(report.activity.tradesPerActiveDay, 1)} completed trades per active day (${report.activity.activeDays} active days); the busiest day saw ${report.activity.topDays[0]?.count ?? 0}. Activity clustering is a descriptive pattern worth watching in the ledger — not a recommendation to trade more or less.`
          : "With more completed trades, patterns like post-loss size escalation and fee drag become measurable. This is an observation about sample size, not a recommendation.",
      evidenceIds: report.activity.topDays[0]?.evidenceId
        ? [report.activity.topDays[0].evidenceId]
        : [],
    },
    generatedBy: "template",
    validationNote: "Deterministic template — generated in code from the computed report.",
  };
}

// ---------------------------------------------------------------------------
// LLM narrative + validation
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a trading behavior analyst writing a "wallet autopsy" for the BUEL platform.

HARD RULES:
- Use ONLY numbers that appear verbatim in the JSON evidence payload you are given. Never compute, convert, round, or invent any number.
- Cite evidence for each finding using exact evidence IDs from the registry (e.g. "ev:coin:BTC").
- Describe past behavior only. NEVER give financial advice, buy/sell suggestions, or predictions.
- If data is thin or coverage is partial, say so plainly.
- Do not make claims about the trader's psychological state. The post-loss metric is a descriptive statistical observation.
- Output STRICT JSON only, no markdown fences, matching this shape:
{"summary":["...","...","..."],"findings":[{"title":"...","body":"...","evidenceIds":["ev:..."]},{"title":"...","body":"...","evidenceIds":["ev:..."]},{"title":"...","body":"...","evidenceIds":["ev:..."]}],"observation":{"body":"...","evidenceIds":["ev:..."]}}
- summary: exactly 3 sentences. findings: 1 to 3 items. The observation is ONE thing to try differently, framed as an observation ("You might watch..."), never an instruction to trade.`;

/** Extract number-like tokens (including $ and % forms) from text. */
function numericTokens(text: string): string[] {
  const matches = text.match(/-?\$?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
  return matches.map((m) => m.replace(/[$,%\s]/g, ""));
}

/**
 * Every number string that exists anywhere in the payload (raw decimal
 * strings, trimmed variants, and comma-grouped variants) is allowable.
 */
function evidenceNumberStrings(payload: string): Set<string> {
  const set = new Set<string>();
  const add = (raw: string) => {
    const clean = raw.replace(/[$,%\s]/g, "");
    set.add(clean);
    const trimmed = clean.replace(/0+$/, "").replace(/\.$/, "");
    set.add(trimmed);
    const [int, frac] = trimmed.split(".");
    if (int.length > 4) set.add(int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? `.${frac}` : ""));
    // Formatted display strings present in the payload as-is.
    set.add(raw);
  };
  for (const m of payload.matchAll(/"-?\d[\d.]*(?:e[+-]?\d+)?"/gi)) add(m[0].slice(1, -1));
  for (const m of payload.matchAll(/\$-?[\d,]+(?:\.\d+)?/g)) add(m[0]);
  for (const m of payload.matchAll(/-?\d[\d,]*(?:\.\d+)?%?/g)) add(m[0]);
  return set;
}

function validateNarrativeNumbers(autopsy: Autopsy, payload: string): string | null {
  const allowed = evidenceNumberStrings(payload);
  const texts = [
    ...autopsy.summary,
    ...autopsy.findings.map((f) => `${f.title} ${f.body}`),
    autopsy.observation.body,
  ];
  for (const text of texts) {
    for (const tok of numericTokens(text)) {
      const normalized = tok.replace(/^0+(?=\d)/, "");
      if (!allowed.has(tok) && !allowed.has(normalized)) {
        return `Narrative referenced a number not present in the evidence: ${tok}`;
      }
    }
  }
  return null;
}

function validateEvidenceIds(autopsy: Autopsy, report: WalletForensicsReport): string | null {
  const all = [...autopsy.findings, autopsy.observation].flatMap((f) => f.evidenceIds);
  for (const id of all) {
    if (!(id in report.evidence)) return `Unknown evidence ID referenced: ${id}`;
  }
  return null;
}

export async function generateAutopsy(report: WalletForensicsReport): Promise<Autopsy> {
  const fallback = templateAutopsy(report);
  if (!llmConfigured()) return fallback;

  const payload = buildNarrativePayload(report);
  const result = await llmComplete(
    SYSTEM_PROMPT,
    `Evidence payload (deterministic, computed in code):\n\n${payload}\n\nWrite the autopsy JSON now.`,
    { maxTokens: 1600 },
  );
  if (!result.ok) {
    return {
      ...fallback,
      validationNote: `Groq unavailable (${result.error}) — deterministic narrative used.`,
    };
  }

  const jsonStart = result.text.indexOf("{");
  const jsonEnd = result.text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    return { ...fallback, validationNote: "Groq returned non-JSON output — deterministic narrative used." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text.slice(jsonStart, jsonEnd + 1));
  } catch {
    return { ...fallback, validationNote: "Groq JSON was malformed — deterministic narrative used." };
  }

  const schemaResult = AutopsySchema.safeParse(parsed);
  if (!schemaResult.success) {
    return { ...fallback, validationNote: "Groq output failed schema validation — deterministic narrative used." };
  }

  const candidate: Autopsy = { ...schemaResult.data, generatedBy: "llm", model: result.model };

  const idError = validateEvidenceIds(candidate, report);
  if (idError) return { ...fallback, validationNote: `${idError} — deterministic narrative used.` };

  const numError = validateNarrativeNumbers(candidate, payload);
  if (numError) return { ...fallback, validationNote: `${numError} — deterministic narrative used.` };

  return candidate;
}

// ---------------------------------------------------------------------------
// Follow-up chat — same isolation contract
// ---------------------------------------------------------------------------

const CHAT_SYSTEM = `You answer follow-up questions about a wallet's FORENSIC REPORT for the BUEL platform.

HARD RULES:
- Use ONLY numbers from the report JSON provided. Never compute or invent numbers.
- Describe past behavior only; never financial advice or predictions.
- If the report doesn't contain the answer, say so plainly.
- Keep answers under 120 words. Plain text only.`;

export async function answerChat(
  report: WalletForensicsReport,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<{ answer: string; generatedBy: "llm" | "deterministic"; model?: string }> {
  if (llmConfigured() && history.length > 0) {
    const payload = buildNarrativePayload(report);
    const convo = history
      .slice(-8)
      .map((m) => `${m.role === "user" ? "USER" : "ANALYST"}: ${m.content}`)
      .join("\n\n");
    const result = await llmComplete(
      CHAT_SYSTEM,
      `Report JSON:\n\n${payload}\n\nConversation:\n\n${convo}\n\nANALYST:`,
      { maxTokens: 600, timeoutMs: 30_000 },
    );
    if (result.ok) return { answer: result.text, generatedBy: "llm", model: result.model };
  }
  return {
    answer: deterministicChatAnswer(report, history[history.length - 1]?.content ?? ""),
    generatedBy: "deterministic",
  };
}

/** Grounded, useful answers from the report without any LLM. */
export function deterministicChatAnswer(report: WalletForensicsReport, question: string): string {
  const q = question.toLowerCase();
  const a = report.accounting; // display-formatted strings

  if (/fee|cost/.test(q)) {
    return `Signed fee total: ${a.signedFeeTotalUsdc} across the analyzed window. Net trading PnL after fees and funding is ${a.netTradingPnl}; realized PnL before costs was ${a.realizedPnl}. ${
      report.feeDrag.feesAsPctOfGrossProfit
        ? `Fees equal ${report.feeDrag.feesAsPctOfGrossProfit}% of gross profit; ${report.feeDrag.winnersWithFeeOver30Pct} of ${report.feeDrag.winnerCount} winning trades paid more than 30% of their profit in fees.`
        : ""
    }`;
  }
  if (/fund/.test(q)) {
    return `Funding: ${a.fundingPaid} paid, ${a.fundingReceived} received — net ${a.signedNetFunding} (positive = received). Funding is reported separately from trading PnL and never mixed into it.`;
  }
  if (/deposit|withdraw|transfer/.test(q)) {
    return `Deposits ${a.deposits}, withdrawals ${a.withdrawals}, transfers ${a.transfers}. These are cash flows, NOT performance: net trading PnL (${a.netTradingPnl}) excludes them by construction.`;
  }
  if (/win|loss|profit factor|trade/.test(q)) {
    return `Over ${report.overview.tradeCount} completed trades: win rate ${fmtNum(report.overview.winRate, 1)}, average win ${fmtUsd(report.overview.avgWin)}, average loss ${fmtUsd(report.overview.avgLoss)}, profit factor ${fmtNum(report.overview.profitFactor, 2)}. ${report.reconstruction.fillsInIncompleteLifecycles} fills belonging to incomplete lifecycles are excluded from these trade statistics.`;
  }
  if (/coin|best|worst/.test(q)) {
    const best = report.coins[0];
    const worst = report.coins[report.coins.length - 1];
    return best && worst
      ? `Best coin: ${best.coin} at ${fmtUsd(best.realizedPnl)} over ${best.trades} trades (win rate ${fmtNum(best.winRate, 1)}). Worst: ${worst.coin} at ${fmtUsd(worst.realizedPnl)} over ${worst.trades} trades (win rate ${fmtNum(worst.winRate, 1)}).`
      : "No completed perp trades in the analyzed window.";
  }
  if (/coverage|complete|partial|history|limit/.test(q)) {
    return `Coverage: ${report.completenessLabel}. ${report.completenessReasons.join(" ")} ${report.analyzedFillCount} of ${report.seenFillCount} seen fills were perp fills included in the statistics.`;
  }
  if (/escalat|tilt|revenge|after.*loss/.test(q)) {
    const e = report.postLossEscalation.afterN.map(
      (x) =>
        `after ${x.consecutiveLosses} loss(es): ${fmtUsd(x.avgOpeningNotional)} avg opening notional (${x.sampleSize} trades${x.ratioVsBaseline ? `, ${x.ratioVsBaseline}× baseline` : ""})`,
    );
    return `Post-Loss Size Escalation (descriptive statistics, not a psychological claim): ${e.join("; ")}. Baseline across all trades: ${fmtUsd(report.postLossEscalation.baselineAvgOpeningNotional)}.`;
  }
  return `Deterministic mode: I can answer about fees, funding, deposits/withdrawals, win rate, coins, post-loss size escalation, or coverage from the stored report. Ask about one of those, or configure GROQ_API_KEY for full natural-language answers. Net trading PnL is ${a.netTradingPnl}; coverage is ${report.completenessLabel}.`;
}
