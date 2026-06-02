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
      changedFiles: [".visp/features/001/verification.json"],
      task: validTaskGraph.tasks[0],
      explicit: false,
      gitWarnings: []
    });

    expect(result.changedFiles).toEqual([]);
    expect(result.status).toBe("passed");
  });
});
