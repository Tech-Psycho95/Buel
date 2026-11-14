"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Logo } from "@/components/logo";

/*
 * Premium split-screen authentication layout: brand + product promise +
 * animated (illustrative, labeled) intelligence visualization on the left;
 * clean, accessible form on the right. All existing auth flows preserved.
 */

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen">
      {/* Brand panel */}
      <aside className="relative hidden w-[44%] flex-col justify-between overflow-hidden border-r border-line bg-bg-2 p-10 lg:flex">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div
          className="drift absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-accent/8 blur-3xl"
          aria-hidden
        />
        <div
          className="drift absolute -right-16 bottom-10 h-72 w-72 rounded-full bg-violet/8 blur-3xl"
          style={{ animationDelay: "-7s" }}
          aria-hidden
        />

        <Link href="/" className="relative flex items-center gap-2.5">
          <Logo variant="lockup" size={38} tone="light" />
        </Link>

        <div className="relative max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent/90">
            Autonomous market intelligence
          </p>
          <p className="mt-4 text-2xl font-semibold leading-snug tracking-tight text-ink">
            Evidence beyond the signal. Conviction beyond the hype.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-ink-dim">
            Independent agents debate. A red-team attacks. A deterministic judge and quality gate
            decide. Paper trading only — your capital is never at risk in this product.
          </p>
          <CouncilOrbit />
          <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">
            Illustrative simulation — demo data. Agent stances shown are sample artifacts, not live
            analysis.
          </p>
        </div>

        <div className="relative flex items-center gap-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          <span className="flex items-center gap-1.5">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-bull" /> Paper-only
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet" /> Evidence-locked AI
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" /> Deterministic judge
          </span>
        </div>
      </aside>

      {/* Form panel */}
      <div className="flex min-w-0 flex-1 items-center justify-center px-5 py-12">
        <motion.div
          className="w-full max-w-[420px]"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link href="/" className="mb-8 flex items-center justify-center lg:hidden">
            <Logo variant="lockup" size={32} tone="light" />
          </Link>
          <div className="rounded-[14px] border border-line bg-surface/80 p-7 panel-sheen backdrop-blur">
            <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
            <p className="mt-1 mb-6 text-xs leading-relaxed text-ink-faint">{subtitle}</p>
            {children}
          </div>
          <p className="mt-5 text-center text-xs text-ink-faint">{footer}</p>
        </motion.div>
      </div>
    </main>
  );
}

/** Slow-orbit agent-council illustration (pure CSS, reduced-motion safe). */
function CouncilOrbit() {
  const agents = [
    { name: "BULL", color: "#2fe0a2", angle: 0 },
    { name: "BEAR", color: "#ff6b7d", angle: 90 },
    { name: "RISK", color: "#ffc757", angle: 180 },
    { name: "ANALYST", color: "#a78bfa", angle: 270 },
  ];
  return (
    <div className="relative mx-auto mt-10 h-64 w-56" aria-hidden>
      <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line/70" />
      <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line/50" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="grid h-16 w-16 place-items-center rounded-2xl border border-accent/40 bg-accent-soft shadow-[0_0_30px_rgba(63,225,255,0.18)]">
          <div className="text-center">
            <p className="text-[9px] font-bold tracking-wider text-accent">JUDGE</p>
            <p className="font-mono text-[8px] text-ink-faint">gate</p>
          </div>
        </div>
      </div>
      {agents.map((a) => (
        <div
          key={a.name}
          className="absolute left-1/2 top-1/2"
          style={{ transform: `rotate(${a.angle}deg) translateY(-92px)` }}
        >
          <div
            className="flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md border bg-bg-2/90 px-1.5 py-1 backdrop-blur"
            style={{ borderColor: `${a.color}44` }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: a.color }} />
            <span className="font-mono text-[8px] font-bold" style={{ color: a.color }}>
              {a.name}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mb-4 rounded-lg border border-bear/30 bg-bear-soft/50 px-3 py-2 text-xs text-bear">
      {message}
    </p>
  );
}

export function SubmitButton({
  loading,
  onClick,
  children,
}: {
  loading: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      onClick={onClick}
      disabled={loading}
      className="w-full rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-[#032129] transition-all hover:bg-accent hover:shadow-[0_0_20px_rgba(63,225,255,0.25)] disabled:opacity-50"
    >
      {loading ? "Working…" : children}
    </button>
  );
}

export function useAuthPost() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(
    url: string,
    body: unknown,
    opts?: { onSuccess?: (data: Record<string, unknown>) => void },
  ) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message ?? "Request failed — try again.");
        return null;
      }
      opts?.onSuccess?.(data);
      return data;
    } catch {
      setError("Network error — check your connection and try again.");
      return null;
    } finally {
      setLoading(false);
      router.refresh();
    }
  }

  return { post, loading, error, setError };
}

export function AuthField({
  label,
  hint,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-center justify-between text-xs font-medium text-ink-dim">
        <span>{label}</span>
        {hint ? <span className="font-normal text-ink-faint">{hint}</span> : null}
      </label>
      <input
        id={id}
        className={`w-full rounded-lg border border-line bg-bg-2/80 px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-faint/80 transition-colors focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/12 ${props.className ?? ""}`}
        {...props}
      />
    </div>
  );
}

/* AuthField replaces manual label+input pairs inside auth screens. */
