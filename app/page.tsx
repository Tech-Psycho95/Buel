import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Logo } from "@/components/logo";
import { GraphTeaser } from "@/components/landing/graph-teaser";
import { HeroVisual } from "@/components/landing/hero-visual";
import { PipelineStories } from "@/components/landing/pipeline-stages";
import { CouncilMap } from "@/components/landing/council-map";
import { ForensicsBoard } from "@/components/landing/forensics-board";

/*
 * BUEL — public landing.
 *
 * Identity: an institutional intelligence terminal rendered as award-level
 * editorial storytelling. Original canvas visualization (orbiting agents +
 * evidence particles), oversized stacked typography, floating product chips,
 * scalloped section dividers, full-width compositions. Every number shown is
 * LABELED illustrative demo data — no invented track records. Informational
 * only, not financial advice.
 */

const TICKER: Array<[string, number, number]> = [
  ["BTC", 104250.5, 2.4],
  ["ETH", 3980.2, 1.1],
  ["SOL", 214.5, -0.8],
  ["ARB", 0.862, 3.6],
  ["AVAX", 41.2, -1.9],
  ["LINK", 26.41, 0.7],
  ["OP", 1.72, -2.4],
  ["DOGE", 0.312, 1.3],
  ["HYPE", 38.9, 5.2],
  ["TRUMP", 12.4, -3.1],
];

const PIPELINE = [
  { step: "01", name: "Detect", copy: "Market Pulse surfaces supported perps with price, funding, volume and freshness labels." },
  { step: "02", name: "Debate", copy: "Bull, Bear, Risk and Analyst agents publish independent, evidence-linked theses." },
  { step: "03", name: "Attack", copy: "The Red-Team tries to falsify the leading thesis and names what would invalidate it." },
  { step: "04", name: "Decide", copy: "A deterministic Judge weighs the council; the Quality Gate can refuse with plain-language reasons." },
  { step: "05", name: "Simulate", copy: "Paper execution with fees, slippage, stops and Guardian risk checks. No real orders, ever." },
  { step: "06", name: "Learn", copy: "Decisions land in an immutable ledger; replay and calibration show how they held up." },
];

const FAQ = [
  {
    q: "Does BUEL trade real money?",
    a: "Never. There is no wallet connection, no private keys, no broker credentials and no real-order endpoint anywhere in the product. All fills, balances and P&L are simulated.",
  },
  {
    q: "Can the AI invent numbers?",
    a: "No. Every statistic is computed by deterministic code. Narrative layers are constrained to cite only computed evidence, are schema-validated, and fall back to rules-based text if anything fails validation.",
  },
  {
    q: "What data does it use?",
    a: "The Hyperliquid public info API (no auth): market metadata, candle snapshots, and wallet fills/funding/ledger history for the Wallet Forensics module. When the API is unavailable, clearly labeled deterministic demo data is shown instead.",
  },
  {
    q: "Does it predict prices?",
    a: "No. BUEL describes evidence, arguments and past behavior. Historical analogues in Market Memory are context, never predictions. Nothing here is financial advice.",
  },
  {
    q: "Why does it sometimes say NO TRADE?",
    a: "Because that is the honest output. When evidence is thin, agents disagree, data is stale, or risk limits bind, the Quality Gate refuses conviction — and explains exactly why.",
  },
];

/** Zeentra-style scalloped divider between sections. */
function Scallop({ bg, flip = false }: { bg: string; flip?: boolean }) {
  return (
    <div
      aria-hidden
      className={`scallop ${flip ? "scallop-up" : "scallop-down"} w-full`}
      style={{ "--scalloped-bg": bg } as React.CSSProperties}
    />
  );
}

export default function LandingPage() {
  return (
    <main className="relative overflow-x-clip">
      {/* ------------- Header: brand anchor | centered nav | actions ------------- */}
      <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 px-5 py-4 md:px-6 md:py-6 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-4 xl:px-10">
        <Link
          href="/"
          className="flex items-center justify-self-start"
          aria-label="BUEL home"
        >
          <Logo variant="lockup" size={40} tone="light" />
        </Link>

        <nav className="hidden justify-self-center items-center gap-1 rounded-full border border-line-strong bg-surface/70 py-1.5 px-1 text-[13px] text-ink-dim shadow-[0_18px_50px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl md:flex">
          <a href="#pipeline" className="rounded-full px-2.5 py-1.5 transition-colors hover:bg-surface-3 hover:text-ink lg:px-3">
            Pipeline
          </a>
          <a href="#council" className="rounded-full px-2.5 py-1.5 transition-colors hover:bg-surface-3 hover:text-ink lg:px-3">
            Agent Council
          </a>
          <a href="#forensics" className="rounded-full px-2.5 py-1.5 transition-colors hover:bg-surface-3 hover:text-ink lg:px-3">
            Forensics
          </a>
          <a href="#trust" className="rounded-full px-2.5 py-1.5 transition-colors hover:bg-surface-3 hover:text-ink lg:px-3">
            Trust
          </a>
          <a href="#faq" className="rounded-full px-2.5 py-1.5 transition-colors hover:bg-surface-3 hover:text-ink lg:px-3">
            FAQ
          </a>
        </nav>

        <div className="flex items-center gap-2.5 justify-self-end">
          <Link href="/auth" className="hidden whitespace-nowrap px-3 py-1.5 text-[13px] text-ink-dim transition-colors hover:text-ink sm:block">
            Log in
          </Link>
          <Link
            href="/auth"
            className="whitespace-nowrap rounded-full bg-accent-strong px-4.5 py-2 text-[13px] font-semibold text-[#032129] transition-all hover:bg-accent hover:shadow-[0_0_22px_rgba(63,225,255,0.35)]"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* --------------------------- HERO (100svh) --------------------------- */}
      <section className="relative flex min-h-[100svh] flex-col overflow-hidden">
        <div className="grid-bg absolute inset-0" aria-hidden />
        {/* ambient orbs */}
        <div className="drift absolute -left-40 top-24 h-96 w-96 rounded-full bg-accent/7 blur-3xl" aria-hidden />
        <div className="drift absolute -right-32 bottom-10 h-96 w-96 rounded-full bg-violet/7 blur-3xl" style={{ animationDelay: "-8s" }} aria-hidden />
        {/* living intelligence visualization */}
        <HeroVisual />
        {/* Depth scrim: dims the ecosystem inside the editorial text band so
            labels and nodes never compete with headline glyphs. The scene
            stays fully visible around the text. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{
            background:
              "radial-gradient(ellipse 46% 42% at 50% 46%, rgba(4,6,11,0.92) 28%, rgba(4,6,11,0.4) 62%, rgba(4,6,11,0) 76%)",
          }}
        />

        {/* floating product chips (desktop) */}
        <div className="float-y absolute right-[8%] top-[16%] z-10 hidden xl:block" aria-hidden>
          <div className="rounded-xl border border-line-strong bg-surface/80 px-3.5 py-2.5 shadow-2xl backdrop-blur">
            <p className="font-mono text-[9px] text-ink-faint">GATE · 6/6 checks</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-bull">
              LONG <span className="text-[10px] font-normal text-ink-faint">BTC · 72%</span>
            </p>
          </div>
        </div>
        <div className="float-y-slow absolute left-[6%] top-[22%] z-10 hidden xl:block" aria-hidden>
          <div className="rounded-xl border border-line-strong bg-surface/80 px-3.5 py-2.5 shadow-2xl backdrop-blur">
            <p className="font-mono text-[9px] text-ink-faint">RED-TEAM</p>
            <p className="mt-0.5 text-xs font-medium text-redteam">HIGH severity · challenged</p>
          </div>
        </div>
        <div className="float-y absolute bottom-[26%] right-[14%] z-10 hidden xl:block" style={{ animationDelay: "-3.5s" }} aria-hidden>
          <div className="rounded-xl border border-line-strong bg-surface/80 px-3.5 py-2.5 shadow-2xl backdrop-blur">
            <p className="font-mono text-[9px] text-ink-faint">NET TRADING PNL</p>
            <p className="tabular mt-0.5 text-sm font-semibold text-bull">+$1,505.92</p>
          </div>
        </div>

        {/* Editorial lockup */}
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 pb-[16svh] pt-[18svh] text-center">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface/60 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-accent backdrop-blur">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              Autonomous market intelligence
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="hero-line mt-8 text-[clamp(2.2rem,10.5vw,8.5rem)] text-ink">
              <span className="block">Intelligence</span>
              <span className="text-outline block">beyond the</span>
              <span className="grad-text block">signal.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-ink-dim md:text-lg">
              An autonomous market-intelligence workspace that investigates, challenges, and
              evaluates market decisions through evidence-backed AI agents — with a deterministic
              judge, an adversarial red-team, and paper-only simulation.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/auth"
                className="rounded-full bg-accent-strong px-7 py-3.5 text-sm font-semibold text-[#032129] transition-all hover:bg-accent hover:shadow-[0_0_30px_rgba(63,225,255,0.4)]"
              >
                Get started
              </Link>
              <Link
                href="/auth"
                className="rounded-full border border-line-strong px-7 py-3.5 text-sm font-medium text-ink-dim transition-colors hover:border-accent/40 hover:text-ink"
              >
                Log in
              </Link>
            </div>
            <p className="mt-5 text-xs text-ink-faint">
              Free workspace · no wallet connection · no keys · informational only
            </p>
          </Reveal>
        </div>

        {/* Ticker strip at the fold */}
        <div className="relative z-10 mt-10 border-y border-line bg-bg/60 py-2.5 backdrop-blur-sm" aria-hidden>
          <div className="marquee-track-slow flex w-max items-center gap-8 px-6">
            {[...TICKER, ...TICKER].map(([sym, px, chg], i) => (
              <span key={i} className="flex items-center gap-2 whitespace-nowrap font-mono text-[11px]">
                <span className="font-semibold text-ink-dim">{sym}</span>
                <span className="tabular text-ink">
                  ${px.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
                <span className={chg >= 0 ? "text-bull" : "text-bear"}>
                  {chg >= 0 ? "▲" : "▼"} {Math.abs(chg)}%
                </span>
                <span className="text-ink-faint/50">·</span>
              </span>
            ))}
          </div>
          <p className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[8px] text-ink-faint sm:block">
            DEMO DATA
          </p>
        </div>
      </section>

      {/* -------------------- Giant marquee + scallop ------------------------ */}
      <div aria-hidden>
        <Scallop bg="#04060b" />
        <div className="overflow-hidden border-b border-line bg-bg-2 py-5">
          <div className="marquee-track flex w-max items-center gap-10">
            {[...Array(2)].map((_, dup) => (
              <span key={dup} className="flex items-center gap-10 whitespace-nowrap">
                {["EVIDENCE-LED", "PAPER-ONLY", "ADVERSARIAL", "DETERMINISTIC", "REPLAYABLE"].map((w) => (
                  <span key={w} className="font-display flex items-center gap-10 text-3xl font-bold uppercase tracking-tight text-ink/12 md:text-5xl">
                    {w}
                    <span className="text-accent/50">✦</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
        <Scallop bg="#04060b" flip />
      </div>

      {/* ----------------------------- Pipeline ----------------------------- */}
      <section id="pipeline" className="scroll-mt-24 py-24">
        <Reveal>
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-accent/90">
            The decision pipeline
          </p>
          <h2 className="font-display mx-auto mt-4 max-w-3xl text-center text-4xl font-bold tracking-tight md:text-6xl">
            Computed. Staged.
            <br />
            <span className="text-outline-accent">Impossible to fake.</span>
          </h2>
        </Reveal>
<PipelineStories />
      </section>

      {/* ------------------------- Agent Council ------------------------- */}
      <section id="council" className="scroll-mt-24 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-accent/90">
              Agent council
            </p>
            <h2 className="font-display mt-4 text-center text-4xl font-bold tracking-tight md:text-6xl">
              Four voices. <span className="text-outline-accent">One verdict.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-relaxed text-ink-dim">
              Independent theses, measured disagreement, an adversarial pass, and a deterministic
              verdict — the full council on one map. Hover any node to trace its evidence; the flow
              is an illustrative trace of the real pipeline.
            </p>
          </Reveal>
          <Reveal delay={0.12} className="mt-10">
            <CouncilMap />
          </Reveal>
        </div>
      </section>

      {/* ------------------------- Wallet Forensics ------------------------- */}
      <section id="forensics" className="scroll-mt-24">
        <Scallop bg="#060911" flip />
        <div className="relative bg-bg-2 py-24">
          <div className="grid-bg absolute inset-0" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-5">
            <Reveal>
              <p className="text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-accent/90">
                Wallet forensics
              </p>
              <h2 className="font-display mx-auto mt-4 max-w-3xl text-center text-4xl font-bold tracking-tight md:text-6xl">
                Your wallet,
                <br />
                <span className="text-outline">audited in code.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.12} className="mt-12">
              <ForensicsBoard />
            </Reveal>
            <Reveal delay={0.2}>
              <div className="mt-10 text-center">
                <Link
                  href="/auth"
                  className="inline-flex rounded-full border border-accent/35 px-6 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
                >
                  Run a forensic analysis →
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
        <Scallop bg="#060911" />
      </section>

      {/* --------------------- Product showcases (real captures) -------------------- */}
      <section className="pb-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-accent/90">
              Product showcases
            </p>
            <h2 className="font-display mt-4 text-center text-4xl font-bold tracking-tight md:text-6xl">
              The actual product.
              <br />
              <span className="text-outline-accent">Not a mockup.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-relaxed text-ink-dim">
              Captures of the running application — every surface you see here is reachable in the
              workspace after sign-up. Demo data is labeled on-screen.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mt-14 [perspective:1600px]">
              <div className="mx-auto max-w-4xl overflow-hidden rounded-[16px] border border-line-strong shadow-[0_60px_120px_-40px_rgba(0,0,0,0.9)] transition-transform duration-500 hover:[transform:rotateX(0deg)_scale(1.01)] [transform:rotateX(10deg)]">
                <div className="flex items-center gap-2 border-b border-line bg-surface-2/80 px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-bear/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-bull/70" />
                  <span className="ml-2 font-mono text-[10px] text-ink-faint">buel · command center</span>
                  <Badge tone="accent" mono className="ml-auto">LIVE PRODUCT</Badge>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/showcases/06-command-center.png" alt="BUEL Command Center" className="block w-full" loading="lazy" />
              </div>
            </div>
          </Reveal>

          <Stagger className="mt-6 grid gap-4 md:grid-cols-2" gap={0.1}>
            <StaggerItem>
              <div className="group overflow-hidden rounded-[16px] border border-line transition-colors hover:border-line-strong">
                <div className="flex items-center gap-2 border-b border-line bg-surface-2/80 px-4 py-2">
                  <span className="font-mono text-[10px] text-ink-faint">wallet forensics</span>
                  <Badge tone="redteam" mono className="ml-auto">INVESTIGATION</Badge>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/showcases/09-forensics.png" alt="Wallet Forensics report" className="block w-full transition-transform duration-500 group-hover:scale-[1.02]" loading="lazy" />
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="group overflow-hidden rounded-[16px] border border-line transition-colors hover:border-line-strong">
                <div className="flex items-center gap-2 border-b border-line bg-surface-2/80 px-4 py-2">
                  <span className="font-mono text-[10px] text-ink-faint">agent council</span>
                  <Badge tone="analyst" mono className="ml-auto">COUNCIL RUN</Badge>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/showcases/07-agent-council.png" alt="Agent Council run" className="block w-full transition-transform duration-500 group-hover:scale-[1.02]" loading="lazy" />
              </div>
            </StaggerItem>
          </Stagger>

          <Stagger className="mt-4 grid gap-4 sm:grid-cols-2" gap={0.08}>
            {[
              ["12-evidence-graph", "evidence graph", "PROVENANCE"],
              ["08-paper-trading", "paper trading", "PAPER ONLY"],
              ["17-scenario-lab", "scenario lab", "HYPOTHETICAL"],
              ["18-market-pulse", "market pulse", "DEMO DATA"],
            ].map(([img, label, tag]) => (
              <StaggerItem key={img as string}>
                <div className="group overflow-hidden rounded-[14px] border border-line transition-colors hover:border-line-strong">
                  <div className="flex items-center gap-2 border-b border-line bg-surface-2/80 px-3 py-2">
                    <span className="font-mono text-[10px] text-ink-faint">{label as string}</span>
                    <Badge tone="neutral" mono className="ml-auto">{tag as string}</Badge>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/showcases/${img}.png`} alt={label as string} className="block h-48 w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]" loading="lazy" />
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* -------------------- Evidence graph teaser ------------------------- */}
      <section className="py-24">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal>
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-violet">
              Evidence graph
            </p>
            <h2 className="font-display mt-4 text-center text-4xl font-bold tracking-tight md:text-6xl">
              Trace every claim
              <br />
              <span className="grad-text">to its source.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <GraphTeaser />
          </Reveal>
        </div>
      </section>

      {/* ------------------------- Workspace bento -------------------------- */}
      <section className="pb-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <h2 className="font-display text-center text-4xl font-bold tracking-tight md:text-6xl">
              Sixteen destinations.
              <br />
              <span className="text-outline-accent">One discipline.</span>
            </h2>
          </Reveal>
          <Stagger className="mt-12 grid gap-3 md:grid-cols-6" gap={0.07}>
            <StaggerItem className="md:col-span-4 md:row-span-2">
              <Card className="relative h-full min-h-[260px] overflow-hidden" variant="elevated">
                <div className="grid-bg absolute inset-0" aria-hidden />
                <div className="relative">
                  <Badge tone="accent" mono>FLAGSHIP MODULE</Badge>
                  <h3 className="font-display mt-3 text-2xl font-semibold tracking-tight text-ink">Paper Trading</h3>
                  <p className="mt-2 max-w-md text-xs leading-relaxed text-ink-dim">
                    Simulated entries, exits, stops, sizing, fees and slippage with Portfolio
                    Guardian risk limits. Unmistakable paper indicators everywhere — and no
                    real-execution path by architecture.
                  </p>
                </div>
                <div className="relative mt-5 overflow-hidden rounded-xl border border-line bg-bg-2/80">
                  <div className="flex items-center justify-between border-b border-line px-3 py-2">
                    <span className="text-xs font-medium text-ink">BTC · LONG 0.05</span>
                    <Badge tone="warn" mono>PAPER</Badge>
                  </div>
                  <svg viewBox="0 0 600 120" className="h-24 w-full" preserveAspectRatio="none" aria-hidden>
                    <polyline
                      className="draw-line"
                      style={{ "--draw-len": 900 } as React.CSSProperties}
                      points="0,95 60,88 120,92 180,74 240,80 300,58 360,64 420,42 480,48 540,30 600,24"
                      fill="none"
                      stroke="#2fe0a2"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                <p className="relative mt-3 text-[9px] text-ink-faint">Illustrative demo data.</p>
              </Card>
            </StaggerItem>
            {[
              ["Scenario Lab", "Counterfactual shocks re-run through the identical pipeline — hypothetical, always labeled."],
              ["Portfolio Guardian", "Order size, concentration, leverage and daily-loss caps — every breach explained."],
              ["Strategy Arena", "Momentum, mean-reversion, breakout and defensive backtests with no look-ahead."],
              ["Market Memory", "Historical analogues over computed features — context, never predictions."],
              ["Performance Lab", "Calibration and precision with sample sizes on every metric."],
            ].map(([name, copy]) => (
              <StaggerItem key={name as string} className="md:col-span-2">
                <Card className="hover-lift h-full">
                  <p className="text-sm font-semibold text-ink">{name as string}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-dim">{copy as string}</p>
                </Card>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ------------------------------- Trust ------------------------------ */}
      <section id="trust" className="scroll-mt-24 pb-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <Card className="halo relative overflow-hidden p-8 md:p-12" variant="elevated">
              <div className="grid-bg absolute inset-0" aria-hidden />
              <div className="relative grid gap-10 md:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent/90">
                    Trust, security & transparency
                  </p>
                  <h2 className="font-display mt-4 text-3xl font-bold tracking-tight md:text-4xl">
                    Deterministic by construction.
                    <br />
                    <span className="text-ink-dim">Paper-only, permanently.</span>
                  </h2>
                  <p className="mt-5 text-sm leading-relaxed text-ink-dim">
                    Every number — wallet statistics, agent evidence, the Judge verdict, the gate
                    decision, paper fills — is computed in code with decimal-exact arithmetic.
                    Narrative layers may rephrase but never compute. There is no execution path: no
                    private keys, no signing, no broker connectivity — by architecture, not policy.
                  </p>
                </div>
                <div className="space-y-3 text-sm text-ink-dim">
                  {[
                    ["Hyperliquid public data", "No-auth public info API with TTL caches, weighted rate limiting and labeled demo fallback."],
                    ["Decimal-exact accounting", "All money math in decimal.js; string numbers parsed, never float-typed."],
                    ["Honest coverage", "Partial coverage is never dressed up as lifetime performance."],
                    ["Server-side security", "Hashed sessions, scrypt passwords, Origin validation, persistent rate limiting."],
                  ].map(([t, c]) => (
                    <div key={t} className="rounded-lg border border-line bg-bg-2/60 p-3.5">
                      <p className="text-xs font-semibold text-ink">{t}</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-dim">{c}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </Reveal>
        </div>
      </section>

      {/* -------------------------------- FAQ ------------------------------- */}
      <section id="faq" className="scroll-mt-24 pb-24">
        <div className="mx-auto max-w-3xl px-5">
          <Reveal>
            <h2 className="font-display text-center text-4xl font-bold tracking-tight md:text-5xl">
              FAQ
            </h2>
          </Reveal>
          <div className="mt-10 space-y-2.5">
            {FAQ.map((f) => (
              <Reveal key={f.q}>
                <details className="group rounded-[12px] border border-line bg-surface/80 px-5 py-4 transition-colors hover:border-line-strong">
                  <summary className="cursor-pointer select-none text-sm font-medium text-ink marker:content-none">
                    <span className="flex items-center justify-between">
                      {f.q}
                      <span className="text-ink-faint transition-transform group-open:rotate-45">+</span>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-ink-dim">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------- Final CTA ---------------------------- */}
      <section className="px-5 pb-16">
        <Reveal>
          <div className="halo relative mx-auto max-w-6xl overflow-hidden rounded-[24px] border border-accent/25 bg-gradient-to-br from-accent-strong/85 via-accent-strong/70 to-violet/60 px-8 py-20 text-center shadow-[0_40px_120px_-40px_rgba(16,179,217,0.45)]">
            <div className="grid-bg absolute inset-0 opacity-40" aria-hidden />
            <p className="relative text-[11px] font-semibold uppercase tracking-[0.24em] text-white/80">
              Your first step to evidence-backed decisions
            </p>
            <h2 className="font-display relative mt-4 text-4xl font-bold tracking-tight text-white md:text-6xl">
              Stop guessing.
              <br />
              Start auditing.
            </h2>
            <p className="relative mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/85">
              Create a free workspace, run your first council decision, and read the evidence
              behind every number. Paper trading only — your capital is never at risk here.
            </p>
            <Link
              href="/auth"
              className="relative mt-9 inline-flex rounded-full bg-white px-8 py-3.5 text-sm font-bold text-[#0a2540] transition-transform hover:scale-[1.03]"
            >
              Get started →
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ------------------------------- Footer ----------------------------- */}
      <footer className="border-t border-line px-5 py-12 text-center">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo variant="lockup" size={34} tone="light" />
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-ink-dim">
            <a href="#pipeline" className="hover:text-ink">Pipeline</a>
            <a href="#council" className="hover:text-ink">Agent Council</a>
            <a href="#forensics" className="hover:text-ink">Wallet Forensics</a>
            <a href="#trust" className="hover:text-ink">Trust & Method</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
            <Link href="/auth" className="hover:text-ink">Sign in</Link>
            <Link href="/auth" className="text-accent hover:underline">Get started</Link>
          </div>
          <p className="max-w-2xl text-[10px] leading-relaxed text-ink-faint">
            BUEL is informational only and is not financial advice. Nothing in this product is a
            recommendation to buy or sell any asset. All trading features are simulations; a
            backtest or paper result is not a performance guarantee. Market data via the Hyperliquid
            public API; demo data is always labeled.
          </p>
        </div>
      </footer>
    </main>
  );
}
