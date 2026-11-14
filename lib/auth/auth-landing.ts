/*
 * Post-logout landing policy for /auth — pure and unit-testable.
 *
 * The authentication page is reached in three different situations, and the
 * difference matters because two of them must NOT touch a Privy session:
 *
 *   a. a normal visit / a return from the OAuth chooser — the restored Privy
 *      session must be bridged into an application session;
 *   b. the landing right after BUEL logout (`/auth?loggedOut=1`) — any Privy
 *      session still on the device must be cleared, never bridged;
 *   c. the landing after (b), once the user has started a NEW sign-in — the
 *      freshly authenticated Privy session must be left alone.
 *
 * Keeping the decision here (instead of inline in the component) is what makes
 * the ordering testable: the sign-in → sign-out loop was a state-visibility
 * bug, where a guard read a React state value that had not been committed yet.
 * The flags below are read from synchronous refs, so "already handled" and
 * "user started a new sign-in" are never stale.
 */

export type AuthLandingState = {
  /** Privy SDK finished initialising (nothing is known before this). */
  ready: boolean;
  /** Privy currently holds a session on this device. */
  authenticated: boolean;
  /** The URL carries ?loggedOut=1 (set by every BUEL sign-out). */
  loggedOutFlag: boolean;
  /** ?loggedOut=1 was already consumed for this page load (and stripped). */
  logoutHandled: boolean;
  /** A Privy logout has already been requested for this post-logout landing. */
  privyCleared: boolean;
  /** The automatic restored-session bridge already fired for this page load. */
  bridgeAttempted: boolean;
  /** The user pressed "Sign in" on this page load (a new session is intended). */
  signInStarted: boolean;
};

export type AuthLandingActions = {
  /** Strip ?loggedOut=1 and show the one-time "Signed out" notice. */
  consumeLoggedOutFlag: boolean;
  /** Alias for the notice itself, kept explicit for readability at call sites. */
  showSignedOutNotice: boolean;
  /** Clear the device-local Privy session (never the app session). */
  clearPrivySession: boolean;
  /** Bridge a restored Privy session into the application. */
  bridgeRestoredSession: boolean;
};

export function decideAuthLanding(state: AuthLandingState): AuthLandingActions {
  // "This page load is the post-logout landing": either the flag is still in
  // the URL or it was already consumed for this mount.
  const postLogout = state.logoutHandled || state.loggedOutFlag;
  const consume = state.loggedOutFlag && !state.logoutHandled;

  return {
    consumeLoggedOutFlag: consume,
    showSignedOutNotice: consume,
    // Clear only on a post-logout landing, only once, and never after the user
    // has begun a new sign-in — that session is the one we want to keep.
    clearPrivySession:
      state.ready && state.authenticated && postLogout && !state.privyCleared && !state.signInStarted,
    // Bridge only outside the post-logout landing: bridging there would log the
    // user straight back in and re-create the loop from the other direction.
    bridgeRestoredSession:
      state.ready && state.authenticated && !postLogout && !state.bridgeAttempted,
  };
}
