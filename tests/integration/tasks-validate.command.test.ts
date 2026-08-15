import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { runFeatureWorkflow } from "../../src/workflows/feature.workflow.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected result to be ok.");
  return result.value;
}

const criterion = {
  id: "AC001",
  requirementId: "REQ001",
  description: "Object.isFrozen(CONSTANTS) returns true.",
  testable: true,
  validationMethod: "unit"
};

const requirement = {
  id: "REQ001",
  featureId: "FEAT001",
  title: "Export a frozen CONSTANTS object",
  description: "The scoring module exports a CONSTANTS object callers cannot mutate at runtime.",
  source: "user",
  priority: "must",
  acceptanceCriteria: [criterion],
  assumptions: [],
  outOfScope: []
};

const task = {
  id: "T001",
  title: "Export a frozen CONSTANTS object from the scoring module",
  description: "Add src/scoring/constants.ts exporting a frozen object and cover it with a test.",
  dependsOn: [],
  requirementIds: ["REQ001"],
  acceptanceCriterionIds: ["AC001"],
  allowedFiles: ["src/scoring/constants.ts"],
  expectedFiles: ["tests/unit/scoring/constants.test.ts"],
  validationCommands: ["pnpm test"],
  status: "ready",
  parallelizable: false,
  riskLevel: "low",
  taskClass: "bounded_feature",
  riskFactors: []
};

/**
 * Writes the four files `tasks --validate` reads, in the shape a coding agent
 * produces: acceptance criteria stated inside their requirement only, and a
 * traceability matrix whose task ids are still empty because the task graph
 * this call validates is what produces them.
 */
async function writeAuthoredTaskStage(featureDir: string): Promise<void> {
  const write = async (name: string, value: unknown): Promise<void> => {
    await writeFile(path.join(featureDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  };

  await write("spec.json", {
    featureId: "FEAT001",
    featureSlug: "add-a-scoring-module",
    title: "Add a scoring module",
    status: "ready",
    userStories: [
      {
        id: "US001",
        title: "Score a wave",
        actor: "player",
        capability: "see the score rise when a wave clears",
        outcome: "the run feels like it is progressing"
      }
    ],
    requirements: [requirement],
    acceptanceCriteria: [],
    businessRules: ["Tuning values are fixed for the lifetime of a run."],
    nonFunctionalRequirements: {
      performance: [],
      security: [],
      accessibility: [],
      reliability: [],
      maintainability: []
    },
    edgeCases: ["A caller assigns to CONSTANTS.scorePerWave and the assignment is ignored."],
    assumptions: [],
    outOfScope: ["Persisting high scores to disk."],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  });

  await write("task-graph.json", {
    featureId: "FEAT001",
    featureSlug: "add-a-scoring-module",
    status: "ready",
    tasks: [task],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  });

  await write("traceability.json", {
    featureId: "FEAT001",
    featureSlug: "add-a-scoring-module",
    entries: [
      {
        requirementId: "REQ001",
        acceptanceCriterionIds: ["AC001"],
        planDecisionIds: [],
        taskIds: [],
        filePaths: [],
        testPaths: [],
        testRefs: [],
        status: "missing"
      }
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  });

  await writeFile(
    path.join(featureDir, "tasks.md"),
    "# Tasks\n\n- T001 Export a frozen CONSTANTS object\n",
    "utf8"
  );
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

type TraceabilityFile = {
  entries: { taskIds: string[]; status: string }[];
};

type TaskGraphFile = {
  tasks: { acceptanceCriterionIds: string[] }[];
};

describe("visp-kit tasks --validate", () => {
  let tempDir: string;
  let featureDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-tasks-validate-"));
    process.exitCode = undefined;
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "Add a scoring module",
        now: "2026-01-01T00:00:00.000Z"
      })
    );
    featureDir = path.join(tempDir, ".visp", "features", "001-add-a-scoring-module");
    await writeAuthoredTaskStage(featureDir);
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("accepts a task graph whose criteria the spec declares only inside their requirement", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "tasks", tempDir, "--validate"]);

    expect(output.join("")).toContain("Validation: passed");
  });

  it("derives the traceability task ids from the task graph it validated", async () => {
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "tasks", tempDir, "--validate"]);

    const traceability = await readJson<TraceabilityFile>(
      path.join(featureDir, "traceability.json")
    );
    expect(traceability.entries[0]?.taskIds).toEqual(["T001"]);
    expect(traceability.entries[0]?.status).toBe("partial");
  });

  it("still reports a criterion no part of the spec declares", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });
    const graphPath = path.join(featureDir, "task-graph.json");
    const graph = await readJson<TaskGraphFile>(graphPath);
    graph.tasks[0]!.acceptanceCriterionIds = ["AC404"];
    await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");

    await program.parseAsync(["node", "visp", "tasks", tempDir, "--validate"]);

    const text = output.join("");
    expect(text).toContain("Validation: failed");
    expect(text).toContain("AC404");
    expect(text).toContain("REQ001");
  });

  it("still reports a task whose requirement has no traceability entry", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });
    const tracePath = path.join(featureDir, "traceability.json");
    const traceability = await readJson<TraceabilityFile>(tracePath);
    traceability.entries = [];
    await writeFile(tracePath, `${JSON.stringify(traceability, null, 2)}\n`, "utf8");

    await program.parseAsync(["node", "visp", "tasks", tempDir, "--validate"]);

    const text = output.join("");
    expect(text).toContain("Validation: failed");
    expect(text).toContain("T001");
  });
});
