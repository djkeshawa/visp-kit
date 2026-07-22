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

  it("treats legacy and per-task implementation markers as generated Visp artifacts", () => {
    expect(isGeneratedVispReviewFile(".visp/state/implement-allowed.json")).toBe(true);
    expect(isGeneratedVispReviewFile(".visp/state/implement-allowed/T001.json")).toBe(true);
    expect(isGeneratedVispReviewFile(".visp/state/implement-allowed/task:one_2.json")).toBe(true);
  });

  it.each([
    " .visp/state/implement-allowed.json",
    ".visp/state/implement-allowed.json ",
    "\t.visp/state/implement-allowed.json",
    ".visp/state/implement-allowed.json\n",
    ".visp\\state\\implement-allowed\\T001.json",
    ".visp/state/session.json",
    ".visp/state/implement-allowed/nested/T001.json",
    ".visp/state/implement-allowed/T001.txt",
    ".visp/state/implement-allowed/bad id.json",
    ".visp/state/implement-allowed/$T001.json",
    " .visp/reports/review.json",
    ".visp\\reports\\review.json"
  ])("does not classify raw marker lookalike %j as generated", (filePath) => {
    expect(isGeneratedVispReviewFile(filePath)).toBe(false);
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

  it.each([
    "package.json",
    "pnpm-lock.yaml",
    "go.mod",
    "pyproject.toml",
    "Cargo.toml"
  ])("classifies exact raw canonical dependency %j", (filePath) => {
    expect(isDependencyFile(filePath)).toBe(true);
  });

  it.each([
    " package.json",
    "package.json ",
    "\tpackage.json",
    "package.json\t",
    "package.json\n",
    "package.json\u0001",
    '"package.json"',
    "dir\\package.json"
  ])("does not classify raw dependency lookalike %j", (filePath) => {
    expect(isDependencyFile(filePath)).toBe(false);
  });
});
