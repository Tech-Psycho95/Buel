import type { RawFill, RawFunding, RawLedgerUpdate } from "@/lib/market-data/types";

/*
 * GroqCloud client — server-side only, used for narrative generation.
 *
 * Groq exposes an OpenAI-compatible Chat Completions API at
 * https://api.groq.com/openai/v1/chat/completions with a Bearer key, which is
 * why no provider SDK is needed: this module is the single place that talks to
 * it, and the key never leaves the server.
 *
 * The model NEVER computes statistics: it receives deterministic, validated
 * evidence and may only rephrase it under strict constraints
 * (lib/forensics/autopsy.ts validates every claim against the evidence), and it
 * can never influence the Judge, the Quality Gate or any trade execution.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Model id used unless GROQ_MODEL overrides it (GroqCloud production model). */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

export function llmConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export function llmModel(): string {
  // The model id is configuration, not code — pin another id from
  // https://console.groq.com/docs/models with GROQ_MODEL.
  return process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
}

export type LlmResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string };

export async function llmComplete(
  system: string,
  user: string,
  opts?: { maxTokens?: number; timeoutMs?: number },
): Promise<LlmResult> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return { ok: false, error: "GROQ_API_KEY not configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 45_000);
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: llmModel(),
        max_tokens: opts?.maxTokens ?? 1600,
        // Literalness over flourish: every number in the narrative is checked
        // against the evidence payload afterwards.
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Status code only — never the provider's body, which can echo request
      // metadata. This string can end up in a user-facing validation note.
      return { ok: false, error: `Groq HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      model?: string;
    };
    const text = (data.choices ?? [])
      .map((c) => c.message?.content ?? "")
      .join("\n")
      .trim();
    if (!text) return { ok: false, error: "Empty LLM response" };
    return { ok: true, text, model: data.model ?? llmModel() };
  } catch (e) {
    const message =
      e instanceof Error && e.name === "AbortError"
        ? "timeout"
        : e instanceof Error
          ? e.message
          : "LLM call failed";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

// Fill/funding/ledger types re-exported for the narrative payload builder.
export type { RawFill, RawFunding, RawLedgerUpdate };
