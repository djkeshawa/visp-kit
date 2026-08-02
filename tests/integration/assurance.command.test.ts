import { createHash } from "node:crypto";
import { link, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createCli } from "../../src/cli/main.js";
import {
  defaultCommandRunner,
  runCommand,
  type CommandRunner
} from "../../src/core/command-runner.js";
import { pathExists } from "../../src/core/file-system.js";
import { ok } from "../../src/core/result.js";
import { evaluatePolicyGate } from "../../src/gates/policy-gate-summary.js";
import { type ReviewDecision } from "../../src/artifacts/schemas/review-decision.schema.js";
import { createAssuranceCaseHash } from "../../src/assurance/assurance-case-hash.js";
import { type AssuranceCase } from "../../src/artifacts/schemas/assurance-case.schema.js";
import { createReviewDecisionHash } from "../../src/review/review-decision-hash.js";
import { selectCanonicalAssuranceSummary } from "../../src/integration/canonical-assurance.js";
import { loadProjectState } from "../../src/orchestrator/project-state.js";
import {
  evaluateCurrentReviewDecision,
  runReviewDecisionRepair,
  runReviewDecisionWorkflow
} from "../../src/review/review-decision.js";
import { runAssuranceWorkflow } from "../../src/workflows/assurance.workflow.js";
import { runNextWorkflow } from "../../src/workflows/next.workflow.js";
import { createPhase8Fixture, expectOk, removeTempDirWithRetry } from "./phase8-fixture.js";

const DECISION_TEST_TIMEOUT_MS = process.platform === "win32" ? 60_000 : 30_000;

async function prepareAssuranceFixture(targetPath: string): Promise<void> {
  await createPhase8Fixture(targetPath);
  expectOk(await runCommand("git", ["init"], { cwd: targetPath }));
  expectOk(await runCommand("git", ["add", "."], { cwd: targetPath }));
  expectOk(
    await runCommand(
      "git",
      [
        "-c",
        "user.name=Visp Test",
        "-c",
        "user.email=visp@example.invalid",
        "commit",
        "-m",
        "fixture"
      ],
      { cwd: targetPath }
    )
  );
  const program = createCli({ writeOut: () => undefined });
  await program.parseAsync(["node", "visp", "context", "T001", targetPath, "--force"]);
  await program.parseAsync(["node", "visp", "oracle", "plan", targetPath, "--task", "T001"]);
  await program.parseAsync(["node", "visp", "oracle", "lock", targetPath, "--task", "T001"]);
  await writeFile(
    path.join(targetPath, "src", "notes.ts"),
    `${await readFile(path.join(targetPath, "src", "notes.ts"), "utf8")}\nexport const assured = true;\n`,
    "utf8"
  );
  process.exitCode = undefined;
}

async function action32(targetPath: string, now: string) {
  const result = expectOk(
    await runNextWorkflow({
      targetPath,
      taskId: "T001",
      protocol: "3.2",
      now
    })
  );
  if (result.action.protocolVersion !== "3.2") {
    throw new Error("Expected WorkflowAction 3.2.");
  }
  expect(result.action.nextCommand).toBe(result.nextCommand);
  return result.action;
}

function pairedCommandRunners(): readonly [CommandRunner, CommandRunner] {
  const gates = new Map<
    number,
    {
      arrivals: number;
      readonly promise: Promise<void>;
      readonly release: () => void;
    }
  >();

  const createRunner = (): CommandRunner => {
    let callIndex = 0;
    return {
      async run(command, args, options) {
        const result = await defaultCommandRunner.run(command, args, options);
        const index = callIndex++;
        let gate = gates.get(index);
        if (gate === undefined) {
          let release: () => void = () => undefined;
          const promise = new Promise<void>((resolve) => {
            release = resolve;
          });
          gate = { arrivals: 0, promise, release };
          gates.set(index, gate);
        }
        gate.arrivals += 1;
        if (gate.arrivals === 2) gate.release();
        await gate.promise;
        return result;
      }
    };
  };

  return [createRunner(), createRunner()];
}

describe("assurance command", { timeout: DECISION_TEST_TIMEOUT_MS }, () => {
  const roots: string[] = [];

  afterEach(() => {
    process.exitCode = undefined;
    return Promise.all(roots.splice(0).map((root) => removeTempDirWithRetry(root)));
  });

  it("routes generate options to the assurance workflow and prints JSON", async () => {
    const writeOut = vi.fn();
    const runAssurance = vi.fn(async () =>
      ok({
        success: true as const,
        taskId: "T001",
        mode: "base_to_commit" as const,
        verdict: "passed" as const,
        caseHash: `sha256:${"a".repeat(64)}`,
        snapshotHash: `sha256:${"b".repeat(64)}`,
        actions: [],
        dryRun: true,
        nextCommand: "visp-kit review --task T001"
      })
    );
    const program = createCli({
      cwd: "/workspace",
      runAssurance,
      writeOut,
      writeErr: vi.fn()
    });
    await program.parseAsync([
      "node",
      "visp",
      "assurance",
      "generate",
      "project",
      "--task",
      "T001",
      "--feature",
      "001-example",
      "--target",
      "HEAD",
      "--dry-run",
      "--json"
    ]);
    expect(runAssurance).toHaveBeenCalledWith({
      targetPath: "project",
      cwd: "/workspace",
      feature: "001-example",
      taskId: "T001",
      targetRevision: "HEAD",
      dryRun: true
    });
    expect(JSON.parse(writeOut.mock.calls[0]![0])).toMatchObject({
      taskId: "T001",
      mode: "base_to_commit",
      verdict: "passed"
    });
  });

  it("routes review decision options without a force bypass", async () => {
    const writeOut = vi.fn();
    const runAssuranceDecision = vi.fn(async () =>
      ok({
        success: true as const,
        taskId: "T001",
        decision: "accept" as const,
        decisionHash: `sha256:${"c".repeat(64)}`,
        caseHash: `sha256:${"d".repeat(64)}`,
        snapshotHash: `sha256:${"e".repeat(64)}`,
        stateHash: `sha256:${"f".repeat(64)}`,
        historyPath: ".visp/history.json",
        pointerPath: ".visp/current.json",
        dryRun: true,
        nextCommand: "visp-kit gate pr"
      })
    );
    const program = createCli({
      cwd: "/workspace",
      runAssuranceDecision,
      writeOut,
      writeErr: vi.fn()
    });
    await program.parseAsync([
      "node",
      "visp",
      "assurance",
      "accept",
      "project",
      "--task",
      "T001",
      "--feature",
      "001-example",
      "--reviewer",
      "reviewer",
      "--reason",
      "All mandatory evidence was reviewed.",
      "--reviewed-hotspot",
      "HS001",
      "--reviewed-hotspot",
      "HS002",
      "--dry-run",
      "--json"
    ]);
    expect(runAssuranceDecision).toHaveBeenCalledWith({
      targetPath: "project",
      cwd: "/workspace",
      feature: "001-example",
      taskId: "T001",
      reviewerId: "reviewer",
      reason: "All mandatory evidence was reviewed.",
      reviewedHotspotIds: ["HS001", "HS002"],
      decision: "accept",
      dryRun: true
    });
    expect(JSON.parse(writeOut.mock.calls[0]![0])).toMatchObject({
      taskId: "T001",
      decision: "accept"
    });
    expect(
      program.commands.find((item) => item.name() === "assurance")?.helpInformation()
    ).not.toContain("--force");
  });

  it("generates honest missing-evidence artifacts from the phase 8 fixture", async () => {
    const targetPath = await mkdtemp(path.join(os.tmpdir(), "visp-assurance-command-"));
    roots.push(targetPath);
    await prepareAssuranceFixture(targetPath);
    expect((await action32(targetPath, "2026-07-25T00:30:00.000Z")).assuranceSummary).toMatchObject(
      {
        state: "unavailable",
        reviewDecision: { status: "missing", decisionHash: null }
      }
    );
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });
    await program.parseAsync([
      "node",
      "visp",
      "assurance",
      "generate",
      targetPath,
      "--task",
      "T001",
      "--json"
    ]);
    expect(errors).toEqual([]);
    expect(JSON.parse(output.join(""))).toMatchObject({
      taskId: "T001",
      mode: "base_to_workspace",
      verdict: "inconclusive"
    });
    expect(process.exitCode).toBeUndefined();
    const assuranceDir = path.join(
      targetPath,
      ".visp",
      "features",
      "001-add-note-pinning",
      "assurance",
      "T001"
    );
    const assuranceCase = JSON.parse(
      await readFile(path.join(assuranceDir, "assurance-case.json"), "utf8")
    ) as {
      bindings: Array<{ role: string; status: string; reason?: string }>;
      evidenceComparisons: Array<{
        baseline: { uncertainty: { reasons: string[] } };
        candidate: { uncertainty: { reasons: string[] } };
      }>;
    };
    expect(assuranceCase.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "baseline_evidence", status: "unavailable" }),
        expect.objectContaining({ role: "candidate_evidence", status: "unavailable" })
      ])
    );
    expect(assuranceCase.evidenceComparisons[0]?.baseline.uncertainty.reasons).toContain(
      "Baseline evidence artifact is missing."
    );
    expect(assuranceCase.evidenceComparisons[0]?.candidate.uncertainty.reasons).toContain(
      "Candidate evidence artifact is missing."
    );
    expect(await readFile(path.join(assuranceDir, "diff-snapshot.json"), "utf8")).toContain(
      '"snapshotSha256"'
    );
    expect(await readFile(path.join(assuranceDir, "assurance-case.md"), "utf8")).toContain(
      "## Bindings and code states"
    );
    const firstBytes = await Promise.all(
      ["assurance-case.json", "diff-snapshot.json", "assurance-case.md"].map((fileName) =>
        readFile(path.join(assuranceDir, fileName), "utf8")
      )
    );
    const firstSummary = JSON.parse(output.join("")) as {
      caseHash: string;
      snapshotHash: string;
    };
    output.length = 0;
    await program.parseAsync([
      "node",
      "visp",
      "assurance",
      "generate",
      targetPath,
      "--task",
      "T001",
      "--json"
    ]);
    const secondBytes = await Promise.all(
      ["assurance-case.json", "diff-snapshot.json", "assurance-case.md"].map((fileName) =>
        readFile(path.join(assuranceDir, fileName), "utf8")
      )
    );
    const secondSummary = JSON.parse(output.join("")) as {
      caseHash: string;
      snapshotHash: string;
    };
    expect(secondBytes).toEqual(firstBytes);
    expect(secondSummary.caseHash).toBe(firstSummary.caseHash);
    expect(secondSummary.snapshotHash).toBe(firstSummary.snapshotHash);
  }, 30_000);

  it("fails closed when the assurance case swaps during review snapshot evaluation", async () => {
    const targetPath = await mkdtemp(path.join(os.tmpdir(), "visp-assurance-snapshot-swap-"));
    roots.push(targetPath);
    await prepareAssuranceFixture(targetPath);
    expectOk(
      await runAssuranceWorkflow({
        targetPath,
        taskId: "T001",
        now: "2026-07-25T01:00:00.000Z"
      })
    );
    const state = expectOk(await loadProjectState({ targetPath, taskId: "T001" }));
    const casePath = path.join(
      targetPath,
      ".visp",
      "features",
      "001-add-note-pinning",
      "assurance",
      "T001",
      "assurance-case.json"
    );
    const originalRaw = await readFile(casePath, "utf8");
    const original = JSON.parse(originalRaw) as AssuranceCase;
    const { caseHash: _caseHash, ...replacementWithoutHash } = {
      ...original,
      nextAction: {
        ...original.nextAction,
        reason: "Concurrent replacement case content."
      }
    };
    const replacement = {
      ...replacementWithoutHash,
      caseHash: createAssuranceCaseHash(replacementWithoutHash)
    };
    const summary = await selectCanonicalAssuranceSummary({
      state,
      now: "2026-07-25T01:30:00.000Z",
      evaluateRequirement: async () => {
        await writeFile(casePath, `${JSON.stringify(replacement, null, 2)}\n`, "utf8");
        return ok({
          required: false,
          caseHash: original.caseHash,
          currentness: {
            status: "current",
            reason: "The original assurance case was accepted.",
            caseHash: original.caseHash,
            decisionHash: `sha256:${"a".repeat(64)}`
          }
        });
      }
    });

    expect(summary).toMatchObject({
      state: "unavailable",
      reviewDecision: {
        required: false,
        status: "invalid",
        decisionHash: null
      }
    });
  }, 30_000);

  it("fails closed when authoritative inputs change after the initial build", async () => {
    const targetPath = await mkdtemp(path.join(os.tmpdir(), "visp-assurance-drift-"));
    roots.push(targetPath);
    await prepareAssuranceFixture(targetPath);
    let writeTreeCalls = 0;
    let mutated = false;
    const commandRunner: CommandRunner = {
      run: async (command, args = [], options = {}) => {
        const result = await defaultCommandRunner.run(command, args, options);
        if (args.includes("write-tree")) writeTreeCalls += 1;
        if (
          !mutated &&
          writeTreeCalls >= 2 &&
          command === "git" &&
          args[0] === "rev-parse" &&
          args[1] === "--is-inside-work-tree"
        ) {
          mutated = true;
          await writeFile(
            path.join(targetPath, ".visp", "overrides.json"),
            `${JSON.stringify(
              {
                version: "1.0",
                overrides: [
                  {
                    id: "OVR999",
                    ruleId: "VSP999",
                    scope: "project",
                    reason: "Regression fixture input drift.",
                    status: "active",
                    createdAt: "2026-07-25T00:00:00.000Z",
                    createdBy: "test"
                  }
                ]
              },
              null,
              2
            )}\n`,
            "utf8"
          );
        }
        return result;
      }
    };

    const result = await runAssuranceWorkflow({
      targetPath,
      taskId: "T001",
      commandRunner,
      now: "2026-07-25T01:00:00.000Z"
    });

    expect(mutated).toBe(true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain(
      "Authoritative assurance inputs or workflow action changed"
    );
  }, 30_000);

  it("records append-only reject and accept decisions and validates currentness", async () => {
    const targetPath = await mkdtemp(path.join(os.tmpdir(), "visp-assurance-decision-"));
    roots.push(targetPath);
    await prepareAssuranceFixture(targetPath);
    const generated = await runAssuranceWorkflow({
      targetPath,
      taskId: "T001",
      now: "2026-07-25T01:00:00.000Z"
    });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const assuranceDir = path.join(
      targetPath,
      ".visp",
      "features",
      "001-add-note-pinning",
      "assurance",
      "T001"
    );
    const assuranceCasePath = path.join(assuranceDir, "assurance-case.json");
    const assuranceCaseRaw = await readFile(assuranceCasePath, "utf8");
    const assuranceCase = JSON.parse(assuranceCaseRaw) as AssuranceCase;
    const mandatoryHotspots = assuranceCase.hotspots
      .filter((hotspot) => hotspot.mandatory)
      .map((hotspot) => hotspot.id);
    const missingDecisionAction = await action32(targetPath, "2026-07-25T01:15:00.000Z");
    expect(missingDecisionAction.assuranceSummary).toMatchObject({
      state: "available",
      artifact: {
        contentHash: `sha256:${createHash("sha256").update(assuranceCaseRaw).digest("hex")}`
      },
      caseHash: assuranceCase.caseHash,
      verdict: assuranceCase.verdict,
      reviewDecision: { status: "missing", decisionHash: null }
    });
    if (missingDecisionAction.assuranceSummary.state === "available") {
      expect(
        missingDecisionAction.assuranceSummary.mandatoryHotspots.map((hotspot) => hotspot.id)
      ).toEqual([...mandatoryHotspots].sort());
    }
    const policyPath = path.join(targetPath, ".visp", "policy.json");
    const originalPolicy = await readFile(policyPath, "utf8");
    const requiredPolicy = JSON.parse(originalPolicy) as {
      rules: { requireCurrentAssuranceDecisionBeforePr?: boolean };
    };
    requiredPolicy.rules.requireCurrentAssuranceDecisionBeforePr = true;
    await writeFile(policyPath, `${JSON.stringify(requiredPolicy, null, 2)}\n`, "utf8");
    expect(
      expectOk(
        await evaluatePolicyGate({
          targetPath,
          stage: "pr",
          taskId: "T001",
          now: "2026-07-25T01:30:00.000Z"
        })
      ).failedRules
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "VSP024", message: expect.stringContaining("missing") })
      ])
    );
    await writeFile(policyPath, originalPolicy, "utf8");

    expect(
      (
        await runReviewDecisionWorkflow({
          targetPath,
          taskId: "T001",
          reviewerId: "reviewer",
          reason: "too short",
          decision: "reject"
        })
      ).ok
    ).toBe(false);
    expect(
      (
        await runReviewDecisionWorkflow({
          targetPath,
          taskId: "T001",
          reviewerId: "reviewer",
          reason: "Unknown hotspot must fail.",
          reviewedHotspotIds: ["HS-unknown"],
          decision: "reject"
        })
      ).ok
    ).toBe(false);
    if (mandatoryHotspots.length > 0) {
      expect(
        (
          await runReviewDecisionWorkflow({
            targetPath,
            taskId: "T001",
            reviewerId: "reviewer",
            reason: "Duplicate acknowledgements must fail.",
            reviewedHotspotIds: [mandatoryHotspots[0]!, mandatoryHotspots[0]!],
            decision: "reject"
          })
        ).ok
      ).toBe(false);
      expect(
        (
          await runReviewDecisionWorkflow({
            targetPath,
            taskId: "T001",
            reviewerId: "reviewer",
            reason: "Mandatory review is incomplete.",
            decision: "accept"
          })
        ).ok
      ).toBe(false);
    }

    const rejected = await runReviewDecisionWorkflow({
      targetPath,
      taskId: "T001",
      reviewerId: "reviewer",
      reason: "Evidence remains insufficient.",
      decision: "reject",
      now: "2026-07-25T02:00:00.000Z"
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(expectOk(await pathExists(path.join(targetPath, rejected.value.historyPath)))).toBe(
      true
    );
    expect(
      expectOk(
        await evaluateCurrentReviewDecision({
          targetPath,
          taskId: "T001",
          now: "2026-07-25T02:30:00.000Z"
        })
      )
    ).toMatchObject({ status: "rejected", decisionHash: rejected.value.decisionHash });
    expect((await action32(targetPath, "2026-07-25T02:30:00.000Z")).assuranceSummary).toMatchObject(
      {
        state: "available",
        reviewDecision: {
          status: "rejected",
          decisionHash: rejected.value.decisionHash
        }
      }
    );
    expect(
      expectOk(
        await evaluatePolicyGate({
          targetPath,
          stage: "pr",
          taskId: "T001",
          now: "2026-07-25T02:30:00.000Z"
        })
      ).failedRules
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "VSP024", message: expect.stringContaining("rejects") })
      ])
    );

    const accepted = await runReviewDecisionWorkflow({
      targetPath,
      taskId: "T001",
      reviewerId: "reviewer",
      reason: "Mandatory hotspots were reviewed.",
      reviewedHotspotIds: mandatoryHotspots,
      decision: "accept",
      now: "2026-07-25T03:00:00.000Z"
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.value.decisionHash).not.toBe(rejected.value.decisionHash);
    expect(expectOk(await pathExists(path.join(targetPath, rejected.value.historyPath)))).toBe(
      true
    );
    expect(
      expectOk(
        await evaluateCurrentReviewDecision({
          targetPath,
          taskId: "T001",
          now: "2026-07-25T03:30:00.000Z"
        })
      )
    ).toMatchObject({ status: "current", decisionHash: accepted.value.decisionHash });
    expect((await action32(targetPath, "2026-07-25T03:30:00.000Z")).assuranceSummary).toMatchObject(
      {
        state: "available",
        reviewDecision: {
          status: "current",
          decisionHash: accepted.value.decisionHash
        }
      }
    );
    expect(
      (
        await runReviewDecisionWorkflow({
          targetPath,
          taskId: "T001",
          reviewerId: "reviewer",
          reason: "Same-time successors must fail.",
          decision: "reject",
          now: "2026-07-25T03:00:00.000Z"
        })
      ).ok
    ).toBe(false);
    expect(
      expectOk(
        await evaluatePolicyGate({
          targetPath,
          stage: "pr",
          taskId: "T001",
          now: "2026-07-25T03:30:00.000Z"
        })
      ).failedRules.some((rule) => rule.ruleId === "VSP024")
    ).toBe(false);

    const sourcePath = path.join(targetPath, "src", "notes.ts");
    const sourceBeforeDrift = await readFile(sourcePath, "utf8");
    await writeFile(sourcePath, `${sourceBeforeDrift}\nexport const drifted = true;\n`, "utf8");
    const drifted = expectOk(
      await evaluateCurrentReviewDecision({
        targetPath,
        taskId: "T001",
        now: "2026-07-25T03:45:00.000Z"
      })
    );

    expect(drifted.status).toBe("stale");

    // Staleness was always detected; only the fact was reported. The delta says
    // what moved, so a returning reviewer does not have to re-read the whole
    // case to find out.
    expect(drifted.delta).toBeDefined();
    expect(drifted.delta?.decisionStale).toBe(true);
    expect(drifted.delta?.unchanged).toBe(false);
    expect(drifted.delta?.changes.some((change) => change.kind === "code")).toBe(true);
    expect((await action32(targetPath, "2026-07-25T03:45:00.000Z")).assuranceSummary).toMatchObject(
      {
        state: "available",
        reviewDecision: {
          status: "stale",
          decisionHash: accepted.value.decisionHash
        }
      }
    );
    expect(
      expectOk(
        await evaluatePolicyGate({
          targetPath,
          stage: "pr",
          taskId: "T001",
          now: "2026-07-25T03:45:00.000Z"
        })
      ).failedRules.some((rule) => rule.ruleId === "VSP024")
    ).toBe(true);
    await writeFile(sourcePath, sourceBeforeDrift, "utf8");

    const pointerPath = path.join(targetPath, accepted.value.pointerPath);
    const pointerBeforeDryRun = await readFile(pointerPath, "utf8");
    expect(
      (
        await runReviewDecisionWorkflow({
          targetPath,
          taskId: "T001",
          reviewerId: "reviewer",
          reason: "Dry run must not publish.",
          decision: "reject",
          dryRun: true,
          now: "2026-07-25T04:00:00.000Z"
        })
      ).ok
    ).toBe(true);
    expect(await readFile(pointerPath, "utf8")).toBe(pointerBeforeDryRun);

    const laterRejected = await runReviewDecisionWorkflow({
      targetPath,
      taskId: "T001",
      reviewerId: "reviewer",
      reason: "Later review rejects readiness.",
      decision: "reject",
      now: "2026-07-25T05:00:00.000Z"
    });
    expect(laterRejected.ok).toBe(true);
    if (!laterRejected.ok) return;
    await writeFile(pointerPath, pointerBeforeDryRun, "utf8");
    expect(
      expectOk(
        await evaluateCurrentReviewDecision({
          targetPath,
          taskId: "T001",
          now: "2026-07-25T05:30:00.000Z"
        })
      ).status
    ).toBe("invalid");
    expect((await action32(targetPath, "2026-07-25T05:30:00.000Z")).assuranceSummary).toMatchObject(
      {
        state: "available",
        reviewDecision: { status: "invalid", decisionHash: null }
      }
    );
    expect(
      expectOk(
        await evaluatePolicyGate({
          targetPath,
          stage: "pr",
          taskId: "T001",
          now: "2026-07-25T05:30:00.000Z"
        })
      ).failedRules
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "VSP024",
          recommendation: expect.stringContaining("assurance repair")
        })
      ])
    );
    expectOk(await runReviewDecisionRepair({ targetPath, taskId: "T001" }));
    expect(
      expectOk(
        await evaluateCurrentReviewDecision({
          targetPath,
          taskId: "T001",
          now: "2026-07-25T05:30:00.000Z"
        })
      )
    ).toMatchObject({ status: "rejected", decisionHash: laterRejected.value.decisionHash });

    const repairedPointer = await readFile(pointerPath, "utf8");
    const pointer = JSON.parse(pointerBeforeDryRun) as Record<string, unknown>;
    pointer.decisionHash = `sha256:${"0".repeat(64)}`;
    await writeFile(pointerPath, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
    expect(
      expectOk(
        await evaluateCurrentReviewDecision({
          targetPath,
          taskId: "T001",
          now: "2026-07-25T05:30:00.000Z"
        })
      ).status
    ).toBe("invalid");
    expectOk(await runReviewDecisionRepair({ targetPath, taskId: "T001" }));
    expect(await readFile(pointerPath, "utf8")).toBe(repairedPointer);

    await writeFile(sourcePath, `${sourceBeforeDrift}\nexport const stagedDrift = true;\n`, "utf8");
    expectOk(await runCommand("git", ["add", "src/notes.ts"], { cwd: targetPath }));
    expect(
      expectOk(
        await evaluateCurrentReviewDecision({
          targetPath,
          taskId: "T001",
          now: "2026-07-25T05:30:00.000Z"
        })
      ).status
    ).toBe("stale");
    await writeFile(sourcePath, sourceBeforeDrift, "utf8");
    expectOk(await runCommand("git", ["add", "src/notes.ts"], { cwd: targetPath }));
    expectOk(
      await runCommand(
        "git",
        [
          "-c",
          "user.name=Visp Test",
          "-c",
          "user.email=visp@example.invalid",
          "commit",
          "--allow-empty",
          "-m",
          "head drift"
        ],
        { cwd: targetPath }
      )
    );
    expect(
      expectOk(
        await evaluateCurrentReviewDecision({
          targetPath,
          taskId: "T001",
          now: "2026-07-25T05:30:00.000Z"
        })
      ).status
    ).toBe("stale");

    const acceptedHistory = JSON.parse(
      await readFile(path.join(targetPath, accepted.value.historyPath), "utf8")
    ) as ReviewDecision;
    const { decisionHash: _oldHash, ...acceptedWithoutHash } = acceptedHistory;
    const forkWithoutHash = {
      ...acceptedWithoutHash,
      decision: "reject" as const,
      reason: "A competing terminal must fail.",
      supersedesDecisionHash: accepted.value.decisionHash,
      decidedAt: "2026-07-25T05:15:00.000Z"
    };
    const forkHash = createReviewDecisionHash(forkWithoutHash);
    await writeFile(
      path.join(
        path.dirname(path.join(targetPath, accepted.value.historyPath)),
        `${forkHash.slice(7)}.json`
      ),
      `${JSON.stringify({ ...forkWithoutHash, decisionHash: forkHash }, null, 2)}\n`,
      "utf8"
    );
    const forkRepair = await runReviewDecisionRepair({ targetPath, taskId: "T001" });
    expect(forkRepair.ok).toBe(false);
    if (!forkRepair.ok) expect(forkRepair.error.message).toContain("fork");
  });

  it("keeps concurrent identical decisions bound to an existing immutable history", async () => {
    const targetPath = await mkdtemp(path.join(os.tmpdir(), "visp-assurance-concurrent-"));
    roots.push(targetPath);
    await prepareAssuranceFixture(targetPath);
    expect(
      (
        await runAssuranceWorkflow({
          targetPath,
          taskId: "T001",
          now: "2026-07-25T01:00:00.000Z"
        })
      ).ok
    ).toBe(true);

    const [firstRunner, secondRunner] = pairedCommandRunners();
    const shared = {
      targetPath,
      taskId: "T001",
      reviewerId: "reviewer",
      reason: "Concurrent identical review decision.",
      decision: "reject" as const,
      now: "2026-07-25T02:00:00.000Z"
    };
    const results = await Promise.all([
      runReviewDecisionWorkflow({ ...shared, commandRunner: firstRunner }),
      runReviewDecisionWorkflow({ ...shared, commandRunner: secondRunner })
    ]);
    const successful = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);

    expect(successful).toHaveLength(1);
    expect(failed).toHaveLength(1);
    const winner = successful[0];
    if (winner === undefined || !winner.ok) return;
    const historyPath = path.join(targetPath, winner.value.historyPath);
    const pointerPath = path.join(targetPath, winner.value.pointerPath);
    expect(expectOk(await pathExists(historyPath))).toBe(true);
    const crashResiduePath = path.join(
      path.dirname(historyPath),
      `.${path.basename(historyPath)}.${process.pid}.00000000-0000-4000-8000-000000000000.tmp`
    );
    await link(historyPath, crashResiduePath);
    expect(JSON.parse(await readFile(pointerPath, "utf8"))).toMatchObject({
      decisionHash: winner.value.decisionHash,
      decisionPath: winner.value.historyPath
    });
    expect(
      expectOk(
        await evaluateCurrentReviewDecision({
          targetPath,
          taskId: "T001",
          now: "2026-07-25T02:30:00.000Z"
        })
      )
    ).toMatchObject({ status: "rejected", decisionHash: winner.value.decisionHash });
  }, 30_000);

  it("reconstructs authoritative inputs and applies override expiry at evaluation time", async () => {
    const targetPath = await mkdtemp(path.join(os.tmpdir(), "visp-assurance-authority-"));
    roots.push(targetPath);
    await prepareAssuranceFixture(targetPath);
    const overridesPath = path.join(targetPath, ".visp", "overrides.json");
    await writeFile(
      overridesPath,
      `${JSON.stringify(
        {
          version: "1.0",
          overrides: [
            {
              id: "OVR999",
              ruleId: "VSP999",
              scope: "project",
              reason: "Time-bounded assurance review fixture.",
              status: "active",
              createdAt: "2026-07-25T00:00:00.000Z",
              createdBy: "test",
              expiresAt: "2026-07-25T02:30:00.000Z"
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    expect(
      (
        await runAssuranceWorkflow({
          targetPath,
          taskId: "T001",
          now: "2026-07-25T01:00:00.000Z"
        })
      ).ok
    ).toBe(true);
    const assuranceDir = path.join(
      targetPath,
      ".visp",
      "features",
      "001-add-note-pinning",
      "assurance",
      "T001"
    );
    const casePath = path.join(assuranceDir, "assurance-case.json");
    const originalCase = await readFile(casePath, "utf8");
    const parsedCase = JSON.parse(originalCase) as AssuranceCase;
    const { caseHash: _caseHash, ...caseWithoutHash } = {
      ...parsedCase,
      featureSlug: "wrong-feature"
    };
    const changedCase = { ...caseWithoutHash, caseHash: createAssuranceCaseHash(caseWithoutHash) };
    await writeFile(casePath, `${JSON.stringify(changedCase, null, 2)}\n`, "utf8");
    expect(
      (
        await runReviewDecisionWorkflow({
          targetPath,
          taskId: "T001",
          reviewerId: "reviewer",
          reason: "Identity mismatch must fail.",
          decision: "reject",
          now: "2026-07-25T02:00:00.000Z"
        })
      ).ok
    ).toBe(false);
    expect((await action32(targetPath, "2026-07-25T02:00:00.000Z")).assuranceSummary).toMatchObject(
      {
        state: "unavailable",
        reviewDecision: { status: "invalid", decisionHash: null }
      }
    );
    await writeFile(casePath, originalCase, "utf8");

    const taskGraphPath = path.join(
      targetPath,
      ".visp",
      "features",
      "001-add-note-pinning",
      "task-graph.json"
    );
    const taskGraph = await readFile(taskGraphPath, "utf8");
    await writeFile(taskGraphPath, `${taskGraph} `, "utf8");
    expect(
      (
        await runReviewDecisionWorkflow({
          targetPath,
          taskId: "T001",
          reviewerId: "reviewer",
          reason: "Changed binding must fail.",
          decision: "reject",
          now: "2026-07-25T02:00:00.000Z"
        })
      ).ok
    ).toBe(false);
    await writeFile(taskGraphPath, taskGraph, "utf8");
    const accepted = await runReviewDecisionWorkflow({
      targetPath,
      taskId: "T001",
      reviewerId: "reviewer",
      reason: "Inputs are current before expiry.",
      decision: "reject",
      now: "2026-07-25T02:00:00.000Z"
    });
    expect(accepted.ok).toBe(true);
    expect(
      expectOk(
        await evaluateCurrentReviewDecision({
          targetPath,
          taskId: "T001",
          now: "2026-07-25T03:00:00.000Z"
        })
      ).status
    ).toBe("stale");
  }, 30_000);
});
