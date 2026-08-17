import { describe, expect, it } from "vitest";

import { type ContextPack } from "../../../src/artifacts/schemas/context-pack.schema.js";
import { type Task } from "../../../src/artifacts/schemas/task.schema.js";
import { contextPackIsStale } from "../../../src/context/context-pack-staleness.js";

const task: Task = {
  id: "T001",
  title: "Implement note pinning helper",
  description: "Update the note helper and test coverage for pinning.",
  requirementIds: ["REQ001"],
  acceptanceCriterionIds: ["AC001"],
  dependsOn: [],
  allowedFiles: ["src/notes.ts"],
  validationCommands: ["pnpm test"],
  status: "ready",
  parallelizable: false,
  riskLevel: "low"
};

function pack(selectedTask: Task): ContextPack {
  return { taskId: selectedTask.id, selectedTask } as unknown as ContextPack;
}

describe("contextPackIsStale", () => {
  it("reports a pack as current when the graph copy of the task still matches", () => {
    expect(contextPackIsStale({ contextPack: pack(task), task })).toBe(false);
  });

  it("reports a pack as stale when the task was re-scoped after it was compiled", () => {
    expect(
      contextPackIsStale({
        contextPack: pack(task),
        task: { ...task, allowedFiles: ["src/notes.ts", "src/other.ts"] }
      })
    ).toBe(true);
  });

  it("keeps a pack current when only the task's status advanced", () => {
    // The workflow moves status itself — reconcile writes `verified` at the end
    // of `visp-kit done`. Treating that as staleness sent `visp-kit next` back
    // to `visp-kit context T001 --force` for a task that was already finished.
    expect(
      contextPackIsStale({
        contextPack: pack(task),
        task: { ...task, status: "verified" }
      })
    ).toBe(false);
  });

  it("judges nothing when the pack belongs to a different task", () => {
    expect(
      contextPackIsStale({
        contextPack: pack(task),
        task: { ...task, id: "T002", allowedFiles: ["src/other.ts"] }
      })
    ).toBe(false);
  });

  it("judges nothing when there is no pack or no task", () => {
    expect(contextPackIsStale({ contextPack: undefined, task })).toBe(false);
    expect(contextPackIsStale({ contextPack: pack(task), task: undefined })).toBe(false);
  });
});
