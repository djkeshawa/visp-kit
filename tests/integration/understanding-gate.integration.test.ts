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

/**
 * Intel's consumer projection, in the shape `visp-intel repo projection`
 * writes: integer codes into dictionaries, edges addressing nodes by row index.
 * Scan reads this artifact — not the archival `repo export` — so this is what
 * has to be on disk for the scan to record an intel store at all.
 *
 * Node rows: 0 `src/notes.ts#pinNote`, 1 `src/sort.ts#sortNotes`,
 * 2 `tests/notes.test.ts#pinNote`.
 */
async function writeIntelProjection(): Promise<void> {
  await mkdir(path.join(tempDir, ".visp-intel", "projection"), { recursive: true });
  await writeFile(
    path.join(tempDir, ".visp-intel", "projection", "graph.json"),
    JSON.stringify({
      kind: "consumer-graph-projection",
      schemaVersion: "1.0",
      authority: "descriptive",
      authorizationEffect: "none",
      identity: {
        repositoryInstanceId: REPOSITORY_INSTANCE,
        snapshotId: SNAPSHOT,
        headSnapshotId: SNAPSHOT,
        gitCommit: null,
        dirty: null,
        worktreeFingerprint: "f".repeat(64),
        indexProfile: "baseline"
      },
      dictionaries: {
        nodeKinds: ["function", "test"],
        edgeKinds: ["imports"],
        paths: ["src/notes.ts", "src/sort.ts", "tests/notes.test.ts"]
      },
      nodes: {
        columns: ["path", "kind", "name", "startLine", "endLine"],
        rows: [
          [0, 0, "pinNote", 5, 7],
          [1, 0, "sortNotes", 2, 4],
          [2, 1, "pinNote", 1, 3]
        ]
      },
      edges: {
        columns: [
          "source",
          "target",
          "kind",
          "confidence",
          "completeness",
          "modality",
          "derivationMethod",
          "uncertaintyReasonCount"
        ],
        rows: [
          [2, 0, 0, 0, 0, null, null, 0],
          [1, 0, 0, 0, 0, null, null, 0]
        ]
      }
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

async function verifyGate(): Promise<GateResult> {
  return expectOk(
    await evaluateGate({
      targetPath: tempDir,
      stage: "verify",
      taskId,
      dryRun: true,
      now: "2026-01-01T00:00:00.000Z"
    })
  );
}

/** A realized change surface of two linked, non-test TypeScript files. */
async function writeSourceChange(): Promise<void> {
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
    await writeIntelProjection();
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

  /**
   * Asymmetry 2, closed. VSP026 used to activate on nothing: a project that had
   * run intel and exported a case for the task still got no gate until someone
   * hand-edited .visp/policy.json. Presence of the export is now a trigger, the
   * way presence of an oracle plan is a trigger for VSP023.
   *
   * `enableVsp026` is deliberately NOT called in this block.
   */
  describe("activation by an exported case, with the rule off in policy", () => {
    it("runs the gate because the case exists", async () => {
      await writeUnderstandingExport(understandingExport({}));

      const result = await implementGate();

      expect(result.passedRules).toContain("VSP026");
      expect(vsp026(result)).toEqual([]);
    });

    it("blocks on the condition that fails, and says why the gate is on", async () => {
      await writeUnderstandingExport(
        understandingExport({ candidateFilePath: "src/undeclared.ts" })
      );

      const result = await implementGate();

      expect(result.allowed).toBe(false);
      expect(vsp026(result).join(" ")).toContain("G6");
      // A reader who checks policy, sees `false`, then meets a VSP026 error has
      // been handed a contradiction unless the report names the other trigger.
      expect(result.warnings.join(" ")).toContain("not because .visp/policy.json enables it");
    });

    it("keeps the gate on when the case goes stale rather than opening it", async () => {
      // The ratchet. Letting a case rot must not return the task to the ungated
      // default — that would make staleness a silent escape hatch.
      await writeUnderstandingExport(understandingExport({ gitCommit: "b".repeat(40) }));

      const result = await implementGate();

      expect(result.allowed).toBe(false);
      expect(vsp026(result).join(" ")).toContain("G1");
    });

    it("distinguishes an unusable export from no export at all", async () => {
      // Both reach the gate as "no case". They call for opposite actions, and
      // G1 used to report the second one for both.
      await writeUnderstandingExport({ kind: "understanding-case-export", schemaVersion: "1.0" });

      const g1 = (await implementGate()).failedRules.find((rule) => rule.message.startsWith("G1"));

      expect(g1?.evidence).toContain("could not use it");
      expect(g1?.recommendation).toContain("Re-export");
    });

    it("stays silent when intel has never run for this task", async () => {
      // The population the preset protects: no export, no policy rule, no gate.
      const result = await implementGate();

      expect(result.taskClassification?.verdict).toBe("behavioural");
      expect(result.failedRules.some((rule) => rule.ruleId === "VSP026")).toBe(false);
      expect(result.passedRules).not.toContain("VSP026");
    });
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

  it("gates a refactor — the enum value that used to fall through every rule", async () => {
    // `refactor` was a valid member of `taskClassValues` in NEITHER the
    // behavioural nor the mechanical list, so a real CLI run on a declared
    // refactor reached `ambiguous_default_mechanical` and VSP026 bound
    // nothing. This runs the shipped gate, not a replay of the rule.
    await enableVsp026();
    await updateTask({ taskClass: "refactor", riskFactors: [] });

    const result = await implementGate();

    expect(result.taskClassification?.verdict).toBe("behavioural");
    expect(result.taskClassification?.basis).toEqual(["B1_task_class"]);
    expect(vsp026(result).length).toBeGreaterThan(0);
  });

  it("does not call a file the scan has never seen a non-source file", async () => {
    // `expectedFiles` exists to name a file the task will CREATE, so scan's
    // index cannot know it. Filtering it out of the source surface emptied the
    // surface and fired M2 with the evidence line "the file index reports no
    // source file in the surface" — about a file the index had said nothing
    // about. Absence of evidence is not evidence of absence.
    await enableVsp026();
    await updateTask({
      taskClass: undefined,
      allowedFiles: [],
      expectedFiles: ["src/pinning/new-store.ts"],
      riskFactors: []
    });

    const result = await implementGate();

    expect(result.taskClassification?.basis).not.toContain("M2_non_source_surface");
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

  /**
   * The route a verifier used to defeat VSP026: declare `documentation`, reach
   * the mechanical branch, edit source. It is closed twice over — the declared
   * surface refutes the class at `implement`, and the diff refutes it at
   * `verify`, which is the stronger evidence because it is what actually
   * happened rather than what was declared.
   *
   * This test previously asserted the opposite ("Recorded, not enforced"). That
   * assertion was correct about the code and wrong about the gate: it pinned
   * the hole in place. It is replaced rather than relaxed, and the case it used
   * to cover — an invalidation that is NOT a refuted declaration — is asserted
   * below, still warning-only.
   */
  it("blocks at verify when the diff refutes the declared mechanical class", async () => {
    await enableVsp026();
    await updateTask({
      taskClass: "documentation",
      allowedFiles: ["docs/notes.md"],
      expectedFiles: [],
      riskFactors: []
    });
    await writeSourceChange();

    const result = await verifyGate();

    // The declared surface is documentation, so `implement` saw nothing to
    // refute and the recorded verdict stays mechanical. The diff does not.
    expect(result.taskClassification?.verdict).toBe("mechanical");
    expect(result.classificationInvalidated?.realizedVerdict).toBe("behavioural");
    expect(result.classificationInvalidated?.realizedBasis).toEqual([
      "B4_mechanical_class_refuted_by_surface"
    ]);
    expect(vsp026(result).join(" ")).toContain("the change it made is code");
    expect(result.allowed).toBe(false);
  });

  it("still only records a mechanical-to-behavioural move that refutes no declaration", async () => {
    await enableVsp026();
    // No declared class at all: `ambiguous_default_mechanical`. The realized
    // surface classifies behavioural through linkage, which is ordinary scope
    // drift and is the scope rules' business, not a task choosing its own gate.
    await updateTask({
      taskClass: undefined,
      allowedFiles: ["docs/notes.md"],
      expectedFiles: [],
      riskFactors: []
    });
    await writeSourceChange();

    const result = await verifyGate();

    expect(result.taskClassification?.basis).toEqual(["ambiguous_default_mechanical"]);
    expect(result.classificationInvalidated?.realizedVerdict).toBe("behavioural");
    expect(result.classificationInvalidated?.realizedBasis).not.toContain(
      "B4_mechanical_class_refuted_by_surface"
    );
    expect(result.failedRules.some((rule) => rule.ruleId === "VSP026")).toBe(false);
    expect(result.warnings.join(" ")).toContain("Recorded, not enforced");
  });

  /**
   * The boundary of what this closes. VSP026 is `false` in all four presets,
   * `locked` included, and that is now a recorded decision rather than a
   * backlog item: the precondition is an artifact only `visp-intel` writes, so
   * a preset that turned it on would ship a gate Kit cannot satisfy. See the
   * argument in `policy-defaults.ts`. A project with no exported case
   * therefore still only gets the refuted declaration written down.
   */
  it("enforces nothing at verify while VSP026 is inactive, and still records it", async () => {
    await updateTask({
      taskClass: "documentation",
      allowedFiles: ["docs/notes.md"],
      expectedFiles: [],
      riskFactors: []
    });
    await writeSourceChange();

    const result = await verifyGate();

    expect(result.classificationInvalidated?.realizedBasis).toEqual([
      "B4_mechanical_class_refuted_by_surface"
    ]);
    expect(result.failedRules.some((rule) => rule.ruleId === "VSP026")).toBe(false);
  });

  it("enforces the refuted declaration at verify once a case has been exported", async () => {
    // Same run as above with one difference: intel has exported a case for this
    // task, so the gate is live and the diff refuting the declared class blocks
    // rather than being written down. Policy is untouched.
    await writeUnderstandingExport(understandingExport({}));
    await updateTask({
      taskClass: "documentation",
      allowedFiles: ["docs/notes.md"],
      expectedFiles: [],
      riskFactors: []
    });
    await writeSourceChange();

    const result = await verifyGate();

    expect(vsp026(result).join(" ")).toContain("the change it made is code");
    expect(result.allowed).toBe(false);
    expect(result.warnings.join(" ")).toContain("not because .visp/policy.json enables it");
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
