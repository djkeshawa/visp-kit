import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary", "lcov"],
      // Thresholds sit at the measured baseline and only ever rise. Anything
      // below what the suite already achieves silently permits regression,
      // which is the failure mode a threshold exists to prevent — and these sat
      // at 85 / 85 / 88 / 72 against a suite measuring 89.64 / 89.64 / 93.64 /
      // 81.22, so a coverage drop of nine branch points would have passed.
      //
      // LC-52, measured 2026-08-23 +0530 on 057a725 plus this change's tests,
      // 1904 passing tests over 256 files. TWO RUNNERS MEASURE THIS SUITE AND
      // THEY DISAGREE, on the same commit and the same tests:
      //
      //   Linux / Node 22.22.3, what the CI `coverage` job runs:
      //     statements 89.64% (42098/46960)   branches 81.24% (9533/11734)
      //     functions  93.64% (1621/1731)     lines    89.64% (42098/46960)
      //   Linux / Node 26.7.0, a developer running `pnpm check`:
      //     statements 89.64% (42098/46960)   branches 81.22% (9533/11736)
      //     functions  96.77% (1620/1674)     lines    89.64% (42098/46960)
      //
      // Statements and lines agree to the unit across every run. Functions do
      // not even agree on the DENOMINATOR (1731 vs 1674), and the v8 provider's
      // branch TOTAL moves between runs of identical code — 11734, 11735,
      // 11736 and 11737 were all observed here, which moves the percentage
      // without a line of `src/` changing. So this is not "one platform covers
      // more".
      //
      // EACH FIGURE IS PINNED AT THE LOWER OF THE TWO RUNNERS, less 0.05 for
      // that drift — 93.60 for functions even though one runner reports 96.77.
      // The 0.05 is not slack to hide a regression in: it is smaller than the
      // gap any real change makes and larger than the movement measured on no
      // change at all. Pinned exactly at the lower runner, branches fail the
      // first time the same numerator meets a larger denominator (9533/11734 is
      // 81.24%, 9533/11736 is 81.22%, and no `src/` changed between them), and
      // CI's Node 22 functions figure has no margin at all. Windows and macOS
      // are not measured here, and `check` runs this gate on both over code
      // that branches on `process.platform`.
      //
      // Written to the hundredth and never rounded up. Do not tidy these back
      // to round numbers: the digits are the measurement.
      //
      // Branches are gated here purely as a regression guard. The crew's floor
      // (AGENTS.md) is 85% on statements and lines, which is what a PR is held
      // to; 81.2 is not a verdict on the branch gap, which stays open — it
      // only stops the number sliding back while the gap is worked.
      thresholds: { lines: 89.6, statements: 89.6, functions: 93.6, branches: 81.2 }
    }
  }
});
