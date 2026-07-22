import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  contextPackArtifactPath,
  featureReconcileMarkdownPath,
  featureIntentArtifactPath,
  planArtifactPath,
  projectProfileArtifactPath,
  specArtifactPath,
  taskGraphArtifactPath,
  taskReconcileArtifactPath,
  taskReconcileMarkdownPath,
  taskReconcilePromptPath,
  taskReviewArtifactPath,
  traceabilityArtifactPath,
  verificationArtifactPath
} from "../../../src/artifacts/artifact-paths.js";
import { writeArtifact } from "../../../src/artifacts/artifact-writer.js";
import { contextPackSchema } from "../../../src/artifacts/schemas/context-pack.schema.js";
import { featureIntentSchema } from "../../../src/artifacts/schemas/feature.schema.js";
import { planDraftArtifactSchema } from "../../../src/artifacts/schemas/plan.schema.js";
import { projectProfileSchema } from "../../../src/artifacts/schemas/project.schema.js";
import { reviewReportSchema } from "../../../src/artifacts/schemas/review.schema.js";
import { specArtifactSchema } from "../../../src/artifacts/schemas/spec.schema.js";
import { taskGraphArtifactSchema } from "../../../src/artifacts/schemas/task.schema.js";
import { traceabilityMatrixSchema } from "../../../src/artifacts/schemas/traceability.schema.js";
import { verificationReportSchema } from "../../../src/artifacts/schemas/verification.schema.js";
import { type CommandRunner } from "../../../src/core/command-runner.js";
import { ok } from "../../../src/core/result.js";
import { runFeatureWorkflow } from "../../../src/workflows/feature.workflow.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";
import { runReconcileWorkflow } from "../../../src/workflows/reconcile.workflow.js";
import {
  timestamp,
  validContextPack,
  validFeature,
  validProjectProfile,
  validRequirement,
  validReviewReport,
  validTaskGraph,
  validTraceabilityMatrix,
  validVerificationReport
} from "../artifacts/fixtures.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected result to be ok.");
  }

  return result.value;
}

function gitRunner(
  filePath: string | readonly string[] = "src/notes/sort.ts",
  untrackedFiles: readonly string[] = []
): CommandRunner {
  const trackedFiles = typeof filePath === "string" ? [filePath] : filePath;

  return {
    async run(command, args, options) {
      const joined = (args ?? []).join(" ");
      let stdout = "";

      if (joined === "rev-parse --is-inside-work-tree") {
        stdout = "true\n";
      } else if (joined === "ls-files --others --exclude-standard -z --") {
        stdout = untrackedFiles.length > 0 ? `${untrackedFiles.join("\0")}\0` : "";
      } else if (joined.includes("--name-status")) {
        stdout = trackedFiles.map((trackedFile) => `M\0${trackedFile}\0`).join("");
      } else if (joined.includes("--numstat")) {
        stdout = trackedFiles.map((trackedFile) => `4\t1\t${trackedFile}\0`).join("");
      } else {
        const displayPath = trackedFiles[0] ?? "unknown";
        stdout = `diff --git a/${displayPath} b/${displayPath}\n+changed\n`;
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

async function createReconcileFixture(rootPath: string): Promise<void> {
  expectOk(await runInitWorkflow({ targetPath: rootPath, agent: "none" }));
  expectOk(
    await runFeatureWorkflow({
      targetPath: rootPath,
      featureIdea: "Add note pinning",
      now: timestamp
    })
  );

  const featureKey = "001-add-note-pinning";
  const task = validTaskGraph.tasks[0]!;
  const taskGraph = {
    ...validTaskGraph,
    featureSlug: "add-note-pinning",
    tasks: [
      {
        ...task,
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
  await writeFile(path.join(rootPath, "src", "notes", "sort.ts"), "export {};\n");
  await writeArtifact(
    featureIntentArtifactPath(rootPath, featureKey),
    featureIntentSchema,
    {
      ...validFeature,
      slug: "add-note-pinning",
      rawUserRequest: "Add note pinning",
      status: "tasks_ready"
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
      featureSlug: "add-note-pinning"
    },
    { artifactName: "traceability" }
  );
  await writeArtifact(
    contextPackArtifactPath(rootPath, featureKey, "T001"),
    contextPackSchema,
    {
      ...validContextPack,
      featureSlug: "add-note-pinning",
      selectedTask: taskGraph.tasks[0]!
    },
    { artifactName: "context pack" }
  );
  await writeArtifact(
    verificationArtifactPath(rootPath, featureKey),
    verificationReportSchema,
    {
      ...validVerificationReport,
      featureSlug: "add-note-pinning"
    },
    { artifactName: "verification report" }
  );
  await writeArtifact(
    taskReviewArtifactPath(rootPath, featureKey, "T001"),
    reviewReportSchema,
    {
      ...validReviewReport,
      featureSlug: "add-note-pinning",
      result: "passed",
      findings: [],
      warnings: []
    },
    { artifactName: "review report" }
  );
}

async function writeApprovedDependencyPlan(rootPath: string): Promise<void> {
  await writeArtifact(
    planArtifactPath(rootPath, "001-add-note-pinning"),
    planDraftArtifactSchema,
    {
      featureId: "001",
      featureSlug: "add-note-pinning",
      status: "ready",
      evidence: {
        knownFromUser: ["Dependency change requested."],
        knownFromSpecification: ["REQ-001"],
        knownFromCodebase: ["package.json"],
        knownFromConstitution: ["Human approval required."],
        inferred: [],
        assumed: [],
        unknown: []
      },
      affectedModules: [
        {
          moduleOrFileArea: "package.json",
          reason: "Approve the canonical dependency change.",
          evidence: "Plan dependency decision."
        }
      ],
      implementationApproach: "Update the canonical dependency manifest after approval.",
      impacts: {
        dataModel: "None.",
        api: "None.",
        ui: "None.",
        securityPrivacy: "Dependency review required.",
        performance: "None."
      },
      testingStrategy: [
        {
          level: "unit",
          whatToTest: "Dependency behavior.",
          validationCommand: "pnpm test"
        }
      ],
      rollbackStrategy: "Revert the canonical dependency change.",
      alternatives: [
        {
          option: "Do not add the dependency.",
          decision: "rejected",
          reason: "The plan explicitly approves it."
        }
      ],
      dependencies: {
        newDependenciesRequired: true,
        notes: "The canonical package.json dependency change requires approval.",
        requiresApproval: true
      },
      risks: [
        {
          id: "RISK001",
          description: "Dependency compatibility risk.",
          level: "medium",
          mitigation: "Run the documented checks.",
          requirementIds: ["REQ-001"]
        }
      ],
      decisions: [
        {
          id: "PD001",
          title: "Approve canonical dependency",
          decision: "Approve package.json only.",
          reason: "The canonical dependency is required.",
          evidence: "Plan dependency decision.",
          impacts: "Dependency manifest only.",
          requirementIds: ["REQ-001"]
        }
      ],
      createdAt: timestamp,
      updatedAt: timestamp
    },
    { artifactName: "plan" }
  );
}

describe("runReconcileWorkflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-reconcile-workflow-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes task reconciliation reports and prompts", async () => {
    await createReconcileFixture(tempDir);

    const summary = expectOk(
      await runReconcileWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        commandRunner: gitRunner(),
        now: timestamp
      })
    );

    expect(summary.result).toBe("passed");
    expect(summary.reportPath).toBe(
      ".visp/features/001-add-note-pinning/reconcile/T001.reconcile.md"
    );
    expect(
      await readFile(taskReconcileMarkdownPath(tempDir, "001-add-note-pinning", "T001"), "utf8")
    ).toContain("# Reconciliation Report");
    expect(
      await readFile(path.join(tempDir, ".visp", "prompts", "reconcile.prompt.md"), "utf8")
    ).toContain("Visp Reconcile Prompt");
  });

  it("writes feature-level reconciliation reports when no task is selected", async () => {
    await createReconcileFixture(tempDir);

    const summary = expectOk(
      await runReconcileWorkflow({
        targetPath: tempDir,
        commandRunner: gitRunner(),
        now: timestamp
      })
    );

    expect(summary.taskId).toBeNull();
    expect(summary.reportPath).toBe(".visp/features/001-add-note-pinning/reconcile.md");
    expect(
      await readFile(featureReconcileMarkdownPath(tempDir, "001-add-note-pinning"), "utf8")
    ).toContain("# Reconciliation Report");
  });

  it("updates traceability when requested and reconciliation has no blocking errors", async () => {
    await createReconcileFixture(tempDir);

    const summary = expectOk(
      await runReconcileWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        updateTraceability: true,
        commandRunner: gitRunner("tests/notes/sort.test.ts"),
        now: timestamp
      })
    );

    const traceability = JSON.parse(
      await readFile(traceabilityArtifactPath(tempDir, "001-add-note-pinning"), "utf8")
    ) as { entries: Array<{ testRefs?: string[]; status: string }> };

    expect(summary.traceabilityUpdate.performed).toBe(true);
    expect(traceability.entries[0]?.testRefs).toContain("changed:tests/notes/sort.test.ts");
    expect(traceability.entries[0]?.status).toBe("verified");
  });

  it("updates task status only when explicitly requested", async () => {
    await createReconcileFixture(tempDir);

    expectOk(
      await runReconcileWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        updateTaskStatus: true,
        commandRunner: gitRunner(),
        now: timestamp
      })
    );

    const graph = JSON.parse(
      await readFile(taskGraphArtifactPath(tempDir, "001-add-note-pinning"), "utf8")
    ) as { tasks: Array<{ id: string; status: string }> };

    expect(graph.tasks[0]?.status).toBe("verified");
  });

  it("dry-run writes nothing", async () => {
    await createReconcileFixture(tempDir);

    const summary = expectOk(
      await runReconcileWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        dryRun: true,
        commandRunner: gitRunner("src/other.ts"),
        now: timestamp
      })
    );

    expect(summary.success).toBe(true);
    expect(summary.reportPath).toBeNull();
    await expect(
      readFile(taskReconcileArtifactPath(tempDir, "001-add-note-pinning", "T001"), "utf8")
    ).rejects.toThrow();
  });

  it("prompt-only writes only reconcile prompts", async () => {
    await createReconcileFixture(tempDir);

    const summary = expectOk(
      await runReconcileWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        promptOnly: true,
        commandRunner: gitRunner(),
        now: timestamp
      })
    );

    expect(summary.reportPath).toBeNull();
    expect(
      await readFile(taskReconcilePromptPath(tempDir, "001-add-note-pinning", "T001"), "utf8")
    ).toContain("Visp Reconcile Prompt");
    await expect(
      readFile(taskReconcileArtifactPath(tempDir, "001-add-note-pinning", "T001"), "utf8")
    ).rejects.toThrow();
  });

  it("inventories a literal-backslash untracked lookalike and fails reconciliation", async () => {
    await createReconcileFixture(tempDir);
    const lookalike = "src\\notes\\sort.ts";
    await writeFile(path.join(tempDir, lookalike), "export const lookalike = true;\n");

    const summary = expectOk(
      await runReconcileWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        dryRun: true,
        commandRunner: gitRunner("src/notes/sort.ts", [lookalike]),
        now: timestamp
      })
    );

    expect(summary.changedFiles.map((file) => file.path)).toContain(lookalike);
    expect(summary.result).toBe("failed");
  });

  it("preserves unstaged tracked lookalikes and controls as failing identities", async () => {
    await createReconcileFixture(tempDir);
    const trackedPaths = [
      " src/notes/sort.ts",
      "src/notes/sort.ts ",
      "src\\notes\\sort.ts",
      "src/notes/tab\tname.ts",
      "src/notes/line\nname.ts",
      "src/notes/control\u0001name.ts",
      ".visp\\state\\implement-allowed\\T001.json"
    ];

    const summary = expectOk(
      await runReconcileWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        unstaged: true,
        dryRun: true,
        commandRunner: gitRunner(trackedPaths),
        now: timestamp
      })
    );

    expect(summary.changedFiles.map((file) => file.path)).toEqual([...trackedPaths].sort());
    expect(summary.result).toBe("failed");
  });

  it("keeps approved canonical dependency lookalikes unmapped and blocking", async () => {
    await createReconcileFixture(tempDir);
    await writeApprovedDependencyPlan(tempDir);
    const lookalikes = [
      " package.json",
      "package.json ",
      "\tpackage.json",
      "package.json\t",
      "package.json\n"
    ];

    const summary = expectOk(
      await runReconcileWorkflow({
        targetPath: tempDir,
        taskId: "T001",
        unstaged: true,
        dryRun: true,
        commandRunner: gitRunner(lookalikes),
        now: timestamp
      })
    );

    expect(summary.changedFiles).toEqual(
      [...lookalikes]
        .sort()
        .map((filePath) => expect.objectContaining({ path: filePath, mappingStatus: "unmapped" }))
    );
    expect(summary.findings.filter((finding) => finding.category === "dependencies")).toEqual([]);
    expect(
      summary.findings.filter(
        (finding) =>
          finding.category === "file-mapping" && finding.driftType === "unmapped_file_change"
      )
    ).toHaveLength(lookalikes.length);
    expect(summary.result).toBe("failed");
  });
});
