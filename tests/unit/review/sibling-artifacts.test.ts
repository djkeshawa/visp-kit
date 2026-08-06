// P13 — a sibling product's state is not the user's source.
//
// Kit decides what counts as a user source change by consulting a
// hand-maintained allowlist of tool-owned `.visp/` paths. The list was written
// when Kit was the only product writing there. It had never heard of
// `.visp/hyper/`, which visp-hyper-agent rewrites on essentially every command
// — including the commands that drive Kit.
//
// So running `visp check` on a real feature reported the toolchain's own state
// file as an unattributed out-of-scope change against the user's task. Using
// the products together made their own gate fail.

import { describe, expect, it } from "vitest";

import {
  isExemptFromTaskScope,
  isGeneratedVispReviewFile
} from "../../../src/review/diff-summary.js";

describe("cross-product artifacts are not user source changes", () => {
  it.each([
    ".visp/hyper/state.json",
    ".visp/hyper/config.json",
    ".visp/hyper/context/manifest.json",
    // Project-root files the toolchain writes during setup. Four of the five
    // out-of-scope findings on a first real feature were these.
    ".mcp.json",
    "AGENTS.md",
    "visp-memory.yaml"
  ])("treats %s as tool-owned", (filePath) => {
    expect(
      isGeneratedVispReviewFile(filePath),
      `${filePath} is written by visp-hyper-agent on ordinary use. Counting it as a user ` +
        "source change makes every Hyper-driven session violate Kit's own scope rule."
    ).toBe(true);
  });

  it.each([
    ".visp/features/001-a/spec.json",
    ".visp/features/001-a/plan.json",
    ".visp/features/001-a/task-graph.json",
    ".visp/memory/constitution.md"
  ])("exempts the workflow artifact %s from task scope", (filePath) => {
    // This assertion is INVERTED from what it said first, and the inversion is
    // the finding. It used to require these to surface as changes, reasoning
    // that a human edits them so a reviewer should see it.
    //
    // Dogfooding a second feature showed the cost: `visp check` reported
    // sixteen out-of-scope files, among them the spec, plan, clarifications
    // and task graph the workflow had just ordered the user to fill in. The
    // task was blamed for doing exactly what it was told.
    //
    // The gate path has always filtered all of `.visp/`, so the two halves of
    // one product disagreed; and an edited spec is checked far more strongly
    // by `visp-kit spec --validate`, which reads its contents, than by a
    // mention in a diff.
    // Exempt from SCOPE, deliberately still visible to the integrity paths:
    // `isGeneratedVispReviewFile` feeds the assurance diff snapshot and the
    // candidate-evidence fingerprints, and hiding a spec from those would
    // disable tamper detection.
    expect(isExemptFromTaskScope(filePath)).toBe(true);
    expect(isGeneratedVispReviewFile(filePath)).toBe(false);
  });

  it.each([
    ".visp/state/implement-allowed/$T001.json",
    ".visp/features/001-a/assurance/T001/planted.json"
  ])("still surfaces %s, because a forged file there grants something", (filePath) => {
    expect(isExemptFromTaskScope(filePath)).toBe(false);
  });

  it.each(["src/main.rs", "Cargo.toml", "README.md", "tests/notes.test.ts"])(
    "still treats real source file %s as a change",
    (filePath) => {
      // The converse that matters: user source must never be excluded, or
      // scope checking stops meaning anything at all.
      expect(isGeneratedVispReviewFile(filePath)).toBe(false);
    }
  );
});
