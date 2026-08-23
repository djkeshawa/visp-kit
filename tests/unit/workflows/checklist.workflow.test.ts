import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type VispError } from "../../../src/core/errors.js";
import { type Result } from "../../../src/core/result.js";
import {
  formatChecklistSummary,
  runChecklistStatusWorkflow,
  runChecklistUpdateWorkflow,
  type ChecklistWorkflowSummary
} from "../../../src/workflows/checklist.workflow.js";
import { runContextWorkflow } from "../../../src/workflows/context.workflow.js";
import {
  createPhase8Fixture,
  expectOk,
  removeTempDirWithRetry
} from "../../integration/phase8-fixture.js";

const REASON = "The staging database this step needs is unavailable on this branch.";

function expectErrorMessage(result: Result<ChecklistWorkflowSummary, VispError>): string {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected a failed result.");
  return result.error.message;
}

describe("checklist workflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-checklist-workflow-"));
    await createPhase8Fixture(tempDir);
  });

  afterEach(async () => {
    await removeTempDirWithRetry(tempDir);
  });

  // Every checklist lives under one task, so a command with no task names no
  // checklist. Reporting that is the only honest answer; picking a task would
  // update a checklist the caller never asked about.
  it("refuses a status request that names no task", async () => {
    expect(expectErrorMessage(await runChecklistStatusWorkflow({ targetPath: tempDir }))).toContain(
      "require --task"
    );
  });

  it("refuses an update that names no task", async () => {
    expect(
      expectErrorMessage(
        await runChecklistUpdateWorkflow({
          targetPath: tempDir,
          itemId: "read-context",
          status: "done"
        })
      )
    ).toContain("require --task");
  });

  it("refuses an update that names no item", async () => {
    expect(
      expectErrorMessage(
        await runChecklistUpdateWorkflow({ targetPath: tempDir, taskId: "T001", status: "done" })
      )
    ).toContain("requires --item");
  });

  it("names the valid items when the item is not one of them", async () => {
    const message = expectErrorMessage(
      await runChecklistUpdateWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        itemId: "read-the-context",
        status: "done"
      })
    );

    expect(message).toContain("Unknown checklist item: read-the-context.");
    expect(message).toContain("read-context");
  });

  it("names the valid statuses when the status is missing or not one of them", async () => {
    const missing = expectErrorMessage(
      await runChecklistUpdateWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        itemId: "read-context"
      })
    );
    const unknown = expectErrorMessage(
      await runChecklistUpdateWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        itemId: "read-context",
        status: "finished" as never
      })
    );

    expect(missing).toContain("pending|done|not_applicable|unavailable|blocked");
    expect(unknown).toContain("pending|done|not_applicable|unavailable|blocked");
  });

  // A step that is done needs no explanation. A step that is being closed
  // without being done is the one a reviewer has to be able to question, so the
  // reason is what makes the record worth keeping.
  it.each([
    "blocked",
    "not_applicable",
    "unavailable"
  ] as const)("refuses to record %s with no reason", async (status) => {
    expect(
      expectErrorMessage(
        await runChecklistUpdateWorkflow({
          targetPath: tempDir,
          taskId: "T001",
          itemId: "read-context",
          status
        })
      )
    ).toContain("--reason is required");
  });

  it("reports a missing checklist as a warning rather than an error", async () => {
    const summary = expectOk(
      await runChecklistStatusWorkflow({ targetPath: tempDir, taskId: "T001" })
    );

    expect(summary.success).toBe(false);
    expect(summary.checklist).toBeNull();
    expect(summary.warnings).toContain("Implementation checklist is missing.");
    expect(formatChecklistSummary(summary)).toContain("Checklist: missing");
  });

  describe("once a context pack exists", () => {
    beforeEach(async () => {
      expectOk(await runContextWorkflow({ targetPath: tempDir, taskId: "T001", force: true }));
    });

    it.each([
      "blocked",
      "not_applicable",
      "unavailable"
    ] as const)("records %s once a reason is given", async (status) => {
      const summary = expectOk(
        await runChecklistUpdateWorkflow({
          targetPath: tempDir,
          taskId: "T001",
          itemId: "read-context",
          status,
          reason: REASON
        })
      );

      expect(summary.updatedItemId).toBe("read-context");
      expect(summary.checklist?.items.find((item) => item.id === "read-context")?.status).toBe(
        status
      );
    });

    it("accepts whitespace around a task and item and trims it", async () => {
      const summary = expectOk(
        await runChecklistUpdateWorkflow({
          targetPath: tempDir,
          taskId: " T001 ",
          itemId: " read-context ",
          status: "done"
        })
      );

      expect(summary.taskId).toBe("T001");
      expect(summary.updatedItemId).toBe("read-context");
    });

    it("lists the still-pending required steps and points back at status", async () => {
      const summary = expectOk(
        await runChecklistStatusWorkflow({ targetPath: tempDir, taskId: "T001" })
      );
      const rendered = formatChecklistSummary(summary);

      expect(summary.success).toBe(false);
      expect(summary.summary.pendingRequired.length).toBeGreaterThan(0);
      expect(summary.nextCommand).toBe("visp-kit checklist status --task T001");
      expect(rendered).toContain("Checklist: present");
      expect(rendered).toContain("Pending required:");
    });

    it("lists a blocked required step separately from the pending ones", async () => {
      expectOk(
        await runChecklistUpdateWorkflow({
          targetPath: tempDir,
          taskId: "T001",
          itemId: "read-context",
          status: "blocked",
          reason: REASON
        })
      );

      const summary = expectOk(
        await runChecklistStatusWorkflow({ targetPath: tempDir, taskId: "T001" })
      );
      const rendered = formatChecklistSummary(summary);

      expect(summary.summary.blockedRequired.map((item) => item.id)).toContain("read-context");
      expect(summary.summary.pendingRequired.map((item) => item.id)).not.toContain("read-context");
      expect(rendered).toContain("Blocked required:");
    });

    it("leaves the checklist untouched on a dry run", async () => {
      const dry = expectOk(
        await runChecklistUpdateWorkflow({
          targetPath: tempDir,
          taskId: "T001",
          itemId: "read-context",
          status: "done",
          dryRun: true
        })
      );

      expect(dry.dryRun).toBe(true);

      const after = expectOk(
        await runChecklistStatusWorkflow({ targetPath: tempDir, taskId: "T001" })
      );

      expect(after.summary.pendingRequired.map((item) => item.id)).toContain("read-context");
    });
  });
});
