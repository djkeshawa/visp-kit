import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { policyArtifactPath } from "../../src/artifacts/artifact-paths.js";
import { pathExists } from "../../src/core/file-system.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok result.");
  return result.value;
}

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

/** The six rules added after the policy artifact shipped, in declaration order. */
const assuranceRuleKeys = [
  "blockOnUnresolvedDrift",
  "preventAssuranceProfileLowering",
  "requireOracleLockBeforeImplementation",
  "requireCurrentAssuranceDecisionBeforePr",
  "requireSignedAssuranceDecision",
  "requireUnderstandingBeforeBehaviouralImplementation"
];

describe("visp-kit policy command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-policy-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("initializes, shows, validates, and updates policy", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await rm(policyArtifactPath(tempDir), { force: true });
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "policy",
      "init",
      tempDir,
      "--strictness",
      "strict",
      "--json"
    ]);
    const initSummary = JSON.parse(output.join("")) as {
      success: boolean;
      policy: { strictnessMode: string };
    };
    expect(initSummary.success).toBe(true);
    expect(initSummary.policy.strictnessMode).toBe("strict");
    expect(await exists(policyArtifactPath(tempDir))).toBe(true);

    output.length = 0;
    await program.parseAsync(["node", "visp", "policy", "show", tempDir, "--json"]);
    const showSummary = JSON.parse(output.join("")) as {
      source: string;
      policy: { strictnessMode: string };
    };
    expect(showSummary.source).toBe("file");
    expect(showSummary.policy.strictnessMode).toBe("strict");

    output.length = 0;
    await program.parseAsync(["node", "visp", "policy", "validate", tempDir, "--json"]);
    const validateSummary = JSON.parse(output.join("")) as {
      success: boolean;
      validation: { passed: boolean };
    };
    expect(validateSummary.success).toBe(true);
    expect(validateSummary.validation.passed).toBe(true);

    output.length = 0;
    await program.parseAsync([
      "node",
      "visp",
      "policy",
      "set-strictness",
      "locked",
      tempDir,
      "--json"
    ]);
    const updateSummary = JSON.parse(output.join("")) as {
      policy: { strictnessMode: string };
    };
    expect(updateSummary.policy.strictnessMode).toBe("locked");
    expect(JSON.parse(await readFile(policyArtifactPath(tempDir), "utf8"))).toMatchObject({
      strictnessMode: "locked"
    });
  });

  it("refuses overwrite without force and supports dry-run", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync(["node", "visp", "policy", "init", tempDir]);
    await program.parseAsync(["node", "visp", "policy", "init", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("--force");

    process.exitCode = undefined;
    output.length = 0;
    errors.length = 0;
    await program.parseAsync([
      "node",
      "visp",
      "policy",
      "set-strictness",
      "relaxed",
      tempDir,
      "--dry-run",
      "--json"
    ]);
    const dryRun = JSON.parse(output.join("")) as {
      dryRun: boolean;
      policy: { strictnessMode: string };
    };
    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.policy.strictnessMode).toBe("relaxed");
    expect(JSON.parse(await readFile(policyArtifactPath(tempDir), "utf8"))).toMatchObject({
      strictnessMode: "standard"
    });
  });

  it("migrates a legacy policy file that omits rule keys added after it was written", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "policy",
      "init",
      tempDir,
      "--strictness",
      "locked",
      "--force",
      "--json"
    ]);

    // Rewind the file to what an older `policy init` wrote: no VSP021-VSP026.
    const written = JSON.parse(await readFile(policyArtifactPath(tempDir), "utf8")) as {
      rules: Record<string, boolean>;
    };
    const legacyRules: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(written.rules)) {
      if (assuranceRuleKeys.includes(key)) continue;
      legacyRules[key] = value;
    }
    await writeFile(
      policyArtifactPath(tempDir),
      `${JSON.stringify({ ...written, rules: legacyRules }, null, 2)}\n`,
      "utf8"
    );

    output.length = 0;
    await program.parseAsync(["node", "visp", "policy", "migrate", tempDir, "--dry-run", "--json"]);
    const preview = JSON.parse(output.join("")) as {
      dryRun: boolean;
      filledRuleKeys: string[];
    };
    expect(preview.dryRun).toBe(true);
    expect(preview.filledRuleKeys).toStrictEqual(assuranceRuleKeys);
    // A dry run must not touch the file.
    expect(
      (JSON.parse(await readFile(policyArtifactPath(tempDir), "utf8")) as { rules: object }).rules
    ).not.toHaveProperty("requireOracleLockBeforeImplementation");

    // A fresh program: commander keeps parsed option values on the command
    // instance, so reusing `program` would carry `--dry-run` into this call.
    output.length = 0;
    const migrateProgram = createCli({ writeOut: (value) => output.push(value) });
    await migrateProgram.parseAsync(["node", "visp", "policy", "migrate", tempDir, "--json"]);
    const migrated = JSON.parse(output.join("")) as {
      success: boolean;
      updated: boolean;
      filledRuleKeys: string[];
    };
    expect(migrated.success).toBe(true);
    expect(migrated.updated).toBe(true);
    expect(migrated.filledRuleKeys).toStrictEqual(assuranceRuleKeys);
    expect(JSON.parse(await readFile(policyArtifactPath(tempDir), "utf8"))).toMatchObject({
      strictnessMode: "locked",
      rules: { requireOracleLockBeforeImplementation: true }
    });

    // Idempotent: a second run has nothing to fill.
    output.length = 0;
    const secondProgram = createCli({ writeOut: (value) => output.push(value) });
    await secondProgram.parseAsync(["node", "visp", "policy", "migrate", tempDir, "--json"]);
    const second = JSON.parse(output.join("")) as {
      updated: boolean;
      filledRuleKeys: string[];
    };
    expect(second.updated).toBe(false);
    expect(second.filledRuleKeys).toStrictEqual([]);
    expect(process.exitCode).toBeUndefined();
  });

  it("leaves an explicit opt-out alone when migrating", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "policy",
      "init",
      tempDir,
      "--strictness",
      "locked",
      "--force",
      "--json"
    ]);
    const written = JSON.parse(await readFile(policyArtifactPath(tempDir), "utf8")) as {
      rules: Record<string, boolean>;
    };
    await writeFile(
      policyArtifactPath(tempDir),
      `${JSON.stringify(
        {
          ...written,
          rules: { ...written.rules, requireOracleLockBeforeImplementation: false }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    output.length = 0;
    await program.parseAsync(["node", "visp", "policy", "migrate", tempDir, "--json"]);

    expect(JSON.parse(await readFile(policyArtifactPath(tempDir), "utf8"))).toMatchObject({
      rules: { requireOracleLockBeforeImplementation: false }
    });
  });

  it("fails clearly when .visp is missing", async () => {
    const errors: string[] = [];
    const program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "policy", "init", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp-kit init");
  });
});
