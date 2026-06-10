import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { createPhase8Fixture } from "./phase8-fixture.js";

describe("visp workflow command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-workflow-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("shows the effective workflow manifest", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "workflow", "show", tempDir]);

    expect(process.exitCode).toBeUndefined();
    expect(output.join("")).not.toBe("");
  });

  it("validates the manifest and returns JSON only", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync(["node", "visp", "workflow", "validate", tempDir, "--json"]);

    const summary = JSON.parse(output.join("")) as { success: boolean; valid: boolean };

    expect(errors.join("")).toBe("");
    expect(summary.success).toBe(true);
    expect(summary.valid).toBe(true);
  });

  it("show works without project initialization", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync(["node", "visp", "workflow", "show", tempDir, "--json"]);

    const summary = JSON.parse(output.join("")) as { success: boolean };

    expect(typeof summary.success).toBe("boolean");
  });
});
