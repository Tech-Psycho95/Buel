# Landing page v3 wiring: hero visual, pipeline stories, council map, forensics board, showcases.
p = "app/page.tsx"
s = open(p, encoding="utf8").read()
changed = []

# --- imports ---
s = s.replace(
    'import { IntelCanvas } from "@/components/landing/intel-canvas";\nimport { GraphTeaser } from "@/components/landing/graph-teaser";',
    'import { GraphTeaser } from "@/components/landing/graph-teaser";\nimport { HeroVisual } from "@/components/landing/hero-visual";\nimport { PipelineStories } from "@/components/landing/pipeline-stages";\nimport { CouncilMap } from "@/components/landing/council-map";\nimport { ForensicsBoard } from "@/components/landing/forensics-board";'
)
changed.append("imports")

# --- hero: swap 2D canvas for the WebGL sculpture boundary ---
s = s.replace(
    "<IntelCanvas className=\"absolute inset-0 h-full w-full\" />",
    "<HeroVisual />",
)
changed.append("hero visual")

# --- pipeline: replace uniform cards with stage stories ---
old_pipeline = '''        <div className="relative mx-auto mt-16 max-w-5xl">
          <span className="absolute left-[27px] top-8 bottom-8 hidden w-px bg-gradient-to-b from-accent/40 via-line to-transparent md:block" aria-hidden />
          <Stagger className="space-y-3" gap={0.09}>
            {PIPELINE.map((p) => (
              <StaggerItem key={p.step}>
                <div className="group flex gap-5 rounded-[14px] border border-line bg-surface/70 p-5 transition-colors hover:border-line-strong hover:bg-surface-2/80 md:pl-8">
                  <span className="font-display grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent-soft text-base font-bold text-accent transition-shadow group-hover:shadow-[0_0_24px_rgba(63,225,255,0.2)]">
                    {p.step}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold tracking-tight text-ink">{p.name}</h3>
                    <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-dim">{p.copy}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>'''
if old_pipeline in s:
    s = s.replace(old_pipeline, "<PipelineStories />")
    changed.append("pipeline stories")
else:
    raise SystemExit("pipeline block not found")

# --- council: replace grid with full-width interactive map ---
old_council_start = s.find('      <section id="council" className="scroll-mt-24 py-24">')
old_council_end = s.find('      {/* ------------------------- Wallet Forensics ------------------------- */}')
if old_council_start == -1 or old_council_end == -1:
    raise SystemExit("council section markers not found")
new_council = '''      <section id="council" className="scroll-mt-24 py-24">
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

'''
s = s[:old_council_start] + new_council + s[old_council_end:]
changed.append("council map")

# --- forensics: replace metrics band with the investigation board ---
old_f_start = s.find("            <Reveal delay={0.1}>")
old_f_end = s.find("        <Scallop bg=\"#060911\" />")
if old_f_start == -1 or old_f_end == -1:
    raise SystemExit("forensics block markers not found")
new_f = '''            <Reveal delay={0.12} className="mt-12">
              <ForensicsBoard />
            </Reveal>
            <Reveal delay={0.2}>
              <div className="mt-10 text-center">
                <Link
                  href="/signup"
                  className="inline-flex rounded-full border border-accent/35 px-6 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
                >
                  Run a forensic analysis →
                </Link>
              </div>
            </Reveal>
'''
s = s[:old_f_start] + new_f + s[old_f_end:]
changed.append("forensics board")

# --- showcases: real product screenshots before the evidence teaser ---
showcase = '''      {/* --------------------- Product showcases (real captures) -------------------- */}
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
                  <span className="ml-2 font-mono text-[10px] text-ink-faint">sentisel · command center</span>
                  <Badge tone="accent" mono className="ml-auto">LIVE PRODUCT</Badge>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/showcases/06-command-center.png" alt="Sentisel Command Center" className="block w-full" loading="lazy" />
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
              ["evidence-graph", "evidence graph", "PROVENANCE"],
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
                  <img src={`/showcases/${img}.png`} alt={label as string} className="block w-full transition-transform duration-500 group-hover:scale-[1.02]" loading="lazy" />
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

'''
anchor = '      {/* -------------------- Evidence graph teaser ------------------------- */}'
if anchor in s:
    s = s.replace(anchor, showcase + anchor, 1)
    changed.append("showcases")
else:
    raise SystemExit("evidence teaser anchor not found")

open(p, "w", encoding="utf8", newline="\n").write(s)
print("changed:", changed)
