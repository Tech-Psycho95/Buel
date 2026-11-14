/*
 * Central BUEL brand configuration — the single place where the product
 * name, asset paths and public metadata live. Change the brand here and
 * every surface (component, metadata, auth, footer) follows.
 */

export const brand = {
  /** Product name shown anywhere user-facing. */
  name: "BUEL",
  /** Default document title. */
  title: "BUEL — Autonomous Market Intelligence",
  /** Metadata description. */
  description:
    "Evidence-first, paper-trading-only market intelligence. Every decision shows its evidence, its strongest counterargument, and what would invalidate it.",
  /** Sign-in button / page copy. */
  signIn: "Sign in to BUEL",
  /** Official production URL (canonical + Open Graph base). */
  productionUrl: "https://buel-app.vercel.app",
  /** Legacy production URL — permanently redirected to productionUrl (see next.config.ts). */
  legacyProductionUrl: "https://sentisel.vercel.app",
  /** Public asset paths (all flat monochrome, transparent backgrounds). */
  assets: {
    symbol: "/buel-symbol.svg",
    symbolWhite: "/buel-symbol-white.svg",
    symbolBlack: "/buel-symbol-black.svg",
    wordmark: "/buel-wordmark.svg",
    icon: "/buel-icon.svg",
    mark: "/buel-mark.svg",
    icon192: "/brand/buel-icon-192.png",
    icon512: "/brand/buel-icon-512.png",
  },
} as const;
