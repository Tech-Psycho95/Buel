import { redirect } from "next/navigation";
import { currentUser } from "./session-cookies";
import type { SessionUser } from "./session-core";

/*
 * Server-side authorization. These checks run in every protected layout and
 * every API route — proxy.ts is a UX convenience only and is never a security
 * boundary.
 */

/** For server components/layouts: unauthenticated → redirect to /login. */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Onboarded-only pages: incomplete onboarding → /onboarding. */
export async function requireOnboardedUser(): Promise<SessionUser> {
  const user = await requirePageUser();
  if (!user.onboardedAt) redirect("/onboarding");
  return user;
}

/**
 * For route handlers: returns null instead of redirecting — the handler maps
 * that to 401. Every mutating API route MUST call this and must also verify
 * per-resource ownership (userId scoping) before touching data.
 */
export async function requireApiUser(): Promise<SessionUser | null> {
  return currentUser();
}
