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

function skipped(overrides: Partial<Parameters<typeof planTaskStatusUpdate>[0]> = {}) {
  const result = plan(overrides);

  if (result.kind !== "skip") throw new Error(`expected a skip plan, got ${result.kind}`);
  return result.update;
}

function written(overrides: Partial<Parameters<typeof planTaskStatusUpdate>[0]> = {}) {
  const result = plan(overrides);

  if (result.kind !== "write") throw new Error(`expected a write plan, got ${result.kind}`);
  return result;
}

describe("planTaskStatusUpdate", () => {
  it("plans the transition a verified task should make", () => {
    const update = written();

    expect(update.taskId).toBe("T001");
    expect(update.previousStatus).toBe("ready");
    expect(update.newStatus).toBe("verified");
  });

  it("never reports a transition as performed, because nothing has been written yet", () => {
    // LC-130: the plan used to carry `performed: true` and the write happened
    // afterwards, so a failed write left the report asserting a transition that
    // never occurred. Only `applyTaskStatusUpdate` may say `performed`.
    expect(Object.keys(written())).not.toContain("performed");
  });

  it("closes a task as done when verification did not pass", () => {
    expect(written({ verificationPassed: false }).newStatus).toBe("done");
  });

  it("says it was never asked when the caller did not request an update", () => {
    const update = skipped({ requested: false });

    expect(update.requested).toBe(false);
    expect(update.performed).toBe(false);
    expect(update.skippedReason).toBe("not requested");
  });

  it("refuses to close a task whose reconciliation has blocking errors", () => {
    const update = skipped({ result: "failed" });

    expect(update.performed).toBe(false);
    expect(update.skippedReason).toContain("blocking errors");
  });

  it("refuses to close a task on warnings unless the caller accepts them", () => {
    const update = skipped({ result: "warnings" });

    expect(update.performed).toBe(false);
    expect(update.skippedReason).toContain("--force");
  });

  it("closes a task on warnings when the caller forced it", () => {
    expect(written({ result: "warnings", force: true }).newStatus).toBe("verified");
  });

  it("closes a task on warnings for a pipeline that already accepted them", () => {
    expect(written({ result: "warnings", closeOnWarnings: true }).newStatus).toBe("verified");
  });

  it("still refuses a failed reconciliation for a pipeline that accepts warnings", () => {
    expect(skipped({ result: "failed", closeOnWarnings: true }).performed).toBe(false);
  });

  it("names the status it would have written during a dry run", () => {
    const update = skipped({ dryRun: true });

    expect(update.performed).toBe(false);
    expect(update.newStatus).toBe("verified");
    expect(update.skippedReason).toBe("dry-run");
  });

  it("writes nothing in prompt-only mode", () => {
    expect(skipped({ promptOnly: true }).skippedReason).toBe("prompt-only mode");
  });

  it("writes nothing when no task is selected", () => {
    const update = skipped({ task: undefined });

    expect(update.performed).toBe(false);
    expect(update.taskId).toBeNull();
    expect(update.skippedReason).toBe("no task selected");
  });
});

describe("describeTaskStatusUpdate", () => {
  it("reads as a transition when the status moved", () => {
    expect(
      describeTaskStatusUpdate({
        requested: true,
        performed: true,
        taskId: "T001",
        previousStatus: "ready",
        newStatus: "verified",
        skippedReason: null
      })
    ).toBe("T001: ready -> verified");
  });

  it("reads as a reason when the status did not move", () => {
    expect(describeTaskStatusUpdate(skipped({ result: "failed" }))).toContain(
      "not updated (reconciliation has blocking errors)"
    );
  });
});
