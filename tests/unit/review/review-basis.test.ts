import { describe, expect, it } from "vitest";

import { type ReviewChangedFile } from "../../../src/artifacts/schemas/review.schema.js";
import {
  emptyScopeFinding,
  emptyScopeMessage,
  reviewScopeBasis
} from "../../../src/review/review-basis.js";

function changedFile(filePath: string): ReviewChangedFile {
  return {
    path: filePath,
    changeType: "modified",
    additions: 1,
    deletions: 0,
    inAllowedFiles: true,
    inExpectedFiles: false,
    inForbiddenFiles: false,
    isDependencyFile: false,
    isTestFile: false,
    isGeneratedVispFile: false,
    isBinary: false,
    diffTruncated: false,
    diff: ""
  };
}

describe("reviewScopeBasis", () => {
  it("names the working tree as the basis when no base ref was given", () => {
    const basis = reviewScopeBasis({
      changedFiles: [changedFile("src/notes.ts")],
      diffSource: "unstaged+staged+untracked",
      baseRef: null
    });

    expect(basis.kind).toBe("working-tree");
    expect(basis.description).toContain("Uncommitted working tree");
    expect(basis.description).toContain("--base <git-ref>");
    expect(basis.baseRef).toBeNull();
  });

  it("names the commit range as the basis when a base ref was given", () => {
    const basis = reviewScopeBasis({
      changedFiles: [changedFile("src/notes.ts")],
      diffSource: "base:main",
      baseRef: "main"
    });

    expect(basis.kind).toBe("base-range");
    expect(basis.description).toContain("main...HEAD");
  });

  it("reports every examined file and counts them", () => {
    const basis = reviewScopeBasis({
      changedFiles: [changedFile("src/notes.ts"), changedFile(".visp/status.json")],
      diffSource: "unstaged",
      baseRef: null
    });

    expect(basis.filesExamined).toBe(2);
    expect(basis.examinedFiles).toEqual(["src/notes.ts", ".visp/status.json"]);
  });

  it("counts only the author's own files as reviewable", () => {
    const basis = reviewScopeBasis({
      changedFiles: [changedFile("src/notes.ts"), changedFile(".visp/status.json")],
      diffSource: "unstaged",
      baseRef: null
    });

    expect(basis.reviewableFiles).toEqual(["src/notes.ts"]);
    expect(basis.empty).toBe(false);
  });

  it("reports an empty scope when the diff holds nothing but Visp's own artifacts", () => {
    const basis = reviewScopeBasis({
      changedFiles: [changedFile(".visp/status.json"), changedFile(".visp/runs/index.json")],
      diffSource: "unstaged+staged+untracked",
      baseRef: null
    });

    expect(basis.filesExamined).toBe(2);
    expect(basis.reviewableFiles).toEqual([]);
    expect(basis.empty).toBe(true);
  });

  it("reports an empty scope when nothing changed at all", () => {
    const basis = reviewScopeBasis({
      changedFiles: [],
      diffSource: "unstaged+staged+untracked",
      baseRef: null
    });

    expect(basis.empty).toBe(true);
    expect(basis.filesExamined).toBe(0);
  });
});

describe("emptyScopeFinding", () => {
  it("blocks the review rather than warning about it", () => {
    const basis = reviewScopeBasis({
      changedFiles: [],
      diffSource: "unstaged+staged+untracked",
      baseRef: null
    });

    const finding = emptyScopeFinding({ basis, taskId: "T001" });

    expect(finding.severity).toBe("error");
    expect(finding.category).toBe("scope");
    expect(finding.relatedTaskId).toBe("T001");
  });

  it("tells a working-tree caller how to review committed work", () => {
    const basis = reviewScopeBasis({
      changedFiles: [],
      diffSource: "unstaged",
      baseRef: null
    });

    expect(emptyScopeFinding({ basis }).recommendation).toContain("--base <git-ref>");
  });

  it("tells a base-range caller to point the base somewhere useful", () => {
    const basis = reviewScopeBasis({
      changedFiles: [],
      diffSource: "base:main",
      baseRef: "main"
    });

    const finding = emptyScopeFinding({ basis });

    expect(finding.description).toContain("main...HEAD");
    expect(finding.recommendation).toContain("`--base`");
  });
});

describe("emptyScopeMessage", () => {
  it("states the basis and both file counts", () => {
    const basis = reviewScopeBasis({
      changedFiles: [changedFile(".visp/status.json")],
      diffSource: "unstaged",
      baseRef: null
    });

    const message = emptyScopeMessage(basis);

    expect(message).toContain("Files examined: 1");
    expect(message).toContain("reviewable: 0");
    expect(message).toContain("Uncommitted working tree");
  });
});
