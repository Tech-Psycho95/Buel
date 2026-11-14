import type { RawFill, RawFunding, RawLedgerUpdate } from "@/lib/market-data/types";

/*
 * Anthropic Messages API client — server-side only, used for narrative
 * generation. The LLM NEVER computes statistics: it receives deterministic,
 * validated evidence and may only rephrase it under strict constraints
 * (lib/forensics/autopsy.ts validates every claim against the evidence).
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export function llmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function llmModel(): string {
  // Model string is config, not code — override via env after checking the
  // current Anthropic docs. Fallback chosen conservatively.
  return process.env.SENTISEL_LLM_MODEL ?? "claude-sonnet-4-5";
}

export type LlmResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string };

export async function llmComplete(
  system: string,
  user: string,
  opts?: { maxTokens?: number; timeoutMs?: number },
): Promise<LlmResult> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { ok: false, error: "ANTHROPIC_API_KEY not configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 45_000);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: llmModel(),
        max_tokens: opts?.maxTokens ?? 1600,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `Anthropic HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      model?: string;
    };
    const text = (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();
    if (!text) return { ok: false, error: "Empty LLM response" };
    return { ok: true, text, model: data.model ?? llmModel() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "LLM call failed" };
  } finally {
    clearTimeout(timer);
  }
}

// Fill/funding/ledger types re-exported for the narrative payload builder.
export type { RawFill, RawFunding, RawLedgerUpdate };
