import { test, expect } from "@playwright/test";
import { createAuthenticatedUser, privyTestSession, registerPrivySession } from "./helpers/auth";

/*
 * RELEASE AUDIT — HTTP-level functional validation.
 *
 * Covers: auth enforcement on every protected route + every API route,
 * the full product lifecycle (agents → ledger → paper → guardian →
 * forensics → chat → scenarios → arena → watchlists → risk), per-user data
 * isolation, guardian risk enforcement, and the Privy session bridge
 * (mint → verify → same-internal-id re-auth). The lifecycle runs in one
 * sequential test with a single request context so cookies persist
 * end-to-end.
 *
 * Legacy password routes (signup/login/reset) were removed in the Privy
 * migration: HTTP-level rate limiting and password-reset behaviour are
 * covered by the integration suite (tests/integration/auth.test.ts +
 * privy-identity.test.ts) instead of hammering shared IP buckets here.
 */

const PROTECTED_PAGES = [
  "/command-center", "/market-pulse", "/agent-council", "/decision-ledger",
  "/scenario-lab", "/strategy-arena", "/paper-trading", "/portfolio-guardian",
  "/catalyst-intelligence", "/market-memory", "/performance-lab", "/evidence-graph",
  "/forensics", "/watchlists", "/risk-preferences", "/settings",
];

const GET_PROTECTED_APIS = [
  "/api/market", "/api/decisions", "/api/paper", "/api/watchlists", "/api/risk",
  "/api/catalysts", "/api/performance", "/api/memory",
];

const POST_PROTECTED_APIS: Array<[string, unknown]> = [
  ["/api/onboarding", { startingBalance: "100000", risk: { maxPositionPct: 20, maxDailyLossPct: 10, maxOpenPositions: 6, maxLeverageX: 5, maxConcentrationPct: 50 } }],
  ["/api/agents/run", { symbol: "BTC" }],
  ["/api/forensics/analyze", { address: "0xc0ffee0000000000000000000000000000000002" }],
  ["/api/arena/run", { symbol: "BTC" }],
  ["/api/scenarios", { symbol: "SOL", priceShockPct: -10, volumeMultiplier: 2, volatilityMultiplier: 2 }],
  ["/api/paper", { symbol: "BTC", side: "long", intent: "entry", qty: "1" }],
  ["/api/watchlists", { symbol: "BTC" }],
];

test("auth enforcement: 16 pages redirect, all APIs return 401 unauthenticated", async ({ request }) => {
  for (const path of PROTECTED_PAGES) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), `${path} should redirect when unauthenticated`).toBe(307);
    expect(res.headers()["location"] ?? "", `${path} → /auth`).toMatch(/^\/auth/);
  }
  for (const path of GET_PROTECTED_APIS) {
    const res = await request.get(path);
    expect(res.status(), `GET ${path}`).toBe(401);
  }
  for (const [path, data] of POST_PROTECTED_APIS) {
    const res = await request.post(path, { data });
    expect(res.status(), `POST ${path}`).toBe(401);
  }
});

test("privy bridge: invalid tokens rejected, legacy routes removed", async ({ request }) => {
  // Removed password routes must be gone (not silently functional).
  for (const path of ["/api/auth/signup", "/api/auth/login", "/api/auth/forgot-password", "/api/auth/reset-password", "/api/auth/change-password"]) {
    const res = await request.post(path, { data: { email: "x@y.test", password: "whatever-123" } });
    expect(res.status(), `${path} must be removed`).toBe(404);
  }
  // Without the dev test secret the bridge refuses to authenticate anything.
  const noSecret = await request.post("/api/auth/privy/session", { data: { accessToken: "not-a-real-privy-token" } });
  expect([401, 503], "bridge without secret rejects (401 under real Privy, 503 pre-configuration)").toContain(noSecret.status());
  // With the dev secret but a malformed token the verifier still rejects it.
  const badToken = await request.post("/api/auth/privy/session", {
    headers: { "x-sentisel-test-secret": process.env.SENTISEL_TEST_SECRET ?? "e2e-test-secret" },
    data: { accessToken: "dev-test:not-an-email" },
  });
  expect(badToken.status(), "malformed token rejected by verifier").toBe(401);
});

test("full product lifecycle (single authenticated session)", async ({ request, playwright }) => {
  // Per-test fixture: lives for the whole test, carries the cookie jar.
  const api = request;
  {
    const email = `audit-${Date.now()}-${Math.floor(Math.random() * 1e6)}@sentisel.test`;
    let decisionId = "";
    let forensicsReportId = "";

    async function expectOk(
      resPromise: Promise<import("@playwright/test").APIResponse> | import("@playwright/test").APIResponse,
      what: string,
    ) {
      const res = await resPromise;
      expect(res.status(), `${what}: expected 2xx for ${res.url()}, got ${res.status()}`).toBeLessThan(300);
      return res.json();
    }

    // ---- Privy session bridge + onboarding ----
    const bridge = await createAuthenticatedUser(api, email);
    expect(bridge).toBeTruthy();

    const session = await expectOk(api.get("/api/auth/session"), "session");
    expect(session.user.email).toBe(email);

    // ---- agents → ledger ----
    const run = await expectOk(api.post("/api/agents/run", { data: { symbol: "BTC" } }), "agents run");
    expect(run.decisionId).toBeTruthy();
    expect(["LONG", "SHORT", "NO_TRADE", "ABSTAIN"]).toContain(run.snapshot.gate.finalDecision);
    expect(run.snapshot.agents).toHaveLength(4);
    decisionId = run.decisionId;

    const list = await expectOk(api.get("/api/decisions?limit=10"), "decisions list");
    expect(list.decisions.some((d: { id: string }) => d.id === decisionId)).toBe(true);

    const single = await expectOk(api.get(`/api/decisions?id=${decisionId}`), "decision replay");
    expect(single.decision.snapshot.judge.decision).toBe(run.snapshot.judge.decision);
    expect(single.decision.snapshot.evidence.items.length).toBeGreaterThan(0);

    // ---- paper trading: entry → guardian breach → exit ----
    const entry = await expectOk(
      api.post("/api/paper", { data: { symbol: "ETH", side: "long", intent: "entry", qty: "0.2" } }),
      "paper entry",
    );
    expect(entry.ok).toBe(true);
    expect(Number(entry.fillPrice)).toBeGreaterThan(0);

    const portfolio = await expectOk(api.get("/api/paper"), "portfolio");
    expect(portfolio.positions.some((p: { symbol: string }) => p.symbol === "ETH")).toBe(true);

    const oversized = await api.post("/api/paper", {
      data: { symbol: "SOL", side: "long", intent: "entry", qty: "200" },
    });
    expect(oversized.status(), "guardian rejects oversized order").toBe(400);
    const oversizedBody = await oversized.json();
    expect(oversizedBody.error.message).toMatch(/Portfolio Guardian/);

    const exit = await expectOk(
      api.post("/api/paper", { data: { symbol: "ETH", side: "long", intent: "exit", qty: "0.2" } }),
      "paper exit",
    );
    expect(exit.ok).toBe(true);
    expect(exit.realizedPnl).not.toBeNull();

    const after = await expectOk(api.get("/api/paper"), "portfolio after exit");
    expect(
      after.orders.some((o: { intent: string; status: string }) => o.intent === "exit" && o.status === "filled"),
    ).toBe(true);

    // ---- forensics: analyze → grounded chat ----
    const analyze = await expectOk(
      api.post("/api/forensics/analyze", {
        data: { address: "0xc0ffee0000000000000000000000000000000002", windowDays: 120 },
      }),
      "forensics analyze",
    );
    expect(analyze.report.completeness).toBeTruthy();
    expect(analyze.report.reconstruction.completedTrades).toBeGreaterThan(0);
    forensicsReportId = analyze.reportId;

    const chat = await expectOk(api.post("/api/forensics/chat", {
      data: {
        reportId: forensicsReportId,
        messages: [{ role: "user", content: "How much did fees cost?" }],
      },
    }), "forensics chat");
    expect(chat.answer.length).toBeGreaterThan(10);

    // ---- scenario lab + strategy arena ----
    const scenario = await expectOk(
      api.post("/api/scenarios", {
        data: { symbol: "SOL", priceShockPct: -10, volumeMultiplier: 2, volatilityMultiplier: 2 },
      }),
      "scenario run",
    );
    expect(scenario.baseline.judge).toBeTruthy();
    expect(scenario.shocked.judge).toBeTruthy();

    const arena = await expectOk(api.post("/api/arena/run", { data: { symbol: "BTC" } }), "arena run");
    expect(arena.results).toHaveLength(4);
    expect(arena.assumptions.fillModel).toMatch(/no look-ahead/i);

    // ---- watchlists + risk ----
    await expectOk(api.post("/api/watchlists", { data: { symbol: "LINK" } }), "watchlist add");
    const wl = await expectOk(api.get("/api/watchlists"), "watchlist get");
    expect(wl.items.some((i: { symbol: string }) => i.symbol === "LINK")).toBe(true);

    await expectOk(api.put("/api/risk", {
      data: { maxPositionPct: 25, maxDailyLossPct: 12, maxOpenPositions: 8, maxLeverageX: 6, maxConcentrationPct: 60 },
    }), "risk save");
    const risk = await expectOk(api.get("/api/risk"), "risk get");
    expect(Number(risk.preferences.maxPositionPct)).toBe(25);

    // ---- per-user data isolation (user B, separate Privy identity) ----
    const ctxB = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    try {
      const emailB = `audit-b-${Date.now()}@sentisel.test`;
      const userIdB = await createAuthenticatedUser(ctxB, emailB);
      expect(userIdB).toBeTruthy();

      const bDecisions = await expectOk(ctxB.get("/api/decisions?limit=50"), "B decisions list");
      expect(bDecisions.decisions.some((d: { id: string }) => d.id === decisionId)).toBe(false);

      const bReplay = await ctxB.get(`/api/decisions?id=${decisionId}`);
      expect(bReplay.status(), "user B cannot replay user A's decision").toBe(400);

      const bChat = await ctxB.post("/api/forensics/chat", {
        data: { reportId: forensicsReportId, messages: [{ role: "user", content: "fees?" }] },
      });
      expect(bChat.status(), "user B cannot chat over user A's report").toBe(400);

      const bPaper = await expectOk(ctxB.get("/api/paper"), "B paper");
      expect(bPaper.positions.some((p: { symbol: string }) => p.symbol === "ETH")).toBe(false);
    } finally {
      await ctxB.dispose();
    }

    // ---- Privy re-auth: same identity → SAME internal user (no duplicate) ----
    const remint = await privyTestSession(api, email);
    const reauth = await registerPrivySession(api, remint.accessToken);
    expect(reauth.action).toBe("authenticated");
    expect(reauth.userId, "re-auth maps to the same internal id").toBe(bridge);

    // ---- logout invalidates ----
    await expectOk(api.post("/api/auth/logout", { data: {} }), "logout");
    const afterLogout = await api.get("/api/auth/session");
    expect(afterLogout.status(), "session invalid after logout").toBe(401);
  }
});
