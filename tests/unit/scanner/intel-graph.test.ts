import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type IntelProjection } from "../../../src/artifacts/schemas/intel-projection.schema.js";
import {
  INTEL_PROJECTION_MAX_BYTES,
  collapseToFileGraph,
  loadIntelGraph
} from "../../../src/scanner/intel-graph.js";
import { buildModuleMap } from "../../../src/scanner/module-map.js";
import { type FileIndexEntry, type FileSummary } from "../../../src/scanner/types.js";

const SNAPSHOT = "urn:visp-intel:snapshot:1.0:sha256:head";

/**
 * A projection in intel's real wire shape: integer codes into dictionaries,
 * edges addressing nodes by ROW INDEX, `null` meaning absent everywhere.
 *
 * Node rows: 0 `src/a.ts`, 1 `src/b.ts`, 2 `tests/a.spec.ts`, 3 the external
 * `zod#z`, which like every external symbol has no path.
 */
function projection(overrides: Partial<IntelProjection> = {}): IntelProjection {
  return {
    kind: "consumer-graph-projection",
    schemaVersion: "1.0",
    identity: {
      repositoryInstanceId: "urn:visp-intel:repository-instance:1.0:sha256:repo",
      snapshotId: SNAPSHOT,
      headSnapshotId: SNAPSHOT
    },
    dictionaries: {
      nodeKinds: ["file", "test", "external_symbol", "function"],
      edgeKinds: ["imports", "contains", "depends_on"],
      paths: ["src/a.ts", "src/b.ts", "tests/a.spec.ts"]
    },
    nodes: {
      columns: ["path", "kind", "name", "startLine", "endLine"],
      rows: [
        [0, 0, "src/a.ts", null, null],
        [1, 0, "src/b.ts", null, null],
        [2, 1, "tests/a.spec.ts#covers", null, null],
        [null, 2, "zod#z", null, null]
      ]
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
      rows: [
        [0, 1, 0, 0, 0, null, null, 0],
        [0, 3, 0, 0, 0, null, null, 0],
        [0, 1, 1, 0, 0, null, null, 0],
        [0, 0, 0, 0, 0, null, null, 0]
      ]
    },
    ...overrides
  };
}

async function writeProjection(root: string, value: unknown): Promise<void> {
  await mkdir(path.join(root, ".visp-intel", "projection"), { recursive: true });
  await writeFile(
    path.join(root, ".visp-intel", "projection", "graph.json"),
    JSON.stringify(value),
    "utf8"
  );
}

describe("collapsing intel's consumer projection to file grain", () => {
  it("resolves internal imports to file paths and externals to module names", () => {
    const graph = collapseToFileGraph(projection());

    expect(graph.internalEdges.get("src/a.ts")).toEqual(["src/b.ts"]);
    expect(graph.externalEdges.get("src/a.ts")).toEqual(["zod"]);
    expect(graph.testFilePaths).toEqual(["tests/a.spec.ts"]);
    expect(graph.filePaths).toEqual(["src/a.ts", "src/b.ts", "tests/a.spec.ts"]);
  });

  it("ignores edge kinds that are not dependencies, and a file importing itself", () => {
    const value = projection();
    const graph = collapseToFileGraph({
      ...value,
      edges: { ...value.edges, rows: [value.edges.rows[2]!, value.edges.rows[3]!] }
    });

    expect(graph.internalEdges.size).toBe(0);
  });

  it("reads every column by name, because intel does not promise an offset", () => {
    const value = projection();
    // Same facts, columns rotated. A reader that hard-coded `row[0]` for a node
    // path or `row[2]` for an edge kind silently invents edges here.
    const graph = collapseToFileGraph({
      ...value,
      nodes: {
        columns: ["kind", "name", "startLine", "endLine", "path"],
        rows: value.nodes.rows.map((row) => [row[1]!, row[2]!, row[3]!, row[4]!, row[0]!])
      },
      edges: {
        columns: [
          "kind",
          "confidence",
          "completeness",
          "modality",
          "derivationMethod",
          "uncertaintyReasonCount",
          "source",
          "target"
        ],
        rows: value.edges.rows.map((row) => [
          row[2]!,
          row[3]!,
          row[4]!,
          row[5]!,
          row[6]!,
          row[7]!,
          row[0]!,
          row[1]!
        ])
      }
    });

    expect(graph.internalEdges.get("src/a.ts")).toEqual(["src/b.ts"]);
    expect(graph.externalEdges.get("src/a.ts")).toEqual(["zod"]);
  });

  it("joins on row index, so two entities sharing a display name stay two identities", () => {
    const value = projection();
    const graph = collapseToFileGraph({
      ...value,
      nodes: {
        ...value.nodes,
        rows: [
          [0, 3, "handler", 1, 9],
          [1, 3, "handler", 1, 9],
          [2, 1, "handler", 1, 9],
          [null, 2, "zod#z", null, null]
        ]
      }
    });

    // src/a.ts#handler imports src/b.ts#handler. Joining on the name would make
    // that a self-edge and drop it, or make every `handler` one node.
    expect(graph.internalEdges.get("src/a.ts")).toEqual(["src/b.ts"]);
  });

  it("drops an edge to a node whose name intel elided to null", () => {
    const value = projection();
    const graph = collapseToFileGraph({
      ...value,
      nodes: {
        ...value.nodes,
        // The repository node: no path, and a name intel elides because it is
        // the repository instance URN. It is not a module anyone imports.
        rows: [...value.nodes.rows.slice(0, 3), [null, 2, null, null, null]]
      }
    });

    expect(graph.externalEdges.get("src/a.ts")).toBeUndefined();
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
      intel: collapseToFileGraph(projection())
    });

    expect(Object.keys(withIntel)).toEqual(Object.keys(withoutIntel));
    expect(withoutIntel.modules[0]?.internalImports).toEqual(["./b.js"]);
    expect(withIntel.modules[0]?.internalImports).toEqual(["src/b.ts"]);
    expect(withIntel.modules[0]?.externalDependencies).toEqual(["zod"]);
  });

  it("keeps the summary-derived answer for a module intel never indexed", () => {
    const value = projection();
    const withIntel = buildModuleMap({
      files,
      summaries,
      sourceRoots: ["src"],
      generatedAt: "2026-01-01T00:00:00.000Z",
      intel: collapseToFileGraph({ ...value, edges: { ...value.edges, rows: [] } })
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
      intel: collapseToFileGraph(projection())
    });

    expect(withKitTest.modules[0]?.testFiles).toEqual(["src/a.test.ts"]);
  });
});

describe("loading intel's consumer projection", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-intel-projection-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns nothing and warns nothing when the project has no intel store", async () => {
    expect(await loadIntelGraph(tempDir)).toEqual({ warnings: [] });
  });

  it("names the missing projection when only the archival export is present", async () => {
    await mkdir(path.join(tempDir, ".visp-intel"), { recursive: true });
    await writeFile(path.join(tempDir, ".visp-intel", "graph.json"), "{}", "utf8");

    const loaded = await loadIntelGraph(tempDir);

    expect(loaded.fileGraph).toBeUndefined();
    expect(loaded.warnings.join(" ")).toContain("visp-intel repo projection");
  });

  it("degrades with a warning naming the artifact when the projection is too big", async () => {
    // The read limit exists so `scan` cannot be made to allocate a whole
    // archive. The warning has to say WHICH artifact was too big: the previous
    // one did not, and a 64 MiB limit sized for the archival export silently
    // degraded three of four measured repositories.
    await writeProjection(tempDir, {
      ...projection(),
      filler: "x".repeat(INTEL_PROJECTION_MAX_BYTES + 1)
    });

    const loaded = await loadIntelGraph(tempDir);

    expect(loaded.fileGraph).toBeUndefined();
    expect(loaded.warnings[0]).toContain(".visp-intel/projection/graph.json");
    expect(loaded.warnings[0]).toContain(`${INTEL_PROJECTION_MAX_BYTES}-byte read limit`);
  });

  it("degrades with a warning when the archival export is put at the projection path", async () => {
    await writeProjection(tempDir, {
      schemaVersion: "1.0",
      repositoryInstanceId: "urn:visp-intel:repository-instance:1.0:sha256:repo",
      headSnapshotId: SNAPSHOT,
      entities: [],
      relations: []
    });

    const loaded = await loadIntelGraph(tempDir);

    expect(loaded.fileGraph).toBeUndefined();
    expect(loaded.warnings.join(" ")).toContain("consumer-projection shape");
  });

  it("degrades with a warning when a table is missing a column Kit reads", async () => {
    const value = projection();
    await writeProjection(tempDir, {
      ...value,
      edges: { columns: ["source", "target"], rows: [] }
    });

    const loaded = await loadIntelGraph(tempDir);

    expect(loaded.fileGraph).toBeUndefined();
    expect(loaded.warnings.join(" ")).toContain('missing the "kind" column');
  });

  it("degrades with a warning when the rows are not the head snapshot", async () => {
    const value = projection();
    await writeProjection(tempDir, {
      ...value,
      identity: { ...value.identity, snapshotId: "urn:visp-intel:snapshot:1.0:sha256:older" }
    });

    const loaded = await loadIntelGraph(tempDir);

    expect(loaded.fileGraph).toBeUndefined();
    expect(loaded.warnings.join(" ")).toContain("not the repository head");
  });

  it("reads a well-formed projection", async () => {
    await writeProjection(tempDir, projection());

    const loaded = await loadIntelGraph(tempDir);

    expect(loaded.warnings).toEqual([]);
    expect(loaded.fileGraph?.filePaths).toContain("src/a.ts");
    expect(loaded.fileGraph?.internalEdges.get("src/a.ts")).toEqual(["src/b.ts"]);
  });
});
