"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Badge, Button, Card, CardHeader, DataTable, Select, StatCard, TextInput, PnL } from "@/components/ui";
import { CoveragePanel, type CoveragePanelData } from "@/components/coverage-panel";
import { ThinkingDots } from "@/components/motion";

/*
 * Wallet Forensics workbench — premium analysis report over deterministic,
 * evidence-referenced stats with honest coverage disclosure.
 */

type Report = {
  address: string;
  analyzedAt: number;
  mode: "live" | "demo";
  dataModeLabel: string;
  completenessLabel: string;
  completenessReasons: string[];
  completeness: "complete_api_available" | "partial";
  scopeDisclosure: string[];
  associatedAccounts: string[] | null;
  analyzedFillCount: number;
  seenFillCount: number;
  caps: { maxPages: number; maxItems: number };
  coveragePanels: CoveragePanelData[];
  exclusions: { categories: Array<{ classification: string; label: string; fills: number; closedPnl: string; coins: string[] }> };
  reconstruction: {
    completedTrades: number;
    incompleteLifecycles: Array<{ coin: string; kind: string; remainingQty: string | null; fillCount: number }>;
    fillsInIncompleteLifecycles: number;
    reversals: number;
  };
  accounting: {
    realizedPnl: string;
    signedFeeTotalUsdc: string;
    signedNetFunding: string;
    netTradingPnl: string;
    netTradingPnlCompact: string;
    deposits: string;
    withdrawals: string;
    transfers: string;
    fundingPaid: string;
    fundingReceived: string;
    raw: Record<string, string>;
    feeDenominations: Array<{ token: string; total: string; fillCount: number; includedInAggregate: boolean }>;
    unsupportedFeeTokens: string[];
  };
  overview: {
    tradeCount: number;
    winRate: string;
    avgWin: string;
    avgLoss: string;
    profitFactor: string;
    expectancy: string;
    bestTradePnl: string;
    worstTradePnl: string;
    avgTradeDurationMin: string;
  };
  coins: Array<{ coin: string; trades: number; wins: number; winRate: string; realizedPnl: string; fees: string; evidenceId: string }>;
  activity: { activeDays: number; tradesPerActiveDay: string; topDays: Array<{ dateUtc: string; count: number; evidenceId: string }> };
  feeDrag: { totalFees: string; feesAsPctOfGrossProfit: string | null; winnersWithFeeOver30Pct: number; winnerCount: number; evidenceId: string };
  postLossEscalation: {
    baselineAvgOpeningNotional: string;
    baselineTradeCount: number;
    afterN: Array<{ consecutiveLosses: string; avgOpeningNotional: string; ratioVsBaseline: string | null; sampleSize: number; evidenceId: string }>;
    framing: string;
  };
  sizeCreep: { weekly: Array<{ weekStartUtc: string; avgOpeningNotional: string; trades: number }>; changePct: string | null };
  hours: { buckets: Array<{ key: string; label: string; trades: number; pnl: string; winRate: string; evidenceId: string }>; bestKey: string | null; worstKey: string | null };
  weekdays: { buckets: Array<{ key: string; label: string; trades: number; pnl: string; winRate: string; evidenceId: string }>; bestKey: string | null; worstKey: string | null };
};

type Narrative = {
  summary: string[];
  findings: Array<{ title: string; body: string; evidenceIds: string[] }>;
  observation: { body: string; evidenceIds: string[] };
  generatedBy: "llm" | "template";
  model?: string;
  validationNote?: string;
};

const usd = (s: string | null) => {
  if (s === null) return "—";
  const n = Number(s);
  const prefix = n < 0 ? "-" : "";
  return `${prefix}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const pct = (s: string | null) => (s === null ? "—" : `${Number(s).toFixed(1)}%`);

export function ForensicsWorkbench() {
  const [address, setAddress] = useState("");
  const [windowDays, setWindowDays] = useState("180");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [narrative, setNarrative] = useState<Narrative | null>(null);
  const [narrativeMeta, setNarrativeMeta] = useState<{
    llmConfigured: boolean;
    narrativeMode: string;
    validationNote: string | null;
  } | null>(null);

  const [chat, setChat] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  async function analyze(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setReport(null);
    setNarrative(null);
    setReportId(null);
    setChat([]);
    try {
      const res = await fetch("/api/forensics/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, windowDays: Number(windowDays) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message ?? "Analysis failed — try again.");
        return;
      }
      setReportId(data.reportId);
      setReport(data.report);
      setNarrative(data.narrative);
      setNarrativeMeta(data.modelMeta);
    } catch {
      setError("Network error during analysis.");
    } finally {
      setBusy(false);
    }
  }

  async function sendChat(e?: React.FormEvent) {
    e?.preventDefault();
    if (!chatInput.trim() || !reportId || chatBusy) return;
    const messages = [...chat, { role: "user" as const, content: chatInput.trim() }];
    setChat(messages);
    setChatInput("");
    setChatBusy(true);
    try {
      const res = await fetch("/api/forensics/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, messages }),
      });
      const data = await res.json().catch(() => ({}));
      const answer = res.ok ? String(data.answer) : (data?.error?.message as string) ?? "Chat failed.";
      setChat([...messages, { role: "assistant", content: res.ok ? answer : `⚠️ ${answer}` }]);
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <div className="space-y-7">
      {/* Address form */}
      <Card variant="elevated" className="halo">
        <CardHeader
          title="Analyze a Hyperliquid wallet"
          subtitle="Paste the master or sub-account address that actually traded."
          right={
            report ? <Badge tone={report.mode === "demo" ? "warn" : "accent"} mono>{report.dataModeLabel}</Badge> : undefined
          }
        />
        <form onSubmit={analyze} className="flex flex-wrap items-center gap-2">
          <TextInput
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…  (42-character hex address)"
            className="min-w-[280px] flex-1 font-mono text-xs"
            required
            aria-label="Hyperliquid address"
          />
          <Select value={windowDays} onChange={(e) => setWindowDays(e.target.value)} aria-label="History window">
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">365 days</option>
          </Select>
          <Button type="submit" disabled={busy || !address.trim()}>
            {busy ? "Analyzing…" : "Run forensics"}
          </Button>
        </form>
        <details className="mt-3.5 text-xs text-ink-faint">
          <summary className="cursor-pointer select-none transition-colors hover:text-ink-dim">
            Why is my address returning no history? (agent-wallet explainer)
          </summary>
          <div className="mt-2.5 space-y-1.5 leading-relaxed">
            <p>
              Hyperliquid records fills under the <strong className="text-ink-dim">master or sub-account</strong> that
              owns the position. An <strong className="text-ink-dim">agent (API) wallet</strong> signs orders but does
              not own them — querying its address often returns an empty history.
            </p>
            <p>
              Use the 0x master account address (or the specific sub-account address). The analysis
              covers <strong className="text-ink-dim">exactly the address you provide</strong>: a master-account
              analysis does not include sub-account activity, and vice versa. Associated addresses are shown for
              context only, never merged.
            </p>
          </div>
        </details>
        {error && (
          <p className="mt-3 rounded-lg border border-bear/30 bg-bear-soft/50 px-3 py-2 text-xs text-bear">{error}</p>
        )}
      </Card>

      {busy && (
        <Card className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-ink-dim">
            <ThinkingDots />
            <span>Walking fill/funding/ledger history with inclusive-overlap pagination — large wallets take up to a minute.</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="shimmer h-24 rounded-xl" />
            ))}
          </div>
        </Card>
      )}

      <AnimatePresence>
        {report && narrative && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-7"
          >
            {/* Autopsy */}
            <Card variant="elevated" className="halo">
              <CardHeader
                eyebrow="Deterministic report"
                title="The autopsy"
                subtitle={
                  narrative.generatedBy === "llm"
                    ? `AI narrative, strictly grounded in computed evidence${narrative.model ? ` · ${narrative.model}` : ""}`
                    : "Deterministic narrative generated in code from the computed report"
                }
                right={
                  <Badge tone={narrative.generatedBy === "llm" ? "analyst" : "neutral"}>
                    {narrative.generatedBy === "llm" ? "LLM · evidence-locked" : "Rules-based"}
                  </Badge>
                }
              />
              <div className="space-y-1.5 text-[13px] leading-relaxed text-ink">
                {narrative.summary.map((s, i) => (
                  <p key={i}>{s}</p>
                ))}
              </div>
              <div className="mt-4 space-y-2.5">
                {narrative.findings.map((f, i) => (
                  <div key={i} className="rounded-lg border border-line bg-bg-2/70 p-3.5 transition-colors hover:border-line-strong">
                    <p className="text-[13px] font-semibold text-accent">
                      <span className="mr-1.5 font-mono text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                      {f.title}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">{f.body}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {f.evidenceIds.map((id) => (
                        <Badge key={id} tone="neutral" mono>
                          {id}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="rounded-lg border border-analyst/25 bg-analyst-soft/25 p-3.5">
                  <p className="text-[13px] font-semibold text-analyst">One thing to watch</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">{narrative.observation.body}</p>
                </div>
              </div>
              {narrativeMeta?.validationNote && (
                <p className="mt-3 text-[11px] text-ink-faint">{narrativeMeta.validationNote}</p>
              )}
              <p className="mt-3 border-t border-line pt-3 text-[11px] text-ink-faint">
                Every number above comes from the deterministic stats engine — the narrative layer
                cannot invent, modify, or override any metric.
              </p>
            </Card>

            {/* Net PnL hero band */}
            <Card variant="elevated" className="halo overflow-hidden">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                    Net trading PnL
                  </p>
                  <p
                    className={`tabular mt-1 text-4xl font-semibold tracking-tight ${
                      Number(report.accounting.raw.netTradingPnl) >= 0 ? "text-bull" : "text-bear"
                    }`}
                  >
                    {usd(report.accounting.raw.netTradingPnl)}
                  </p>
                </div>
                <p className="font-mono text-[11px] text-ink-faint">
                  realized − fees + funding
                </p>
              </div>
              <div className="grid gap-3 pt-4 sm:grid-cols-3">
                {[
                  ["Realized PnL", report.accounting.raw.realizedPnl, "Σ closedPnl (authoritative)", "neutral"],
                  ["Signed fees", report.accounting.raw.signedFeeTotalUsdc, "builder fees included, never double-counted", "bear"],
                  ["Signed net funding", report.accounting.raw.signedNetFunding, `paid ${usd(report.accounting.fundingPaid)} · received ${usd(report.accounting.fundingReceived)}`, "neutral"],
                ].map(([l, v, h]) => (
                  <div key={l as string} className="rounded-lg border border-line bg-bg-2/70 p-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{l as string}</p>
                    <p className="tabular mt-1.5 text-xl font-semibold text-ink">{usd(v as string)}</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-ink-faint">{h as string}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Accounting separation */}
            <Card>
              <CardHeader
                title="Accounting separation"
                subtitle="Cash flows are reported separately and never count as trading performance."
              />
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg border border-line bg-bg-2/70 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Deposits</p>
                  <p className="tabular mt-1 text-lg font-medium text-ink">{usd(report.accounting.raw.deposits)}</p>
                </div>
                <div className="rounded-lg border border-line bg-bg-2/70 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Withdrawals</p>
                  <p className="tabular mt-1 text-lg font-medium text-ink">{usd(report.accounting.raw.withdrawals)}</p>
                </div>
                <div className="rounded-lg border border-line bg-bg-2/70 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Transfers</p>
                  <p className="tabular mt-1 text-lg font-medium text-ink">{usd(report.accounting.raw.transfers)}</p>
                </div>
              </div>
              {report.accounting.unsupportedFeeTokens.length > 0 && (
                <p className="mt-3 rounded-lg border border-warn/25 bg-warn-soft/30 px-3 py-2 text-xs text-warn">
                  Non-USDC fee denominations detected ({report.accounting.unsupportedFeeTokens.join(", ")}) — reported
                  separately, excluded from the aggregate.
                </p>
              )}
              <p className="mt-3 text-[11px] text-ink-faint">
                Net Trading PnL = Realized PnL − Signed Fee Total + Signed Net Funding (positive funding = received).
              </p>
            </Card>

            {/* Coverage */}
            <CoveragePanel
              panels={report.coveragePanels}
              completenessLabel={report.completenessLabel}
              completenessReasons={report.completenessReasons}
              analyzedFillCount={report.analyzedFillCount}
              seenFillCount={report.seenFillCount}
              caps={report.caps}
              exclusions={report.exclusions.categories.map((c) => ({
                label: c.label,
                fills: c.fills,
                coins: c.coins,
              }))}
            />

            {/* Trade stats */}
            <StaggerGrid>
              <StatCard
                label="Completed trades"
                value={report.overview.tradeCount.toLocaleString("en-US")}
                hint={`${report.reconstruction.reversals} reversal${report.reconstruction.reversals === 1 ? "" : "s"} · ${report.reconstruction.fillsInIncompleteLifecycles} incomplete-lifecycle fills excluded`}
              />
              <StatCard
                label="Win rate"
                value={pct(String(Number(report.overview.winRate) * 100))}
                hint="completed trades only"
              />
              <StatCard
                label="Profit factor"
                value={Number(report.overview.profitFactor).toFixed(2)}
                hint="gross win / gross loss"
              />
              <StatCard
                label="Avg trade duration"
                value={`${Number(report.overview.avgTradeDurationMin).toFixed(0)}m`}
                hint={`expectancy ${usd(report.overview.expectancy)}`}
              />
            </StaggerGrid>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Per-coin breakdown" subtitle="Completed trades only, sorted by realized PnL" />
                {report.coins.length === 0 ? (
                  <p className="text-sm text-ink-faint">No completed perp trades in the analyzed window.</p>
                ) : (
                  <DataTable head={["Coin", "Trades", "Win rate", "Realized PnL", "Fees"]}>
                    {report.coins.slice(0, 8).map((c) => (
                      <tr key={c.coin} className="text-ink-dim transition-colors hover:bg-surface-2/60">
                        <td className="px-3 py-2 font-medium text-ink">{c.coin}</td>
                        <td className="tabular px-3 py-2">{c.trades}</td>
                        <td className="tabular px-3 py-2">{pct(String(Number(c.winRate) * 100))}</td>
                        <td className="px-3 py-2">
                          <PnL value={c.realizedPnl} formatted={usd(c.realizedPnl)} />
                        </td>
                        <td className="tabular px-3 py-2">{usd(c.fees)}</td>
                      </tr>
                    ))}
                  </DataTable>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="Post-Loss Size Escalation"
                  subtitle="Descriptive statistical observation — not a claim about psychology"
                />
                <p className="tabular text-xs text-ink-faint">
                  Baseline: {usd(report.postLossEscalation.baselineAvgOpeningNotional)} average opening notional across{" "}
                  {report.postLossEscalation.baselineTradeCount} trades
                </p>
                <div className="mt-3.5 space-y-2.5">
                  {report.postLossEscalation.afterN.map((x) => {
                    const ratio = x.ratioVsBaseline ? Number(x.ratioVsBaseline) : null;
                    const width = ratio ? Math.min(100, ratio * 33) : 0;
                    return (
                      <div key={x.consecutiveLosses}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-ink-dim">
                            after {x.consecutiveLosses} consecutive loss{x.consecutiveLosses === "1" ? "" : "es"}
                          </span>
                          <span className="tabular text-ink">
                            {usd(x.avgOpeningNotional)}
                            <span className="ml-2 text-[10px] text-ink-faint">
                              {x.ratioVsBaseline ? `${Number(x.ratioVsBaseline).toFixed(2)}× · n=${x.sampleSize}` : `n=${x.sampleSize}`}
                            </span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-warn/60 to-bear/80"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-faint">
                  {report.postLossEscalation.framing}
                </p>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Fee drag" subtitle="Where costs ate the edge" />
                <div className="space-y-2.5 text-[13px] text-ink-dim">
                  <p className="tabular">
                    Total fees: <span className="font-medium text-ink">{usd(report.feeDrag.totalFees)}</span>
                  </p>
                  <p className="tabular">
                    Fees as % of gross profit:{" "}
                    <span className="font-medium text-ink">{pct(report.feeDrag.feesAsPctOfGrossProfit)}</span>
                  </p>
                  <p className="tabular">
                    Winning trades paying &gt;30% of profit in fees:{" "}
                    <span className="font-medium text-ink">
                      {report.feeDrag.winnersWithFeeOver30Pct} of {report.feeDrag.winnerCount}
                    </span>
                  </p>
                  <p className="tabular text-xs text-ink-faint">
                    Sample: {report.overview.tradeCount} completed trades · evidence {report.feeDrag.evidenceId}
                  </p>
                </div>
              </Card>
              <Card>
                <CardHeader title="Activity & timing (UTC)" subtitle="When the wallet actually traded" />
                <div className="space-y-2.5 text-[13px] text-ink-dim">
                  <p className="tabular">
                    Active days: <span className="font-medium text-ink">{report.activity.activeDays}</span> ·
                    trades/active day: <span className="font-medium text-ink">{Number(report.activity.tradesPerActiveDay).toFixed(1)}</span>
                  </p>
                  <p className="tabular">
                    Busiest day:{" "}
                    <span className="font-medium text-ink">{report.activity.topDays[0]?.dateUtc ?? "—"}</span> (
                    {report.activity.topDays[0]?.count ?? 0} trades)
                  </p>
                  <p className="tabular">
                    Best hour:{" "}
                    <span className="font-medium text-ink">{report.hours.bestKey ? `${report.hours.bestKey}:00` : "—"}</span> ·
                    worst:{" "}
                    <span className="font-medium text-ink">{report.hours.worstKey ? `${report.hours.worstKey}:00` : "—"}</span>
                  </p>
                  <p className="tabular">
                    Best weekday: <span className="font-medium text-ink">{report.weekdays.bestKey ?? "—"}</span> · worst:{" "}
                    <span className="font-medium text-ink">{report.weekdays.worstKey ?? "—"}</span>
                  </p>
                  <p className="tabular text-xs text-ink-faint">
                    Size creep across weeks:{" "}
                    {report.sizeCreep.changePct === null ? "—" : `${Number(report.sizeCreep.changePct).toFixed(1)}% (first vs second half)`}
                  </p>
                </div>
              </Card>
            </div>

            {/* Scope disclosure */}
            <Card>
              <CardHeader title="Scope & limitations" subtitle="What this analysis does and does not cover" />
              <ul className="space-y-2 text-xs leading-relaxed text-ink-dim">
                {report.scopeDisclosure.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-ink-faint">•</span>
                    <span>{s}</span>
                  </li>
                ))}
                {report.associatedAccounts && report.associatedAccounts.length > 0 && (
                  <li className="flex gap-2">
                    <span className="text-ink-faint">•</span>
                    <span className="font-mono text-[11px]">
                      Associated accounts (context only, not merged): {report.associatedAccounts.slice(0, 3).join(", ")}
                    </span>
                  </li>
                )}
              </ul>
            </Card>

            {/* Chat */}
            <Card>
              <CardHeader
                title="Ask about this report"
                subtitle="Answers are grounded in the stored report — the assistant cannot invent numbers."
              />
              <div className="max-h-72 space-y-3 overflow-y-auto">
                {chat.length === 0 && (
                  <p className="text-xs text-ink-faint">
                    Try: &ldquo;How much did fees cost?&rdquo; · &ldquo;What is the win rate?&rdquo; · &ldquo;Does size
                    escalate after losses?&rdquo;
                  </p>
                )}
                {chat.map((m, i) => (
                  <div
                    key={i}
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      m.role === "user"
                        ? "ml-auto bg-accent-soft text-ink"
                        : "border border-line bg-bg-2/70 text-ink-dim"
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
                {chatBusy && <ThinkingDots className="text-ink-faint" />}
              </div>
              <form onSubmit={sendChat} className="mt-4 flex gap-2">
                <TextInput
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask a follow-up question…"
                  aria-label="Chat message"
                />
                <Button type="submit" disabled={chatBusy || !chatInput.trim() || !reportId}>
                  Send
                </Button>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {!report && !busy && !error && (
        <Card className="halo py-14 text-center">
          <p className="text-sm font-semibold text-ink">Paste an address to begin</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-faint">
            The engine walks the wallet&apos;s complete available fill, funding and ledger history,
            reconstructs trades per coin, separates cash flows from trading PnL, and computes every
            metric in deterministic code — with honest coverage badges throughout.
          </p>
        </Card>
      )}
    </div>
  );
}

function StaggerGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
