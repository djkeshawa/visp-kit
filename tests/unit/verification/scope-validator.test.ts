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

  it("warns when the task declares no file scope at all", () => {
    const result = validateScope({
      changedFiles: ["src/other.ts"],
      task: { ...validTaskGraph.tasks[0]!, allowedFiles: [], expectedFiles: [] },
      explicit: false,
      gitWarnings: []
    });

    expect(result.status).toBe("warned");
    expect(result.outOfScopeFiles).toEqual([]);
  });

  it("still enforces scope declared only through expectedFiles", () => {
    const result = validateScope({
      changedFiles: ["src/other.ts"],
      task: {
        ...validTaskGraph.tasks[0]!,
        allowedFiles: [],
        expectedFiles: ["src/notes/sort.ts"]
      },
      explicit: false,
      gitWarnings: []
    });

    expect(result.outOfScopeFiles).toEqual(["src/other.ts"]);
    expect(result.status).toBe("failed");
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

  it("reads a ./-prefixed declared path as the same file the gate layer reads", () => {
    const result = validateScope({
      changedFiles: ["src/notes/sort.ts"],
      task: { ...validTaskGraph.tasks[0]!, allowedFiles: ["./src/notes/sort.ts"] },
      explicit: true,
      gitWarnings: []
    });

    expect(result.allowedFiles).toEqual(["src/notes/sort.ts"]);
    expect(result.outOfScopeFiles).toEqual([]);
    expect(result.status).toBe("passed");
  });

  it("enforces a forbidden path that was declared with a ./ prefix", () => {
    const result = validateScope({
      changedFiles: ["package.json"],
      task: {
        ...validTaskGraph.tasks[0]!,
        allowedFiles: ["package.json"],
        forbiddenFiles: ["./package.json"]
      },
      explicit: true,
      gitWarnings: []
    });

    expect(result.forbiddenChangedFiles).toEqual(["package.json"]);
    expect(result.status).toBe("failed");
  });
});
