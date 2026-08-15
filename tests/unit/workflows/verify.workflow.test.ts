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

/** Like {@link passingRunner}, but remembers everything it was asked to run. */
function recordingRunner(sink: string[], changedFiles: readonly string[] = []): CommandRunner {
  const inner = passingRunner(changedFiles);

  return {
    async run(command, args, options) {
      if (command !== "git") sink.push([command, ...(args ?? [])].join(" "));
      return inner.run(command, args, options);
    }
  };
}

async function setTaskValidationCommands(
  rootPath: string,
  commands: readonly string[]
): Promise<void> {
  const graphPath = taskGraphArtifactPath(rootPath, "001-add-note-pinning");
  const graph = JSON.parse(await readFile(graphPath, "utf8")) as {
    tasks: { validationCommands: readonly string[] }[];
  };

  graph.tasks[0]!.validationCommands = [...commands];
  await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
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

  // ------------------------------------------------------------------
  // D-128. The defect the head-to-head found, reproduced end to end.
  //
  // Two agents built the same browser game. The one driving the full
  // toolchain shipped a game that emptied its own screen in six seconds from
  // a two-line screen-wrap bug, and every gate passed — because the gates ran
  // around the code and never on it. The task's declared check was an English
  // sentence, so `/bin/sh` was asked to run "Manually", verification recorded
  // a failing test, and no run ever executed anything over the diff.
  // ------------------------------------------------------------------
  it("refuses to pass when the task's only declared check is an English sentence", async () => {
    await createVerifyFixture(tempDir);
    await setTaskValidationCommands(tempDir, [
      "Manually open index.html and check the snake wraps at the screen edge"
    ]);

    const executed: string[] = [];
    const summary = expectOk(
      await runVerifyWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        statusUpdates: false,
        commandRunner: recordingRunner(executed, ["src/notes/sort.ts"]),
        now: timestamp
      })
    );

    // The sentence is never handed to a shell.
    expect(executed).not.toContain(
      "Manually open index.html and check the snake wraps at the screen edge"
    );
    // The selector falls back to the project's generic `pnpm test`, which
    // passes — it has no test for wrapping, because nobody wrote one. That
    // fallback is real evidence about something, and about a DIFFERENT
    // question than the task asked. It must not be allowed to stand in for
    // the check the task declared.
    expect(executed).toContain("pnpm test");
    expect(summary.success).toBe(false);
    expect(summary.codeEvidence.evidence).toBe("executed");
    expect(summary.errors.join(" ")).toContain("was not executed because");
    expect(summary.errors.join(" ")).toContain("answered a different question");
    // A refusal that does not say what to do next is just a different dead
    // end, so the next command is part of the contract.
    expect(summary.nextCommand).toBe("visp-kit tasks --validate");
  });

  it("refuses to pass when nothing runnable exists at all", async () => {
    await createVerifyFixture(tempDir);
    await setTaskValidationCommands(tempDir, []);
    await writeArtifact(
      projectProfileArtifactPath(tempDir),
      projectProfileSchema,
      {
        ...validProjectProfile,
        testCommands: [],
        typecheckCommands: [],
        lintCommands: [],
        buildCommands: []
      },
      { artifactName: "project profile" }
    );

    const summary = expectOk(
      await runVerifyWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        statusUpdates: false,
        commandRunner: passingRunner(["src/notes/sort.ts"]),
        now: timestamp
      })
    );

    expect(summary.success).toBe(false);
    expect(summary.codeEvidence.evidence).toBe("refused");
    expect(summary.nextCommand).toBe("visp-kit scan");
    // The refusal names what the spec said was provable, so the gap between
    // "the spec asserted this" and "nothing checked it" is on the page.
    expect(summary.codeEvidence.assertedCriteria.length).toBeGreaterThan(0);
    expect(summary.errors.join(" ")).toContain(
      summary.codeEvidence.assertedCriteria[0] ?? "unreachable"
    );
  });

  it("records executed evidence, and the report says so in words", async () => {
    await createVerifyFixture(tempDir);

    const summary = expectOk(
      await runVerifyWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        statusUpdates: false,
        commandRunner: passingRunner(["src/notes/sort.ts"]),
        now: timestamp
      })
    );

    expect(summary.success).toBe(true);
    expect(summary.codeEvidence.evidence).toBe("executed");
    expect(summary.codeEvidence.executedCommands).toBe(1);
    expect(summary.codeEvidence.passedCommands).toBe(1);

    const markdown = await readFile(
      path.join(tempDir, ".visp", "features", "001-add-note-pinning", "verification.md"),
      "utf8"
    );

    expect(markdown).toContain("## Code Evidence");
    expect(markdown).toContain("Evidence: executed");
    // The report must not let a reader upgrade "a check ran" into "the spec
    // was proven". That is the exact inference the head-to-head made.
    expect(markdown).toContain("do not by themselves prove");
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
