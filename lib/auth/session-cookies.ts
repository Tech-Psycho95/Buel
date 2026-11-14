import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import {
  createSession,
  resolveSession,
  revokeSession,
  type SessionUser,
} from "./session-core";

/*
 * Cookie glue for Next.js. The cookie is HttpOnly, Secure in production, and
 * SameSite=Lax — the browser never sees a readable credential, and cross-site
 * POSTs do not carry it.
 */

export const SESSION_COOKIE = "sentisel_session";

const cookieOptions = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60,
};

export async function startSessionCookie(userId: string): Promise<void> {
  const db = await getDb();
  const { token } = await createSession(db, userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions);
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  return resolveSession(db, token);
}

/** Raw current session token (for keep-this-session operations). */
export async function sessionCookieToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}

export async function endSessionCookie(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await revokeSession(db, token);
  }
  jar.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}
