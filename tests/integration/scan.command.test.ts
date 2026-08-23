import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

const SNAPSHOT = "urn:visp-intel:snapshot:1.0:sha256:head";

/** Intel's consumer projection, minimal but real: one indexed file, at head. */
async function writeIntelProjection(rootPath: string): Promise<void> {
  await mkdir(path.join(rootPath, ".visp-intel", "projection"), { recursive: true });
  await writeFile(
    path.join(rootPath, ".visp-intel", "projection", "graph.json"),
    JSON.stringify({
      kind: "consumer-graph-projection",
      schemaVersion: "1.0",
      identity: {
        repositoryInstanceId: "urn:visp-intel:repository-instance:1.0:sha256:repo",
        snapshotId: SNAPSHOT,
        headSnapshotId: SNAPSHOT
      },
      dictionaries: { nodeKinds: ["file"], edgeKinds: ["imports"], paths: ["index.js"] },
      nodes: {
        columns: ["path", "kind", "name", "startLine", "endLine"],
        rows: [[0, 0, "index.js", null, null]]
      },
      edges: {
        columns: [
          "source",
          "target",
          "kind",
          "confidence",
          "completeness",
          "modality",
          "derivationMethod",
          "uncertaintyReasonCount"
        ],
        rows: []
      }
    }),
    "utf8"
  );
}

describe("visp-kit scan command", () => {
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
    expect(await exists(path.join(tempDir, ".visp", "cache", "scan-meta.json"))).toBe(true);
  });

  /**
   * The reason gets its OWN always-present line, deliberately not the warnings
   * line. The common absence — no `.visp-intel/` at all — raises no warning, so
   * a scan that read no intel printed `Warnings: None` and left the operator to
   * guess whether intel had informed the scan or silently failed to.
   */
  it("states on stdout why no intel store was read", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await writeFile(path.join(tempDir, "index.js"), "export const x = 1;");
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "scan", tempDir]);

    const printed = output.join("");

    expect(printed).toContain("Intel store: not read (intel_absent)");
    expect(printed).toContain("this project has no .visp-intel/ store");
    // The line is the answer to "did intel inform this scan?", so it cannot be
    // conditional on a warning to hang it on: nothing in the warnings block
    // mentions intel in this run, and the line is there anyway.
    expect((printed.split("Warnings:")[1] ?? "").toLowerCase()).not.toContain("intel");
  });

  it("states on stdout that the intel store was read when there is one", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await writeFile(path.join(tempDir, "index.js"), "export const x = 1;");
    await writeIntelProjection(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "scan", tempDir]);

    expect(output.join("")).toContain("Intel store: read (1 files indexed)");
  });

  it("carries the intel store into the JSON summary", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await writeFile(path.join(tempDir, "index.js"), "export const x = 1;");
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "scan", tempDir, "--json"]);

    const summary = JSON.parse(output.join("")) as {
      intelStore: { read: boolean; absenceReason?: string };
    };

    expect(summary.intelStore).toEqual({ read: false, absenceReason: "intel_absent" });
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
    expect(errors.join("")).toContain("visp-kit init");
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
    expect(await exists(path.join(tempDir, ".visp", "reports", "scan-report.md"))).toBe(true);
  });
});
