import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected result to be ok.");
  }

  return result.value;
}

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

describe("visp constitution command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-constitution-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("generates TypeScript lean constitution files with force", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "constitution",
      tempDir,
      "--preset",
      "typescript",
      "--budget",
      "lean",
      "--force"
    ]);

    expect(output.join("")).toContain("Visp constitution complete");
    expect(output.join("")).toContain("Validation: passed");
    expect(
      await exists(path.join(tempDir, ".visp", "memory", "constitution.md"))
    ).toBe(true);
    expect(
      await readFile(
        path.join(tempDir, ".visp", "memory", "constitution.md"),
        "utf8"
      )
    ).toContain("explicit types");
  });

  it("prints parseable JSON with no extra text", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "constitution",
      tempDir,
      "--force",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      validation: { passed: boolean };
      overwrittenFiles: string[];
    };

    expect(summary.success).toBe(true);
    expect(summary.validation.passed).toBe(true);
    expect(summary.overwrittenFiles).toContain(".visp/memory/constitution.md");
  });

  it("validates generated compact constitution", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "constitution",
      tempDir,
      "--validate"
    ]);

    expect(output.join("")).toContain("Validation: passed");
  });

  it("returns JSON validation failures for malformed compact rules", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await writeFile(
      path.join(tempDir, ".visp", "memory", "constitution.compact.md"),
      "C001: One.\nBAD: Two.\n",
      "utf8"
    );
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "constitution",
      tempDir,
      "--validate",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      validation: { passed: boolean; errors: string[] };
    };

    expect(summary.success).toBe(false);
    expect(summary.validation.passed).toBe(false);
    expect(summary.validation.errors[0]).toContain("Invalid rule ID");
    expect(process.exitCode).toBe(1);
  });

  it("dry-run does not write missing constitution files", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await rm(path.join(tempDir, ".visp", "memory", "constitution.md"));
    await rm(path.join(tempDir, ".visp", "memory", "constitution.compact.md"));
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "constitution",
      tempDir,
      "--dry-run"
    ]);

    expect(output.join("")).toContain("Created: 2 files");
    expect(
      await exists(path.join(tempDir, ".visp", "memory", "constitution.md"))
    ).toBe(false);
  });

  it("fails clearly when .visp is missing", async () => {
    const errors: string[] = [];
    const program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "constitution", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp init");
  });
});
