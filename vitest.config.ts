import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 30000,
    // Unit tests run in every CI run; integration tests use PGlite (embedded,
    // deterministic Postgres) and mocked network. No external services here.
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
