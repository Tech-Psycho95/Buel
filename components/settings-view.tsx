"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, CardHeader, TextInput } from "@/components/ui";

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken"; message: string }
  | { state: "invalid"; message: string }
  | { state: "error"; message: string };

export function SettingsView({
  email,
  username,
}: {
  email: string;
  username: string;
}) {
  const [current, setCurrent] = useState(username);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(username);
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced live availability feedback while editing.
  useEffect(() => {
    if (!editing) return;
    if (draft.trim() === current) {
      setAvailability({ state: "idle" });
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAvailability({ state: "checking" });
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/profile/username?username=${encodeURIComponent(draft.trim())}`);
        const d = await res.json().catch(() => null);
        if (!res.ok || !d) {
          setAvailability({ state: "error", message: "Could not verify availability. Try again." });
          return;
        }
        if (d.available) setAvailability({ state: "available" });
        else if (d.reason === "taken") setAvailability({ state: "taken", message: d.message });
        else setAvailability({ state: "invalid", message: d.message });
      } catch {
        setAvailability({ state: "error", message: "Could not verify availability. Try again." });
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draft, editing, current]);

  function startEdit() {
    setDraft(current);
    setNotice(null);
    setAvailability({ state: "idle" });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(current);
    setNotice(null);
    setAvailability({ state: "idle" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/profile/username", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: draft.trim() }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.ok) {
        setAvailability({
          state: d?.error?.code === "username_taken" ? "taken" : "invalid",
          message: d?.error?.message ?? "Could not save the username. Try again.",
        });
        return;
      }
      setCurrent(d.username);
      setEditing(false);
      setNotice("Username updated.");
      setAvailability({ state: "idle" });
    } catch {
      setNotice("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const availabilityTone =
    availability.state === "available"
      ? "border-bull/30 bg-bull-soft/40 text-bull"
      : availability.state === "error" || availability.state === "idle"
        ? "border-line/60 bg-surface-2/60 text-ink-dim"
        : "border-bear/30 bg-bear-soft/50 text-bear";

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Profile" subtitle="Manage your personal information and account identity." />
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-faint">Username</p>
            {!editing ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <p className="text-ink">{current}</p>
                <Button variant="ghost" onClick={startEdit}>
                  Change username
                </Button>
              </div>
            ) : (
              <form onSubmit={save} className="mt-2 max-w-sm space-y-3">
                <div>
                  <label htmlFor="username" className="mb-1 block text-xs text-ink-dim">
                    New username
                  </label>
                  <TextInput
                    id="username"
                    value={draft}
                    autoFocus
                    required
                    minLength={3}
                    maxLength={20}
                    pattern="[A-Za-z0-9_]+"
                    title="3–20 characters: letters, numbers and underscores"
                    onChange={(e) => setDraft(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <p className={`rounded-lg border px-3 py-2 text-xs ${availabilityTone}`}>
                  {availability.state === "idle" && "3–20 characters: letters, numbers and underscores."}
                  {availability.state === "checking" && "Checking availability…"}
                  {availability.state === "available" && "Username available."}
                  {availability.state === "taken" && availability.message}
                  {availability.state === "invalid" && availability.message}
                  {availability.state === "error" && availability.message}
                </p>
                <div className="flex items-center gap-2.5">
                  <Button type="submit" disabled={saving || availability.state === "checking"}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={cancelEdit} disabled={saving}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-faint">Email</p>
            <p className="mt-1.5 text-ink-dim">{email}</p>
          </div>
        </div>
        {notice && (
          <p className="mt-4 rounded-lg border border-bull/30 bg-bull-soft/40 px-3 py-2 text-xs text-bull">{notice}</p>
        )}
      </Card>

      <Card>
        <CardHeader title="Data & safety" subtitle="How this workspace handles data" />
        <ul className="space-y-1.5 text-xs leading-relaxed text-ink-dim">
          <li className="flex gap-2"><span className="text-ink-faint">•</span><span>Market data: Hyperliquid public info API, cached with TTL and freshness labels; demo fallback is always labeled.</span></li>
          <li className="flex gap-2"><span className="text-ink-faint">•</span><span>Persistence: PostgreSQL via Drizzle; per-user data scoping enforced server-side.</span></li>
          <li className="flex gap-2"><span className="text-ink-faint">•</span><span>Safety: strictly paper-trading. No private keys, wallet signing, broker credentials or real-order endpoints exist in this product.</span></li>
          <li className="flex gap-2"><span className="text-ink-faint">•</span><span>Everything shown is informational only — not financial advice.</span></li>
        </ul>
        <div className="mt-4">
          <Button variant="danger" onClick={logout}>
            Sign out of this device
          </Button>
        </div>
      </Card>

      <p className="flex items-center gap-2 text-[11px] text-ink-faint">
        <Badge tone="neutral" mono>
          BUEL
        </Badge>
        Sign-in, security and account recovery are managed by your Privy identity.
      </p>
    </div>
  );
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/auth?loggedOut=1";
}
