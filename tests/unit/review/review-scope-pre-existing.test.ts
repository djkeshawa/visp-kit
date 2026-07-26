import { describe, expect, it } from "vitest";

import { reviewScope } from "../../../src/review/review-scope.js";

const task = {
  id: "T001",
  allowedFiles: ["tests/site.spec.js"],
  expectedFiles: ["tests/site.spec.js"],
  forbiddenFiles: [],
  requirementIds: ["REQ001"],
  acceptanceCriterionIds: ["AC001"]
};

const taskGraph = { tasks: [task] };

function file(path: string) {
  return { path, isGeneratedVispFile: false };
}

function run(preExistingChangedFiles?: readonly string[]) {
  return reviewScope({
    files: [file("tests/site.spec.js"), file("styles.css"), file("features.html")] as never,
    task: task as never,
    taskGraph: taskGraph as never,
    ...(preExistingChangedFiles === undefined ? {} : { preExistingChangedFiles })
  });
}

describe("pre-existing changes are attributed to earlier work", () => {
  it("reports every out-of-scope file as a violation when no starting state was recorded", () => {
    const result = run();

    // Absent means "not captured", not "the tree was clean" — behaviour is
    // unchanged for markers written before the field existed.
    expect([...result.scopeReview.outOfScopeFiles].sort()).toEqual(["features.html", "styles.css"]);
    expect(result.scopeReview.preExistingOutOfScopeFiles).toEqual([]);
    expect(result.scopeReview.status).toBe("failed");
  });

  it("moves files that were already dirty out of the violation list", () => {
    const result = run(["styles.css", "features.html"]);

    expect(result.scopeReview.outOfScopeFiles).toEqual([]);
    expect([...result.scopeReview.preExistingOutOfScopeFiles].sort()).toEqual([
      "features.html",
      "styles.css"
    ]);
  });

  it("still fails on a file this task actually changed outside its scope", () => {
    // styles.css was already dirty; features.html was not, so it remains a
    // genuine violation by the current task.
    const result = run(["styles.css"]);

    expect(result.scopeReview.outOfScopeFiles).toEqual(["features.html"]);
    expect(result.scopeReview.preExistingOutOfScopeFiles).toEqual(["styles.css"]);
    expect(result.scopeReview.status).toBe("failed");
  });

  it("reports pre-existing files as warnings rather than errors", () => {
    const result = run(["styles.css", "features.html"]);
    const preExisting = result.findings.filter(
      (item) => item.title === "Pre-existing change outside task scope"
    );

    expect(preExisting).toHaveLength(2);
    expect(preExisting.every((item) => item.severity === "warning")).toBe(true);
    expect(result.scopeReview.errors).toEqual([]);
    expect(result.scopeReview.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("never excuses a file inside forbiddenFiles", () => {
    const forbidden = { ...task, forbiddenFiles: ["styles.css"] };
    const result = reviewScope({
      files: [file("styles.css")] as never,
      task: forbidden as never,
      taskGraph: { tasks: [forbidden] } as never,
      preExistingChangedFiles: ["styles.css"]
    });

    // Pre-existing attribution must not launder a forbidden path.
    expect(result.scopeReview.forbiddenChangedFiles).toEqual(["styles.css"]);
    expect(result.scopeReview.status).toBe("failed");
  });
});
