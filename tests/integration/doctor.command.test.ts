import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";
import { expectOk } from "./phase8-fixture.js";

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

describe("visp-kit doctor command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-doctor-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reports missing .visp cleanly", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "doctor", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(output.join("")).toContain("Visp doctor");
    expect(output.join("")).toContain("Project is not initialized");
  });

  it("returns JSON only", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync(["node", "visp", "doctor", tempDir, "--json"]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      result: string;
    };

    expect(errors.join("")).toBe("");
    expect(summary.success).toBe(false);
    expect(summary.result).toBe("failed");
  });

  it("applies safe fixes and writes a report on initialized projects", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await rm(path.join(tempDir, ".visp", "prompts"), { recursive: true, force: true });
    await rm(path.join(tempDir, ".visp", "policy.json"), { force: true });
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "doctor", tempDir, "--fix"]);

    expect(await exists(path.join(tempDir, ".visp", "prompts"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "policy.json"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "reports", "doctor-report.md"))).toBe(true);
  });

  it("dry-run writes nothing", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await rm(path.join(tempDir, ".visp", "reports"), { recursive: true, force: true });
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "doctor", tempDir, "--dry-run"]);

    expect(await exists(path.join(tempDir, ".visp", "reports", "doctor-report.md"))).toBe(false);
  });
});
