import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests spawn the CLI and git repeatedly; under parallel
    // workers (especially on Windows) they can exceed the 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary", "lcov"],
      // Calibrated just below measured coverage (2026-07); ratchet upward as
      // coverage improves, never downward to admit regressions.
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 88,
        branches: 72
      }
    }
  }
});
