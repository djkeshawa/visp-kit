import { mkdtemp, readFile, rm } from "node:fs/promises";
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

  it("fails clearly when .visp is missing", async () => {
    const errors: string[] = [];
    const program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "policy", "init", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp-kit init");
  });
});
