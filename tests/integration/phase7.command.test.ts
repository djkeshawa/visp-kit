import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";
import { runFeatureWorkflow } from "../../src/workflows/feature.workflow.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected result to be ok.");
  return result.value;
}

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

async function updateJson(filePath: string, update: (value: any) => void): Promise<void> {
  const value = JSON.parse(await readFile(filePath, "utf8"));
  update(value);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function completeClarification(featureDir: string): Promise<void> {
  await updateJson(path.join(featureDir, "clarifications.json"), (artifact) => {
    artifact.questions[0].question = "Should pinned notes appear before unpinned notes?";
    artifact.questions[0].recommendedDefault = "Pinned notes appear first.";
    artifact.questions[0].reason = "The ordering rule changes observable behavior.";
  });
}

async function completeSpec(featureDir: string): Promise<void> {
  await updateJson(path.join(featureDir, "spec.json"), (spec) => {
    spec.status = "ready";
    spec.userStories[0] = {
      id: "US001",
      title: "Pin a note",
      actor: "note user",
      capability: "pin and unpin a note",
      outcome: "important notes remain at the top"
    };
    const criterion = {
      id: "AC001",
      requirementId: "REQ001",
      description:
        "Pinning a note places it before unpinned notes while preserving order within each group.",
      testable: true,
      validationMethod: "unit"
    };
    spec.requirements[0].title = "Persist note pin state";
    spec.requirements[0].description = "The note store must persist whether each note is pinned.";
    spec.requirements[0].acceptanceCriteria = [criterion];
    spec.acceptanceCriteria = [criterion];
    spec.businessRules = ["Pinned notes sort before unpinned notes."];
    spec.nonFunctionalRequirements = {
      performance: ["Sorting remains linearithmic in the number of notes."],
      security: ["Pinning does not change note authorization."],
      accessibility: ["Pinned state is available to assistive technology."],
      reliability: ["Pin state survives a store reload."],
      maintainability: ["Pin ordering is covered by unit tests."]
    };
    spec.edgeCases = ["Unpinning the only pinned note restores normal ordering."];
    spec.outOfScope = ["Cross-device synchronization of pin state."];
  });
}

async function completePlan(featureDir: string): Promise<void> {
  await updateJson(path.join(featureDir, "plan.json"), (plan) => {
    plan.status = "ready";
    plan.evidence.knownFromSpecification = [
      "REQ001 and AC001 define pin persistence and ordering."
    ];
    plan.evidence.knownFromCodebase = ["src/notes/store.ts owns note persistence."];
    plan.evidence.knownFromConstitution = ["Keep changes task-scoped and tested."];
    plan.evidence.inferred = ["Existing note ordering can be extended without a new dependency."];
    plan.evidence.assumed = ["The note model can accept a boolean pinned field."];
    plan.evidence.unknown = ["No migration is needed for existing in-memory fixtures."];
    plan.affectedModules[0] = {
      moduleOrFileArea: "src/notes/store.ts",
      reason: "Persist and sort the pin state.",
      evidence: "REQ001 and the existing store boundary."
    };
    plan.implementationApproach =
      "Add pin state to the note store and cover grouped ordering with unit tests.";
    plan.impacts = {
      dataModel: "Add a default-false pinned field.",
      api: "Expose pin and unpin store operations.",
      ui: "No UI change in this task.",
      securityPrivacy: "No authorization change.",
      performance: "One grouped sort when listing notes."
    };
    plan.testingStrategy[0] = {
      level: "unit",
      whatToTest: "Pin persistence, unpin behavior, and stable grouped ordering.",
      validationCommand: "pnpm test"
    };
    plan.rollbackStrategy = "Remove the field and pin operations if validation fails.";
    plan.alternatives[0] = {
      option: "Maintain a separate pinned-note index.",
      decision: "rejected",
      reason: "It adds state synchronization without a demonstrated need."
    };
    plan.risks[0].description = "Existing note fixtures may omit the new field.";
    plan.risks[0].mitigation = "Default missing pin state to false and add regression tests.";
    plan.decisions[0] = {
      id: "PD001",
      title: "Store pin state on the note",
      decision: "Use a default-false boolean field.",
      reason: "It keeps persistence and ordering in one model.",
      evidence: "REQ001; src/notes/store.ts",
      impacts: "Note fixtures and store sorting.",
      requirementIds: ["REQ001"]
    };
  });
}

async function completeTasks(featureDir: string): Promise<void> {
  await updateJson(path.join(featureDir, "task-graph.json"), (graph) => {
    graph.status = "ready";
    graph.tasks[0] = {
      ...graph.tasks[0],
      title: "Implement note pin persistence and ordering",
      description: "Add pin operations and stable grouped ordering with focused unit tests.",
      allowedFiles: ["src/notes/store.ts", "tests/unit/notes/store.test.ts"],
      expectedFiles: ["tests/unit/notes/store.test.ts"],
      validationCommands: ["pnpm test"],
      status: "ready",
      taskClass: "bounded_feature",
      riskFactors: [],
      riskLevel: "medium"
    };
  });
}

async function initializedFeature(tempDir: string): Promise<void> {
  expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
  expectOk(
    await runFeatureWorkflow({
      targetPath: tempDir,
      featureIdea: "Add note pinning",
      now: "2026-01-01T00:00:00.000Z"
    })
  );
}

async function writeNormalizableSpecMistakes(specPath: string): Promise<void> {
  const spec = JSON.parse(await readFile(specPath, "utf8")) as {
    requirements: Array<{
      source: string;
      assumptions: unknown[];
      acceptanceCriteria: Array<{ validationMethod: string }>;
    }>;
    acceptanceCriteria: Array<{ validationMethod: string }>;
    assumptions: unknown[];
  };

  spec.requirements[0]!.source = "constitution";
  spec.requirements[0]!.assumptions = ["Follow existing project conventions."];
  spec.requirements[0]!.acceptanceCriteria[0]!.validationMethod = "review";
  spec.acceptanceCriteria[0]!.validationMethod = "test";
  spec.assumptions = ["Repository state may include user changes."];

  await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
}

describe("phase 7 template commands", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-phase7-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("runs the full clarify, spec, plan, and tasks command chain after semantic completion", async () => {
    await initializedFeature(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "clarify", tempDir]);
    const featureDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning");
    await completeClarification(featureDir);
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
    await completeSpec(featureDir);
    await program.parseAsync(["node", "visp", "spec", tempDir, "--validate"]);
    await program.parseAsync(["node", "visp", "plan", tempDir]);
    await completePlan(featureDir);
    await program.parseAsync(["node", "visp", "plan", tempDir, "--validate"]);
    await program.parseAsync(["node", "visp", "tasks", tempDir]);
    await completeTasks(featureDir);
    await program.parseAsync(["node", "visp", "tasks", tempDir, "--validate"]);

    for (const file of [
      "clarifications.md",
      "clarifications.json",
      "spec.md",
      "spec.json",
      "plan.md",
      "plan.json",
      "tasks.md",
      "task-graph.json",
      "traceability.md",
      "traceability.json"
    ]) {
      expect(await exists(path.join(featureDir, file))).toBe(true);
    }

    const specMarkdown = await readFile(path.join(featureDir, "spec.md"), "utf8");
    const planMarkdown = await readFile(path.join(featureDir, "plan.md"), "utf8");
    const tasksMarkdown = await readFile(path.join(featureDir, "tasks.md"), "utf8");

    expect(specMarkdown).toContain("Persist note pin state");
    expect(planMarkdown).toContain("Add pin state to the note store");
    expect(tasksMarkdown).toContain("Implement note pin persistence and ordering");

    for (const markdown of [specMarkdown, planMarkdown, tasksMarkdown]) {
      expect(markdown).not.toContain("TBD");
      expect(markdown).not.toContain("<placeholder>");
    }

    for (const file of [
      "clarify.prompt.md",
      "spec.prompt.md",
      "plan.prompt.md",
      "tasks.prompt.md"
    ]) {
      expect(await exists(path.join(tempDir, ".visp", "prompts", file))).toBe(true);
    }

    expect(await readFile(path.join(tempDir, ".visp", "status.json"), "utf8")).toContain(
      "tasks_ready"
    );
    expect(await readFile(path.join(featureDir, "traceability.json"), "utf8")).toContain("T001");
    expect(
      await readFile(path.join(tempDir, ".visp", "reports", "budget-report.md"), "utf8")
    ).toContain("# Visp Budget Report");
  });

  it("fails clearly when .visp or active feature is missing", async () => {
    const errors: string[] = [];
    let program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "clarify", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp-kit init");

    process.exitCode = undefined;
    errors.length = 0;
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "clarify", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp-kit feature");
  });

  it("does not let force bypass missing clarifications", async () => {
    await initializedFeature(tempDir);
    const errors: string[] = [];
    const program = createCli({
      writeErr: (value) => errors.push(value),
      writeOut: () => undefined
    });

    await program.parseAsync(["node", "visp", "spec", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp-kit clarify");
    expect(errors.join("")).toContain("Recover: run `visp-kit clarify`");

    process.exitCode = undefined;
    const jsonOutput: string[] = [];
    const jsonProgram = createCli({
      writeOut: (value) => jsonOutput.push(value),
      writeErr: () => undefined
    });
    await jsonProgram.parseAsync(["node", "visp", "spec", tempDir, "--json"]);

    const envelope = JSON.parse(jsonOutput.join("")) as {
      success: boolean;
      recovery?: string;
    };

    expect(envelope.success).toBe(false);
    expect(envelope.recovery).toBe("visp-kit clarify");

    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "spec", tempDir, "--force"]);

    expect(
      await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning", "spec.json"))
    ).toBe(false);
  });

  it("records clarification answers through the CLI", async () => {
    await initializedFeature(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "clarify", tempDir]);
    await completeClarification(path.join(tempDir, ".visp", "features", "001-add-note-pinning"));
    output.length = 0;
    await program.parseAsync([
      "node",
      "visp",
      "clarify",
      "answer",
      "CQ001",
      tempDir,
      "--answer",
      "Use the existing note model and keep pinning behavior task-scoped.",
      "--json"
    ]);

    const summary = JSON.parse(output.at(-1) ?? "{}") as {
      success: boolean;
      artifactStatus: string;
      questionId: string;
      updatedFiles: string[];
    };
    const featureDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning");
    const artifact = JSON.parse(
      await readFile(path.join(featureDir, "clarifications.json"), "utf8")
    ) as {
      status: string;
      questions: Array<{ id: string; status: string; answer: string }>;
    };

    expect(summary.success).toBe(true);
    expect(summary.artifactStatus).toBe("ready");
    expect(summary.questionId).toBe("CQ001");
    expect(summary.updatedFiles).toContain(
      ".visp/features/001-add-note-pinning/clarifications.json"
    );
    expect(artifact.status).toBe("ready");
    expect(artifact.questions[0]?.status).toBe("answered");
    expect(artifact.questions[0]?.answer).toContain("existing note model");
    expect(await readFile(path.join(featureDir, "clarifications.md"), "utf8")).toContain(
      "existing note model"
    );
  });

  it("auto-normalizes common AI-generated spec JSON mistakes", async () => {
    await initializedFeature(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });
    const featureDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning");
    const specPath = path.join(featureDir, "spec.json");

    await program.parseAsync(["node", "visp", "clarify", tempDir]);
    await completeClarification(featureDir);
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
    await completeSpec(featureDir);
    await writeNormalizableSpecMistakes(specPath);

    output.length = 0;
    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "spec", tempDir, "--validate"]);

    expect(process.exitCode).toBeUndefined();
    expect(output.join("")).toContain("Auto-normalized");

    const normalized = JSON.parse(await readFile(specPath, "utf8")) as {
      requirements: Array<{
        source: string;
        assumptions: Array<{ id: string; description: string }>;
        acceptanceCriteria: Array<{ validationMethod: string }>;
      }>;
      acceptanceCriteria: Array<{ validationMethod: string }>;
      assumptions: Array<{ id: string; description: string }>;
    };

    expect(normalized.requirements[0]?.source).toBe("derived");
    expect(normalized.requirements[0]?.acceptanceCriteria[0]?.validationMethod).toBe("manual");
    expect(normalized.acceptanceCriteria[0]?.validationMethod).toBe("unit");
    expect(normalized.assumptions[0]).toEqual({
      id: "ASM001",
      description: "Repository state may include user changes."
    });
    expect(normalized.requirements[0]?.assumptions[0]).toEqual({
      id: "REQ001-ASM001",
      description: "Follow existing project conventions."
    });

    await program.parseAsync(["node", "visp", "plan", tempDir]);
    await completePlan(featureDir);
    await writeNormalizableSpecMistakes(specPath);
    await program.parseAsync(["node", "visp", "tasks", tempDir]);
    await completeTasks(featureDir);
    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "tasks", tempDir, "--validate"]);

    expect(process.exitCode).toBeUndefined();
    expect(await readFile(path.join(featureDir, "tasks.md"), "utf8")).toContain(
      "# Task Graph: Add note pinning"
    );
  });

  it("skips existing generated files without force and overwrites with force", async () => {
    await initializedFeature(tempDir);
    const program = createCli({ writeOut: () => undefined });
    const markdownPath = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "clarifications.md"
    );

    await program.parseAsync(["node", "visp", "clarify", tempDir]);
    await writeFile(markdownPath, "custom", "utf8");
    await program.parseAsync(["node", "visp", "clarify", tempDir]);
    expect(await readFile(markdownPath, "utf8")).toBe("custom");
    await program.parseAsync(["node", "visp", "clarify", tempDir, "--force"]);
    expect(await readFile(markdownPath, "utf8")).toContain("# Clarifications");
  });

  it("regenerates hand-edited markdown from the validated JSON on the validate path", async () => {
    await initializedFeature(tempDir);
    const program = createCli({ writeOut: () => undefined });
    const featureDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning");
    const handEdited = "hand-edited prose that no artifact backs";
    const markdownAt = (name: string): string => path.join(featureDir, name);

    await program.parseAsync(["node", "visp", "clarify", tempDir]);
    await completeClarification(featureDir);
    await program.parseAsync([
      "node",
      "visp",
      "clarify",
      "answer",
      "CQ001",
      tempDir,
      "--accept-default"
    ]);

    await writeFile(markdownAt("clarifications.md"), handEdited, "utf8");
    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "clarify", tempDir, "--validate"]);

    const clarifications = await readFile(markdownAt("clarifications.md"), "utf8");
    expect(process.exitCode).toBeUndefined();
    expect(clarifications).not.toContain(handEdited);
    expect(clarifications).toContain("# Clarifications");
    expect(clarifications).toContain("Should pinned notes appear before unpinned notes?");

    await program.parseAsync(["node", "visp", "spec", tempDir]);
    await completeSpec(featureDir);
    await writeFile(markdownAt("spec.md"), handEdited, "utf8");
    await writeFile(markdownAt("traceability.md"), handEdited, "utf8");
    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "spec", tempDir, "--validate"]);

    const spec = await readFile(markdownAt("spec.md"), "utf8");
    const traceabilityAfterSpec = await readFile(markdownAt("traceability.md"), "utf8");
    expect(process.exitCode).toBeUndefined();
    expect(spec).not.toContain(handEdited);
    expect(spec).toContain("# Specification: Add note pinning");
    expect(spec).toContain("Persist note pin state");
    expect(traceabilityAfterSpec).not.toContain(handEdited);
    expect(traceabilityAfterSpec).toContain("# Traceability: Add note pinning");

    await program.parseAsync(["node", "visp", "plan", tempDir]);
    await completePlan(featureDir);
    await writeFile(markdownAt("plan.md"), handEdited, "utf8");
    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "plan", tempDir, "--validate"]);

    const plan = await readFile(markdownAt("plan.md"), "utf8");
    expect(process.exitCode).toBeUndefined();
    expect(plan).not.toContain(handEdited);
    expect(plan).toContain("# Implementation Plan: Add note pinning");
    expect(plan).toContain("Add pin state to the note store");

    await program.parseAsync(["node", "visp", "tasks", tempDir]);
    await completeTasks(featureDir);
    await writeFile(markdownAt("tasks.md"), handEdited, "utf8");
    await writeFile(markdownAt("traceability.md"), handEdited, "utf8");
    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "tasks", tempDir, "--validate"]);

    const tasks = await readFile(markdownAt("tasks.md"), "utf8");
    const traceabilityAfterTasks = await readFile(markdownAt("traceability.md"), "utf8");
    expect(process.exitCode).toBeUndefined();
    expect(tasks).not.toContain(handEdited);
    expect(tasks).toContain("# Task Graph: Add note pinning");
    expect(tasks).toContain("Implement note pin persistence and ordering");
    expect(traceabilityAfterTasks).not.toContain(handEdited);
    expect(traceabilityAfterTasks).toContain("T001");
  });

  it("reports the regenerated markdown as an updated file in --json output", async () => {
    await initializedFeature(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });
    const featureDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning");

    await program.parseAsync(["node", "visp", "clarify", tempDir]);
    await completeClarification(featureDir);
    await program.parseAsync([
      "node",
      "visp",
      "clarify",
      "answer",
      "CQ001",
      tempDir,
      "--accept-default"
    ]);

    output.length = 0;
    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "clarify", tempDir, "--validate", "--json"]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      updatedFiles: string[];
    };

    expect(summary.success).toBe(true);
    expect(summary.updatedFiles).toContain(".visp/features/001-add-note-pinning/clarifications.md");
  });

  it("leaves markdown untouched when validation fails, is dry run, or is prompt only", async () => {
    await initializedFeature(tempDir);
    const program = createCli({ writeOut: () => undefined, writeErr: () => undefined });
    const featureDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning");
    const markdownPath = path.join(featureDir, "clarifications.md");
    const handEdited = "hand-edited prose that no artifact backs";

    await program.parseAsync(["node", "visp", "clarify", tempDir]);
    await completeClarification(featureDir);
    await program.parseAsync([
      "node",
      "visp",
      "clarify",
      "answer",
      "CQ001",
      tempDir,
      "--accept-default"
    ]);

    await writeFile(markdownPath, handEdited, "utf8");
    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "clarify", tempDir, "--validate", "--dry-run"]);
    expect(await readFile(markdownPath, "utf8")).toBe(handEdited);

    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "clarify", tempDir, "--validate", "--prompt-only"]);
    expect(await readFile(markdownPath, "utf8")).toBe(handEdited);

    await writeFile(path.join(featureDir, "clarifications.json"), "{", "utf8");
    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "clarify", tempDir, "--validate"]);
    expect(process.exitCode).toBe(1);
    expect(await readFile(markdownPath, "utf8")).toBe(handEdited);
  });

  it("supports prompt-only, dry-run, and JSON validation output", async () => {
    await initializedFeature(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "plan", tempDir, "--prompt-only"]);

    expect(await exists(path.join(tempDir, ".visp", "prompts", "plan.prompt.md"))).toBe(true);
    expect(
      await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning", "plan.md"))
    ).toBe(false);

    output.length = 0;
    await program.parseAsync(["node", "visp", "clarify", tempDir, "--dry-run"]);
    expect(output.join("")).toContain("dry run");
    expect(
      await exists(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "clarifications.md")
      )
    ).toBe(false);

    await program.parseAsync(["node", "visp", "clarify", tempDir]);
    await writeFile(
      path.join(tempDir, ".visp", "features", "001-add-note-pinning", "clarifications.json"),
      "{",
      "utf8"
    );

    output.length = 0;
    await program.parseAsync(["node", "visp", "clarify", tempDir, "--validate", "--json"]);
    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      validation: { passed: boolean; errors: string[] };
    };

    expect(summary.success).toBe(false);
    expect(summary.validation.passed).toBe(false);
    expect(process.exitCode).toBe(1);
  });
});
