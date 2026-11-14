import type { NextConfig } from "next";

/*
 * Legacy production domain → official domain.
 * sentisel.vercel.app is kept assigned to the BUEL project but every request
 * to it is permanently redirected (308) to buel-app.vercel.app, preserving
 * the path and query string. Only matches the legacy host — the canonical
 * domain is never redirected.
 */
const nextConfig: NextConfig = {
  // Pin the workspace root so Next never infers the home directory.
  turbopack: { root: import.meta.dirname },
  // Server-only packages kept out of the client bundle.
  serverExternalPackages: ["pglite", "postgres"],
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "sentisel.vercel.app" }],
        destination: "https://buel-app.vercel.app/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
