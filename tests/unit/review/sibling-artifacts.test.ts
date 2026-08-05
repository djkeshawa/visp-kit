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

import { isGeneratedVispReviewFile } from "../../../src/review/diff-summary.js";

describe("cross-product artifacts are not user source changes", () => {
  it.each([
    ".visp/hyper/state.json",
    ".visp/hyper/config.json",
    ".visp/hyper/context/manifest.json"
  ])("treats %s as tool-owned", (filePath) => {
    expect(
      isGeneratedVispReviewFile(filePath),
      `${filePath} is written by visp-hyper-agent on ordinary use. Counting it as a user ` +
        "source change makes every Hyper-driven session violate Kit's own scope rule."
    ).toBe(true);
  });

  it.each([
    "src/main.rs",
    "Cargo.toml",
    ".visp/features/001-a/spec.json",
    ".visp/memory/constitution.md"
  ])("still treats %s as a real change", (filePath) => {
    // The converse, and the reason this is an allowlist rather than a blanket
    // `.visp/` filter: artifacts a human edits must keep surfacing in review.
    // A fix that excluded all of `.visp/` would silently stop reviewing the
    // spec and the constitution.
    expect(isGeneratedVispReviewFile(filePath)).toBe(false);
  });
});
