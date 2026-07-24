import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { runCommand } from "../../src/core/command-runner.js";
import { pathExists } from "../../src/core/file-system.js";
import { runBaselineVerificationWorkflow } from "../../src/workflows/baseline-verification.workflow.js";
import { createPhase8Fixture, expectOk } from "./phase8-fixture.js";

async function runGit(targetPath: string, args: readonly string[]): Promise<void> {
  expectOk(await runCommand("git", args, { cwd: targetPath }));
}

async function prepareContext(targetPath: string): Promise<void> {
  const program = createCli({ writeOut: () => undefined });
  await program.parseAsync(["node", "visp", "context", "T001", targetPath, "--force"]);
  expect(process.exitCode).toBeUndefined();
}

describe("visp oracle command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-oracle-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("generates, dry-runs, and validates a base-commit-bound oracle plan", async () => {
    await createPhase8Fixture(tempDir);
    await runGit(tempDir, ["init"]);
    await runGit(tempDir, ["add", "."]);
    await runGit(tempDir, [
      "-c",
      "user.name=Visp Test",
      "-c",
      "user.email=visp@example.invalid",
      "commit",
      "-m",
      "fixture"
    ]);
    await prepareContext(tempDir);

    const output: string[] = [];
    let program = createCli({ writeOut: (value) => output.push(value) });
    const oraclePath = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "assurance",
      "T001",
      "oracle-plan.json"
    );

    await program.parseAsync([
      "node",
      "visp",
      "oracle",
      "plan",
      tempDir,
      "--task",
      "T001",
      "--dry-run",
      "--json"
    ]);
    expect(expectOk(await pathExists(oraclePath))).toBe(false);
    expect(JSON.parse(output.join("")).dryRun).toBe(true);

    output.length = 0;
    program = createCli({ writeOut: (value) => output.push(value) });
    await program.parseAsync([
      "node",
      "visp",
      "oracle",
      "plan",
      tempDir,
      "--task",
      "T001",
      "--json"
    ]);

    const plan = JSON.parse(await readFile(oraclePath, "utf8")) as {
      assuranceProfile: string;
      baseCommit: { status: string; commit?: string };
      oracles: Array<{ baseline: { expected: string }; candidate: { expected: string } }>;
      testStrengthEvidence: Array<{ path: string; independence: string }>;
    };
    expect(plan.assuranceProfile).toBe("behavioral");
    expect(plan.baseCommit.status).toBe("captured");
    expect(plan.baseCommit.commit).toMatch(/^[a-f0-9]{40}$/u);
    expect(plan.oracles[0]).toMatchObject({
      baseline: { expected: "recorded" },
      candidate: { expected: "passed" }
    });
    expect(plan.testStrengthEvidence).toContainEqual(
      expect.objectContaining({
        path: "tests/notes.test.ts",
        independence: "pre_existing"
      })
    );

    output.length = 0;
    program = createCli({ writeOut: (value) => output.push(value) });
    await program.parseAsync([
      "node",
      "visp",
      "oracle",
      "validate",
      tempDir,
      "--task",
      "T001",
      "--json"
    ]);
    expect(JSON.parse(output.join("")).action).toBe("validated");
    expect(process.exitCode).toBeUndefined();

    await runGit(tempDir, [
      "-c",
      "user.name=Visp Test",
      "-c",
      "user.email=visp@example.invalid",
      "commit",
      "--allow-empty",
      "-m",
      "advance base"
    ]);
    process.exitCode = undefined;
    const errors: string[] = [];
    program = createCli({
      writeOut: () => undefined,
      writeErr: (value) => errors.push(value)
    });
    await program.parseAsync(["node", "visp", "oracle", "validate", tempDir, "--task", "T001"]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("base commit is stale");
  });

  it("records explicit pre-approval and rejects changed test evidence", async () => {
    await createPhase8Fixture(tempDir);
    await prepareContext(tempDir);
    const errors: string[] = [];
    let program = createCli({
      writeOut: () => undefined,
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync([
      "node",
      "visp",
      "oracle",
      "plan",
      tempDir,
      "--task",
      "T001",
      "--pre-approved-test",
      "tests/notes.test.ts"
    ]);
    const oraclePath = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "assurance",
      "T001",
      "oracle-plan.json"
    );
    const plan = JSON.parse(await readFile(oraclePath, "utf8")) as {
      testStrengthEvidence: Array<{ independence: string }>;
    };
    expect(plan.testStrengthEvidence[0]?.independence).toBe("pre_approved");

    await writeFile(path.join(tempDir, "tests", "notes.test.ts"), "// changed\n", "utf8");
    program = createCli({
      writeOut: () => undefined,
      writeErr: (value) => errors.push(value)
    });
    await program.parseAsync(["node", "visp", "oracle", "validate", tempDir, "--task", "T001"]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("Test-strength evidence changed");
  });

  it("fails closed when authoritative criteria change after generation", async () => {
    await createPhase8Fixture(tempDir);
    await prepareContext(tempDir);
    const errors: string[] = [];
    let program = createCli({
      writeOut: () => undefined,
      writeErr: (value) => errors.push(value)
    });
    await program.parseAsync(["node", "visp", "oracle", "plan", tempDir, "--task", "T001"]);

    const specPath = path.join(tempDir, ".visp", "features", "001-add-note-pinning", "spec.json");
    const spec = JSON.parse(await readFile(specPath, "utf8")) as {
      acceptanceCriteria: Array<{ description: string }>;
      requirements: Array<{ acceptanceCriteria: Array<{ description: string }> }>;
    };
    spec.acceptanceCriteria[0]!.description = "Changed behavior.";
    spec.requirements[0]!.acceptanceCriteria[0]!.description = "Changed behavior.";
    await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

    process.exitCode = undefined;
    program = createCli({
      writeOut: () => undefined,
      writeErr: (value) => errors.push(value)
    });
    await program.parseAsync(["node", "visp", "oracle", "validate", tempDir, "--task", "T001"]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("authoritative REQ001 requirement");
  });

  it("rejects provider requirements substituted in the stored plan", async () => {
    await createPhase8Fixture(tempDir);
    await prepareContext(tempDir);
    const oraclePath = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "assurance",
      "T001",
      "oracle-plan.json"
    );
    let program = createCli({ writeOut: () => undefined });
    await program.parseAsync(["node", "visp", "oracle", "plan", tempDir, "--task", "T001"]);

    const plan = JSON.parse(await readFile(oraclePath, "utf8")) as {
      requiredProviders: Array<{ id: string; version: string }>;
    };
    plan.requiredProviders = [{ id: "substituted-provider", version: "9.9.9" }];
    await writeFile(oraclePath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

    process.exitCode = undefined;
    const errors: string[] = [];
    program = createCli({
      writeOut: () => undefined,
      writeErr: (value) => errors.push(value)
    });
    await program.parseAsync(["node", "visp", "oracle", "validate", tempDir, "--task", "T001"]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("stale or has been modified");
  });

  it("blocks implementation until a current oracle lock is bound to the marker", async () => {
    await createPhase8Fixture(tempDir);
    await prepareContext(tempDir);
    let program = createCli({ writeOut: () => undefined });
    await program.parseAsync(["node", "visp", "oracle", "plan", tempDir, "--task", "T001"]);

    const output: string[] = [];
    program = createCli({ writeOut: (value) => output.push(value) });
    await program.parseAsync([
      "node",
      "visp",
      "gate",
      "implement",
      tempDir,
      "--task",
      "T001",
      "--json"
    ]);
    const blocked = JSON.parse(output.join("")) as {
      allowed: boolean;
      failedRules: Array<{ ruleId: string }>;
    };
    expect(blocked.allowed).toBe(false);
    expect(blocked.failedRules.map((rule) => rule.ruleId)).toContain("VSP023");

    process.exitCode = undefined;
    program = createCli({ writeOut: () => undefined });
    await program.parseAsync(["node", "visp", "oracle", "lock", tempDir, "--task", "T001"]);
    await program.parseAsync(["node", "visp", "verify", tempDir, "--baseline", "--task", "T001"]);
    await program.parseAsync(["node", "visp", "gate", "implement", tempDir, "--task", "T001"]);
    expect(process.exitCode).toBeUndefined();

    const marker = JSON.parse(
      await readFile(path.join(tempDir, ".visp", "state", "implement-allowed", "T001.json"), "utf8")
    ) as {
      oracleAuthorization?: {
        lockPath: string;
        lockHash: string;
        lockFileSha256: string;
      };
    };
    expect(marker.oracleAuthorization).toMatchObject({
      lockPath: expect.stringContaining("oracle-lock.json"),
      lockHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      lockFileSha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u)
    });
  });

  it("requires approval for critical tasks and fails closed after revocation", async () => {
    await createPhase8Fixture(tempDir);
    const taskGraphPath = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "task-graph.json"
    );
    const taskGraph = JSON.parse(await readFile(taskGraphPath, "utf8")) as {
      tasks: Array<{ taskClass?: string; riskLevel: string }>;
    };
    taskGraph.tasks[0]!.taskClass = "security";
    taskGraph.tasks[0]!.riskLevel = "high";
    await writeFile(taskGraphPath, `${JSON.stringify(taskGraph, null, 2)}\n`, "utf8");
    await prepareContext(tempDir);

    let errors: string[] = [];
    let program = createCli({
      writeOut: () => undefined,
      writeErr: (value) => errors.push(value)
    });
    await program.parseAsync(["node", "visp", "oracle", "plan", tempDir, "--task", "T001"]);
    await program.parseAsync(["node", "visp", "oracle", "lock", tempDir, "--task", "T001"]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("approval");

    process.exitCode = undefined;
    errors = [];
    program = createCli({
      writeOut: () => undefined,
      writeErr: (value) => errors.push(value)
    });
    await program.parseAsync([
      "node",
      "visp",
      "oracle",
      "approve",
      tempDir,
      "--task",
      "T001",
      "--reviewer",
      "human-reviewer",
      "--reason",
      "Critical authorization behavior was reviewed."
    ]);
    await program.parseAsync(["node", "visp", "oracle", "lock", tempDir, "--task", "T001"]);
    await program.parseAsync(["node", "visp", "verify", tempDir, "--baseline", "--task", "T001"]);
    expect(process.exitCode).toBeUndefined();

    await program.parseAsync(["node", "visp", "gate", "implement", tempDir, "--task", "T001"]);
    const lockPath = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "assurance",
      "T001",
      "oracle-lock.json"
    );
    const markerPath = path.join(tempDir, ".visp", "state", "implement-allowed", "T001.json");
    expect(expectOk(await pathExists(lockPath))).toBe(true);
    expect(expectOk(await pathExists(markerPath))).toBe(true);

    await program.parseAsync([
      "node",
      "visp",
      "oracle",
      "revoke",
      tempDir,
      "--task",
      "T001",
      "--reason",
      "The reviewed authorization is no longer valid."
    ]);
    expect(expectOk(await pathExists(lockPath))).toBe(false);
    expect(expectOk(await pathExists(markerPath))).toBe(false);
    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "oracle", "lock", tempDir, "--task", "T001"]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("revoked");
  });

  it("reuses a complete baseline cache and invalidates it after configuration changes", async () => {
    await createPhase8Fixture(tempDir);
    await prepareContext(tempDir);
    let program = createCli({ writeOut: () => undefined });
    await program.parseAsync(["node", "visp", "oracle", "plan", tempDir, "--task", "T001"]);
    await program.parseAsync(["node", "visp", "oracle", "lock", tempDir, "--task", "T001"]);

    const gateOutput: string[] = [];
    program = createCli({ writeOut: (value) => gateOutput.push(value) });
    await program.parseAsync([
      "node",
      "visp",
      "gate",
      "implement",
      tempDir,
      "--task",
      "T001",
      "--json"
    ]);
    expect(
      (JSON.parse(gateOutput.join("")) as { failedRules: Array<{ ruleId: string }> }).failedRules
    ).toContainEqual(expect.objectContaining({ ruleId: "VSP023" }));

    process.exitCode = undefined;
    const output: string[] = [];
    program = createCli({ writeOut: (value) => output.push(value) });
    await program.parseAsync([
      "node",
      "visp",
      "verify",
      tempDir,
      "--baseline",
      "--task",
      "T001",
      "--json"
    ]);
    const first = JSON.parse(output.join("")) as { action: string; cacheKey: string };
    expect(first.action).toBe("executed");

    output.length = 0;
    await program.parseAsync([
      "node",
      "visp",
      "verify",
      tempDir,
      "--baseline",
      "--task",
      "T001",
      "--json"
    ]);
    const cached = JSON.parse(output.join("")) as { action: string; cacheKey: string };
    expect(cached).toMatchObject({ action: "cached", cacheKey: first.cacheKey });

    const packagePath = path.join(tempDir, "package.json");
    const manifest = JSON.parse(await readFile(packagePath, "utf8")) as Record<string, unknown>;
    manifest.baselineCacheInput = "changed";
    await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    output.length = 0;
    await program.parseAsync([
      "node",
      "visp",
      "verify",
      tempDir,
      "--baseline",
      "--task",
      "T001",
      "--json"
    ]);
    const refreshed = JSON.parse(output.join("")) as { action: string; cacheKey: string };
    expect(refreshed.action).toBe("executed");
    expect(refreshed.cacheKey).not.toBe(first.cacheKey);
  });

  it("fails closed before execution for an unavailable provider and remains recoverable", async () => {
    await createPhase8Fixture(tempDir);
    await prepareContext(tempDir);
    const program = createCli({ writeOut: () => undefined });
    await program.parseAsync(["node", "visp", "oracle", "plan", tempDir, "--task", "T001"]);
    await program.parseAsync(["node", "visp", "oracle", "lock", tempDir, "--task", "T001"]);

    const unsupported = await runBaselineVerificationWorkflow({
      targetPath: tempDir,
      taskId: "T001",
      providerRegistry: new Map()
    });
    expect(unsupported.ok).toBe(true);
    if (!unsupported.ok) return;
    expect(unsupported.value).toMatchObject({
      success: false,
      outcome: "inconclusive",
      commands: []
    });
    expect(unsupported.value.providers).toHaveLength(2);
    expect(unsupported.value.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "inconclusive",
          failureCode: "unsupported_provider"
        })
      ])
    );

    const lockPath = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "assurance",
      "T001",
      "oracle-lock.json"
    );
    expect(JSON.parse(await readFile(lockPath, "utf8"))).not.toHaveProperty("baselineEvidence");

    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "verify", tempDir, "--baseline", "--task", "T001"]);
    expect(process.exitCode).toBeUndefined();
  });

  it("writes candidate evidence and rejects comparison against a stale baseline", async () => {
    await createPhase8Fixture(tempDir);
    const packagePath = path.join(tempDir, "package.json");
    const packageManifest = JSON.parse(await readFile(packagePath, "utf8")) as {
      scripts: Record<string, string>;
    };
    packageManifest.scripts.test = "node -e \"console.log('plan tests passed')\"";
    packageManifest.scripts.typecheck = "node -e \"console.log('types passed')\"";
    packageManifest.scripts.build = "node -e \"console.log('build passed')\"";
    await writeFile(packagePath, `${JSON.stringify(packageManifest, null, 2)}\n`, "utf8");
    const taskGraphPath = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "task-graph.json"
    );
    const taskGraph = JSON.parse(await readFile(taskGraphPath, "utf8")) as {
      tasks: Array<{ validationCommands: string[] }>;
    };
    taskGraph.tasks[0]!.validationCommands = [
      `node -e "process.exit(require('fs').existsSync('candidate.ok') ? 0 : 1)"`
    ];
    await writeFile(taskGraphPath, `${JSON.stringify(taskGraph, null, 2)}\n`, "utf8");
    await prepareContext(tempDir);

    let program = createCli({ writeOut: () => undefined });
    await program.parseAsync([
      "node",
      "visp",
      "oracle",
      "plan",
      tempDir,
      "--task",
      "T001",
      "--pre-approved-test",
      "tests/notes.test.ts"
    ]);
    await program.parseAsync(["node", "visp", "oracle", "lock", tempDir, "--task", "T001"]);
    await program.parseAsync(["node", "visp", "verify", tempDir, "--baseline", "--task", "T001"]);
    expect(process.exitCode).toBeUndefined();

    const candidatePath = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "assurance",
      "T001",
      "candidate-evidence.json"
    );
    const baselineActionOutput: string[] = [];
    program = createCli({ writeOut: (value) => baselineActionOutput.push(value) });
    await program.parseAsync([
      "node",
      "visp",
      "next",
      tempDir,
      "--format",
      "json",
      "--protocol",
      "3.1"
    ]);
    expect(JSON.parse(baselineActionOutput.join("")).evidence).toMatchObject({
      state: "available",
      value: {
        source: "baseline",
        outcome: "passed",
        freshness: "fresh"
      }
    });
    const failedOutput: string[] = [];
    program = createCli({ writeOut: (value) => failedOutput.push(value) });
    await program.parseAsync([
      "node",
      "visp",
      "verify",
      tempDir,
      "--candidate",
      "--task",
      "T001",
      "--json"
    ]);
    expect(JSON.parse(failedOutput.join(""))).toMatchObject({
      success: false,
      outcome: "failed",
      action: "executed"
    });
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    const failedActionOutput: string[] = [];
    program = createCli({ writeOut: (value) => failedActionOutput.push(value) });
    await program.parseAsync([
      "node",
      "visp",
      "next",
      tempDir,
      "--format",
      "json",
      "--protocol",
      "3.1"
    ]);
    const failedAction = JSON.parse(failedActionOutput.join(""));
    expect(failedAction.evidence).toMatchObject({
      state: "available",
      value: {
        source: "candidate",
        outcome: "failed",
        freshness: "fresh",
        testStrength: { state: "available", value: { status: "passed" } }
      }
    });
    expect(
      failedAction.evidence.value.providers.flatMap(
        (provider: { results: Array<{ outcome: { status: string } }> }) =>
          provider.results.map((result) => result.outcome.status)
      )
    ).toContain("failed");

    await writeFile(path.join(tempDir, "candidate.ok"), "ready\n", "utf8");
    const passedOutput: string[] = [];
    program = createCli({ writeOut: (value) => passedOutput.push(value) });
    await program.parseAsync([
      "node",
      "visp",
      "verify",
      tempDir,
      "--candidate",
      "--task",
      "T001",
      "--json"
    ]);
    const passedSummary = JSON.parse(passedOutput.join(""));
    expect(passedSummary, JSON.stringify(passedSummary, null, 2)).toMatchObject({
      success: true,
      outcome: "passed",
      action: "executed"
    });
    const passedEvidence = await readFile(candidatePath, "utf8");

    const passedActionOutput: string[] = [];
    program = createCli({ writeOut: (value) => passedActionOutput.push(value) });
    await program.parseAsync([
      "node",
      "visp",
      "next",
      tempDir,
      "--format",
      "json",
      "--protocol",
      "3.1"
    ]);
    expect(JSON.parse(passedActionOutput.join("")).evidence).toMatchObject({
      state: "available",
      value: {
        source: "candidate",
        outcome: "passed",
        freshness: "fresh"
      }
    });

    const tampered = JSON.parse(passedEvidence) as { evidenceHash: string };
    tampered.evidenceHash = `sha256:${"0".repeat(64)}`;
    await writeFile(candidatePath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
    const invalidActionOutput: string[] = [];
    program = createCli({ writeOut: (value) => invalidActionOutput.push(value) });
    await program.parseAsync([
      "node",
      "visp",
      "next",
      tempDir,
      "--format",
      "json",
      "--protocol",
      "3.1"
    ]);
    const invalidAction = JSON.parse(invalidActionOutput.join(""));
    expect(invalidAction).toMatchObject({
      evidence: { state: "unavailable", reasonCode: "source_invalid" },
      verdict: "inconclusive"
    });
    expect(invalidAction.findings).toContainEqual(
      expect.objectContaining({
        code: "VISP.EVIDENCE.CURRENT_INVALID",
        effect: "uncertain"
      })
    );
    await writeFile(candidatePath, passedEvidence, "utf8");

    const implementationPath = path.join(tempDir, "src", "notes.ts");
    const implementation = await readFile(implementationPath, "utf8");
    await writeFile(implementationPath, `${implementation}\n// changed after candidate\n`, "utf8");
    const staleWorkspaceOutput: string[] = [];
    program = createCli({ writeOut: (value) => staleWorkspaceOutput.push(value) });
    await program.parseAsync([
      "node",
      "visp",
      "next",
      tempDir,
      "--format",
      "json",
      "--protocol",
      "3.1"
    ]);
    const staleWorkspaceAction = JSON.parse(staleWorkspaceOutput.join(""));
    expect(staleWorkspaceAction).toMatchObject({
      evidence: { state: "unavailable", reasonCode: "source_invalid" },
      verdict: "inconclusive"
    });
    expect(staleWorkspaceAction.findings).toContainEqual(
      expect.objectContaining({
        code: "VISP.EVIDENCE.CURRENT_INVALID",
        message: expect.stringContaining("stale for the current implementation workspace")
      })
    );
    await writeFile(implementationPath, implementation, "utf8");

    const manifest = JSON.parse(await readFile(packagePath, "utf8")) as Record<string, unknown>;
    manifest.materialConfigurationChange = true;
    await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    process.exitCode = undefined;
    const errors: string[] = [];
    program = createCli({
      writeOut: () => undefined,
      writeErr: (value) => errors.push(value)
    });
    await program.parseAsync(["node", "visp", "verify", tempDir, "--candidate", "--task", "T001"]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("Baseline cache inputs changed");
    expect(await readFile(candidatePath, "utf8")).toBe(passedEvidence);
  });
});
