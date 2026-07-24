import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { runCommand } from "../../src/core/command-runner.js";
import { pathExists } from "../../src/core/file-system.js";
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
});
