import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type IntelGraph } from "../../../src/artifacts/schemas/intel-graph.schema.js";
import { loadIntelGraph, projectIntelGraph } from "../../../src/scanner/intel-graph.js";
import { buildModuleMap } from "../../../src/scanner/module-map.js";
import { type FileIndexEntry, type FileSummary } from "../../../src/scanner/types.js";

const SNAPSHOT = "urn:visp-intel:snapshot:1.0:sha256:head";

function graph(overrides: Partial<IntelGraph> = {}): IntelGraph {
  return {
    schemaVersion: "1.0",
    repositoryInstanceId: "urn:visp-intel:repository-instance:1.0:sha256:repo",
    headSnapshotId: SNAPSHOT,
    entities: [
      {
        id: "e:a",
        snapshotId: SNAPSHOT,
        kind: "file",
        canonicalName: "src/a.ts",
        path: "src/a.ts"
      },
      {
        id: "e:b",
        snapshotId: SNAPSHOT,
        kind: "file",
        canonicalName: "src/b.ts",
        path: "src/b.ts"
      },
      {
        id: "e:spec",
        snapshotId: SNAPSHOT,
        kind: "test",
        canonicalName: "tests/a.spec.ts#covers",
        path: "tests/a.spec.ts"
      },
      {
        id: "e:zod",
        snapshotId: SNAPSHOT,
        kind: "external_symbol",
        canonicalName: "zod#z",
        symbol: "zod#z"
      }
    ],
    relations: [
      { id: "r:1", sourceId: "e:a", targetId: "e:b", kind: "imports" },
      { id: "r:2", sourceId: "e:a", targetId: "e:zod", kind: "imports" },
      { id: "r:3", sourceId: "e:a", targetId: "e:b", kind: "contains" }
    ],
    ...overrides
  };
}

describe("intel graph projection", () => {
  it("resolves internal imports to file paths and externals to module names", () => {
    const projection = projectIntelGraph(graph());

    expect(projection.internalEdges.get("src/a.ts")).toEqual(["src/b.ts"]);
    expect(projection.externalEdges.get("src/a.ts")).toEqual(["zod"]);
    expect(projection.testFilePaths).toEqual(["tests/a.spec.ts"]);
  });

  it("ignores relation kinds that are not dependencies", () => {
    const projection = projectIntelGraph({
      ...graph(),
      relations: [{ id: "r:3", sourceId: "e:a", targetId: "e:b", kind: "contains" }]
    });

    expect(projection.internalEdges.size).toBe(0);
  });

  it("ignores entities from a snapshot that is not head", () => {
    const value = graph();
    const projection = projectIntelGraph({
      ...value,
      entities: value.entities.map((entity) =>
        entity.id === "e:b" ? { ...entity, snapshotId: "urn:old" } : entity
      )
    });

    // src/b.ts is no longer a known file, so the edge to it is not an internal
    // dependency; it must not silently become an external one either.
    expect(projection.internalEdges.get("src/a.ts")).toBeUndefined();
    expect(projection.externalEdges.get("src/a.ts")).toEqual(["zod"]);
  });
});

describe("module map backed by intel", () => {
  const files: FileIndexEntry[] = [
    {
      path: "src/a.ts",
      extension: ".ts",
      sizeBytes: 10,
      hash: "h1",
      language: "TypeScript",
      isTestFile: false,
      isConfigFile: false,
      isSourceFile: true,
      lastScannedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      path: "src/b.ts",
      extension: ".ts",
      sizeBytes: 10,
      hash: "h2",
      language: "TypeScript",
      isTestFile: false,
      isConfigFile: false,
      isSourceFile: true,
      lastScannedAt: "2026-01-01T00:00:00.000Z"
    }
  ];
  const summaries: FileSummary[] = [
    {
      path: "src/a.ts",
      hash: "h1",
      language: "TypeScript",
      sizeBytes: 10,
      lineCount: 3,
      imports: ["./b.js", "zod"],
      exports: [],
      symbols: [],
      comments: [],
      summaryKind: "deterministic"
    }
  ];

  it("keeps the artifact shape and replaces specifiers with resolved paths", () => {
    const withoutIntel = buildModuleMap({
      files,
      summaries,
      sourceRoots: ["src"],
      generatedAt: "2026-01-01T00:00:00.000Z"
    });
    const withIntel = buildModuleMap({
      files,
      summaries,
      sourceRoots: ["src"],
      generatedAt: "2026-01-01T00:00:00.000Z",
      intel: projectIntelGraph(graph())
    });

    expect(Object.keys(withIntel)).toEqual(Object.keys(withoutIntel));
    expect(withoutIntel.modules[0]?.internalImports).toEqual(["./b.js"]);
    expect(withIntel.modules[0]?.internalImports).toEqual(["src/b.ts"]);
    expect(withIntel.modules[0]?.externalDependencies).toEqual(["zod"]);
  });

  it("keeps the summary-derived answer for a module intel never indexed", () => {
    const withIntel = buildModuleMap({
      files,
      summaries,
      sourceRoots: ["src"],
      generatedAt: "2026-01-01T00:00:00.000Z",
      intel: projectIntelGraph({ ...graph(), relations: [] })
    });

    // No indexed edges in this module, so falling through to intel would
    // report "no dependencies" — worse than what scan already knew.
    expect(withIntel.modules[0]?.internalImports).toEqual(["./b.js"]);
  });

  it("unions Kit's test detection with intel's rather than replacing it", () => {
    const withKitTest = buildModuleMap({
      files: [...files, { ...files[0]!, path: "src/a.test.ts", isTestFile: true }],
      summaries,
      sourceRoots: ["src"],
      generatedAt: "2026-01-01T00:00:00.000Z",
      intel: projectIntelGraph(graph())
    });

    expect(withKitTest.modules[0]?.testFiles).toEqual(["src/a.test.ts"]);
  });
});

describe("loading intel's graph", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-intel-graph-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns nothing and warns nothing when the project has no intel store", async () => {
    expect(await loadIntelGraph(tempDir)).toEqual({ warnings: [] });
  });

  it("degrades with a warning when the graph is not the expected shape", async () => {
    await mkdir(path.join(tempDir, ".visp-intel"), { recursive: true });
    await writeFile(
      path.join(tempDir, ".visp-intel", "graph.json"),
      JSON.stringify({ schemaVersion: "1.0" }),
      "utf8"
    );

    const loaded = await loadIntelGraph(tempDir);

    expect(loaded.projection).toBeUndefined();
    expect(loaded.warnings.join(" ")).toContain("export shape");
  });

  it("reads a well-formed graph", async () => {
    await mkdir(path.join(tempDir, ".visp-intel"), { recursive: true });
    await writeFile(
      path.join(tempDir, ".visp-intel", "graph.json"),
      JSON.stringify(graph()),
      "utf8"
    );

    const loaded = await loadIntelGraph(tempDir);

    expect(loaded.warnings).toEqual([]);
    expect(loaded.projection?.filePaths).toContain("src/a.ts");
  });
});
