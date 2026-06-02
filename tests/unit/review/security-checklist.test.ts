import { describe, expect, it } from "vitest";

import { securityChecklist } from "../../../src/review/security-checklist.js";

describe("security checklist", () => {
  it("includes Electron IPC items for preload/ipc files", () => {
    const result = securityChecklist({
      changedFiles: [
        {
          path: "src/preload/ipc.ts",
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
        }
      ]
    });

    expect(result.checklist.map((item) => item.category)).toContain("Electron IPC");
  });

  it("includes API input validation items for route files", () => {
    const result = securityChecklist({
      changedFiles: [
        {
          path: "src/api/notes.route.ts",
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
        }
      ]
    });

    expect(result.checklist.map((item) => item.category)).toContain("network/API changes");
  });
});
