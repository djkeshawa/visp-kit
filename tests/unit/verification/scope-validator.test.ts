import { describe, expect, it } from "vitest";

import { validateScope } from "../../../src/verification/scope-validator.js";
import { validTaskGraph } from "../artifacts/fixtures.js";

describe("scope validator", () => {
  it("passes allowed changed files", () => {
    const result = validateScope({
      changedFiles: ["src/notes/sort.ts"],
      task: validTaskGraph.tasks[0],
      explicit: false,
      gitWarnings: []
    });

    expect(result.status).toBe("passed");
  });

  it("fails forbidden changed files", () => {
    const result = validateScope({
      changedFiles: ["package.json"],
      task: validTaskGraph.tasks[0],
      explicit: false,
      gitWarnings: []
    });

    expect(result.status).toBe("failed");
    expect(result.forbiddenChangedFiles).toEqual(["package.json"]);
  });

  it("warns when allowedFiles is empty", () => {
    const result = validateScope({
      changedFiles: ["src/other.ts"],
      task: { ...validTaskGraph.tasks[0]!, allowedFiles: [] },
      explicit: false,
      gitWarnings: []
    });

    expect(result.status).toBe("warned");
  });

  it("ignores .visp generated files", () => {
    const result = validateScope({
      changedFiles: [
        ".visp/features/001/verification.json",
        ".visp/features/001/assurance/T001/oracle-plan.json",
        ".visp/features/001/assurance/T001/oracle-lock.json",
        ".visp/features/001/assurance/T001/baseline-evidence.json",
        ".visp/features/001/assurance/T001/candidate-evidence.json"
      ],
      task: validTaskGraph.tasks[0],
      explicit: false,
      gitWarnings: []
    });

    expect(result.changedFiles).toEqual([]);
    expect(result.status).toBe("passed");
  });

  it("normalizes declared scope while preserving raw changed filename identity", () => {
    const changedFiles = [
      "src/notes/sort.ts",
      " src/notes/sort.ts",
      "src/notes/sort.ts ",
      "src/notes/sort.ts\t",
      "src/notes/sort.ts\n",
      "src\\notes\\sort.ts"
    ];
    const result = validateScope({
      changedFiles,
      task: {
        ...validTaskGraph.tasks[0]!,
        allowedFiles: [" src\\notes\\sort.ts "]
      },
      explicit: true,
      gitWarnings: []
    });

    expect(result.allowedFiles).toEqual(["src/notes/sort.ts"]);
    expect(result.changedFiles).toEqual([...changedFiles].sort());
    expect(result.outOfScopeFiles).toEqual(changedFiles.slice(1).sort());
    expect(result.status).toBe("failed");
  });

  it("continues to promote Git warnings when explicit scope is requested", () => {
    const warning = "Git untracked file enumeration failed: unavailable";
    const result = validateScope({
      changedFiles: ["src/notes/sort.ts"],
      task: validTaskGraph.tasks[0],
      explicit: true,
      gitWarnings: [warning]
    });

    expect(result.errors).toContain(warning);
    expect(result.status).toBe("failed");
  });

  it("excludes only valid raw generated paths from explicit verification scope", () => {
    const invalidMarker = ".visp/state/implement-allowed/bad id.json";
    const result = validateScope({
      changedFiles: [
        ".visp/state/implement-allowed.json",
        ".visp/state/implement-allowed/T001.json",
        invalidMarker
      ],
      task: validTaskGraph.tasks[0],
      explicit: true,
      gitWarnings: []
    });

    expect(result.changedFiles).toEqual([invalidMarker]);
    expect(result.outOfScopeFiles).toEqual([invalidMarker]);
    expect(result.status).toBe("failed");
  });
});
