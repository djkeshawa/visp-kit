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
  tasks: { acceptanceCriterionIds: string[]; requirementIds: string[] }[];
};

type Criterion = typeof criterion;

type SpecFile = {
  requirements: { acceptanceCriteria: Criterion[] }[];
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

  it("leaves a coverage judgement a later stage already recorded", async () => {
    const program = createCli({ writeOut: () => undefined });
    const tracePath = path.join(featureDir, "traceability.json");
    const traceability = await readJson<TraceabilityFile>(tracePath);
    traceability.entries[0]!.status = "verified";
    await writeFile(tracePath, `${JSON.stringify(traceability, null, 2)}\n`, "utf8");

    await program.parseAsync(["node", "visp", "tasks", tempDir, "--validate"]);

    const updated = await readJson<TraceabilityFile>(tracePath);
    expect(updated.entries[0]?.status).toBe("verified");
    expect(updated.entries[0]?.taskIds).toEqual(["T001"]);
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

  it("offers a criterion repair the spec gate still refuses, so no filler survives it", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });
    const graphPath = path.join(featureDir, "task-graph.json");
    const graph = await readJson<TaskGraphFile>(graphPath);
    graph.tasks[0]!.acceptanceCriterionIds = ["AC001", "AC404"];
    await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");

    await program.parseAsync(["node", "visp", "tasks", tempDir, "--validate"]);

    const fragment = /\{"id":"AC404".*\}/u.exec(output.join(""))?.[0];
    expect(fragment).toBeDefined();

    // Paste the repair exactly as instructed, then ask the gate that owns the
    // spec whether it accepts the result. It must not: the fastest path out of
    // one error may not leave an acceptance criterion that asserts nothing.
    const specPath = path.join(featureDir, "spec.json");
    const spec = await readJson<SpecFile>(specPath);
    spec.requirements[0]!.acceptanceCriteria.push(JSON.parse(fragment as string) as Criterion);
    await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

    const specOutput: string[] = [];
    const specProgram = createCli({ writeOut: (value) => specOutput.push(value) });
    await specProgram.parseAsync(["node", "visp", "spec", tempDir, "--validate"]);

    expect(specOutput.join("")).toContain("Validation: failed");
    expect(specOutput.join("")).toContain("placeholder text");
  });

  it("does not ask for a traceability entry against a requirement the spec never declared", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });
    const graphPath = path.join(featureDir, "task-graph.json");
    const graph = await readJson<TaskGraphFile>(graphPath);
    graph.tasks[0]!.requirementIds = ["REQ999"];
    await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");

    await program.parseAsync(["node", "visp", "tasks", tempDir, "--validate"]);

    const text = output.join("");
    expect(text).toContain("Validation: failed");
    expect(text).toContain("T001 references requirement REQ999, which spec.json does not declare.");
    expect(text).toContain('"id":"REQ999"');
    expect(text).not.toContain("add to the taskIds of REQ999");
  });

  // LC-32: tasks --validate is the last gate before implementation, and it
  // reported "passed" on artifacts spec --validate refused — a spec criterion
  // the traceability matrix never covers. Passing the last gate has to mean the
  // earlier gate on the same artifacts would still hold.
  it("fails when the spec gate would fail on the same artifacts", async () => {
    const specPath = path.join(featureDir, "spec.json");
    const spec = await readJson<SpecFile>(specPath);
    spec.requirements[0]!.acceptanceCriteria.push({
      id: "AC404",
      requirementId: "REQ001",
      description: "Reassigning CONSTANTS.scorePerWave throws in strict mode.",
      testable: true,
      validationMethod: "unit"
    });
    await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

    const specOutput: string[] = [];
    await createCli({ writeOut: (value) => specOutput.push(value) }).parseAsync([
      "node",
      "visp",
      "spec",
      tempDir,
      "--validate"
    ]);
    expect(specOutput.join(""), "the spec gate must refuse this fixture").toContain(
      "Traceability is missing acceptance criteria AC404"
    );

    const output: string[] = [];
    await createCli({ writeOut: (value) => output.push(value) }).parseAsync([
      "node",
      "visp",
      "tasks",
      tempDir,
      "--validate"
    ]);

    const text = output.join("");
    expect(text).toContain("Validation: failed");
    expect(text).toContain("Traceability is missing acceptance criteria AC404");
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
