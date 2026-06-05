import { describe, expect, it } from "vitest";

import {
  isDependencyFile,
  isGeneratedVispReviewFile,
  isTestFile
} from "../../../src/review/diff-summary.js";

describe("diff summary helpers", () => {
  it("treats implementation checklist files as generated Visp artifacts", () => {
    expect(
      isGeneratedVispReviewFile(
        ".visp/features/001-add-note-pinning/context/T001.implementation-checklist.md"
      )
    ).toBe(true);
  });

  it("detects core language dependency and test files", () => {
    expect(isDependencyFile("go.mod")).toBe(true);
    expect(isDependencyFile("pom.xml")).toBe(true);
    expect(isDependencyFile("pyproject.toml")).toBe(true);
    expect(isDependencyFile("Cargo.toml")).toBe(true);
    expect(isTestFile("notes_test.go")).toBe(true);
    expect(isTestFile("src/NoteServiceTest.java")).toBe(true);
    expect(isTestFile("tests/test_notes.py")).toBe(true);
    expect(isTestFile("src/notes_test.rs")).toBe(true);
  });
});
