import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok result.");
  return result.value;
}

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

async function initProject(rootPath: string): Promise<void> {
  const program = createCli({ writeOut: () => undefined, writeErr: () => undefined });
  await program.parseAsync([
    "node",
    "visp",
    "init",
    rootPath,
    "--agent",
    "none",
    "--preset",
    "typescript",
    "--budget",
    "lean",
    "--strictness",
    "strict"
  ]);
  process.exitCode = undefined;
}

describe("visp agent copilot command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-agent-copilot-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("installs Copilot instructions and passes doctor", async () => {
    await initProject(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "agent", "install", "copilot", tempDir]);

    expect(await exists(path.join(tempDir, ".github", "copilot-instructions.md"))).toBe(true);
    for (const name of ["feature", "task", "fix", "review", "pr"]) {
      expect(
        await exists(path.join(tempDir, ".github", "instructions", `visp-${name}.instructions.md`))
      ).toBe(true);
    }

    const instructions = await readFile(
      path.join(tempDir, ".github", "copilot-instructions.md"),
      "utf8"
    );
    expect(instructions).toContain("user prompt is raw intent");
    expect(instructions).toContain("visp gate");

    output.length = 0;
    await program.parseAsync(["node", "visp", "agent", "doctor", tempDir, "--target", "copilot"]);
    expect(output.join("")).toContain("Result: passed");
  });

  it("JSON install is parseable and dry-run writes nothing", async () => {
    await initProject(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "agent",
      "install",
      "copilot",
      tempDir,
      "--json",
      "--dry-run"
    ]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      target: string;
      createdFiles: string[];
    };
    expect(summary.success).toBe(true);
    expect(summary.target).toBe("copilot");
    expect(summary.createdFiles).toContain(".github/copilot-instructions.md");
    expect(await exists(path.join(tempDir, ".github"))).toBe(false);
  });

  it("skips existing Copilot files without force and refreshes with force", async () => {
    await initProject(tempDir);
    await mkdir(path.join(tempDir, ".github"), { recursive: true });
    const instructionsPath = path.join(tempDir, ".github", "copilot-instructions.md");
    await writeFile(instructionsPath, "# Existing Copilot Instructions\n", "utf8");
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "agent", "install", "copilot", tempDir]);
    expect(await readFile(instructionsPath, "utf8")).toBe("# Existing Copilot Instructions\n");

    await program.parseAsync([
      "node",
      "visp",
      "agent",
      "refresh",
      tempDir,
      "--target",
      "copilot",
      "--force"
    ]);
    expect(await readFile(instructionsPath, "utf8")).toContain("Visp Kit Copilot Instructions");
  });
});
