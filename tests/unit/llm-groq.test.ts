import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";
import { llmComplete, llmConfigured, llmModel, DEFAULT_XAI_MODEL } from "@/lib/agents/llm";
import type { WalletForensicsReport } from "@/lib/forensics/report";

/*
 * xAI Grok client contract:
 *  - no key → not configured, no network call at all;
 *  - the request is an OpenAI-compatible chat completion against api.x.ai with
 *    a Bearer key, the system prompt as a system message, XAI_MODEL honoured;
 *  - failures degrade to { ok: false } and never leak the provider body.
 *
 * Autopsy-level fallback: ANY failure (missing key, HTTP error, non-JSON,
 * schema violation, ungrounded number) must yield the deterministic template
 * narrative — the Council, Judge and Gate must never depend on the provider.
 */

const ok = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

const completion = (content: string | null, model = "grok-4.7") => ({
  id: "chatcmpl-test",
  object: "chat.completion",
  model,
  choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
});

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("xAI client", () => {
  it("is not configured without XAI_API_KEY and never calls the network", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(llmConfigured()).toBe(false);
    const result = await llmComplete("sys", "user");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("XAI_API_KEY not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("defaults to grok-4.7 and honours XAI_MODEL", () => {
    vi.stubEnv("XAI_MODEL", "");
    expect(DEFAULT_XAI_MODEL).toBe("grok-4.7");
    expect(llmModel()).toBe("grok-4.7");

    vi.stubEnv("XAI_MODEL", "grok-4.7-fast");
    expect(llmModel()).toBe("grok-4.7-fast");
  });

  it("posts an OpenAI-compatible chat completion to https://api.x.ai/v1", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubEnv("XAI_MODEL", "");
    const fetchMock = vi.fn(async () => ok(completion("grounded narrative")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await llmComplete("SYSTEM PROMPT", "USER PAYLOAD", { maxTokens: 512 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.x.ai/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(String(init.body)) as {
      model: string;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe("grok-4.7");
    expect(body.max_tokens).toBe(512);
    expect(body.messages).toEqual([
      { role: "system", content: "SYSTEM PROMPT" },
      { role: "user", content: "USER PAYLOAD" },
    ]);

    expect(result).toEqual({ ok: true, text: "grounded narrative", model: "grok-4.7" });
  });

  it("reports the provider status without leaking the response body", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    const fetchMock = vi.fn(async () =>
      ({ ok: false, status: 429, json: async () => ({ error: "key sk-live-should-not-surface" }) }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await llmComplete("sys", "user");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("xAI HTTP 429");
      expect(result.error).not.toContain("sk-live");
    }
  });

  it("treats an empty or refused completion as a failure", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");

    vi.stubGlobal("fetch", vi.fn(async () => ok({ choices: [] })));
    const empty = await llmComplete("sys", "user");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toBe("Empty LLM response");

    vi.stubGlobal("fetch", vi.fn(async () => ok(completion(null))));
    const refused = await llmComplete("sys", "user");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe("Empty LLM response");
  });

  it("returns a failure instead of throwing when the request errors", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));

    const result = await llmComplete("sys", "user");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("network down");
  });

  it("aborts on timeout and reports it as a timeout", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
        });
      }),
    ));

    const result = await llmComplete("sys", "user", { timeoutMs: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("timeout");
  });
});

describe("Grok narrative fallback (Agent Council / forensics)", () => {
  let report: WalletForensicsReport;

  beforeAll(async () => {
    process.env.SENTISEL_DEMO_DATA = "1";
    const { buildWalletReport } = await import("@/lib/forensics/report");
    report = await buildWalletReport("0xc0ffee0000000000000000000000000000000002", { windowDays: 90 });
  });

  afterAll(() => {
    delete process.env.SENTISEL_DEMO_DATA;
  });

  /** A schema-valid narrative that contains no digits, so it passes grounding. */
  const groundedNarrative = (overrides: Record<string, unknown> = {}) => ({
    summary: [
      "Fees and funding are reported separately from trading results.",
      "Coverage and completeness are disclosed rather than assumed.",
      "Only observed behaviour is described, never a forecast.",
    ],
    findings: [
      {
        title: "Accounting separation",
        body: "Realized results, fees and funding are kept apart, and cash flows never inflate performance.",
        evidenceIds: [],
      },
    ],
    observation: {
      body: "The report describes past trading behaviour only and makes no claim about future outcomes.",
      evidenceIds: [],
    },
    ...overrides,
  });

  it("uses the deterministic narrative when XAI_API_KEY is missing", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { generateAutopsy } = await import("@/lib/forensics/autopsy");

    const autopsy = await generateAutopsy(report);
    expect(autopsy.generatedBy).toBe("template");
    expect(autopsy.validationNote).toContain("Deterministic template");
    expect(autopsy.validationNote).not.toContain("Grok");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back when the provider errors", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ok({}, 503)));
    const { generateAutopsy } = await import("@/lib/forensics/autopsy");

    const autopsy = await generateAutopsy(report);
    expect(autopsy.generatedBy).toBe("template");
    expect(autopsy.validationNote).toContain("Grok unavailable (xAI HTTP 503)");
  });

  it("falls back on non-JSON output", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ok(completion("I cannot help with that."))));
    const { generateAutopsy } = await import("@/lib/forensics/autopsy");

    const autopsy = await generateAutopsy(report);
    expect(autopsy.generatedBy).toBe("template");
    expect(autopsy.validationNote).toContain("non-JSON");
  });

  it("falls back when the JSON violates the schema", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ok(completion(JSON.stringify({ summary: ["only one"] })))));
    const { generateAutopsy } = await import("@/lib/forensics/autopsy");

    const autopsy = await generateAutopsy(report);
    expect(autopsy.generatedBy).toBe("template");
    expect(autopsy.validationNote).toContain("schema validation");
  });

  it("falls back when the narrative invents a number", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    const narrative = groundedNarrative({
      summary: [
        "Fees and funding are reported separately from trading results.",
        "Coverage of 987654321 records is disclosed rather than assumed.",
        "Only observed behaviour is described, never a forecast.",
      ],
    });
    vi.stubGlobal("fetch", vi.fn(async () => ok(completion(JSON.stringify(narrative)))));
    const { generateAutopsy } = await import("@/lib/forensics/autopsy");

    const autopsy = await generateAutopsy(report);
    expect(autopsy.generatedBy).toBe("template");
    expect(autopsy.validationNote).toContain("number not present in the evidence");
  });

  it("accepts a grounded narrative and records the Grok model", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubEnv("XAI_MODEL", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok(completion(JSON.stringify(groundedNarrative()), "grok-4.7"))),
    );
    const { generateAutopsy } = await import("@/lib/forensics/autopsy");

    const autopsy = await generateAutopsy(report);
    expect(autopsy.validationNote).toBeUndefined();
    expect(autopsy.generatedBy).toBe("llm");
    expect(autopsy.model).toBe("grok-4.7");
    expect(autopsy.summary).toHaveLength(3);
    // Narrative is annotations only: the report itself is untouched.
    expect(report.accounting.netTradingPnl).toBeTruthy();
  });
});
