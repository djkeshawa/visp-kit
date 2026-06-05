import { describe, expect, it } from "vitest";

import { validateDependencies } from "../../../src/verification/dependency-validator.js";
import { validTaskGraph } from "../artifacts/fixtures.js";

describe("dependency validator", () => {
  it("passes when no dependency files changed", () => {
    const result = validateDependencies({
      changedFiles: ["src/notes/sort.ts"],
      task: validTaskGraph.tasks[0]
    });

    expect(result.status).toBe("passed");
    expect(result.changedDependencyFiles).toEqual([]);
  });

  it("fails dependency file changes without approval", () => {
    const result = validateDependencies({
      changedFiles: ["go.mod", "pom.xml", "pyproject.toml", "Cargo.toml"],
      task: {
        ...validTaskGraph.tasks[0]!,
        allowedFiles: ["src/notes/sort.ts"],
        expectedFiles: ["tests/notes/sort.test.ts"]
      }
    });

    expect(result.status).toBe("failed");
    expect(result.errors.join(" ")).toContain("go.mod");
    expect(result.errors.join(" ")).toContain("pom.xml");
    expect(result.errors.join(" ")).toContain("pyproject.toml");
    expect(result.errors.join(" ")).toContain("Cargo.toml");
  });

  it("warns when dependency files are allowed by task scope", () => {
    const result = validateDependencies({
      changedFiles: ["package.json"],
      task: {
        ...validTaskGraph.tasks[0]!,
        allowedFiles: ["src/notes/sort.ts", "package.json"]
      }
    });

    expect(result.status).toBe("warned");
    expect(result.approvedByTaskScope).toBe(true);
  });
});
