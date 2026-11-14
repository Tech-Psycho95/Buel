import { NextRequest, NextResponse } from "next/server";

/*
 * proxy.ts (Next.js 16) — UX-level redirect for unauthenticated visitors.
 *
 * SECURITY NOTE: this is NOT the authorization boundary. Every protected page
 * re-validates the session server-side (lib/auth/guard.ts) and every API route
 * re-checks session + ownership independently. This file only redirects
 * anonymous visitors to /login before rendering.
 */

const PROTECTED_PREFIXES = [
  "/command-center",
  "/market-pulse",
  "/agent-council",
  "/decision-ledger",
  "/scenario-lab",
  "/strategy-arena",
  "/paper-trading",
  "/portfolio-guardian",
  "/catalyst-intelligence",
  "/market-memory",
  "/performance-lab",
  "/evidence-graph",
  "/forensics",
  "/watchlists",
  "/risk-preferences",
  "/settings",
  "/onboarding",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasCookie = Boolean(req.cookies.get("sentisel_session")?.value);

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const isAuthPage = pathname === "/auth";

  if (isProtected && !hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (isAuthPage && hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/command-center";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/command-center/:path*",
    "/market-pulse/:path*",
    "/agent-council/:path*",
    "/decision-ledger/:path*",
    "/scenario-lab/:path*",
    "/strategy-arena/:path*",
    "/paper-trading/:path*",
    "/portfolio-guardian/:path*",
    "/catalyst-intelligence/:path*",
    "/market-memory/:path*",
    "/performance-lab/:path*",
    "/evidence-graph/:path*",
    "/forensics/:path*",
    "/watchlists/:path*",
    "/risk-preferences/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/auth",
  ],
};
