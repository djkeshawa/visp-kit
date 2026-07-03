import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { runCommand } from "../../src/core/command-runner.js";
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

describe("visp feature command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-feature-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates a feature intent workspace", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "feature", "Add note pinning", tempDir]);

    expect(output.join("")).toContain("Visp feature created");
    expect(
      await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning", "intent.md"))
    ).toBe(true);
    expect(
      await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning", "intent.json"))
    ).toBe(true);
    expect(await readFile(path.join(tempDir, ".visp", "status.json"), "utf8")).toContain(
      "feature_intent_ready"
    );
  });

  it("prints parseable JSON with no extra text", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "feature",
      "Add note pinning",
      tempDir,
      "--json",
      "--budget",
      "strict",
      "--risk",
      "high"
    ]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      feature: {
        id: string;
        slug: string;
        budgetMode: string;
        riskLevel: string;
      };
      createdFiles: string[];
    };

    expect(summary.success).toBe(true);
    expect(summary.feature).toMatchObject({
      id: "001",
      slug: "add-note-pinning",
      budgetMode: "strict",
      riskLevel: "high"
    });
    expect(summary.createdFiles).toContain(".visp/features/001-add-note-pinning/intent.json");
  });

  it("uses current working directory when no path is provided", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const originalCwd = process.cwd();
    const output: string[] = [];

    process.chdir(tempDir);

    try {
      const program = createCli({ writeOut: (value) => output.push(value) });
      await program.parseAsync(["node", "visp", "feature", "Add note pinning"]);
    } finally {
      process.chdir(originalCwd);
    }

    expect(output.join("")).toContain("001-add-note-pinning");
    expect(
      await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning", "intent.md"))
    ).toBe(true);
  });

  it("creates multiple feature folders in order", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "feature", "Add note pinning", tempDir]);
    await program.parseAsync(["node", "visp", "feature", "Export notes as PDF", tempDir]);

    expect(await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning"))).toBe(
      true
    );
    expect(await exists(path.join(tempDir, ".visp", "features", "002-export-notes-as-pdf"))).toBe(
      true
    );
  });

  it("fails clearly when .visp is missing", async () => {
    const errors: string[] = [];
    const program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "feature", "Add note pinning", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp init");
  });

  it("dry-run writes nothing", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "feature", "Dry run feature", tempDir, "--dry-run"]);

    expect(output.join("")).toContain("dry run");
    expect(await exists(path.join(tempDir, ".visp", "features", "001-dry-run-feature"))).toBe(
      false
    );
  });

  it("does not create a branch when --no-branch is provided", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "feature",
      "Add note pinning",
      tempDir,
      "--no-branch"
    ]);

    expect(output.join("")).not.toContain("Branch:");
  });

  it("creates the default branch when --branch is provided in a Git repo", async () => {
    expectOk(await runCommand("git", ["init"], { cwd: tempDir }));
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "feature", "Add note pinning", tempDir, "--branch"]);

    const branch = expectOk(
      await runCommand("git", ["branch", "--show-current"], { cwd: tempDir })
    );

    expect(output.join("")).toContain("visp/001-add-note-pinning");
    expect(branch.stdout.trim()).toBe("visp/001-add-note-pinning");
  });

  it("uses a custom branch name in dry-run mode", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "feature",
      "Add note pinning",
      tempDir,
      "--branch-name",
      "custom/name",
      "--dry-run",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as {
      branch: { requested: boolean; created: boolean; name: string | null };
    };

    expect(summary.branch).toEqual({
      requested: true,
      created: false,
      name: "custom/name"
    });
  });

  it("fails clearly when branch and no-branch are both provided", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const errors: string[] = [];
    const program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "feature",
      "Add note pinning",
      tempDir,
      "--branch",
      "--no-branch"
    ]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("--branch");
  });
});
