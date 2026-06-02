import { describe, expect, it } from "vitest";

import { type TaskGraphArtifact } from "../../../src/artifacts/schemas/task.schema.js";
import {
  selectNextTask,
  selectTaskById
} from "../../../src/context/task-selector.js";
import { isErr } from "../../../src/core/result.js";
import { timestamp, validTaskGraph } from "../artifacts/fixtures.js";

function graph(
  tasks: TaskGraphArtifact["tasks"]
): TaskGraphArtifact {
  return {
    featureId: "001",
    featureSlug: "note-pinning",
    tasks,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("task selector", () => {
  it("finds exact task IDs", () => {
    const selected = selectTaskById(validTaskGraph, "T001");

    expect(selected.ok).toBe(true);
    if (selected.ok) expect(selected.value.id).toBe("T001");
  });

  it("fails clearly for missing tasks", () => {
    const selected = selectTaskById(validTaskGraph, "T999");

    expect(isErr(selected)).toBe(true);
    if (isErr(selected)) expect(selected.error.message).toContain("Available task IDs");
  });

  it("selects the first ready task", () => {
    const selected = selectNextTask(
      graph([
        { ...validTaskGraph.tasks[0]!, id: "T001", status: "pending" },
        { ...validTaskGraph.tasks[0]!, id: "T002", status: "ready" }
      ])
    );

    expect(selected.ok && selected.value.id).toBe("T002");
  });

  it("falls back to pending tasks with resolved dependencies", () => {
    const selected = selectNextTask(
      graph([
        { ...validTaskGraph.tasks[0]!, id: "T001", status: "done" },
        {
          ...validTaskGraph.tasks[0]!,
          id: "T002",
          status: "pending",
          dependsOn: ["T001"]
        }
      ])
    );

    expect(selected.ok && selected.value.id).toBe("T002");
  });
});
