"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PrivyProvider, useLogin, usePrivy, getIdentityToken } from "@privy-io/react-auth";
import { AuthShell, AuthField, FormError, SubmitButton } from "@/components/auth-form";
import { Badge } from "@/components/ui";
import { decideAuthLanding } from "@/lib/auth/auth-landing";

/*
 * Privy-powered authentication (PHASE 3) — the SOLE login mechanism.
 *
 * Privy handles email OTP / Google / wallet / passkey inside its modal; on
 * completion the client posts the Privy access token to /api/auth/privy/session,
 * where the server verifies it (signature, issuer, audience, expiry) and
 * resolves it to the internal BUEL user. Legacy accounts are claimed with
 * a one-time password proof — never auto-merged by email.
 *
 * When NEXT_PUBLIC_PRIVY_APP_ID is unset the page shows an explicit
 * NEEDS CONFIGURATION panel instead of a broken login.
 */

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

function AuthPrivyInner() {
  const params = useSearchParams();
  const privy = usePrivy();
  const { login } = useLogin({
    onComplete: (user) => {
      void bridge(user.user.id);
    },
    onError: (e) => setError(typeof e === "string" ? e : "Privy login failed. Please try again."),
  });
  const { getAccessToken, logout, ready } = privy;

  const [bridging, setBridging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [claim, setClaim] = useState<{ legacyEmail: string; hint: string } | null>(null);
  const [legacyPassword, setLegacyPassword] = useState("");
  const bridgedFor = useRef<string | null>(null);

  const loggedOutFlag = params.get("loggedOut") === "1";

  // Post-logout notice: visible only when the page was opened right after a
  // logout (?loggedOut=1), and never re-shown on later visits. It is captured
  // once at mount on purpose: the flag is stripped from the URL immediately
  // afterwards, so a derived value would make the notice disappear again. Both
  // logout call sites navigate with a full page load, so the flag is always
  // present at mount when it applies.
  const [signedOutNotice] = useState(() => loggedOutFlag);

  // Post-logout handoff state lives in refs, never in state: every guard below
  // has to be readable synchronously, inside the same commit. A guard that
  // reads a value set by a sibling effect sees the previous render's value, and
  // that stale read is what re-created the sign-in → logout loop.
  const logoutHandled = useRef(false); // ?loggedOut=1 consumed for this page load
  const privyCleared = useRef(false); // Privy logout already requested for this landing
  const autoBridged = useRef(false); // restored-session bridge already fired
  const signInStarted = useRef(false); // user pressed "Sign in" on this page load
  const bridgeInFlight = useRef(false); // one bridge POST at a time

  /** Current landing decision — see lib/auth/auth-landing.ts for the rules. */
  function landingState() {
    return {
      ready,
      authenticated: privy.authenticated,
      loggedOutFlag,
      logoutHandled: logoutHandled.current,
      privyCleared: privyCleared.current,
      bridgeAttempted: autoBridged.current,
      signInStarted: signInStarted.current,
    };
  }

  // 1. Consume ?loggedOut=1 exactly once per page load and strip it from the
  //    URL immediately — before Privy's OAuth finalization can reload the page.
  //    A reload re-mounts this component and resets its refs, so a flag left in
  //    the URL would re-arm the cleanup and log a freshly authenticated user
  //    straight back out (the sign-in → logout loop seen in production).
  useEffect(() => {
    const decision = decideAuthLanding(landingState());
    if (!decision.consumeLoggedOutFlag) return;
    logoutHandled.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.has("loggedOut")) {
      url.searchParams.delete("loggedOut");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedOutFlag]);

  // 2. Clear the device-local Privy session on that post-logout landing —
  //    including one Privy restores asynchronously after the effect above has
  //    already run. The application session was revoked server-side by
  //    /api/auth/logout; this only removes the local Privy session so it cannot
  //    silently sign the user back in. It stands down as soon as the user
  //    starts a NEW sign-in.
  // 3. A Privy session restored at page load (e.g. the user closed the tab after
  //    the OAuth chooser and came back) is bridged automatically so the user
  //    enters the application instead of facing the sign-in button again —
  //    never on a post-logout landing, where it would undo the logout.
  useEffect(() => {
    const decision = decideAuthLanding(landingState());
    if (decision.clearPrivySession && !privyCleared.current) {
      privyCleared.current = true;
      logout().catch(() => {});
      return;
    }
    if (decision.bridgeRestoredSession && !autoBridged.current) {
      autoBridged.current = true;
      void bridge(privy.user?.id ?? "restored");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, privy.authenticated, loggedOutFlag]);

  /**
   * Read the Privy tokens with a short retry — the SDK can report login
   * complete a beat before the access/identity tokens are readable, and a
   * single immediate read may return null (observed in production).
   */
  async function readTokens(): Promise<{ accessToken: string; idToken: string | null } | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const [accessToken, idToken] = await Promise.all([
        getAccessToken().catch(() => null),
        getIdentityToken().catch(() => null),
      ]);
      if (accessToken) return { accessToken, idToken: idToken ?? null };
      await new Promise((r) => setTimeout(r, 400));
    }
    return null;
  }

  async function bridge(did: string, legacyPassword?: string) {
    if (next) return; // already resolved — a redirect is in flight
    if (bridgedFor.current === did) return; // already bridged for this identity
    if (bridgeInFlight.current) return; // never mint two sessions for one sign-in
    bridgeInFlight.current = true;
    setBridging(true);
    setError(null);
    try {
      const tokens = await readTokens();
      if (!tokens) {
        setError("Sign-in completed but the session token wasn't ready yet. Please click sign-in again.");
        return;
      }
      // idToken (identity token) lets the server resolve the VERIFIED profile
      // server-side (getUser({ idToken })) — the email is never trusted from
      // client state, only from the signed token Privy issued.
      const res = await fetch("/api/auth/privy/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: tokens.accessToken, idToken: tokens.idToken, legacyPassword: legacyPassword ?? null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message ?? "Authentication bridge failed.");
        return;
      }
      if (data.action === "needs_legacy_claim") {
        setClaim({ legacyEmail: data.legacyEmail, hint: data.hint });
        return;
      }
      bridgedFor.current = did;
      setNext(String(data.next ?? "/command-center"));
    } catch {
      setError("Network error during authentication bridge.");
    } finally {
      bridgeInFlight.current = false;
      setBridging(false);
    }
  }

  useEffect(() => {
    if (next) window.location.href = next;
  }, [next]);

  return (
    <>
      <FormError message={error} />

      {claim ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBridging(true);
            setError(null);
            try {
              const tokens = await readTokens();
              if (!tokens) {
                setError("Session token wasn't ready yet. Please try again.");
                return;
              }
              const res = await fetch("/api/auth/privy/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accessToken: tokens.accessToken, idToken: tokens.idToken, legacyPassword }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                setError(data?.error?.message ?? "Claim failed.");
                return;
              }
              bridgedFor.current = "claimed";
              setNext(String(data.next ?? "/command-center"));
            } finally {
              setBridging(false);
            }
          }}
          className="space-y-4"
        >
          <div className="rounded-lg border border-violet/30 bg-violet-soft/40 px-3 py-2.5 text-xs leading-relaxed text-violet">
            <p className="font-semibold">Restore your existing account</p>
            <p className="mt-1">
              The email <span className="font-mono">{claim.legacyEmail}</span> belongs to an
              existing BUEL account. Enter the password you used before to keep your
              decisions, reports and paper-trading history. This is asked once.
            </p>
          </div>
          <AuthField
            id="legacyPassword"
            label="Previous password"
            type="password"
            required
            value={legacyPassword}
            onChange={(e) => setLegacyPassword(e.target.value)}
            placeholder="Your previous BUEL password"
          />
          {bridging && <SubmitButton loading>Verifying…</SubmitButton>}
          {!bridging && <SubmitButton loading={false}>Restore account</SubmitButton>}
          <button
            type="button"
            onClick={() => {
              setClaim(null);
              setLegacyPassword("");
            }}
            className="w-full text-center text-xs text-ink-faint hover:text-ink-dim"
          >
            Skip — continue with a new empty account
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          {!ready ? (
            <p className="text-sm text-ink-dim">Connecting to Privy…</p>
          ) : (
            <SubmitButton
              loading={bridging}
              onClick={() => {
                setError(null);
                // An explicit sign-in starts a NEW session: the post-logout
                // cleanup must stand down from here on.
                signInStarted.current = true;
                login();
              }}
            >
              Sign in to BUEL
            </SubmitButton>
          )}
          <p className="text-[11px] leading-relaxed text-ink-faint">
            Opens the Privy authentication modal: email code, Google, wallet or passkey —
            configured in the Privy dashboard. No passwords are stored by BUEL.
          </p>
          {signedOutNotice && (
            <p className="rounded-lg border border-bull/30 bg-bull-soft/40 px-3 py-2 text-xs text-bull">
              Signed out. Your Privy session has been cleared.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function PrivyLoginFlow() {
  const params = useSearchParams();
  const loggedOut = params.get("loggedOut") === "1";

  if (!PRIVY_APP_ID) {
    return (
      <div className="space-y-3">
        <Badge tone="warn">NEEDS CONFIGURATION</Badge>
        <p className="text-sm leading-relaxed text-ink-dim">
          Privy authentication requires an application ID. Create an app at
          dashboard.privy.io, then set{" "}
          <span className="font-mono text-ink">NEXT_PUBLIC_PRIVY_APP_ID</span> and{" "}
          <span className="font-mono text-ink">PRIVY_APP_SECRET</span> in the environment
          (Vercel for production, .env.local for development). Allowed login origins:
          localhost:3111 (dev) and the production domain.
        </p>
        <p className="text-xs text-ink-faint">
          Email OTP, Google, wallet and passkey login methods are enabled once configured.
        </p>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#3fe1ff",
          logo: "/buel-mark.svg",
        },
        loginMethods: ["email", "google", "wallet", "passkey"],
        embeddedWallets: {
          // Per directive: never create embedded wallets automatically.
          ethereum: { createOnLogin: "off" as const },
          solana: { createOnLogin: "off" as const },
        },
      }}
    >
      <Suspense fallback={<p className="text-sm text-ink-dim">Loading authentication…</p>}>
        <AuthPrivyInner />
      </Suspense>
    </PrivyProvider>
  );
}

export default function AuthPage() {
  return (
    <AuthShell
      title="Sign in to BUEL"
      subtitle="One secure sign-in: email code, Google, wallet or passkey. No passwords stored by BUEL."
      footer={
        <>
          New here? Your account is created on first sign-in.{" "}
          <Link href="/" className="text-accent hover:underline">
            Back to home
          </Link>
        </>
      }
    >
      <Suspense fallback={<p className="text-sm text-ink-dim">Loading…</p>}>
        <PrivyLoginFlow />
      </Suspense>
    </AuthShell>
  );
}
