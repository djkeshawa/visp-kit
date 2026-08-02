import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";
import { createPhase8Fixture, expectOk } from "./phase8-fixture.js";

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

describe("visp-kit drift command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-drift-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  async function prepareContext(): Promise<void> {
    await createPhase8Fixture(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);
  }

  it("passes when nothing drifted and writes report files", async () => {
    await prepareContext();
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "drift", tempDir, "--json"]);

    const report = JSON.parse(output.join("")) as {
      success: boolean;
      result: string;
      findings: readonly { kind: string }[];
    };

    expect(report.success).toBe(true);
    expect(
      report.findings.filter((finding) => finding.kind === "stale_context_provenance")
    ).toEqual([]);
    expect(await exists(path.join(tempDir, ".visp", "reports", "drift-report.json"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "reports", "drift-report.md"))).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it("detects a spec edited after context compilation and exits non-zero in strict mode", async () => {
    await prepareContext();
    const strictProgram = createCli({ writeOut: () => undefined });

    await strictProgram.parseAsync(["node", "visp", "policy", "set-strictness", "strict", tempDir]);

    const specPath = path.join(tempDir, ".visp", "features", "001-add-note-pinning", "spec.json");
    const spec = JSON.parse(await readFile(specPath, "utf8")) as { title: string };

    spec.title = "Edited after context";
    await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "drift", tempDir, "--json"]);

    const report = JSON.parse(output.join("")) as {
      success: boolean;
      result: string;
      findings: readonly { kind: string; severity: string }[];
    };

    expect(report.result).toBe("failed");
    expect(report.findings.some((finding) => finding.kind === "stale_context_provenance")).toBe(
      true
    );
    expect(process.exitCode).toBe(1);
  });

  it("blocks the PR gate through VSP021 when context provenance is stale", async () => {
    await prepareContext();
    const strictProgram = createCli({ writeOut: () => undefined });

    await strictProgram.parseAsync(["node", "visp", "policy", "set-strictness", "strict", tempDir]);

    const specPath = path.join(tempDir, ".visp", "features", "001-add-note-pinning", "spec.json");
    const spec = JSON.parse(await readFile(specPath, "utf8")) as { title: string };

    spec.title = "Edited after context";
    await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "gate", "pr", tempDir, "--json"]);

    const gate = JSON.parse(output.join("")) as {
      allowed: boolean;
      failedRules: readonly { ruleId: string }[];
    };

    expect(gate.allowed).toBe(false);
    expect(gate.failedRules.some((rule) => rule.ruleId === "VSP021")).toBe(true);
  });

  it("returns JSON only", async () => {
    await prepareContext();
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "drift", tempDir, "--json"]);

    expect(() => JSON.parse(output.join(""))).not.toThrow();
  });

  it("dry-run writes nothing", async () => {
    await prepareContext();
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "drift", tempDir, "--dry-run"]);

    expect(await exists(path.join(tempDir, ".visp", "reports", "drift-report.json"))).toBe(false);
  });

  it("fails clearly when .visp is missing", async () => {
    const errors: string[] = [];
    const program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "drift", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp-kit init");
  });
});
