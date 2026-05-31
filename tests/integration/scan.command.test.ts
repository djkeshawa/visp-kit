import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

describe("visp scan command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-scan-command-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("prints JSON scan summaries without extra text", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await writeFile(path.join(tempDir, "index.js"), "export const x = 1;");
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "scan", tempDir, "--json"]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      packageManager: string;
      writtenFiles: string[];
    };

    expect(summary.success).toBe(true);
    expect(summary.packageManager).toBe("unknown");
    expect(summary.writtenFiles).toContain(".visp/cache/file-index.json");
  });

  it("prints normal terminal summaries", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await writeFile(path.join(tempDir, "index.js"), "export const x = 1;");
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "scan", tempDir]);

    expect(output.join("")).toContain("Visp scan complete");
    expect(await exists(path.join(tempDir, ".visp", "cache", "scan-meta.json"))).toBe(
      true
    );
  });

  it("fails clearly when the project is not initialized", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync(["node", "visp", "scan", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp init");
    expect(output.join("")).toBe("");
    process.exitCode = undefined;
  });

  it("dry-run does not update scan cache", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await writeFile(path.join(tempDir, "index.js"), "export const x = 1;");
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "scan", tempDir, "--dry-run"]);

    expect(output.join("")).toContain("dry run");
    expect(await exists(path.join(tempDir, ".visp", "reports", "scan-report.md"))).toBe(
      true
    );
  });
});
