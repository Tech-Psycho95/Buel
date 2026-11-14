# BUEL — Privy sign-in / sign-out loop: verification report

**Date:** 2026-11-15
**Workspace:** `C:\Users\shiva\Downloads\Sentisel` (package `buel`, Next.js 16 App Router, Privy react-auth)
**Scope:** continue the existing authentication fix, verify it end to end, do not redesign auth.

---

## 0. Starting point, and one important environment fact

**There is no Git repository in this workspace** (`git status` → `fatal: not a git repository (or any of the parent directories): .git`).
So step 1 of the brief ("run `git status`, review the existing diffs") could not be performed as written: there is no
history and no diff to review. The state of the previous agent's work was established by reading the files on disk
instead. Nothing on disk was discarded, reverted or rewritten outside the files listed in §2.

Also: the referenced `RTK.md` does not exist anywhere in the workspace.

What was actually present, verified by reading the code:

- `app/auth/page.tsx` (client) already contained the previous agent's change: the `?loggedOut=1` flag is deleted from
  the URL with `history.replaceState` as soon as the cleanup effect runs, the notice is kept in component state, and a
  restored Privy session is auto-bridged.
- `e2e/auth-cycle.spec.ts` had been "corrected" to expect new users to land on onboarding — **but the test did not
  pass.** See §3.1; this was the first concrete defect found.

---

## 1. Root cause

**Original failure chain (as described in the brief):** after logout, `/auth?loggedOut=1` loads; the cleanup effect calls
Privy `logout()`; a grace-period ref was supposed to make it one-shot, but Privy's Google OAuth finalization reloads the
page, which re-mounts the component and resets the ref. With the flag still in the URL, the cleanup re-armed and logged
out the freshly authenticated session → sign-in → logout → sign-in loop.

**Is it fixed?** Yes, and now for the right reason:

1. `?loggedOut=1` is consumed and stripped from the URL **before** any Privy OAuth reload can happen (`replaceState`
   inside a `useEffect` that runs on mount). A reload therefore lands on a clean `/auth` and cannot re-arm the cleanup.
2. The one-shot guards are **refs, not state** (`logoutHandled`, `privyCleared`, `autoBridged`, `signInStarted`,
   `bridgeInFlight`). This was the remaining hole: the previous version's auto-bridge effect consulted the
   `signedOutNotice` *state* to decide "we just signed out". React state set by one effect is not visible to the next
   effect in the same commit, so on a `?loggedOut=1` landing with a restored Privy session the bridge ran anyway with
   `signedOutNotice === false` and posted the still-valid Privy token to `/api/auth/privy/session` while `logout()` was
   in flight. Depending on timing that either minted a new app session right after logout (sign-out → sign-in) or
   produced a spurious "token wasn't ready" error on the sign-in page. Same class of bug as the original loop, opposite
   direction. It is now impossible by construction: the decision is a pure function of synchronous refs.
3. The mirror image is also closed: once the user presses **Sign in** on that landing, `signInStarted` makes the Privy
   cleanup stand down, so completing a new sign-in can never be logged out by the page that was supposed to clear the
   *old* session.
4. Duplicate bridges are prevented (`bridgeInFlight`), so one sign-in cannot mint two sessions.

The decision rules live in `lib/auth/auth-landing.ts` as a pure function and are pinned by 8 unit tests, including the
two orderings that produced the loop and the "user just signed in" case (§3.2).

---

## 2. Files changed

| File | Change |
| --- | --- |
| `app/auth/page.tsx` | Post-logout handoff rewritten on refs: flag consumed + stripped once per page load, one-shot notice captured at mount (`useState(() => loggedOutFlag)`) so stripping the URL cannot hide it, Privy session cleared on the post-logout landing even if Privy restores it asynchronously, auto-bridge suppressed on that landing and after an explicit sign-in, `signInStarted` / `bridgeInFlight` guards. `bridge()` now refuses to run twice for one identity. |
| `lib/auth/auth-landing.ts` | **New.** Pure `decideAuthLanding()` policy (consume flag / show notice / clear Privy / bridge restored session) with the full rationale. |
| `tests/unit/auth-landing.test.ts` | **New.** 8 unit tests covering the decision matrix (normal visit, post-logout landing, late Privy restore, new sign-in in progress, already-consumed flag, already-bridged, already-cleared, not-ready). |
| `e2e/auth-cycle.spec.ts` | Fixed the sign-out step (it hung for the full 120 s — see §3.1), asserted the server's `next` destination for new vs. existing users, asserted `?loggedOut=1` is stripped, added a reload check and a "notice never follows the user back" check. |
| `components/shell.tsx` | `aria-label="Sign out"` on the sidebar sign-out button (it had no accessible name once the rail was collapsed, which is what broke the test). Behaviour unchanged. |

Not touched: `/api/auth/privy/session`, `/api/auth/logout`, `/api/auth/session`, `lib/auth/privy-server.ts`,
`lib/auth/session-core.ts`, `lib/auth/session-cookies.ts`, `lib/auth/guard.ts`, `proxy.ts`, onboarding, and every
non-auth surface. No dependency added or removed.

---

## 3. Test results

### 3.1 The "corrected" authentication-cycle test was broken

First run, on the inherited code, **before any edit**:

```
[1/1] [chromium] › e2e\auth-cycle.spec.ts:38:1 › sign-in / sign-out cycle
  1) Test timeout of 120000ms exceeded.
    Error: locator.click: Test timeout of 120000ms exceeded.
    Call log:
      - waiting for getByRole('button', { name: /sign out/i })
```

Cause (from the failure snapshot): the test clicked *Collapse sidebar* first, and in the collapsed rail the sign-out
button renders only its icon (`{(!collapsed || mobile) && <span>Sign out</span>}`), so it had **no accessible name at
all**. The test therefore never reached the logout step — meaning the logout path it was supposed to verify had never
actually been exercised end to end. Sign-in, onboarding and "session survives a refresh" had passed.

Fixed by labelling the button (`aria-label="Sign out"`, kept in both rail states) and clicking it by that name with the
rail expanded. The collapsed-rail label fix is why the same locator now resolves even in the compact layout.

### 3.2 Unit / integration (vitest)

```
baseline : Test Files 13 passed (13)  Tests 139 passed (139)
after    : Test Files 14 passed (14)  Tests 147 passed (147)   (+8 = new auth-landing suite)
```

### 3.3 Playwright — authentication cycle (the brief's 12-step sequence)

```
npx playwright test e2e/auth-cycle.spec.ts
  1 passed (42.8s)
```

The spec now asserts, in order: new user → `next: "/onboarding"` → onboarding page renders → onboarding completes →
Command Center "Welcome back" → reload keeps the session → sign out via the UI → `/auth?loggedOut=1` → notice visible →
**URL is back to `/auth` (flag stripped)** → `/command-center` redirects to `/auth` → notice absent on the fresh visit →
`/api/auth/session` = **401** → reload of `/auth` shows no notice and still 401 → sign in again → `next: "/command-center"`
→ "Welcome back" → `/auth` redirects an authenticated visitor to `/command-center` with no stale notice.

### 3.4 Playwright — auth regression specs

```
npx playwright test e2e/api-audit.spec.ts e2e/console-sweep.spec.ts
  auth enforcement: 16 pages redirect, all APIs return 401 unauthenticated   passed
  privy bridge: invalid tokens rejected, legacy routes removed               passed
  full product lifecycle (single authenticated session)                      passed
  no console errors on any page                                              passed
  4 passed (2.3m)
```

### 3.5 Static checks

```
npx tsc --noEmit                → exit 0, no output
npx eslint .                    → 2 errors, 58 warnings — identical to the pre-change baseline
```

Both errors are **pre-existing and unrelated**: `demo-video/record-buel.js:2,3  @typescript-eslint/no-require-imports`.
A per-file/per-rule comparison against the baseline shows **zero** new warnings from this change (the extra entries in a
raw `eslint .` run come from the tool's own snapshots under `.zwork/artifacts/`, which the config does not ignore).

### 3.6 Production build, and a smoke test of the built artifact

```
npm run build → exit 0 (all routes compiled; /auth is prerendered as static, proxy = middleware)
```

The build was then served with `next start -p 3112` and driven with a real browser:

- `/auth?loggedOut=1` → "Signed out. Your Privy session has been cleared." visible **once**, URL becomes `/auth`;
- reload → no notice, still `/auth` (the static page + client effect behave correctly, not only in dev);
- `/command-center` as an anonymous visitor → redirected to `/auth`;
- `POST /api/auth/privy/test-session` → **404** (dev-only minter hard-disabled in a production build);
- `GET /api/auth/session` → **401**.

---

## 4. Answers to the brief's final questions

1. **Is the original root cause fixed?** Yes. The flag is consumed and removed from the URL before any Privy OAuth reload
   can see it, the one-shot guards are synchronous refs rather than state, and the post-logout landing can no longer
   bridge (re-create) a session. The residual same-class bug in the auto-bridge effect is also closed.

2. **Files changed** — see §2.

3. **Authentication test results** — see §3. TypeScript clean; ESLint identical to baseline (2 pre-existing errors, none
   from this change); 147/147 unit+integration tests; auth-cycle e2e passing; 4/4 auth/API regression specs passing;
   production build OK; built-artifact smoke test OK.

4. **Does new-user onboarding work?** Yes — the server returns `next: "/onboarding"`, `/command-center` redirects a
   not-yet-onboarded user to `/onboarding`, the onboarding page renders ("BUEL onboarding"), and completing it lands on
   the Command Center.

5. **Does existing-user sign-in work?** Yes — the same identity re-authenticates to `next: "/command-center"` with no
   second onboarding, and the session survives a refresh.

6. **Do logout and re-login work without loops?** Yes in every path the harness can drive: sign-out clears the server
   session (revoked row + cookie expiry → 401), protected routes redirect, the notice is shown exactly once, and a
   later sign-in is not destroyed. The Privy-session-side paths (Google OAuth, restored Privy session) cannot be driven
   in this environment — see §5 — so they are covered by the unit-tested decision matrix plus code review rather than by
   a browser run.

7. **Production deployment and verification** — **not deployed, not verified.**
   - `https://buel-app.vercel.app` is live (BUEL landing renders), but it is serving the **previous** build; this change
     is not on it.
   - The workspace has **no Git repository**, so nothing was committed or pushed (and no force-push was attempted).
   - A `VERCEL_TOKEN` exists in `.env.local` and the folder is linked to project `sentisel`, but publishing to
     production is a consequential, outward-facing action that was not explicitly authorised, so it was not performed.
   - What *was* verified is the production **build** and the production-mode server behaviour, locally (§3.6). That is
     not a claim about the deployed site.

8. **Remaining issues** — see §5.

---

## 5. Remaining issues and limitations (stated plainly)

1. **Google OAuth itself was not executed.** No Google account, inbox or OAuth consent can be automated here. The cycle
   is verified through `/api/auth/privy/test-session` → `/api/auth/privy/session`, i.e. the same server-side identity
   resolution, session issuance, cookie, guard and revocation path, but not through Google's consent screen.
2. **The token used by the e2e suite is the dev-only fallback.** This Privy app does not expose test credentials, so the
   minter returns `dev-test:<email>` tokens and the bridge verifies them with the dev verifier. That verifier is
   hard-disabled in production (confirmed: minter 404 and forged-token rejection in the production build). The **real**
   Privy SDK verification path is demonstrably intact: posting a forged JWT to `/api/auth/privy/session` returns
   `401 invalid_token — Privy token rejected: "alg" (Algorithm) Header Parameter not allowed`, i.e. the official SDK
   verifier is the one doing the rejecting.
3. **A Privy-side browser session cannot be seeded in Playwright**, so the "restored Privy session on
   `/auth?loggedOut=1`" race is verified by construction and by unit tests, not by an end-to-end browser run. It is the
   one scenario where I am relying on code semantics rather than a reproduced failure.
4. **Logout is best-effort on the client.** `components/shell.tsx` and `components/settings-view.tsx` `await` the
   logout POST and ignore failures (`.catch(() => {})`) before navigating to `/auth?loggedOut=1`. If that POST fails
   (offline, 5xx) the HttpOnly cookie survives, `proxy.ts` sends the visitor from `/auth` back to `/command-center`, and
   the "Signed out" claim would be wrong until the session expires. It is a narrow window (the request is awaited before
   navigation) and it was left as-is to keep the change minimal; a server-side re-check on the post-logout landing would
   close it.
5. **Pre-existing, untouched:** the 2 ESLint errors in `demo-video/record-buel.js`; 58 pre-existing warnings; a dead
   `const loggedOut` in `PrivyLoginFlow` (`app/auth/page.tsx`); and the `?next=` parameter set by `proxy.ts` is never
   consumed by the auth page (a redirected visitor always lands on `/command-center`, not on the page they asked for).
6. **The attached screen recording (`Recording 2026-11-15 032949.mp4`) was not used as evidence** — there is no video
   decoder available in this environment. The bug description in the brief and the code were the sources.
7. **No commit, no push, no deploy.** Production still runs the older build; deploying requires explicit authorisation.

---

## 6. How to re-run

```powershell
npx tsc --noEmit
npx eslint .                                  # 2 pre-existing errors in demo-video/record-buel.js
npx vitest run                                # 147 tests
npx playwright test e2e/auth-cycle.spec.ts    # starts next dev on :3111 with SENTISEL_TEST_SECRET
npx playwright test e2e/api-audit.spec.ts e2e/console-sweep.spec.ts
npm run build
```
