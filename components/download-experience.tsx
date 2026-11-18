"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Reveal } from "@/components/motion";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui";
import { brand } from "@/lib/brand";

/*
 * BUEL Desktop download experience.
 *
 * OS detection only HIGHLIGHTS the recommended installer — it never triggers
 * a download. All four release assets, their sizes and SHA-256 checksums come
 * from the published v1.0.0 GitHub Release (verified against SHA256SUMS.txt).
 */

type OS = "windows" | "mac" | "other";

function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Windows NT/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  return "other";
}

const INSTALLERS = {
  windowsExe: {
    label: "BUEL Setup for Windows",
    file: "BUEL-Windows-x64-setup.exe",
    url: brand.desktop.windowsSetup,
    size: "1.9 MB",
    sha256: "c4bcaab3c633386c26b7e373a5f916e741d40e89c56711c1b8a2143bd1ab177a",
  },
  windowsMsi: {
    label: "BUEL Windows MSI installer",
    file: "BUEL-Windows-x64.msi",
    url: brand.desktop.windowsMsi,
    size: "3.0 MB",
    sha256: "2fdce63b9a5fb044c967defde921732fd603a276c8f1b0612385caa841643e24",
  },
  macApple: {
    label: "BUEL for Apple Silicon",
    file: "BUEL-macOS-AppleSilicon.dmg",
    url: brand.desktop.macAppleSilicon,
    size: "2.9 MB",
    sha256: "74c3f5e6fd544e130c6e48225d6d907af207cba8ec885db1da427aa85aacb981",
  },
  macIntel: {
    label: "BUEL for Intel Macs",
    file: "BUEL-macOS-Intel.dmg",
    url: brand.desktop.macIntel,
    size: "3.0 MB",
    sha256: "0ec98dee99b20ffebbecd80249c864c7e8af4993cccadaa30299530b39c6bb3e",
  },
};

const BENEFITS = [
  {
    title: "A dedicated window for the workspace",
    body: "BUEL runs in its own native application window — no browser tabs competing for attention, no lost sessions.",
  },
  {
    title: "Your session stays put",
    body: "The desktop app keeps you signed in across restarts on the same device, opening straight back into your workspace.",
  },
  {
    title: "The complete BUEL platform",
    body: "Every module — Agent Council, Wallet Forensics, Decision Ledger, Scenario Lab, Paper Trading — is the same evidence-backed workspace.",
  },
  {
    title: "Paper-trading safety, unchanged",
    body: "The desktop app is strictly paper-trading. There are no real-money endpoints, and none of your credentials live on your device.",
  },
];

export function DownloadExperience() {
  const [os, setOs] = useState<OS>("other");
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    setOs(detectOS());
    setDetected(true);
  }, []);

  const recommended = INSTALLERS.windowsExe;

  const osLabel = os === "windows" ? "Windows 10 / 11 · 64-bit" : os === "mac" ? "macOS 12+ · Apple Silicon & Intel" : "Windows & macOS";

  return (
    <main className="relative overflow-x-clip">
      {/* ------------------------------- Hero ----------------------------- */}
      <section className="relative flex min-h-[92svh] flex-col justify-center overflow-hidden px-5 pt-28 pb-16 text-center">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="drift absolute -left-32 top-24 h-80 w-80 rounded-full bg-accent/8 blur-3xl" aria-hidden />
        <div className="drift absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-violet/8 blur-3xl" style={{ animationDelay: "-6s" }} aria-hidden />

        <div className="relative mx-auto max-w-3xl">
          <Reveal>
            <Badge tone="neutral" mono>
              BUEL DESKTOP · V{brand.desktop.version.toUpperCase()}
            </Badge>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-5 font-display text-[clamp(2.6rem,7vw,5.2rem)] font-bold leading-[1.02] tracking-tight">
              BUEL, beyond the browser.
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-ink-dim md:text-[15px]">
              BUEL Desktop brings the same evidence-backed market-intelligence
              workspace into a dedicated native window — same account, same
              sessions, same paper-trading safety. No browser tabs. No lost
              workspace.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <a
                href={recommended.url}
                className="rounded-full bg-accent-strong px-8 py-3.5 text-sm font-semibold text-[#032129] transition-all hover:bg-accent hover:shadow-[0_0_30px_rgba(63,225,255,0.4)]"
              >
                Download BUEL for {os === "mac" ? "macOS" : "Windows"}
              </a>
              <a
                href="#downloads"
                className="rounded-full border border-line-strong px-8 py-3.5 text-sm font-medium text-ink-dim transition-colors hover:border-accent/40 hover:text-ink"
              >
                All installers
              </a>
            </div>
            <div className="mt-6 flex items-center justify-center gap-2.5 text-xs text-ink-faint">
              <span className={os === "windows" ? "text-ink" : ""}>Windows 10 / 11</span>
              <span aria-hidden>·</span>
              <span className={os === "mac" ? "text-ink" : ""}>macOS 12+ (Apple Silicon &amp; Intel)</span>
              <span aria-hidden>·</span>
              <span>{brand.desktop.version.toUpperCase()}</span>
            </div>
          </Reveal>
        </div>

        {/* Desktop-window product showcase */}
        <Reveal delay={0.1} className="relative mx-auto mt-16 w-full max-w-5xl px-5">
          <div className="absolute -inset-8 -z-10 rounded-[40px] bg-accent/6 blur-3xl" aria-hidden />
          <div className="overflow-hidden rounded-[18px] border border-line-strong bg-[#101318] shadow-[0_50px_120px_-40px_rgba(0,0,0,0.9)]">
            <div className="flex items-center gap-2 border-b border-line bg-[#141820] px-4 py-2.5">
              <span className="h-3 w-3 rounded-full bg-[#3a414d]" aria-hidden />
              <span className="h-3 w-3 rounded-full bg-[#3a414d]" aria-hidden />
              <span className="h-3 w-3 rounded-full bg-[#3a414d]" aria-hidden />
              <span className="ml-3 font-mono text-[11px] text-ink-faint">BUEL — Command Center</span>
              <Badge tone="warn" mono className="ml-auto">
                PAPER TRADING ONLY
              </Badge>
            </div>
            <Image
              src="/showcases/06-command-center.png"
              alt="The BUEL Command Center running inside the BUEL Desktop application window"
              width={1440}
              height={900}
              className="block w-full"
              priority
            />
          </div>
        </Reveal>
      </section>

      {/* ------------------------- Downloads (per OS) ----------------------- */}
      <section id="downloads" className="relative border-t border-line px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <Badge tone="neutral" mono>
              INSTALLERS · SIGNED-FREE RELEASE
            </Badge>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-4xl">
              Choose your installer
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-dim">
              Every installer is built from the same v{brand.desktop.version} release and
              published with SHA-256 checksums. Downloads never require a GitHub account.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {/* Windows */}
            <Reveal className="h-full">
              <div
                className={`relative flex h-full flex-col rounded-2xl border bg-surface/70 p-7 transition-colors ${
                  detected && os === "windows"
                    ? "border-accent/50 shadow-[0_0_40px_-12px_rgba(63,225,255,0.35)]"
                    : "border-line hover:border-line-strong"
                }`}
              >
                {detected && os === "windows" && (
                  <span className="absolute -top-3 right-6 rounded-full border border-accent/40 bg-bg px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                    Recommended for your system
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Windows</h3>
                  <span className="text-xs text-ink-faint">Windows 10 / 11 · 64-bit</span>
                </div>
                <div className="mt-5 space-y-2.5">
                  <a
                    href={INSTALLERS.windowsExe.url}
                    className="block rounded-lg border border-line bg-bg-2/60 px-4 py-3 transition-colors hover:border-accent/40"
                    download
                  >
                    <span className="block text-sm font-medium text-ink">{INSTALLERS.windowsExe.label}</span>
                    <span className="mt-1 block text-[11px] text-ink-faint">
                      .exe · {INSTALLERS.windowsExe.size} · recommended
                    </span>
                  </a>
                  <a
                    href={INSTALLERS.windowsMsi.url}
                    className="block rounded-lg border border-line bg-bg-2/60 px-4 py-3 transition-colors hover:border-accent/40"
                    download
                  >
                    <span className="block text-sm font-medium text-ink">{INSTALLERS.windowsMsi.label}</span>
                    <span className="mt-1 block text-[11px] text-ink-faint">
                      .msi · {INSTALLERS.windowsMsi.size} · for managed deployments
                    </span>
                  </a>
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
                  SHA-256 <span className="font-mono">{INSTALLERS.windowsExe.sha256.slice(0, 26)}…</span>
                </p>
              </div>
            </Reveal>

            {/* macOS */}
            <Reveal delay={0.08} className="h-full">
              <div
                className={`relative flex h-full flex-col rounded-2xl border bg-surface/70 p-7 transition-colors ${
                  detected && os === "mac"
                    ? "border-accent/50 shadow-[0_0_40px_-12px_rgba(63,225,255,0.35)]"
                    : "border-line hover:border-line-strong"
                }`}
              >
                {detected && os === "mac" && (
                  <span className="absolute -top-3 right-6 rounded-full border border-accent/40 bg-bg px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                    Recommended for your system
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">macOS</h3>
                  <span className="text-xs text-ink-faint">macOS 12 or newer</span>
                </div>
                <div className="mt-5 space-y-2.5">
                  <a
                    href={INSTALLERS.macApple.url}
                    className="block rounded-lg border border-line bg-bg-2/60 px-4 py-3 transition-colors hover:border-accent/40"
                    download
                  >
                    <span className="block text-sm font-medium text-ink">{INSTALLERS.macApple.label}</span>
                    <span className="mt-1 block text-[11px] text-ink-faint">
                      .dmg · {INSTALLERS.macApple.size} · M1–M4 (2020 and newer)
                    </span>
                  </a>
                  <a
                    href={INSTALLERS.macIntel.url}
                    className="block rounded-lg border border-line bg-bg-2/60 px-4 py-3 transition-colors hover:border-accent/40"
                    download
                  >
                    <span className="block text-sm font-medium text-ink">{INSTALLERS.macIntel.label}</span>
                    <span className="mt-1 block text-[11px] text-ink-faint">
                      .dmg · {INSTALLERS.macIntel.size} · Intel-based Macs
                    </span>
                  </a>
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
                  Not sure which Mac you have?  Apple menu → About This Mac: “Chip: Apple
                  M1/M2/M3/M4” → Apple Silicon; “Processor: Intel …” → Intel.
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                  SHA-256 <span className="font-mono">{INSTALLERS.macApple.sha256.slice(0, 26)}…</span>
                </p>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <p className="mt-6 text-xs text-ink-faint">
              Verify your download with{" "}
              <a href={brand.desktop.checksums} className="text-accent hover:underline">
                SHA256SUMS.txt
              </a>{" "}
              — every installer above is listed with its full SHA-256 digest. Downloads
              never require a GitHub account.
            </p>
          </Reveal>
        </div>
      </section>

      {/* --------------------------- Installation --------------------------- */}
      <section className="relative border-t border-line px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <Badge tone="neutral" mono>
              INSTALLATION
            </Badge>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-4xl">
              Up and running in three steps
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Reveal className="h-full">
              <div className="h-full rounded-2xl border border-line bg-surface/70 p-7">
                <h3 className="text-lg font-semibold">Windows</h3>
                <ol className="mt-5 space-y-3 text-sm leading-relaxed text-ink-dim">
                  <li className="flex gap-3">
                    <span className="text-accent">1.</span> Run the downloaded{" "}
                    <span className="font-mono text-xs text-ink">BUEL-Windows-x64-setup.exe</span>.
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">2.</span> Follow the installer — a Start-menu
                    shortcut is created automatically.
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">3.</span> Launch BUEL and sign in with email
                    code, Google, wallet or passkey.
                  </li>
                </ol>
                <p className="mt-5 text-[11px] leading-relaxed text-ink-faint">
                  Enterprise environments can deploy the{" "}
                  <a href={INSTALLERS.windowsMsi.url} className="text-ink-dim hover:text-ink">
                    MSI installer
                  </a>{" "}
                  through standard management tools.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.08} className="h-full">
              <div className="h-full rounded-2xl border border-line bg-surface/70 p-7">
                <h3 className="text-lg font-semibold">macOS</h3>
                <ol className="mt-5 space-y-3 text-sm leading-relaxed text-ink-dim">
                  <li className="flex gap-3">
                    <span className="text-accent">1.</span> Open the .dmg for your Mac
                    (Apple Silicon or Intel) and drag BUEL into Applications.
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">2.</span> First launch: right-click BUEL →
                    Open, then confirm — see the note below.
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">3.</span> Sign in and your workspace opens
                    exactly as it does in the browser.
                  </li>
                </ol>
                <p className="mt-5 text-[11px] leading-relaxed text-ink-faint">
                  Not sure which installer? Apple menu → About This Mac: “Chip: Apple M1/M2/M3/M4”
                  → Apple Silicon build; “Processor: Intel …” → Intel build.
                </p>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <div className="mt-8 rounded-2xl border border-bear/25 bg-bear-soft/20 p-6">
              <h3 className="text-sm font-semibold text-ink">About the unsigned builds</h3>
              <p className="mt-2 text-xs leading-relaxed text-ink-dim">
                BUEL Desktop installers are not code-signed yet. Windows SmartScreen and macOS
                Gatekeeper may ask for confirmation on first launch — this is expected for
                unsigned software and will change once official signing certificates are
                configured. The installers are built directly from the public{" "}
                <a href={brand.desktop.repo} className="text-ink-dim hover:text-ink">
                  BUEL repository
                </a>{" "}
                by GitHub Actions, and every build is published with SHA-256 checksums so you
                can verify what you run.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-ink-dim">
                BUEL Desktop requires an internet connection — the intelligence workspace runs
                on BUEL&apos;s servers and no market data is stored locally.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------- Benefits ----------------------------- */}
      <section className="relative border-t border-line px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <Badge tone="neutral" mono>
              WHY DESKTOP
            </Badge>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-4xl">
              The same intelligence, always one click away
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {BENEFITS.map((b, i) => (
              <Reveal key={b.title} delay={i * 0.06} className="h-full">
                <div className="h-full rounded-2xl border border-line bg-surface/50 p-6">
                  <h3 className="text-base font-semibold text-ink">{b.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-ink-dim">{b.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------- Release info --------------------------- */}
      <section className="relative border-t border-line px-5 py-20">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <Badge tone="neutral" mono>
              RELEASE NOTES · V{brand.desktop.version.toUpperCase()}
            </Badge>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-4xl">
              Version {brand.desktop.version}
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <ul className="mt-6 space-y-2 text-sm leading-relaxed text-ink-dim">
              <li>• Initial desktop release — the complete BUEL workspace in a native window.</li>
              <li>• Privy authentication (email code, Google, wallet, passkey) inside the desktop window.</li>
              <li>• Server-side session persistence across app restarts on the same device.</li>
              <li>• External links open in your default browser; untrusted navigation is blocked.</li>
              <li>• Offline detection with a retry connection screen.</li>
            </ul>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="mt-8 overflow-hidden rounded-2xl border border-line">
              <div className="border-b border-line bg-surface-2/70 px-5 py-3">
                <p className="font-mono text-xs text-ink-dim">SHA256SUMS.txt</p>
              </div>
              <div className="space-y-1.5 bg-[#0d1016] px-5 py-4 font-mono text-[11px] leading-relaxed text-ink-faint">
                {Object.values(INSTALLERS).map((i) => (
                  <p key={i.file} className="break-all">
                    <span className="text-ink-dim">{i.sha256}</span> {i.file}
                  </p>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 text-xs text-ink-faint">
              Download any installer above and compare it with the digests here, or fetch{" "}
              <a href={brand.desktop.checksums} className="text-accent hover:underline">
                SHA256SUMS.txt
              </a>{" "}
              directly from the release. File sizes: {INSTALLERS.windowsExe.size} (exe) ·{" "}
              {INSTALLERS.windowsMsi.size} (msi) · {INSTALLERS.macApple.size} (Apple Silicon dmg) ·{" "}
              {INSTALLERS.macIntel.size} (Intel dmg).
            </p>
          </Reveal>
        </div>
      </section>

      {/* --------------------------- Closing CTA ---------------------------- */}
      <section className="relative border-t border-line px-5 py-24 text-center">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <Logo size={64} tone="light" className="mx-auto" />
            <h2 className="mt-8 font-display text-3xl font-bold tracking-tight md:text-4xl">
              Ready for BUEL Desktop?
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-ink-dim">
              Download the desktop app, or open the same workspace in your browser —
              both share your account.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <a
                href={recommended.url}
                className="rounded-full bg-accent-strong px-8 py-3.5 text-sm font-semibold text-[#032129] transition-all hover:bg-accent hover:shadow-[0_0_30px_rgba(63,225,255,0.4)]"
              >
                Download BUEL for {os === "mac" ? "macOS" : "Windows"}
              </a>
              <Link
                href="/auth"
                className="rounded-full border border-line-strong px-8 py-3.5 text-sm font-medium text-ink-dim transition-colors hover:border-accent/40 hover:text-ink"
              >
                Open the web workspace
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

export default DownloadExperience;
