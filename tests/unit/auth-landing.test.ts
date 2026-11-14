import { describe, it, expect } from "vitest";
import { decideAuthLanding, type AuthLandingState } from "@/lib/auth/auth-landing";

/*
 * The sign-in → logout loop came from ordering, not from a missing check: the
 * cleanup effect and the auto-bridge effect ran in the same commit, and the
 * bridge read a React state value the cleanup had just set but not yet
 * committed. These cases pin the resulting decision matrix down, including the
 * two cases that produced the loop and the one that would produce its mirror
 * image (clearing the Privy session the user just authenticated).
 */

const base: AuthLandingState = {
  ready: true,
  authenticated: false,
  loggedOutFlag: false,
  logoutHandled: false,
  privyCleared: false,
  bridgeAttempted: false,
  signInStarted: false,
};

describe("decideAuthLanding", () => {
  it("bridges a restored Privy session on a normal /auth visit", () => {
    const d = decideAuthLanding({ ...base, authenticated: true });
    expect(d.bridgeRestoredSession).toBe(true);
    expect(d.clearPrivySession).toBe(false);
    expect(d.consumeLoggedOutFlag).toBe(false);
    expect(d.showSignedOutNotice).toBe(false);
  });

  it("clears — never bridges — a Privy session found on the post-logout landing", () => {
    const d = decideAuthLanding({ ...base, authenticated: true, loggedOutFlag: true });
    expect(d.clearPrivySession).toBe(true);
    expect(d.bridgeRestoredSession).toBe(false);
    expect(d.consumeLoggedOutFlag).toBe(true);
    expect(d.showSignedOutNotice).toBe(true);
  });

  it("still clears a Privy session Privy restores AFTER the flag was consumed", () => {
    // This is the reload/async-restore ordering: the URL is already clean for
    // this page load, but the landing is still the post-logout one.
    const d = decideAuthLanding({ ...base, authenticated: true, logoutHandled: true });
    expect(d.clearPrivySession).toBe(true);
    expect(d.bridgeRestoredSession).toBe(false);
    expect(d.consumeLoggedOutFlag).toBe(false);
    expect(d.showSignedOutNotice).toBe(false);
  });

  it("leaves the session alone once the user starts a new sign-in", () => {
    const d = decideAuthLanding({
      ...base,
      authenticated: true,
      logoutHandled: true,
      signInStarted: true,
      privyCleared: true,
    });
    expect(d.clearPrivySession).toBe(false);
    expect(d.bridgeRestoredSession).toBe(false);
  });

  it("never re-arms the flag cleanup within the same page load", () => {
    const d = decideAuthLanding({ ...base, loggedOutFlag: true, logoutHandled: true });
    expect(d.consumeLoggedOutFlag).toBe(false);
    expect(d.showSignedOutNotice).toBe(false);
    expect(d.clearPrivySession).toBe(false);
  });

  it("does not repeat a bridge that already fired", () => {
    const d = decideAuthLanding({ ...base, authenticated: true, bridgeAttempted: true });
    expect(d.bridgeRestoredSession).toBe(false);
  });

  it("does not repeat a Privy logout that was already requested", () => {
    const d = decideAuthLanding({
      ...base,
      authenticated: true,
      loggedOutFlag: true,
      privyCleared: true,
    });
    expect(d.clearPrivySession).toBe(false);
    expect(d.bridgeRestoredSession).toBe(false);
  });

  it("decides nothing before Privy is ready", () => {
    const d = decideAuthLanding({ ...base, ready: false, authenticated: true, loggedOutFlag: true });
    expect(d.clearPrivySession).toBe(false);
    expect(d.bridgeRestoredSession).toBe(false);
    // The URL flag is still consumed: it must be gone before any reload.
    expect(d.consumeLoggedOutFlag).toBe(true);
  });
});
