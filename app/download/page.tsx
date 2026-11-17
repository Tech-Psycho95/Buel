import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Download BUEL for Windows and macOS",
  description:
    "Download the official BUEL desktop application for Windows and macOS. Same evidence-backed intelligence, same accounts — in a native window.",
};

const DOWNLOADS = [
  {
    platform: "Windows",
    detail: "Windows 10 / 11 · 64-bit",
    primary: { label: "Download for Windows (.exe)", url: brand.desktop.windowsSetup },
    secondary: { label: "MSI installer", url: brand.desktop.windowsMsi },
    steps: [
      "Run the downloaded BUEL setup file.",
      "Follow the installer (a Start-menu shortcut is created).",
      "Launch BUEL and sign in — an internet connection is required.",
    ],
  },
  {
    platform: "macOS",
    detail: "Apple Silicon (M1–M4) and Intel Macs · macOS 12+",
    primary: { label: "Download for Apple Silicon (.dmg)", url: brand.desktop.macAppleSilicon },
    secondary: { label: "Download for Intel Mac (.dmg)", url: brand.desktop.macIntel },
    steps: [
      "Open the downloaded .dmg and drag BUEL into Applications.",
      "On first launch, right-click → Open (unsigned builds).",
      "Sign in — an internet connection is required.",
    ],
  },
];

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={30} tone="light" />
            <span className="text-[15px] font-semibold tracking-tight">BUEL</span>
          </Link>
          <Link href="/auth" className="rounded-full bg-accent-strong px-4.5 py-2 text-[13px] font-semibold text-[#032129] transition-all hover:bg-accent">
            Open the web app
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <Badge tone="neutral" mono>
          DESKTOP · V{brand.desktop.version.toUpperCase()}
        </Badge>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">
          BUEL for Windows and macOS
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-dim">
          The official BUEL desktop application connects to the same evidence-backed
          workspace as the web app — same account, same sessions, same paper-trading
          safety. It runs in a native window with no local installation of market data
          or credentials; <span className="text-ink">an internet connection is required</span>.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {DOWNLOADS.map((d) => (
            <div key={d.platform} className="rounded-2xl border border-line bg-surface/70 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{d.platform}</h2>
                <span className="text-xs text-ink-faint">{d.detail}</span>
              </div>
              <a
                href={d.primary.url}
                className="mt-4 block rounded-full bg-accent-strong px-5 py-2.5 text-center text-[13px] font-semibold text-[#032129] transition-all hover:bg-accent"
              >
                {d.primary.label}
              </a>
              <a href={d.secondary.url} className="mt-2 block text-center text-xs text-ink-dim hover:text-ink">
                {d.secondary.label}
              </a>
              <ol className="mt-5 space-y-1.5 text-xs leading-relaxed text-ink-dim">
                {d.steps.map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="text-ink-faint">•</span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-line bg-surface/50 p-6 text-xs leading-relaxed text-ink-dim">
          <h2 className="text-sm font-semibold text-ink">Version {brand.desktop.version} — release notes</h2>
          <ul className="mt-3 space-y-1.5">
            <li>• Initial desktop release: the complete BUEL workspace in a native window.</li>
            <li>• Privy authentication (email code, Google, wallet, passkey) inside the desktop window.</li>
            <li>• Server-side session persistence across app restarts on the same device.</li>
            <li>• External links open in your default browser; untrusted navigation is blocked.</li>
            <li>• Offline detection with a retry connection screen.</li>
          </ul>
          <p className="mt-4">
            Release history:{" "}
            <a href={brand.desktop.releasesUrl} className="text-accent hover:underline">
              github.com/Tech-Psycho95/Buel/releases
            </a>
          </p>
        </div>

        <p className="mt-8 text-[11px] leading-relaxed text-ink-faint">
          BUEL is informational only and is not financial advice. All trading features are
          simulations; there are no real-money endpoints. Desktop builds are currently
          unsigned — Windows SmartScreen and macOS Gatekeeper may ask for confirmation on
          first launch.
        </p>
        <p className="mt-4 text-xs text-ink-faint">
          Prefer the browser?{" "}
          <Link href="/auth" className="text-accent hover:underline">
            Open the web workspace
          </Link>{" "}
          — both clients share the same account.
        </p>
      </section>
    </main>
  );
}
