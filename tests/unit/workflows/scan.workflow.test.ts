import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readArtifact } from "../../../src/artifacts/artifact-reader.js";
import { projectProfileSchema } from "../../../src/artifacts/schemas/project.schema.js";
import { pathExists, readJsonFile } from "../../../src/core/file-system.js";
import { isErr, isOk } from "../../../src/core/result.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";
import { runScanWorkflow } from "../../../src/workflows/scan.workflow.js";
import { writeScanPlan } from "../../../src/workflows/scan/write-plan.js";

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
      dictionaries: {
        nodeKinds: ["file"],
        edgeKinds: ["imports"],
        paths: ["src/index.ts"]
      },
      nodes: {
        columns: ["path", "kind", "name", "startLine", "endLine"],
        rows: [[0, 0, "src/index.ts", null, null]]
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

async function createTypeScriptFixture(rootPath: string): Promise<void> {
  await writeFile(
    path.join(rootPath, "package.json"),
    JSON.stringify(
      {
        name: "scan-fixture",
        packageManager: "pnpm@10.0.0",
        scripts: {
          build: "tsc",
          test: "vitest",
          lint: "eslint .",
          typecheck: "tsc --noEmit"
        },
        dependencies: { react: "^19.0.0" },
        devDependencies: { typescript: "^5.0.0", vitest: "^3.0.0" }
      },
      null,
      2
    ),
    "utf8"
  );
  await mkdir(path.join(rootPath, "src"), { recursive: true });
  await mkdir(path.join(rootPath, "tests"), { recursive: true });
  await writeFile(
    path.join(rootPath, "src", "index.ts"),
    `import React from "react";

export function hello(name: string): string {
  return \`Hello \${name}\`;
}

export class Greeter {}
`,
    "utf8"
  );
  await writeFile(
    path.join(rootPath, "tests", "index.test.ts"),
    `import { hello } from "../src/index";

test("hello", () => {
  expect(hello("Visp")).toBe("Hello Visp");
});
`,
    "utf8"
  );
}

describe("runScanWorkflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-scan-workflow-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("fails clearly when .visp is missing", async () => {
    const result = await runScanWorkflow({ targetPath: tempDir });

    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.message).toContain("visp-kit init");
    }
  });

  it("scans a TypeScript project and writes deterministic caches", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await createTypeScriptFixture(tempDir);

    const summary = expectOk(
      await runScanWorkflow({
        targetPath: tempDir,
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(summary.packageManager).toBe("pnpm");
    expect(summary.languages.map((language) => language.name)).toContain("TypeScript");
    expect(summary.frameworks.map((framework) => framework.name)).toContain("react");
    expect(summary.testRoots).toEqual(["tests"]);
    expect(summary.writtenFiles).toContain(".visp/cache/file-index.json");
    expect(await exists(path.join(tempDir, ".visp", "cache", "module-map.json"))).toBe(true);

    const project = expectOk(
      await readArtifact(path.join(tempDir, ".visp", "project.json"), projectProfileSchema)
    );
    expect(project.name).toBe("scan-fixture");
    expect(project.packageManager).toBe("pnpm");
    expect(project.buildCommands).toEqual(["pnpm build"]);
    expect(project.testCommands).toEqual(["pnpm test"]);

    const fileSummaries = expectOk(
      await readJsonFile<{ items: Array<{ path: string; imports: string[] }> }>(
        path.join(tempDir, ".visp", "cache", "file-summaries.json")
      )
    );
    const sourceSummary = fileSummaries.items.find((item) => item.path === "src/index.ts");

    expect(sourceSummary?.imports).toContain("react");
    expect(
      await readFile(path.join(tempDir, ".visp", "memory", "project-summary.md"), "utf8")
    ).toContain("scan-fixture");
    expect(
      await readFile(path.join(tempDir, ".visp", "reports", "scan-report.md"), "utf8")
    ).toContain("Files indexed");
  });

  it("works when package.json is missing", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "index.js"), "export const x = 1;");

    const summary = expectOk(await runScanWorkflow({ targetPath: tempDir }));

    expect(summary.packageManager).toBe("unknown");
    expect(summary.languages.map((language) => language.name)).toContain("JavaScript");
  });

  it("detects Go project validation commands", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await writeFile(path.join(tempDir, "go.mod"), "module example.com/app\n", "utf8");
    await mkdir(path.join(tempDir, "cmd"), { recursive: true });
    await writeFile(path.join(tempDir, "cmd", "main.go"), "package main\n", "utf8");

    const summary = expectOk(
      await runScanWorkflow({
        targetPath: tempDir,
        now: "2026-01-01T00:00:00.000Z"
      })
    );
    const project = expectOk(
      await readArtifact(path.join(tempDir, ".visp", "project.json"), projectProfileSchema)
    );

    expect(summary.languages.map((language) => language.name)).toContain("Go");
    expect(project.testCommands).toContain("go test ./...");
    expect(project.lintCommands).toContain("go vet ./...");
    expect(project.buildCommands).toContain("go build ./...");
  });

  it("reuses unchanged summaries with changed mode", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await createTypeScriptFixture(tempDir);
    expectOk(await runScanWorkflow({ targetPath: tempDir }));

    const second = expectOk(await runScanWorkflow({ targetPath: tempDir, changed: true }));

    expect(second.reusedSummaries).toBeGreaterThan(0);
  });

  it("recomputes summaries with force", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await createTypeScriptFixture(tempDir);
    expectOk(await runScanWorkflow({ targetPath: tempDir }));

    const second = expectOk(await runScanWorkflow({ targetPath: tempDir, force: true }));

    expect(second.reusedSummaries).toBe(0);
    expect(second.changedFiles).toBeGreaterThan(0);
  });

  it("removes deleted files from the summary cache", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await createTypeScriptFixture(tempDir);
    expectOk(await runScanWorkflow({ targetPath: tempDir }));
    await rm(path.join(tempDir, "tests", "index.test.ts"));

    const second = expectOk(await runScanWorkflow({ targetPath: tempDir }));
    const summaries = expectOk(
      await readJsonFile<{ items: Array<{ path: string }> }>(
        path.join(tempDir, ".visp", "cache", "file-summaries.json")
      )
    );

    expect(second.deletedFiles).toBe(1);
    expect(summaries.items.map((item) => item.path)).not.toContain("tests/index.test.ts");
  });

  it("dry-run writes nothing", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await createTypeScriptFixture(tempDir);

    const summary = expectOk(await runScanWorkflow({ targetPath: tempDir, dryRun: true }));

    expect(summary.dryRun).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "cache", "file-index.json"))).toBe(true);
    const raw = await readFile(path.join(tempDir, ".visp", "cache", "file-index.json"), "utf8");
    expect(raw).toContain('"populatedBy": "visp-kit scan"');
  });

  it("indexes large files and skips their summaries", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(path.join(tempDir, "src", "large.ts"), "x".repeat(260000));

    expectOk(await runScanWorkflow({ targetPath: tempDir }));
    const summaries = expectOk(
      await readJsonFile<{
        items: Array<{ path: string; summarySkippedReason?: string }>;
      }>(path.join(tempDir, ".visp", "cache", "file-summaries.json"))
    );

    expect(summaries.items.find((item) => item.path === "src/large.ts")?.summarySkippedReason).toBe(
      "file_too_large"
    );
  });

  /**
   * P21-KIT-01's exit says scan's artifact shape, schema and command surface
   * are UNCHANGED. `scan-meta.json` had gained an always-present top-level
   * `intel` key, which made that sentence false — additive and unschema'd, so
   * nothing broke, but "nothing broke" is a weaker claim than the one the unit
   * makes and it is the claim a packed, unpublished CLI cannot casually widen.
   *
   * This pins the key set rather than the absence of one key, so the next thing
   * added to scan meta has to come past a test that says what the artifact is.
   */
  it("keeps scan-meta.json's top-level keys exactly as they were before intel", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await createTypeScriptFixture(tempDir);
    expectOk(await runScanWorkflow({ targetPath: tempDir }));

    const meta = expectOk(
      await readJsonFile<Record<string, unknown>>(
        path.join(tempDir, ".visp", "cache", "scan-meta.json")
      )
    );

    expect(Object.keys(meta).sort()).toEqual([
      "changedFiles",
      "changedMode",
      "counts",
      "deletedFiles",
      "force",
      "generatedAt",
      "git",
      "lockFiles",
      "targetPath"
    ]);
  });

  it("records intel provenance in its own file, present and null with no store", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await createTypeScriptFixture(tempDir);
    expectOk(await runScanWorkflow({ targetPath: tempDir }));

    const provenance = expectOk(
      await readJsonFile<{ store: unknown }>(
        path.join(tempDir, ".visp", "cache", "intel-scan.json")
      )
    );

    // Written on every scan, `null` included: a scan that no longer finds a
    // store must overwrite the instance id a previous scan recorded, or a case
    // from a deleted store keeps looking current.
    expect(provenance.store).toBeNull();
  });

  /**
   * The writer half of "additive in both directions": scan never records an
   * absence it cannot account for. `intel_absent` is the reason that used to be
   * carried by nothing at all — no warning, no field — so a fixture with no
   * `.visp-intel/` is exactly the case that proves the field is populated
   * rather than merely permitted.
   */
  it("records why the intel store was absent, not just that it was", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await createTypeScriptFixture(tempDir);
    expectOk(await runScanWorkflow({ targetPath: tempDir }));

    const provenance = expectOk(
      await readJsonFile<Record<string, unknown>>(
        path.join(tempDir, ".visp", "cache", "intel-scan.json")
      )
    );

    expect(provenance.storeAbsenceReason).toBe("intel_absent");
    expect(Object.keys(provenance).sort()).toEqual(["generatedAt", "store", "storeAbsenceReason"]);
  });

  /**
   * The write schema, exercised through the workflow's own writer rather than
   * against the schema alone: an unexplained `null` fails validation before it
   * reaches the disk, so there is no path through `scan` that produces one.
   */
  it("refuses to write a null store with no reason", async () => {
    const failure = await writeScanPlan([
      {
        kind: "intelScan",
        path: path.join(tempDir, "intel-scan.json"),
        displayPath: "intel-scan.json",
        value: { generatedAt: "2026-01-01T00:00:00.000Z", store: null }
      }
    ]);

    expect(isErr(failure)).toBe(true);
    expect(await exists(path.join(tempDir, "intel-scan.json"))).toBe(false);
  });

  it("reports the store as read when a projection is present", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await createTypeScriptFixture(tempDir);
    await writeIntelProjection(tempDir);

    const summary = expectOk(await runScanWorkflow({ targetPath: tempDir }));

    expect(summary.intelStore.read).toBe(true);

    const provenance = expectOk(
      await readJsonFile<Record<string, unknown>>(
        path.join(tempDir, ".visp", "cache", "intel-scan.json")
      )
    );

    expect(provenance.store).not.toBeNull();
    expect(provenance.storeAbsenceReason).toBeUndefined();
  });

  it("returns ok results", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await createTypeScriptFixture(tempDir);

    expect(isOk(await runScanWorkflow({ targetPath: tempDir }))).toBe(true);
  });
});
