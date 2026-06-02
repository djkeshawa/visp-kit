import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";
import { runFeatureWorkflow } from "../../src/workflows/feature.workflow.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected result to be ok.");
  return result.value;
}

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

async function initializedFeature(tempDir: string): Promise<void> {
  expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
  expectOk(
    await runFeatureWorkflow({
      targetPath: tempDir,
      featureIdea: "Add note pinning",
      now: "2026-01-01T00:00:00.000Z"
    })
  );
}

describe("phase 7 template commands", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-phase7-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("runs the full clarify, spec, plan, and tasks command chain", async () => {
    await initializedFeature(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "clarify", tempDir]);
    await program.parseAsync(["node", "visp", "clarify", tempDir, "--validate"]);
    await program.parseAsync(["node", "visp", "spec", tempDir]);
    await program.parseAsync(["node", "visp", "spec", tempDir, "--validate"]);
    await program.parseAsync(["node", "visp", "plan", tempDir]);
    await program.parseAsync(["node", "visp", "plan", tempDir, "--validate"]);
    await program.parseAsync(["node", "visp", "tasks", tempDir]);
    await program.parseAsync(["node", "visp", "tasks", tempDir, "--validate"]);

    const featureDir = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning"
    );

    for (const file of [
      "clarifications.md",
      "clarifications.json",
      "spec.md",
      "spec.json",
      "plan.md",
      "plan.json",
      "tasks.md",
      "task-graph.json",
      "traceability.md",
      "traceability.json"
    ]) {
      expect(await exists(path.join(featureDir, file))).toBe(true);
    }

    for (const file of [
      "clarify.prompt.md",
      "spec.prompt.md",
      "plan.prompt.md",
      "tasks.prompt.md"
    ]) {
      expect(await exists(path.join(tempDir, ".visp", "prompts", file))).toBe(
        true
      );
    }

    expect(await readFile(path.join(tempDir, ".visp", "status.json"), "utf8")).toContain(
      "tasks_ready"
    );
    expect(await readFile(path.join(featureDir, "traceability.json"), "utf8")).toContain(
      "T001"
    );
  });

  it("fails clearly when .visp or active feature is missing", async () => {
    const errors: string[] = [];
    let program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "clarify", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp init");

    process.exitCode = undefined;
    errors.length = 0;
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "clarify", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp feature");
  });

  it("requires clarifications before spec unless force is used", async () => {
    await initializedFeature(tempDir);
    const errors: string[] = [];
    const program = createCli({
      writeErr: (value) => errors.push(value),
      writeOut: () => undefined
    });

    await program.parseAsync(["node", "visp", "spec", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp clarify");

    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "spec", tempDir, "--force"]);

    expect(
      await exists(
        path.join(
          tempDir,
          ".visp",
          "features",
          "001-add-note-pinning",
          "spec.json"
        )
      )
    ).toBe(true);
  });

  it("skips existing generated files without force and overwrites with force", async () => {
    await initializedFeature(tempDir);
    const program = createCli({ writeOut: () => undefined });
    const markdownPath = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "clarifications.md"
    );

    await program.parseAsync(["node", "visp", "clarify", tempDir]);
    await writeFile(markdownPath, "custom", "utf8");
    await program.parseAsync(["node", "visp", "clarify", tempDir]);
    expect(await readFile(markdownPath, "utf8")).toBe("custom");
    await program.parseAsync(["node", "visp", "clarify", tempDir, "--force"]);
    expect(await readFile(markdownPath, "utf8")).toContain("# Clarifications");
  });

  it("supports prompt-only, dry-run, and JSON validation output", async () => {
    await initializedFeature(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "plan", tempDir, "--prompt-only"]);

    expect(await exists(path.join(tempDir, ".visp", "prompts", "plan.prompt.md"))).toBe(
      true
    );
    expect(
      await exists(
        path.join(
          tempDir,
          ".visp",
          "features",
          "001-add-note-pinning",
          "plan.md"
        )
      )
    ).toBe(false);

    output.length = 0;
    await program.parseAsync(["node", "visp", "clarify", tempDir, "--dry-run"]);
    expect(output.join("")).toContain("dry run");
    expect(
      await exists(
        path.join(
          tempDir,
          ".visp",
          "features",
          "001-add-note-pinning",
          "clarifications.md"
        )
      )
    ).toBe(false);

    await program.parseAsync(["node", "visp", "clarify", tempDir]);
    await writeFile(
      path.join(
        tempDir,
        ".visp",
        "features",
        "001-add-note-pinning",
        "clarifications.json"
      ),
      "{",
      "utf8"
    );

    output.length = 0;
    await program.parseAsync([
      "node",
      "visp",
      "clarify",
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
    expect(process.exitCode).toBe(1);
  });
});
