import type { ReactNode } from "react";

/*
 * BUEL UI kit — premium institutional primitives.
 * Server-compatible unless marked "use client" (motion.tsx).
 */

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  sub,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  sub?: ReactNode;
}) {
  const valueTone =
    tone === "bull"
      ? "text-bull"
      : tone === "bear"
        ? "text-bear"
        : tone === "warn"
          ? "text-warn"
          : "text-ink";
  return (
    <Card className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      {/* div (not p) — value may legitimately contain block-level nodes */}
      <div className={`tabular mt-2 text-[22px] font-semibold tracking-tight ${valueTone}`}>{value}</div>
      {hint ? <p className="tabular mt-1 text-[11px] leading-relaxed text-ink-dim">{hint}</p> : null}
      {sub}
    </Card>
  );
}

export function Card({
  children,
  className = "",
  padded = true,
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  variant?: "default" | "elevated" | "flush";
}) {
  const base =
    "rounded-[12px] border border-line bg-surface/90 panel-sheen backdrop-blur-sm";
  const variants = {
    default: "",
    elevated: "bg-surface-2/80 shadow-[0_16px_48px_-24px_rgba(0,0,0,0.8)]",
    flush: "bg-surface/60",
  } as const;
  return (
    <div className={`${base} ${variants[variant]} ${padded ? "p-5" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent/80">{eyebrow}</p>
        ) : null}
        <h3 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs leading-relaxed text-ink-faint">{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

type Tone = "neutral" | "bull" | "bear" | "warn" | "accent" | "analyst" | "redteam" | "violet";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-neutral-chip/8 text-neutral-chip border-neutral-chip/25",
  bull: "bg-bull-soft text-bull border-bull/30",
  bear: "bg-bear-soft text-bear border-bear/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  accent: "bg-accent-soft text-accent border-accent/30",
  analyst: "bg-analyst-soft text-analyst border-analyst/30",
  redteam: "bg-redteam-soft text-redteam border-redteam/30",
  violet: "bg-violet-soft text-violet border-violet/30",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
  mono = false,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${
        mono ? "font-mono" : ""
      } ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "subtle" | "accent-ghost";
  size?: "sm" | "md";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent/50";
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-[13px]" } as const;
  const variants = {
    primary:
      "bg-accent-strong text-[#032129] hover:bg-accent hover:shadow-[0_0_18px_rgba(63,225,255,0.25)]",
    "accent-ghost": "border border-accent/35 text-accent hover:bg-accent-soft",
    ghost: "border border-line text-ink-dim hover:border-line-strong hover:text-ink",
    danger: "bg-bear-soft text-bear border border-bear/30 hover:bg-bear/20",
    subtle: "bg-surface-3 text-ink-dim hover:text-ink border border-line",
  } as const;
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function TextInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-line bg-bg-2/80 px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint/80 transition-colors focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/12 ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`rounded-lg border border-line bg-bg-2/80 px-3 py-2 text-[13px] text-ink transition-colors focus:border-accent/50 focus:outline-none ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-lg ${className}`} />;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 py-14 text-center halo">
      <div className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface-3 text-accent">
        ◇
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="max-w-md text-xs leading-relaxed text-ink-faint">{body}</p>
      {action}
    </Card>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <Card className="border-bear/30 bg-bear-soft/30">
      <p className="text-sm font-semibold text-bear">Something went wrong</p>
      <p className="mt-1 text-xs text-ink-dim">{message}</p>
      {retry ? (
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export function DataTable({
  head,
  children,
  className = "",
}: {
  head: ReactNode[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full min-w-[560px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-line-strong/70">
            {head.map((h, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">{children}</tbody>
      </table>
    </div>
  );
}

/** Section label — Linear-style micro-caps. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint/90">{children}</p>
  );
}

export function PageHeader({
  title,
  description,
  right,
  breadcrumb,
}: {
  title: string;
  description?: string;
  right?: ReactNode;
  breadcrumb?: string[];
}) {
  return (
    <div className="mb-7">
      {breadcrumb && breadcrumb.length > 0 ? (
        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-ink-faint">
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-ink-faint/60">/</span>}
              <span className={i === breadcrumb.length - 1 ? "text-ink-dim" : ""}>{b}</span>
            </span>
          ))}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
          {description ? (
            <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-dim">{description}</p>
          ) : null}
        </div>
        {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
      </div>
    </div>
  );
}

/** Inline SVG sparkline — zero deps, draw-in animation. */
export function Sparkline({
  points,
  className = "h-8 w-24",
  positive,
}: {
  points: number[];
  className?: string;
  positive?: boolean;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const path = points
    .map((p, i) => `${(i / (points.length - 1)) * w},${h - 3 - ((p - min) / range) * (h - 6)}`)
    .join(" ");
  const up = positive ?? points[points.length - 1] >= points[0];
  const stroke = up ? "#2fe0a2" : "#ff6b7d";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-hidden>
      <polyline
        className="draw-line"
        style={{ "--draw-len": 300 } as React.CSSProperties}
        points={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** DATA MODE chip — DEMO DATA is impossible to confuse with live data. */
export function DataModeBadge({
  mode,
  className = "",
}: {
  mode: "live" | "demo";
  className?: string;
}) {
  return mode === "demo" ? (
    <Badge tone="warn" className={className}>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-warn" /> DEMO DATA
    </Badge>
  ) : (
    <Badge tone="accent" className={className}>
      <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-bull" /> LIVE DATA
    </Badge>
  );
}

export function FreshnessBadge({ stale, ageSec }: { stale: boolean; ageSec: number }) {
  return stale ? (
    <Badge tone="warn" mono>
      stale · {ageSec}s
    </Badge>
  ) : (
    <Badge tone="neutral" mono>
      fresh · {ageSec}s
    </Badge>
  );
}

export function PnL({ value, formatted }: { value: string; formatted?: string }) {
  const d = parseFloat(value);
  const tone = d > 0 ? "text-bull" : d < 0 ? "text-bear" : "text-ink-dim";
  return <span className={`tabular font-medium ${tone}`}>{formatted ?? value}</span>;
}
