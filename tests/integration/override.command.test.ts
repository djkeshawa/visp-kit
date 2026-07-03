import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { overridesArtifactPath } from "../../src/artifacts/artifact-paths.js";
import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";
import { createPhase8Fixture, expectOk } from "./phase8-fixture.js";

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

describe("visp override command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-override-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates, lists, shows, validates, and revokes an override", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "override",
      "create",
      "VSP014",
      tempDir,
      "--scope",
      "task",
      "--feature",
      "001",
      "--task",
      "T001",
      "--stage",
      "review",
      "--reason",
      "Prototype branch has no automated verification yet; manual validation is documented.",
      "--json"
    ]);

    const created = JSON.parse(output.join("")) as {
      success: boolean;
      override: { id: string; ruleId: string };
    };

    expect(created.success).toBe(true);
    expect(created.override.id).toBe("OVR001");
    expect(created.override.ruleId).toBe("VSP014");
    expect(await exists(overridesArtifactPath(tempDir))).toBe(true);

    output.length = 0;
    await program.parseAsync(["node", "visp", "override", "list", tempDir, "--json"]);
    const list = JSON.parse(output.join("")) as {
      overrides: Array<{ id: string }>;
    };
    expect(list.overrides.map((override) => override.id)).toEqual(["OVR001"]);

    output.length = 0;
    await program.parseAsync(["node", "visp", "override", "show", "OVR001", tempDir, "--json"]);
    const show = JSON.parse(output.join("")) as {
      override: { id: string; scope: string };
    };
    expect(show.override.id).toBe("OVR001");
    expect(show.override.scope).toBe("task");

    output.length = 0;
    await program.parseAsync(["node", "visp", "override", "validate", tempDir, "--json"]);
    const validate = JSON.parse(output.join("")) as {
      success: boolean;
    };
    expect(validate.success).toBe(true);

    output.length = 0;
    await program.parseAsync([
      "node",
      "visp",
      "override",
      "revoke",
      "OVR001",
      tempDir,
      "--reason",
      "Automated verification is now required before review.",
      "--json"
    ]);
    const revoked = JSON.parse(output.join("")) as {
      override: { status: string; revokedReason: string };
    };
    expect(revoked.override.status).toBe("revoked");
    expect(revoked.override.revokedReason).toContain("Automated verification");
  });

  it("rejects missing, placeholder, unknown, and non-overridable overrides", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const errors: string[] = [];
    const program = createCli({ writeErr: (value) => errors.push(value) });

    const output: string[] = [];
    const jsonProgram = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });
    await jsonProgram.parseAsync([
      "node",
      "visp",
      "override",
      "create",
      "VSP014",
      tempDir,
      "--json"
    ]);
    const missing = JSON.parse(output.join("")) as { success: boolean; error: string };
    expect(missing.success).toBe(false);
    expect(missing.error).toContain("Override reason is required");
    expect(errors.join("")).toBe("");

    process.exitCode = undefined;
    errors.length = 0;
    await program.parseAsync([
      "node",
      "visp",
      "override",
      "create",
      "VSP999",
      tempDir,
      "--reason",
      "This is a meaningful reason for an unknown rule."
    ]);
    expect(errors.join("")).toContain("Unknown policy rule ID");

    process.exitCode = undefined;
    errors.length = 0;
    await program.parseAsync([
      "node",
      "visp",
      "override",
      "create",
      "VSP019",
      tempDir,
      "--reason",
      "This policy rule should remain non-overridable."
    ]);
    expect(errors.join("")).toContain("cannot be overridden");

    process.exitCode = undefined;
    errors.length = 0;
    await program.parseAsync([
      "node",
      "visp",
      "override",
      "create",
      "VSP014",
      tempDir,
      "--reason",
      "test"
    ]);
    expect(errors.join("")).toContain("at least 12 characters");
  });

  it("keeps project-scoped overrides unbound from feature and task", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "override",
      "create",
      "VSP014",
      tempDir,
      "--scope",
      "project",
      "--feature",
      "001",
      "--task",
      "T001",
      "--reason",
      "Project-wide exception while verification tooling is rebuilt.",
      "--json"
    ]);

    const created = JSON.parse(output.join("")) as {
      success: boolean;
      override: {
        scope: string;
        featureId: string | null;
        featureSlug: string | null;
        taskId: string | null;
      };
      warnings: string[];
    };

    expect(created.success).toBe(true);
    expect(created.override.scope).toBe("project");
    expect(created.override.featureId).toBeNull();
    expect(created.override.featureSlug).toBeNull();
    expect(created.override.taskId).toBeNull();
    expect(created.warnings.join(" ")).toContain("ignored for project-scoped overrides");
  });

  it("blocks override creation when policy disallows overrides", async () => {
    await createPhase8Fixture(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "policy", "set-strictness", "locked", tempDir]);

    process.exitCode = undefined;
    const errors: string[] = [];
    const lockedProgram = createCli({ writeErr: (value) => errors.push(value) });

    await lockedProgram.parseAsync([
      "node",
      "visp",
      "override",
      "create",
      "VSP014",
      tempDir,
      "--scope",
      "project",
      "--reason",
      "This override should be rejected while policy is locked."
    ]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("not allowed by the current policy");
    expect(await exists(overridesArtifactPath(tempDir))).toBe(false);
  });

  it("dry-run writes nothing", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "override",
      "create",
      "VSP014",
      tempDir,
      "--scope",
      "project",
      "--reason",
      "Dry run should not write this override.",
      "--dry-run"
    ]);

    expect(await exists(overridesArtifactPath(tempDir))).toBe(false);
    await expect(readFile(overridesArtifactPath(tempDir), "utf8")).rejects.toThrow();
  });
});
