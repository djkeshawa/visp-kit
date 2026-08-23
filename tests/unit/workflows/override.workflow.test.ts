import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type VispError } from "../../../src/core/errors.js";
import { type Result } from "../../../src/core/result.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";
import {
  runOverrideCreateWorkflow,
  runOverrideListWorkflow,
  runOverrideRevokeWorkflow,
  runOverrideShowWorkflow,
  type OverrideWorkflowSummary
} from "../../../src/workflows/override.workflow.js";

const REASON =
  "Prototype branch has no automated verification yet; manual validation is documented.";
const CREATED_AT = "2026-01-01T00:00:00.000Z";
const AFTER_EXPIRY = "2026-01-09T00:00:00.000Z";

function expectOk<T>(result: Result<T, VispError>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected ok result: ${result.error.message}`);
  return result.value;
}

function expectErrorMessage(result: Result<OverrideWorkflowSummary, VispError>): string {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected a failed result.");
  return result.error.message;
}

describe("override workflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-override-workflow-"));
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none", strictness: "strict" }));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createProjectOverride(
    overrides: { readonly expires?: string; readonly now?: string } = {}
  ): Promise<OverrideWorkflowSummary> {
    return expectOk(
      await runOverrideCreateWorkflow({
        targetPath: tempDir,
        ruleId: "VSP014",
        scope: "project",
        reason: REASON,
        now: overrides.now ?? CREATED_AT,
        expires: overrides.expires
      })
    );
  }

  describe("create", () => {
    // Each of these scopes needs an identifier the flag carries; without it the
    // override would be written against a feature or task nobody named.
    it("refuses a feature-scoped override with no feature named", async () => {
      const message = expectErrorMessage(
        await runOverrideCreateWorkflow({
          targetPath: tempDir,
          ruleId: "VSP014",
          scope: "feature",
          reason: REASON,
          now: CREATED_AT
        })
      );

      expect(message).toContain("require --feature");
    });

    it("refuses a task-scoped override with no task named", async () => {
      const message = expectErrorMessage(
        await runOverrideCreateWorkflow({
          targetPath: tempDir,
          ruleId: "VSP014",
          scope: "task",
          feature: "001",
          reason: REASON,
          now: CREATED_AT
        })
      );

      expect(message).toContain("require --feature and --task");
    });

    it("refuses a stage-scoped override with no stage named", async () => {
      const message = expectErrorMessage(
        await runOverrideCreateWorkflow({
          targetPath: tempDir,
          ruleId: "VSP014",
          scope: "stage",
          reason: REASON,
          now: CREATED_AT
        })
      );

      expect(message).toContain("require --stage");
    });
  });

  describe("list", () => {
    it("reports the missing store rather than failing when nothing was ever overridden", async () => {
      const summary = expectOk(await runOverrideListWorkflow({ targetPath: tempDir }));

      expect(summary.overrides).toEqual([]);
      expect(summary.warnings).toContain("No overrides file found.");
    });

    // An override that outlived its expiry is not active any more, and the
    // stored record still says `active` — the status is derived at read time.
    it("hides an override past its expiry from the default listing", async () => {
      const created = await createProjectOverride({ expires: "7d" });
      expect(created.override?.status).toBe("active");

      const current = expectOk(
        await runOverrideListWorkflow({ targetPath: tempDir, now: CREATED_AT })
      );
      expect(current.overrides.map((override) => override.id)).toEqual(["OVR001"]);

      const later = expectOk(
        await runOverrideListWorkflow({ targetPath: tempDir, now: AFTER_EXPIRY })
      );
      expect(later.overrides).toEqual([]);

      const expired = expectOk(
        await runOverrideListWorkflow({ targetPath: tempDir, now: AFTER_EXPIRY, expired: true })
      );
      expect(expired.overrides.map((override) => override.status)).toEqual(["expired"]);
    });

    it("filters by rule ID", async () => {
      await createProjectOverride();

      const matching = expectOk(
        await runOverrideListWorkflow({ targetPath: tempDir, now: CREATED_AT, ruleId: "VSP014" })
      );
      expect(matching.overrides.map((override) => override.id)).toEqual(["OVR001"]);

      const otherRule = expectOk(
        await runOverrideListWorkflow({ targetPath: tempDir, now: CREATED_AT, ruleId: "VSP013" })
      );
      expect(otherRule.overrides).toEqual([]);
    });

    it("lists revoked overrides only when asked for them", async () => {
      await createProjectOverride();
      expectOk(
        await runOverrideRevokeWorkflow({
          targetPath: tempDir,
          overrideId: "OVR001",
          reason: "The verification gap it covered is now closed by automated tests.",
          now: CREATED_AT
        })
      );

      const active = expectOk(
        await runOverrideListWorkflow({ targetPath: tempDir, now: CREATED_AT })
      );
      expect(active.overrides).toEqual([]);

      const revoked = expectOk(
        await runOverrideListWorkflow({ targetPath: tempDir, now: CREATED_AT, revoked: true })
      );
      expect(revoked.overrides.map((override) => override.id)).toEqual(["OVR001"]);
    });
  });

  describe("show", () => {
    it("fails on an override ID the store does not hold", async () => {
      await createProjectOverride();

      expect(
        expectErrorMessage(
          await runOverrideShowWorkflow({ targetPath: tempDir, overrideId: "OVR404" })
        )
      ).toContain("Override not found: OVR404.");
    });

    it("reports an expired override as expired", async () => {
      await createProjectOverride({ expires: "7d" });

      const summary = expectOk(
        await runOverrideShowWorkflow({
          targetPath: tempDir,
          overrideId: "OVR001",
          now: AFTER_EXPIRY
        })
      );

      expect(summary.override?.status).toBe("expired");
    });
  });

  describe("revoke", () => {
    it("fails on an override ID the store does not hold", async () => {
      await createProjectOverride();

      expect(
        expectErrorMessage(
          await runOverrideRevokeWorkflow({
            targetPath: tempDir,
            overrideId: "OVR404",
            reason: "The verification gap it covered is now closed by automated tests.",
            now: CREATED_AT
          })
        )
      ).toContain("Override not found: OVR404.");
    });

    it("requires a reason of its own, held to the same bar as creation", async () => {
      await createProjectOverride();

      expect(
        expectErrorMessage(
          await runOverrideRevokeWorkflow({
            targetPath: tempDir,
            overrideId: "OVR001",
            reason: "no",
            now: CREATED_AT
          })
        )
      ).toContain("at least 12 characters");

      expect(
        expectErrorMessage(
          await runOverrideRevokeWorkflow({
            targetPath: tempDir,
            overrideId: "OVR001",
            now: CREATED_AT
          })
        )
      ).toContain("Override reason is required.");
    });

    // Revoking twice must not rewrite the record: the first revocation's reason
    // and timestamp are the audit trail.
    it("leaves an already revoked override untouched", async () => {
      await createProjectOverride();
      const first = expectOk(
        await runOverrideRevokeWorkflow({
          targetPath: tempDir,
          overrideId: "OVR001",
          reason: "The verification gap it covered is now closed by automated tests.",
          now: CREATED_AT
        })
      );

      const second = expectOk(
        await runOverrideRevokeWorkflow({
          targetPath: tempDir,
          overrideId: "OVR001",
          reason: "A different reason recorded much later, which must not replace the first.",
          now: AFTER_EXPIRY
        })
      );

      expect(second.override?.status).toBe("revoked");
      expect(second.override?.revokedAt).toBe(first.override?.revokedAt);
      expect(second.override?.revokedReason).toBe(first.override?.revokedReason);
      expect(second.updatedFiles).toEqual([]);
    });

    it("writes nothing on a dry run", async () => {
      await createProjectOverride();

      const summary = expectOk(
        await runOverrideRevokeWorkflow({
          targetPath: tempDir,
          overrideId: "OVR001",
          reason: "The verification gap it covered is now closed by automated tests.",
          dryRun: true,
          now: CREATED_AT
        })
      );

      expect(summary.updatedFiles).toEqual([]);

      const stillActive = expectOk(
        await runOverrideListWorkflow({ targetPath: tempDir, now: CREATED_AT })
      );
      expect(stillActive.overrides.map((override) => override.id)).toEqual(["OVR001"]);
    });
  });
});
