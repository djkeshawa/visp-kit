import { describe, expect, it } from "vitest";

import { type Task } from "../../../src/artifacts/schemas/task.schema.js";
import {
  describeTaskStatusUpdate,
  planTaskStatusUpdate
} from "../../../src/reconcile/task-status-update.js";

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

function plan(overrides: Partial<Parameters<typeof planTaskStatusUpdate>[0]> = {}) {
  return planTaskStatusUpdate({
    requested: true,
    promptOnly: false,
    dryRun: false,
    task,
    result: "passed",
    force: false,
    closeOnWarnings: false,
    verificationPassed: true,
    ...overrides
  });
}

describe("planTaskStatusUpdate", () => {
  it("closes a verified task and records the transition it made", () => {
    const update = plan();

    expect(update.performed).toBe(true);
    expect(update.taskId).toBe("T001");
    expect(update.previousStatus).toBe("ready");
    expect(update.newStatus).toBe("verified");
    expect(update.skippedReason).toBeNull();
  });

  it("closes a task as done when verification did not pass", () => {
    expect(plan({ verificationPassed: false }).newStatus).toBe("done");
  });

  it("says it was never asked when the caller did not request an update", () => {
    const update = plan({ requested: false });

    expect(update.requested).toBe(false);
    expect(update.performed).toBe(false);
    expect(update.skippedReason).toBe("not requested");
  });

  it("refuses to close a task whose reconciliation has blocking errors", () => {
    const update = plan({ result: "failed" });

    expect(update.performed).toBe(false);
    expect(update.skippedReason).toContain("blocking errors");
  });

  it("refuses to close a task on warnings unless the caller accepts them", () => {
    const update = plan({ result: "warnings" });

    expect(update.performed).toBe(false);
    expect(update.skippedReason).toContain("--force");
  });

  it("closes a task on warnings when the caller forced it", () => {
    expect(plan({ result: "warnings", force: true }).performed).toBe(true);
  });

  it("closes a task on warnings for a pipeline that already accepted them", () => {
    expect(plan({ result: "warnings", closeOnWarnings: true }).performed).toBe(true);
  });

  it("still refuses a failed reconciliation for a pipeline that accepts warnings", () => {
    expect(plan({ result: "failed", closeOnWarnings: true }).performed).toBe(false);
  });

  it("names the status it would have written during a dry run", () => {
    const update = plan({ dryRun: true });

    expect(update.performed).toBe(false);
    expect(update.newStatus).toBe("verified");
    expect(update.skippedReason).toBe("dry-run");
  });

  it("writes nothing in prompt-only mode", () => {
    expect(plan({ promptOnly: true }).skippedReason).toBe("prompt-only mode");
  });

  it("writes nothing when no task is selected", () => {
    const update = plan({ task: undefined });

    expect(update.performed).toBe(false);
    expect(update.taskId).toBeNull();
    expect(update.skippedReason).toBe("no task selected");
  });
});

describe("describeTaskStatusUpdate", () => {
  it("reads as a transition when the status moved", () => {
    expect(describeTaskStatusUpdate(plan())).toBe("T001: ready -> verified");
  });

  it("reads as a reason when the status did not move", () => {
    expect(describeTaskStatusUpdate(plan({ result: "failed" }))).toContain(
      "not updated (reconciliation has blocking errors)"
    );
  });
});
