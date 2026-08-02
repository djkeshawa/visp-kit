import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  featureIntentArtifactPath,
  projectProfileArtifactPath,
  specArtifactPath,
  taskGraphArtifactPath,
  traceabilityArtifactPath
} from "../../../src/artifacts/artifact-paths.js";
import { writeArtifact } from "../../../src/artifacts/artifact-writer.js";
import { featureIntentSchema } from "../../../src/artifacts/schemas/feature.schema.js";
import { projectProfileSchema } from "../../../src/artifacts/schemas/project.schema.js";
import { specArtifactSchema } from "../../../src/artifacts/schemas/spec.schema.js";
import { taskGraphArtifactSchema } from "../../../src/artifacts/schemas/task.schema.js";
import { traceabilityMatrixSchema } from "../../../src/artifacts/schemas/traceability.schema.js";
import { type CommandRunner } from "../../../src/core/command-runner.js";
import { err, ok } from "../../../src/core/result.js";
import { VispError } from "../../../src/core/errors.js";
import { runFeatureWorkflow } from "../../../src/workflows/feature.workflow.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";
import { runVerifyWorkflow } from "../../../src/workflows/verify.workflow.js";
import {
  timestamp,
  validFeature,
  validProjectProfile,
  validRequirement,
  validTaskGraph,
  validTraceabilityMatrix
} from "../artifacts/fixtures.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected result to be ok.");
  }

  return result.value;
}

function passingRunner(changedFiles: readonly string[] = []): CommandRunner {
  return {
    async run(command, args, options) {
      if (command === "git") {
        return ok({
          command,
          args: args ?? [],
          cwd: options?.cwd,
          exitCode: 0,
          signal: null,
          stdout: changedFiles.join("\n"),
          stderr: "",
          timedOut: false
        });
      }

      return ok({
        command,
        args: args ?? [],
        cwd: options?.cwd,
        exitCode: 0,
        signal: null,
        stdout: "passed",
        stderr: "",
        timedOut: false
      });
    }
  };
}

function failingRunner(): CommandRunner {
  return {
    async run(command, args, options) {
      if (command === "git") {
        return ok({
          command,
          args: args ?? [],
          cwd: options?.cwd,
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
          timedOut: false
        });
      }

      return err(
        new VispError("COMMAND_FAILED", "Command failed.", {
          details: {
            command,
            args,
            cwd: options?.cwd,
            exitCode: 1,
            stdout: "",
            stderr: "failure",
            timedOut: false
          }
        })
      );
    }
  };
}

async function createVerifyFixture(rootPath: string): Promise<void> {
  expectOk(await runInitWorkflow({ targetPath: rootPath, agent: "none" }));
  expectOk(
    await runFeatureWorkflow({
      targetPath: rootPath,
      featureIdea: "Add note pinning",
      now: timestamp
    })
  );

  const featureKey = "001-add-note-pinning";
  const taskGraph = {
    ...validTaskGraph,
    featureSlug: "add-note-pinning",
    tasks: [
      {
        ...validTaskGraph.tasks[0]!,
        allowedFiles: ["src/notes/sort.ts"],
        expectedFiles: ["tests/notes/sort.test.ts"],
        validationCommands: ["pnpm test"],
        status: "ready" as const
      }
    ]
  };
  const spec = {
    featureId: "001",
    featureSlug: "add-note-pinning",
    title: "Add note pinning",
    status: "ready" as const,
    userStories: [],
    requirements: [validRequirement],
    acceptanceCriteria: validRequirement.acceptanceCriteria,
    businessRules: [],
    nonFunctionalRequirements: {
      performance: [],
      security: [],
      accessibility: [],
      reliability: [],
      maintainability: []
    },
    edgeCases: [],
    assumptions: [],
    outOfScope: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await mkdir(path.join(rootPath, "src", "notes"), { recursive: true });
  await mkdir(path.join(rootPath, "tests", "notes"), { recursive: true });
  await writeFile(path.join(rootPath, "src", "notes", "sort.ts"), "export {};\n");
  await writeFile(path.join(rootPath, "tests", "notes", "sort.test.ts"), "test.todo('sort');\n");
  await writeArtifact(
    featureIntentArtifactPath(rootPath, featureKey),
    featureIntentSchema,
    {
      ...validFeature,
      slug: "add-note-pinning",
      rawUserRequest: "Add note pinning",
      status: "draft"
    },
    { artifactName: "feature intent" }
  );
  await writeArtifact(
    projectProfileArtifactPath(rootPath),
    projectProfileSchema,
    validProjectProfile,
    { artifactName: "project profile" }
  );
  await writeArtifact(specArtifactPath(rootPath, featureKey), specArtifactSchema, spec, {
    artifactName: "spec"
  });
  await writeArtifact(
    taskGraphArtifactPath(rootPath, featureKey),
    taskGraphArtifactSchema,
    taskGraph,
    { artifactName: "task graph" }
  );
  await writeArtifact(
    traceabilityArtifactPath(rootPath, featureKey),
    traceabilityMatrixSchema,
    {
      ...validTraceabilityMatrix,
      featureId: "001"
    },
    { artifactName: "traceability" }
  );
}

describe("runVerifyWorkflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-verify-workflow-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes verification reports for a selected task", async () => {
    await createVerifyFixture(tempDir);

    const summary = expectOk(
      await runVerifyWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        commandRunner: passingRunner(),
        now: timestamp
      })
    );

    expect(summary.success).toBe(true);
    expect(summary.reportPath).toBe(".visp/features/001-add-note-pinning/verification.md");
    expect(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "verification.md"),
        "utf8"
      )
    ).toContain("# Verification Report");
  });

  it("records command failures without aborting report generation", async () => {
    await createVerifyFixture(tempDir);

    const summary = expectOk(
      await runVerifyWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        commandRunner: failingRunner(),
        now: timestamp
      })
    );

    expect(summary.success).toBe(false);
    expect(summary.errors).toContain("Command failed: pnpm test");
    expect(summary.commands[0]?.exitCode).toBe(1);
  });

  it("dry-run does not write reports or fail failed checks", async () => {
    await createVerifyFixture(tempDir);

    const summary = expectOk(
      await runVerifyWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        dryRun: true,
        commandRunner: passingRunner(["src/other.ts"]),
        now: timestamp
      })
    );

    expect(summary.success).toBe(true);
    expect(summary.reportPath).toBeNull();
    await expect(
      readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "verification.json"),
        "utf8"
      )
    ).rejects.toThrow();
  });

  it("updates task status only when requested and passing", async () => {
    await createVerifyFixture(tempDir);

    expectOk(
      await runVerifyWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        artifacts: true,
        updateTaskStatus: true,
        commandRunner: passingRunner(),
        now: timestamp
      })
    );

    const taskGraph = JSON.parse(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "task-graph.json"),
        "utf8"
      )
    ) as { tasks: Array<{ id: string; status: string }> };

    expect(taskGraph.tasks[0]).toMatchObject({ id: "T001", status: "verified" });
  });

  // P10-US-02: the non-mutating check mode. Evidence is written, failures are
  // reported honestly, and no workflow state moves. This is NOT --dry-run,
  // which suppresses writes and always reports success.
  it("check mode writes evidence but never advances task status", async () => {
    await createVerifyFixture(tempDir);

    const summary = expectOk(
      await runVerifyWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        artifacts: true,
        updateTaskStatus: true,
        statusUpdates: false,
        commandRunner: passingRunner(),
        now: timestamp
      })
    );

    expect(summary.success).toBe(true);
    expect(summary.reportPath).toBe(".visp/features/001-add-note-pinning/verification.md");

    const taskGraph = JSON.parse(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "task-graph.json"),
        "utf8"
      )
    ) as { tasks: Array<{ id: string; status: string }> };
    // The task did NOT advance to verified, despite updateTaskStatus.
    expect(taskGraph.tasks[0]).toMatchObject({ id: "T001", status: "ready" });
    // The implementation checklist was never touched: check mode did not even
    // create the artifact a verify tick would have written.
    await expect(
      readFile(
        path.join(
          tempDir,
          ".visp",
          "features",
          "001-add-note-pinning",
          "context",
          "T001.implementation-checklist.json"
        ),
        "utf8"
      )
    ).rejects.toThrow();
  });

  it("check mode reports a failing command as failure, with state untouched", async () => {
    await createVerifyFixture(tempDir);

    const summary = expectOk(
      await runVerifyWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        statusUpdates: false,
        commandRunner: failingRunner(),
        now: timestamp
      })
    );

    expect(summary.success).toBe(false);
    expect(summary.errors).toContain("Command failed: pnpm test");
    const taskGraph = JSON.parse(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "task-graph.json"),
        "utf8"
      )
    ) as { tasks: Array<{ id: string; status: string }> };
    expect(taskGraph.tasks[0]).toMatchObject({ id: "T001", status: "ready" });
  });

  // D-115 measured the zero-command false pass: commands skipped, overall
  // success true. requireCommandEvidence closes it; the contrast is pinned so
  // the old behavior cannot silently return.
  it("requireCommandEvidence fails when zero validation commands executed", async () => {
    await createVerifyFixture(tempDir);

    const withoutRequirement = expectOk(
      await runVerifyWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        skipCommands: true,
        statusUpdates: false,
        commandRunner: passingRunner(),
        now: timestamp
      })
    );
    expect(withoutRequirement.success).toBe(true);

    const withRequirement = expectOk(
      await runVerifyWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        skipCommands: true,
        statusUpdates: false,
        requireCommandEvidence: true,
        commandRunner: passingRunner(),
        now: timestamp
      })
    );
    expect(withRequirement.success).toBe(false);
    expect(withRequirement.errors).toContain(
      "No validation command was executed; at least one must run to count as evidence."
    );
  });
});
