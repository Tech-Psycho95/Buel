"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Gauge, Activity, Users, BookOpen, FlaskConical, Swords, NotebookPen, Shield,
  Zap, Brain, LineChart, GitBranch, Microscope, Eye, SlidersHorizontal, Settings,
  PanelLeftClose, PanelLeftOpen, LogOut, Menu, X, Search, Bell, ChevronRight,
} from "lucide-react";
import { NAV_ITEMS, NAV_GROUPS } from "@/lib/nav";
import { MotionModal } from "@/components/motion";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  gauge: Gauge, activity: Activity, users: Users, "book-open": BookOpen,
  "flask-conical": FlaskConical, swords: Swords, "notebook-pen": NotebookPen,
  shield: Shield, zap: Zap, brain: Brain, "line-chart": LineChart,
  "git-branch": GitBranch, microscope: Microscope, eye: Eye,
  "sliders-horizontal": SlidersHorizontal, settings: Settings,
};

const GROUP_OF: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.map((i) => [i.href, i.group]),
);

/* --------------------------- Command palette --------------------------- */

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return NAV_ITEMS.slice(0, 8);
    return NAV_ITEMS.filter(
      (i) => i.label.toLowerCase().includes(query) || i.group.toLowerCase().includes(query),
    ).slice(0, 8);
  }, [q]);

  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <MotionModal open={open} onClose={onClose} className="max-w-xl">
      <div className="overflow-hidden rounded-[14px] border border-line-strong bg-surface-2/95 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search size={15} className="text-ink-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) go(matches[0].href);
              if (e.key === "Escape") onClose();
            }}
            placeholder="Search modules and actions…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            aria-label="Command palette"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {matches.map((m) => {
            const Icon = ICONS[m.icon] ?? Gauge;
            return (
              <button
                key={m.href}
                onClick={() => go(m.href)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-surface-3"
              >
                <span className="grid h-7 w-7 place-items-center rounded-md border border-line bg-surface text-accent">
                  <Icon size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{m.label}</span>
                  <span className="block text-[11px] text-ink-faint">{m.group}</span>
                </span>
                <ChevronRight size={13} className="text-ink-faint/60" />
              </button>
            );
          })}
          {matches.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-ink-faint">No matches.</p>
          )}
        </div>
        <div className="border-t border-line px-4 py-2 text-[10px] text-ink-faint">
          <span className="font-mono">↵</span> open · <span className="font-mono">esc</span> close
        </div>
      </div>
    </MotionModal>
  );
}

/* --------------------------- Notifications --------------------------- */

type RecentDecision = {
  id: string;
  symbol: string;
  decision: string;
  confidence: string;
  createdAt: string;
  dataMode: string;
};

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RecentDecision[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/decisions?limit=5");
      const d = await res.json();
      if (res.ok) setItems(d.decisions ?? []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const recentCount = items?.filter(
    (i) => Date.now() - new Date(i.createdAt).getTime() < 24 * 3600_000,
  ).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-dim transition-colors hover:border-line-strong hover:text-ink"
        aria-label="Recent decisions"
      >
        <Bell size={15} />
        {recentCount ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent-strong px-1 text-[9px] font-bold text-[#032129]">
            {recentCount}
          </span>
        ) : null}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-10 w-80 overflow-hidden rounded-xl border border-line-strong bg-surface-2/95 shadow-2xl backdrop-blur"
          >
            <p className="border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Recent council decisions
            </p>
            {items === null ? (
              <p className="px-4 py-6 text-center text-xs text-ink-faint">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-ink-faint">
                No decisions yet — run the Agent Council.
              </p>
            ) : (
              items.map((d) => (
                <Link
                  key={d.id}
                  href="/decision-ledger"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-2 border-b border-line/60 px-4 py-2.5 last:border-0 hover:bg-surface-3"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-medium text-ink">{d.symbol}</span>
                    <Badge
                      tone={d.decision === "LONG" ? "bull" : d.decision === "SHORT" ? "bear" : d.decision === "NO_TRADE" ? "warn" : "neutral"}
                    >
                      {d.decision.replace("_", " ")}
                    </Badge>
                  </span>
                  <span className="tabular text-[10px] text-ink-faint">
                    {new Date(d.createdAt).toISOString().slice(5, 16).replace("T", " ")}
                  </span>
                </Link>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------ Sidebar ------------------------------ */

function NavLink({
  href,
  label,
  icon,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const Icon = ICONS[icon] ?? Gauge;
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={`group relative flex items-center gap-2.5 rounded-lg py-[7px] text-[13px] transition-colors ${
        collapsed ? "justify-center px-0" : "px-2.5"
      } ${active ? "bg-accent-soft text-accent" : "text-ink-dim hover:bg-surface-3/70 hover:text-ink"}`}
    >
      {active && (
        <motion.span
          layoutId="nav-rail"
          className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r bg-accent"
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
        />
      )}
      <Icon size={15} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

/* ------------------------------- Shell ------------------------------- */

export function ShellFrame({
  user,
  children,
}: {
  user: { displayName: string; email: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/auth?loggedOut=1";
  }

  const current = NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  const crumbs = current ? [current.group, current.label] : ["Workspace"];
  const initials = user.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const sidebar = (mobile: boolean) => (
    <div
      className={`flex h-full flex-col border-r border-line bg-surface/85 backdrop-blur ${
        mobile ? "w-72" : collapsed ? "w-[58px]" : "w-60"
      } transition-[width] duration-200`}
    >
      <div className={`flex items-center gap-2.5 px-4 py-4 ${collapsed && !mobile ? "justify-center px-0" : ""}`}>
        {collapsed && !mobile ? (
          <span className="grid place-items-center">
            <Logo size={30} tone="light" />
          </span>
        ) : (
          <>
            <span className="grid place-items-center">
              <Logo variant="lockup" size={28} tone="light" />
            </span>
            <span className="rounded-full border border-line px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
              paper-only
            </span>
          </>
        )}
        {!mobile && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto text-ink-faint transition-colors hover:text-ink"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
        {mobile && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto text-ink-faint" aria-label="Close menu">
            <X size={18} />
          </button>
        )}
      </div>

      <button
        onClick={() => setPaletteOpen(true)}
        className={`mx-2 mb-3 flex items-center gap-2 rounded-lg border border-line bg-bg-2/60 px-2.5 py-1.5 text-xs text-ink-faint transition-colors hover:border-line-strong hover:text-ink-dim ${
          collapsed && !mobile ? "justify-center px-0" : ""
        }`}
        aria-label="Open command palette"
      >
        <Search size={13} />
        {(!collapsed || mobile) && (
          <>
            <span className="flex-1 text-left">Search…</span>
            <kbd className="rounded border border-line px-1 py-0.5 font-mono text-[9px]">⌘K</kbd>
          </>
        )}
      </button>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group}>
            {(!collapsed || mobile) && (
              <p className="px-2.5 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.2em] text-ink-faint/60">
                {group}
              </p>
            )}
            <div className="space-y-0.5">
              {NAV_ITEMS.filter((i) => i.group === group).map((item) => (
                <NavLink
                  key={item.href}
                  {...item}
                  collapsed={collapsed && !mobile}
                  onNavigate={() => mobile && setMobileOpen(false)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-2.5">
        <button
          onClick={logout}
          aria-label="Sign out"
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink-dim transition-colors hover:bg-bear-soft/40 hover:text-bear ${
            collapsed && !mobile ? "justify-center px-0" : ""
          }`}
        >
          <LogOut size={15} />
          {(!collapsed || mobile) && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen shrink-0 md:block">{sidebar(false)}</aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <motion.div
              className="absolute inset-0 bg-black/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="absolute left-0 top-0 h-full"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
            >
              {sidebar(true)}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 hidden items-center gap-3 border-b border-line bg-bg/80 px-6 py-2.5 backdrop-blur md:flex">
          <Logo size={20} tone="light" className="shrink-0" />
          <span className="h-3.5 w-px shrink-0 bg-line-strong" aria-hidden />
          <p className="flex items-center gap-1.5 text-xs text-ink-faint">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight size={11} className="text-ink-faint/50" />}
                <span className={i === crumbs.length - 1 ? "font-medium text-ink-dim" : ""}>{c}</span>
              </span>
            ))}
          </p>
          <Badge tone="warn" className="ml-1" mono>
            PAPER TRADING ONLY
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <NotificationsBell />
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-lg border border-line py-1 pl-1 pr-2.5 transition-colors hover:border-line-strong"
                aria-label="User menu"
              >
                <span className="grid h-6 w-6 place-items-center rounded-md bg-violet-soft text-[10px] font-bold text-violet">
                  {initials}
                </span>
                <span className="max-w-[120px] truncate text-xs text-ink-dim">{user.displayName}</span>
              </button>
              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-10 w-56 overflow-hidden rounded-xl border border-line-strong bg-surface-2/95 shadow-2xl backdrop-blur"
                  >
                    <div className="border-b border-line px-4 py-3">
                      <p className="truncate text-xs font-medium text-ink">{user.displayName}</p>
                      <p className="truncate text-[11px] text-ink-faint">{user.email}</p>
                    </div>
                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-xs text-ink-dim hover:bg-surface-3 hover:text-ink"
                    >
                      <Settings size={13} /> Settings / Profile
                    </Link>
                    <Link
                      href="/risk-preferences"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-xs text-ink-dim hover:bg-surface-3 hover:text-ink"
                    >
                      <SlidersHorizontal size={13} /> Risk Preferences
                    </Link>
                    <button
                      onClick={logout}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-ink-dim hover:bg-bear-soft/40 hover:text-bear"
                    >
                      <LogOut size={13} /> Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Mobile topbar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur md:hidden">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="text-ink-dim">
            <Menu size={18} />
          </button>
          <Logo variant="lockup" size={26} tone="light" />
          <Badge tone="warn" className="ml-auto" mono>
            PAPER ONLY
          </Badge>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-7 md:py-8">{children}</main>

        <footer className="border-t border-line px-6 py-3.5 text-center text-[10px] leading-relaxed text-ink-faint">
          BUEL is informational only — not financial advice. All trading is simulated; no real-money
          execution path exists in this product.
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
