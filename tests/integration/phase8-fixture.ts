import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { createCli } from "../../src/cli/main.js";
import { runFeatureWorkflow } from "../../src/workflows/feature.workflow.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";
import { runScanWorkflow } from "../../src/workflows/scan.workflow.js";

export function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) {
    throw new Error("Expected result to be ok.");
  }

  return result.value;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Windows holds transient locks on files a just-exited child process (git,
 * spawned commands) touched, so `rm` can fail with EBUSY/ENOTEMPTY/EPERM even
 * with `force: true`. Retry a few times with a short backoff before giving up.
 * On POSIX this succeeds on the first attempt.
 */
export async function removeTempDirWithRetry(dir: string, attempts = 5): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryable =
        code === "EBUSY" || code === "ENOTEMPTY" || code === "EPERM" || code === "EACCES";

      if (!retryable || attempt === attempts) {
        // Best-effort cleanup: a leaked temp dir under the OS temp path must not
        // fail an otherwise-passing test suite.
        return;
      }

      await sleep(50 * attempt);
    }
  }
}

async function updateJson(filePath: string, update: (value: any) => void): Promise<void> {
  const value = JSON.parse(await readFile(filePath, "utf8"));
  update(value);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function completePlanningArtifacts(
  featureDir: string,
  program: ReturnType<typeof createCli>,
  tempDir: string
): Promise<void> {
  await updateJson(path.join(featureDir, "clarifications.json"), (artifact) => {
    artifact.questions[0].question = "Should pinned notes sort before unpinned notes?";
    artifact.questions[0].recommendedDefault = "Pinned notes sort first.";
    artifact.questions[0].reason = "Ordering affects observable behavior.";
  });
  await program.parseAsync([
    "node",
    "visp",
    "clarify",
    "answer",
    "CQ001",
    tempDir,
    "--accept-default"
  ]);

  await program.parseAsync(["node", "visp", "spec", tempDir]);
  await updateJson(path.join(featureDir, "spec.json"), (spec) => {
    spec.status = "ready";
    spec.userStories[0] = {
      id: "US001",
      title: "Pin note",
      actor: "user",
      capability: "pin a note",
      outcome: "important notes appear first"
    };
    const criterion = {
      id: "AC001",
      requirementId: "REQ001",
      description:
        "Pinning a note places it before unpinned notes and unpinning restores ordinary ordering.",
      testable: true,
      validationMethod: "unit"
    };
    spec.requirements[0].title = "Persist note pin state";
    spec.requirements[0].description = "The note helper must preserve explicit pin state.";
    spec.requirements[0].acceptanceCriteria = [criterion];
    spec.acceptanceCriteria = [criterion];
    spec.businessRules = ["Pinned notes appear before unpinned notes."];
    spec.nonFunctionalRequirements = {
      performance: ["Pin operations remain constant time."],
      security: ["Pinning does not alter authorization."],
      accessibility: ["Pin state is represented as data."],
      reliability: ["Unpinning reverses pin state."],
      maintainability: ["Pin behavior has unit coverage."]
    };
    spec.edgeCases = ["Pinning an already pinned note is idempotent."];
    spec.outOfScope = ["Synchronizing pin state across devices."];
  });
  await program.parseAsync(["node", "visp", "spec", tempDir, "--validate"]);

  await program.parseAsync(["node", "visp", "plan", tempDir]);
  await updateJson(path.join(featureDir, "plan.json"), (plan) => {
    plan.status = "ready";
    plan.evidence = {
      knownFromUser: ["Add note pinning."],
      knownFromSpecification: ["REQ001 and AC001 define pin state."],
      knownFromCodebase: ["src/notes.ts owns the note helper."],
      knownFromConstitution: ["Keep changes small and tested."],
      inferred: ["A boolean field fits the existing note shape."],
      assumed: ["Existing callers tolerate an optional field."],
      unknown: ["No persistence migration is needed for this fixture."]
    };
    plan.affectedModules[0] = {
      moduleOrFileArea: "src/notes.ts",
      reason: "Owns note pin behavior.",
      evidence: "Existing Note and pinNote exports."
    };
    plan.implementationApproach = "Update the note helper and add focused unit coverage.";
    plan.impacts = {
      dataModel: "Optional pinned boolean.",
      api: "Existing helper remains compatible.",
      ui: "No UI work.",
      securityPrivacy: "No access change.",
      performance: "Constant-time update."
    };
    plan.testingStrategy[0] = {
      level: "unit",
      whatToTest: "Pin and unpin behavior.",
      validationCommand: "pnpm test"
    };
    plan.rollbackStrategy = "Revert the optional field and helper change.";
    plan.alternatives[0] = {
      option: "Separate pin index.",
      decision: "rejected",
      reason: "Unnecessary state duplication."
    };
    plan.risks[0] = {
      id: "RISK001",
      description: "Old fixtures omit pinned state.",
      level: "medium",
      mitigation: "Keep the field optional.",
      requirementIds: ["REQ001"]
    };
    plan.decisions[0] = {
      id: "PD001",
      title: "Optional boolean pin state",
      decision: "Store pin state on Note.",
      reason: "Smallest compatible change.",
      evidence: "REQ001; src/notes.ts",
      impacts: "Note type and helper tests.",
      requirementIds: ["REQ001"]
    };
  });
  await program.parseAsync(["node", "visp", "plan", tempDir, "--validate"]);

  await program.parseAsync(["node", "visp", "tasks", tempDir]);
  await updateJson(path.join(featureDir, "task-graph.json"), (graph) => {
    graph.status = "ready";
    graph.tasks[0] = {
      ...graph.tasks[0],
      title: "Implement note pinning helper",
      description: "Update the note helper and test coverage for pinning.",
      allowedFiles: ["src/notes.ts"],
      expectedFiles: ["tests/notes.test.ts"],
      validationCommands: ["pnpm test"],
      status: "ready",
      taskClass: "bounded_feature",
      riskFactors: []
    };
  });

  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    await program.parseAsync(["node", "visp", "tasks", tempDir, "--validate"]);
    if (process.exitCode !== undefined && process.exitCode !== 0) {
      throw new Error(`Phase 8 fixture task validation failed with exit code ${process.exitCode}.`);
    }
  } finally {
    process.exitCode = previousExitCode;
  }
}

export async function createPhase8Fixture(tempDir: string): Promise<void> {
  expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
  await writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "context-fixture",
        packageManager: "pnpm@10.0.0",
        scripts: {
          build: "tsc",
          test: "vitest",
          typecheck: "tsc --noEmit"
        },
        devDependencies: {
          typescript: "^5.0.0",
          vitest: "^3.0.0"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await mkdir(path.join(tempDir, "src"), { recursive: true });
  await mkdir(path.join(tempDir, "tests"), { recursive: true });
  await writeFile(
    path.join(tempDir, "src", "notes.ts"),
    `export interface Note {
  id: string;
  title: string;
  pinned?: boolean;
}

export function pinNote(note: Note): Note {
  return { ...note, pinned: true };
}
`,
    "utf8"
  );
  await writeFile(
    path.join(tempDir, "tests", "notes.test.ts"),
    `import { pinNote } from "../src/notes";

test("pinNote", () => {
  expect(pinNote({ id: "1", title: "A" }).pinned).toBe(true);
});
`,
    "utf8"
  );
  expectOk(await runScanWorkflow({ targetPath: tempDir }));
  expectOk(
    await runFeatureWorkflow({
      targetPath: tempDir,
      featureIdea: "Add note pinning",
      now: "2026-01-01T00:00:00.000Z"
    })
  );

  const program = createCli({ writeOut: () => undefined });

  await program.parseAsync(["node", "visp", "clarify", tempDir]);
  const featureDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning");
  await completePlanningArtifacts(featureDir, program, tempDir);

  const taskGraphPath = path.join(
    tempDir,
    ".visp",
    "features",
    "001-add-note-pinning",
    "task-graph.json"
  );
  const taskGraph = JSON.parse(await readFile(taskGraphPath, "utf8")) as {
    tasks: Array<Record<string, unknown>>;
  };

  taskGraph.tasks[0] = {
    ...taskGraph.tasks[0],
    title: "Implement note pinning helper",
    description: "Update the note helper and test coverage for pinning.",
    allowedFiles: ["src/notes.ts"],
    expectedFiles: ["tests/notes.test.ts"],
    validationCommands: ["pnpm test"],
    status: "ready",
    taskClass: "bounded_feature",
    riskFactors: []
  };

  await writeFile(taskGraphPath, `${JSON.stringify(taskGraph, null, 2)}\n`, "utf8");
  process.exitCode = undefined;
}
