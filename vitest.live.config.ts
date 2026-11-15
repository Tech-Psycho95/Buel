import { defineConfig } from "vitest/config";
import path from "node:path";

// Live-suite: opt-in only (`npm run test:live`). Hits real Hyperliquid and Groq
// endpoints so external availability never affects the core suite.
export default defineConfig({
  test: {
    include: ["tests/live/**/*.test.ts"],
    environment: "node",
    testTimeout: 60000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
