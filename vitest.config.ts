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
      // at 85 / 85 / 88 / 72 against a suite measuring 89.69 / 89.69 / 93.66 /
      // 81.29, so a nine-point branch regression would have passed unnoticed.
      //
      // LC-52, measured 2026-08-23 +0530 on 62323a1 plus this change's tests,
      // 1956 passing tests over 260 files.
      //
      // TWO RUNNERS MEASURE THIS SUITE AND THEY DISAGREE, on the same commit
      // and the same tests. Two runs on each, four in total:
      //
      //   Linux / Node 22.22.3, what the CI `coverage` job runs:
      //     statements 89.69% (42174/47019)   branches 81.31% (9560/11757)
      //     functions  93.66% (1626/1736)     lines    89.69% (42174/47019)
      //     second run: branches 81.31% (9562/11759), everything else identical
      //   Linux / Node 26.7.0, a developer running `pnpm check`:
      //     statements 89.69% (42174/47019)   branches 81.29% (9560/11759)
      //     functions  96.78% (1625/1679)     lines    89.69% (42174/47019)
      //     second run: identical in every figure
      //
      // Statements and lines are stable — same numerator and denominator in all
      // four runs. The other two are not, and not in the way "one platform
      // covers more" would predict:
      //
      //   * FUNCTIONS DO NOT AGREE ON THE DENOMINATOR. 1736 functions exist on
      //     Node 22 and 1679 on Node 26, from one unchanged `src/`. The 3.12
      //     point spread is an artifact of what each engine reports, not of
      //     what the tests reach.
      //   * THE BRANCH TOTAL MOVES BETWEEN RUNS OF IDENTICAL CODE. The two
      //     Node 22 runs above are the same commit, the same tests, minutes
      //     apart: 9560/11757 and 9562/11759. Earlier runs of this same tree on
      //     a loaded machine reported branch totals of 11734, 11735, 11736 and
      //     11737. The percentage held here; the counts did not.
      //
      // EACH FIGURE IS PINNED AT THE LOWER OF THE TWO RUNNERS, LESS 0.05 for
      // that drift: branches from Node 26's 81.29, functions from Node 22's
      // 93.66 even though the other runner reports 96.78. The 0.05 is not slack
      // to hide a regression in — it is smaller than the gap any real change
      // makes and larger than the movement measured on no change at all.
      // Pinned exactly at a runner's figure instead, the gate goes red on an
      // untouched commit the first time the counts land one tick the other way,
      // and a red gate nobody can satisfy is the one the next person under time
      // pressure lowers. Windows and macOS are not measured here, and `check`
      // runs this gate on both over code that branches on `process.platform`.
      //
      // Written to the hundredth and never rounded up. Do not tidy these back
      // to round numbers: the digits are the measurement.
      //
      // Branches are gated here purely as a regression guard. The crew's floor
      // (AGENTS.md) is 85% on statements and lines, and that is what a PR is
      // held to; 81.24 is not a verdict on the branch gap, which stays open —
      // it only stops the number sliding back while the gap is worked.
      thresholds: { lines: 89.64, statements: 89.64, functions: 93.61, branches: 81.24 }
    }
  }
});
