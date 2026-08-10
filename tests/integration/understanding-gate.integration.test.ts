import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { policyArtifactPath } from "../../src/artifacts/artifact-paths.js";
import { type GateResult } from "../../src/artifacts/schemas/gate.schema.js";
import { evaluateGate } from "../../src/gates/gate-engine.js";
import { runContextWorkflow } from "../../src/workflows/context.workflow.js";
import { runOverrideCreateWorkflow } from "../../src/workflows/override.workflow.js";
import { runScanWorkflow } from "../../src/workflows/scan.workflow.js";
import { createPhase8Fixture, expectOk, removeTempDirWithRetry } from "./phase8-fixture.js";

const execFileAsync = promisify(execFile);

const REPOSITORY_INSTANCE = "urn:visp-intel:repository-instance:1.0:sha256:fixture";
const SNAPSHOT = "urn:visp-intel:snapshot:1.0:sha256:fixture";
const NOTES = "urn:visp-intel:entity:1.0:sha256:notes";
const SORT = "urn:visp-intel:entity:1.0:sha256:sort";
const TEST = "urn:visp-intel:entity:1.0:sha256:test";
const SORTER = "urn:visp-intel:entity:1.0:sha256:sorter";

let tempDir: string;
let taskId: string;
let headCommit: string;

const taskGraphPath = (): string =>
  path.join(tempDir, ".visp", "features", "001-add-note-pinning", "task-graph.json");

async function updateTask(update: Record<string, unknown>): Promise<void> {
  const graph = JSON.parse(await readFile(taskGraphPath(), "utf8")) as {
    tasks: Record<string, unknown>[];
  };
  graph.tasks[0] = { ...graph.tasks[0], ...update };
  await writeFile(taskGraphPath(), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
}

async function writeIntelGraph(): Promise<void> {
  await mkdir(path.join(tempDir, ".visp-intel"), { recursive: true });
  await writeFile(
    path.join(tempDir, ".visp-intel", "graph.json"),
    JSON.stringify({
      schemaVersion: "1.0",
      repositoryInstanceId: REPOSITORY_INSTANCE,
      headSnapshotId: SNAPSHOT,
      entities: [
        {
          id: NOTES,
          snapshotId: SNAPSHOT,
          kind: "function",
          canonicalName: "src/notes.ts#pinNote",
          path: "src/notes.ts",
          symbol: "pinNote"
        },
        {
          id: TEST,
          snapshotId: SNAPSHOT,
          kind: "test",
          canonicalName: "tests/notes.test.ts#pinNote",
          path: "tests/notes.test.ts",
          symbol: "pinNote"
        },
        {
          id: SORTER,
          snapshotId: SNAPSHOT,
          kind: "function",
          canonicalName: "src/sort.ts#sortNotes",
          path: "src/sort.ts",
          symbol: "sortNotes"
        }
      ],
      relations: [
        { id: "r:1", sourceId: TEST, targetId: NOTES, kind: "imports" },
        { id: "r:2", sourceId: SORTER, targetId: NOTES, kind: "imports" }
      ]
    }),
    "utf8"
  );
}

function understandingExport(overrides: {
  readonly gitCommit?: string | null;
  readonly candidateFilePath?: string;
  readonly pathRelations?: number;
  readonly affectedTests?: number;
  readonly unknownIds?: readonly string[];
}): unknown {
  const withPath = (overrides.pathRelations ?? 1) > 0;
  const withTests = (overrides.affectedTests ?? 1) > 0;
  const unknownIds = overrides.unknownIds ?? [];

  return {
    kind: "understanding-case-export",
    schemaVersion: "1.0",
    case: {
      schemaVersion: "1.0",
      authority: "descriptive",
      authorizationEffect: "none",
      id: "urn:visp-intel:understanding-case:1.0:sha256:case",
      taskStateId: "urn:visp-intel:task-state:1.0:sha256:state",
      taskId,
      snapshotId: SNAPSHOT,
      behavioralQuestion: "How does a pinned note reach the sort order?",
      observations: [],
      hypotheses: [
        {
          id: "H1",
          statement: "pinNote is the only writer of pin state.",
          status: "unresolved",
          evidenceIds: []
        }
      ],
      entrypointIds: [NOTES],
      relationIds: withPath ? ["urn:visp-intel:relation:1.0:sha256:r1"] : [],
      evidenceIds: ["urn:visp-intel:evidence:1.0:sha256:e1"],
      unknownIds: [...unknownIds],
      candidateChangeEntityIds: [SORT],
      affectedUnchangedEntityIds: [],
      affectedTestIds: withTests ? [TEST] : [],
      queryReceiptIds: [],
      impactQueryReceiptIds: [],
      validationSuggestions: []
    },
    resolution: {
      [NOTES]: {
        kind: "function",
        filePath: "src/notes.ts",
        startLine: 6,
        endLine: 8,
        signature: "function src/notes.ts#pinNote",
        displayName: "pinNote"
      },
      [SORT]: {
        kind: "function",
        filePath: overrides.candidateFilePath ?? "src/notes.ts",
        startLine: 0,
        endLine: 4,
        signature: "function src/notes.ts#sortNotes",
        displayName: "sortNotes"
      },
      // Present only while the case cites it: `resolution` may hold nothing
      // unreachable from the case, and the reader rejects an export that does.
      ...(withTests
        ? {
            [TEST]: {
              kind: "test",
              filePath: "tests/notes.test.ts",
              startLine: 2,
              endLine: 4,
              signature: "test tests/notes.test.ts#pinNote",
              displayName: "pinNote"
            }
          }
        : {})
    },
    identity: {
      repositoryInstanceId: REPOSITORY_INSTANCE,
      snapshotId: SNAPSHOT,
      headSnapshotId: SNAPSHOT,
      gitCommit: overrides.gitCommit === undefined ? headCommit : overrides.gitCommit,
      dirty: false,
      worktreeFingerprint: "f".repeat(64)
    },
    path: withPath
      ? [
          {
            relationId: "urn:visp-intel:relation:1.0:sha256:r1",
            sourceId: NOTES,
            targetId: SORT,
            kind: "calls",
            evidenceId: "urn:visp-intel:evidence:1.0:sha256:e1"
          }
        ]
      : [],
    counts: {
      entrypoints: 1,
      pathRelations: withPath ? 1 : 0,
      candidateChanges: 1,
      affectedUnchanged: 0,
      affectedTests: withTests ? 1 : 0,
      unknowns: unknownIds.length
    }
  };
}

async function writeUnderstandingExport(value: unknown): Promise<void> {
  await mkdir(path.join(tempDir, ".visp-intel", "understanding"), { recursive: true });
  await writeFile(
    path.join(tempDir, ".visp-intel", "understanding", `${taskId}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8"
  );
}

async function enableVsp026(): Promise<void> {
  const policyPath = policyArtifactPath(tempDir);
  const policy = JSON.parse(await readFile(policyPath, "utf8")) as {
    rules: Record<string, boolean>;
  };
  policy.rules.requireUnderstandingBeforeBehaviouralImplementation = true;
  await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
}

async function implementGate(): Promise<GateResult> {
  return expectOk(
    await evaluateGate({
      targetPath: tempDir,
      stage: "implement",
      taskId,
      dryRun: true,
      now: "2026-01-01T00:00:00.000Z"
    })
  );
}

function vsp026(result: GateResult): readonly string[] {
  return result.failedRules
    .filter((rule) => rule.ruleId === "VSP026" && rule.severity === "error")
    .map((rule) => rule.message);
}

describe("VSP026 understanding gate", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-vsp026-"));
    await createPhase8Fixture(tempDir);
    const graph = JSON.parse(await readFile(taskGraphPath(), "utf8")) as {
      tasks: { id: string }[];
    };
    taskId = graph.tasks[0]?.id ?? "T001";
    await writeFile(
      path.join(tempDir, "src", "sort.ts"),
      'import { type Note } from "./notes";\n\nexport function sortNotes(notes: Note[]): Note[] {\n  return [...notes];\n}\n',
      "utf8"
    );
    await writeIntelGraph();
    expectOk(await runScanWorkflow({ targetPath: tempDir }));
    await execFileAsync("git", ["init"], { cwd: tempDir });
    await execFileAsync("git", ["add", "."], { cwd: tempDir });
    await execFileAsync(
      "git",
      [
        "-c",
        "user.email=visp@example.test",
        "-c",
        "user.name=Visp Test",
        "commit",
        "-m",
        "baseline"
      ],
      { cwd: tempDir }
    );
    headCommit = (
      await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempDir })
    ).stdout.trim();
    expectOk(
      await runContextWorkflow({
        targetPath: tempDir,
        taskId,
        now: "2026-01-01T00:00:00.000Z"
      })
    );
  });

  afterEach(async () => {
    await removeTempDirWithRetry(tempDir);
  });

  it("records the classification even when the rule is switched off", async () => {
    const result = await implementGate();

    // taskClass bounded_feature is B1. The record exists so the
    // misclassification rate can be measured on runs where nothing was gated.
    expect(result.taskClassification?.verdict).toBe("behavioural");
    expect(result.taskClassification?.basis).toEqual(["B1_task_class"]);
    expect(vsp026(result)).toEqual([]);
  });

  it("blocks a behavioural task that has no understanding case", async () => {
    await enableVsp026();

    const result = await implementGate();

    expect(result.allowed).toBe(false);
    expect(vsp026(result).join(" ")).toContain("G1");
  });

  it("does not gate a mechanical task", async () => {
    await enableVsp026();
    await updateTask({
      taskClass: "documentation",
      allowedFiles: ["docs/notes.md"],
      expectedFiles: [],
      riskFactors: []
    });

    const result = await implementGate();

    expect(result.taskClassification?.verdict).toBe("mechanical");
    expect(vsp026(result)).toEqual([]);
  });

  it("allows a behavioural task once a current case satisfies every condition", async () => {
    await enableVsp026();
    await writeUnderstandingExport(understandingExport({}));

    const result = await implementGate();

    expect(vsp026(result)).toEqual([]);
    expect(result.passedRules).toContain("VSP026");
  });

  it("treats a case exported at another commit as absent, without failing", async () => {
    await enableVsp026();
    await writeUnderstandingExport(understandingExport({ gitCommit: "b".repeat(40) }));

    const result = await implementGate();

    // Stale never fails a command. It just does not satisfy the gate.
    expect(result.success).toBe(false);
    expect(vsp026(result).join(" ")).toContain("G1");
  });

  it("names the specific condition that failed", async () => {
    await enableVsp026();
    await writeUnderstandingExport(understandingExport({ pathRelations: 0, affectedTests: 0 }));
    await updateTask({ validationCommands: [] });

    const messages = vsp026(await implementGate()).join(" ");

    expect(messages).toContain("G3");
    expect(messages).toContain("G4");
    expect(messages).not.toContain("G1:");
  });

  it("accepts an honest unresolved scout run in place of a path", async () => {
    await enableVsp026();
    await writeUnderstandingExport(understandingExport({ pathRelations: 0 }));
    await mkdir(path.join(tempDir, ".visp", "hyper", "current"), { recursive: true });
    await writeFile(
      path.join(tempDir, ".visp", "hyper", "current", "scout-findings.json"),
      JSON.stringify({
        schemaVersion: "1.0",
        taskId,
        status: "unresolved",
        unresolved: [{ question: "Which caller sets pin state?", unknownId: null }]
      }),
      "utf8"
    );

    expect(vsp026(await implementGate()).join(" ")).not.toContain("G3");
  });

  it("blocks when the case changes something the task does not declare", async () => {
    await enableVsp026();
    await writeUnderstandingExport(understandingExport({ candidateFilePath: "src/undeclared.ts" }));

    expect(vsp026(await implementGate()).join(" ")).toContain("G6");
  });

  it("reports cited unknowns without pretending it can read their risk", async () => {
    await enableVsp026();
    await writeUnderstandingExport(
      understandingExport({ unknownIds: ["urn:visp-intel:unknown:1.0:sha256:u1"] })
    );

    const result = await implementGate();
    const g5 = result.failedRules.find((rule) => rule.message.startsWith("G5"));

    expect(g5?.severity).toBe("warning");
    expect(g5?.evidence).toContain("no risk field");
  });

  it("records a misclassification from the realized surface without blocking it", async () => {
    await enableVsp026();
    await updateTask({
      taskClass: "documentation",
      allowedFiles: ["docs/notes.md"],
      expectedFiles: [],
      riskFactors: []
    });
    await writeFile(
      path.join(tempDir, "src", "notes.ts"),
      "export interface Note {\n  id: string;\n  pinned?: boolean;\n}\n",
      "utf8"
    );
    await writeFile(
      path.join(tempDir, "src", "sort.ts"),
      'import { type Note } from "./notes";\n\nexport function sortNotes(notes: Note[]): Note[] {\n  return [...notes].reverse();\n}\n',
      "utf8"
    );

    const result = expectOk(
      await evaluateGate({
        targetPath: tempDir,
        stage: "verify",
        taskId,
        dryRun: true,
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(result.taskClassification?.verdict).toBe("mechanical");
    expect(result.classificationInvalidated?.realizedVerdict).toBe("behavioural");
    // Recorded, never retroactive: no VSP026 finding is raised at verify.
    expect(result.failedRules.some((rule) => rule.ruleId === "VSP026")).toBe(false);
    expect(result.warnings.join(" ")).toContain("Recorded, not enforced");
  });

  it("clears the block through the existing recorded override, not a flag", async () => {
    await enableVsp026();
    expectOk(
      await runOverrideCreateWorkflow({
        targetPath: tempDir,
        ruleId: "VSP026",
        scope: "task",
        feature: "001-add-note-pinning",
        taskId,
        reason: "Legacy task predates the intel index; tracked in the phase record.",
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    const result = await implementGate();

    expect(vsp026(result)).toEqual([]);
    expect(result.overriddenRules).toContain("VSP026");
    expect(result.appliedOverrides[0]?.reason).toContain("Legacy task");
  });
});
