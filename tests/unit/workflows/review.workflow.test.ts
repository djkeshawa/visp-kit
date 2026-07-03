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
import { ok } from "../../../src/core/result.js";
import { runFeatureWorkflow } from "../../../src/workflows/feature.workflow.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";
import { runReviewWorkflow } from "../../../src/workflows/review.workflow.js";
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

function gitRunner(filePath = "src/notes/sort.ts"): CommandRunner {
  return {
    async run(command, args, options) {
      const joined = (args ?? []).join(" ");
      let stdout = "";

      if (joined === "rev-parse --is-inside-work-tree") {
        stdout = "true\n";
      } else if (joined.includes("--name-status")) {
        stdout = `M\t${filePath}\n`;
      } else if (joined.includes("--numstat")) {
        stdout = `4\t1\t${filePath}\n`;
      } else {
        stdout = `diff --git a/${filePath} b/${filePath}\n+changed\n`;
      }

      return ok({
        command,
        args: args ?? [],
        cwd: options?.cwd,
        exitCode: 0,
        signal: null,
        stdout,
        stderr: "",
        timedOut: false
      });
    }
  };
}

async function createReviewFixture(rootPath: string): Promise<void> {
  expectOk(await runInitWorkflow({ targetPath: rootPath, agent: "none" }));
  expectOk(
    await runFeatureWorkflow({
      targetPath: rootPath,
      featureIdea: "Add note pinning",
      now: timestamp
    })
  );

  const featureKey = "001-add-note-pinning";
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
  await writeFile(path.join(rootPath, "src", "notes", "sort.ts"), "export {};\n");
  await writeArtifact(
    featureIntentArtifactPath(rootPath, featureKey),
    featureIntentSchema,
    {
      ...validFeature,
      slug: "add-note-pinning",
      rawUserRequest: "Add note pinning"
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
    { ...validTaskGraph, featureSlug: "add-note-pinning" },
    { artifactName: "task graph" }
  );
  await writeArtifact(
    traceabilityArtifactPath(rootPath, featureKey),
    traceabilityMatrixSchema,
    validTraceabilityMatrix,
    { artifactName: "traceability" }
  );
}

describe("runReviewWorkflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-review-workflow-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes task review reports and prompts", async () => {
    await createReviewFixture(tempDir);

    const summary = expectOk(
      await runReviewWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        commandRunner: gitRunner(),
        now: timestamp
      })
    );

    expect(summary.result).toBe("warnings");
    expect(summary.reportPath).toBe(".visp/features/001-add-note-pinning/review/T001.review.md");
    expect(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "review", "T001.review.md"),
        "utf8"
      )
    ).toContain("# Review Report");
    expect(
      await readFile(path.join(tempDir, ".visp", "prompts", "review.prompt.md"), "utf8")
    ).toContain("Visp Diff Review Prompt");
  });

  it("dry-run writes nothing", async () => {
    await createReviewFixture(tempDir);

    const summary = expectOk(
      await runReviewWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        dryRun: true,
        commandRunner: gitRunner(),
        now: timestamp
      })
    );

    expect(summary.reportPath).toBeNull();
    await expect(
      readFile(
        path.join(
          tempDir,
          ".visp",
          "features",
          "001-add-note-pinning",
          "review",
          "T001.review.json"
        ),
        "utf8"
      )
    ).rejects.toThrow();
  });
});
