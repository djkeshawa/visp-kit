import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two absences are failures of the filesystem CALL, not states a directory tree
 * can be put into, so both are injected at the boundary instead of arranged on
 * disk:
 *
 * - `access` failing with anything other than ENOENT. What the underlying error
 *   is depends entirely on the platform. A regular file standing where the
 *   projection directory belongs raises ENOTDIR on Linux and macOS, but Windows
 *   reports that path as simply not there — ENOENT — so `pathExists` answers
 *   "absent" and the honest reason becomes `intel_absent`. The branch is real
 *   on every platform (a denied ACL or a locked file reaches it on Windows too)
 *   and only the fixture was POSIX-shaped.
 * - `stat` failing on a projection `access` just accepted. Nothing a test can
 *   put on disk is both reachable and unsizable.
 *
 * Every other call passes straight through to the real implementation, so this
 * file exercises real files everywhere else.
 */
const accessMock = vi.hoisted(() => vi.fn());
const statMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();

  return { ...actual, access: accessMock, stat: statMock };
});

import { type IntelProjection } from "../../../src/artifacts/schemas/intel-projection.schema.js";
import {
  intelStoreAbsenceReasons,
  type IntelStoreAbsenceReason
} from "../../../src/artifacts/schemas/intel-scan.schema.js";
import {
  INTEL_PROJECTION_MAX_BYTES,
  collapseToFileGraph,
  loadIntelGraph,
  readScanIntelInstanceId
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

/**
 * Both mocks answer as the real filesystem until a scenario says otherwise, so
 * every test that is not about a failing syscall runs against real files.
 */
async function useRealFileSystem(): Promise<void> {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

  accessMock.mockReset();
  accessMock.mockImplementation(actual.access);
  statMock.mockReset();
  statMock.mockImplementation(actual.stat);
}

/** A syscall failure that is NOT "the path is not there". */
function syscallError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: simulated failure`), { code });
}

beforeEach(useRealFileSystem);
// Disarm whatever a scenario injected, so a failure cannot outlive its test.
afterEach(useRealFileSystem);

describe("collapsing intel's consumer projection to file grain", () => {
  it("resolves internal imports to file paths and externals to module names", () => {
    const graph = collapseToFileGraph(projection());

    expect(graph.internalEdges.get("src/a.ts")).toEqual(["src/b.ts"]);
    expect(graph.externalEdges.get("src/a.ts")).toEqual(["zod"]);
    expect(graph.testFilePaths).toEqual(["tests/a.spec.ts"]);
    expect(graph.filePaths).toEqual(["src/a.ts", "src/b.ts", "tests/a.spec.ts"]);
  });

  /**
   * Test edges arrive in their OWN field. The module map is built from
   * `internalEdges`, its artifact contract calls those entries imports, and its
   * recorded precision and recall are statements about imports — so a test edge
   * that leaked into that map would silently restate a measured number as
   * something else.
   */
  it("collects tested_by and covered_by separately from the dependency edges", () => {
    const value = projection();
    const graph = collapseToFileGraph({
      ...value,
      dictionaries: {
        ...value.dictionaries,
        edgeKinds: ["imports", "contains", "depends_on", "tested_by", "covered_by"]
      },
      edges: {
        ...value.edges,
        rows: [
          // src/a.ts -> src/b.ts, an ordinary import.
          [0, 1, 0, 0, 0, null, null, 0],
          // src/a.ts tested_by tests/a.spec.ts.
          [0, 2, 3, 0, 0, null, null, 0],
          // src/b.ts covered_by tests/a.spec.ts.
          [1, 2, 4, 0, 0, null, null, 0],
          // A file testing itself is not a fact about two files.
          [2, 2, 3, 0, 0, null, null, 0]
        ]
      }
    });

    expect(graph.testEdges.get("src/a.ts")).toEqual(["tests/a.spec.ts"]);
    expect(graph.testEdges.get("src/b.ts")).toEqual(["tests/a.spec.ts"]);
    expect(graph.testEdges.has("tests/a.spec.ts")).toBe(false);
    // The dependency view is exactly what it was.
    expect(graph.internalEdges.get("src/a.ts")).toEqual(["src/b.ts"]);
    expect(graph.internalEdges.get("src/b.ts")).toBeUndefined();
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
      isRecognisedTextFile: true,
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
      isRecognisedTextFile: true,
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

  /**
   * The absence nobody could see. A project with no `.visp-intel/` raises no
   * warning — correctly, there is nothing for a human to do — and used to
   * return nothing else either, so `scan` wrote `store: null` while holding the
   * reason and discarding it. Silence on the warnings line is still the
   * behaviour; silence about the CAUSE is not.
   */
  it("returns nothing and warns nothing when the project has no intel store, and still says why", async () => {
    expect(await loadIntelGraph(tempDir)).toEqual({
      warnings: [],
      storeAbsenceReason: "intel_absent"
    });
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

/**
 * One scenario per way `loadIntelGraph` can return without a file graph, in the
 * order it evaluates them. The point of the table is that the LAST test in the
 * block compares the reasons these nine scenarios actually produce against the
 * enumeration itself: a tenth branch added without a code, or a code nobody
 * ever produces, fails here rather than reaching an artifact as a bare `null`.
 */
const absenceScenarios: readonly {
  readonly reason: IntelStoreAbsenceReason;
  readonly situation: string;
  readonly arrange: (root: string) => Promise<void>;
}[] = [
  {
    reason: "projection_path_unreadable",
    situation: "the projection path cannot be probed at all",
    // Injected, not arranged on disk: the branch is "the probe FAILED", which
    // `pathExists` distinguishes from "the path is absent" by the error being
    // anything other than ENOENT — and which error a real filesystem raises for
    // a given tree is platform-specific. EACCES is the case that reaches this
    // branch identically on POSIX and on Windows.
    arrange: async () => {
      accessMock.mockRejectedValue(syscallError("EACCES"));
    }
  },
  {
    reason: "intel_absent",
    situation: "the project has neither a projection nor an archival export",
    arrange: async () => {}
  },
  {
    reason: "projection_missing_export_present",
    situation: "only the archival export is on disk",
    arrange: async (root) => {
      await mkdir(path.join(root, ".visp-intel"), { recursive: true });
      await writeFile(path.join(root, ".visp-intel", "graph.json"), "{}", "utf8");
    }
  },
  {
    reason: "projection_above_read_limit",
    situation: "the projection is above the read limit",
    arrange: async (root) => {
      await writeProjection(root, {
        ...projection(),
        filler: "x".repeat(INTEL_PROJECTION_MAX_BYTES + 1)
      });
    }
  },
  {
    reason: "projection_size_unreadable",
    situation: "the projection cannot be sized",
    arrange: async (root) => {
      await writeProjection(root, projection());
      statMock.mockRejectedValue(syscallError("EIO"));
    }
  },
  {
    reason: "projection_unreadable",
    situation: "the projection is not JSON",
    arrange: async (root) => {
      await mkdir(path.join(root, ".visp-intel", "projection"), { recursive: true });
      await writeFile(
        path.join(root, ".visp-intel", "projection", "graph.json"),
        "{ not json",
        "utf8"
      );
    }
  },
  {
    reason: "projection_shape_mismatch",
    situation: "the archival export is put at the projection path",
    arrange: async (root) => {
      await writeProjection(root, {
        schemaVersion: "1.0",
        repositoryInstanceId: "urn:visp-intel:repository-instance:1.0:sha256:repo",
        headSnapshotId: SNAPSHOT,
        entities: [],
        relations: []
      });
    }
  },
  {
    reason: "projection_snapshot_not_head",
    situation: "the rows describe a snapshot that was not the head",
    arrange: async (root) => {
      const value = projection();
      await writeProjection(root, {
        ...value,
        identity: { ...value.identity, snapshotId: "urn:visp-intel:snapshot:1.0:sha256:older" }
      });
    }
  },
  {
    reason: "projection_indexed_no_files",
    situation: "the projection is valid and indexed nothing",
    arrange: async (root) => {
      const value = projection();
      await writeProjection(root, {
        ...value,
        dictionaries: { ...value.dictionaries, paths: [] },
        nodes: { ...value.nodes, rows: [] },
        edges: { ...value.edges, rows: [] }
      });
    }
  }
];

describe("recording why scan read no intel store", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-intel-absence-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  for (const scenario of absenceScenarios) {
    it(`reports ${scenario.reason} when ${scenario.situation}`, async () => {
      await scenario.arrange(tempDir);

      const loaded = await loadIntelGraph(tempDir);

      expect(loaded.fileGraph).toBeUndefined();
      expect(loaded.storeAbsenceReason).toBe(scenario.reason);
    });
  }

  it("produces exactly the reasons the enumeration declares", async () => {
    const produced: string[] = [];

    for (const scenario of absenceScenarios) {
      await useRealFileSystem();

      const root = await mkdtemp(path.join(os.tmpdir(), "visp-intel-absence-all-"));

      await scenario.arrange(root);
      produced.push(String((await loadIntelGraph(root)).storeAbsenceReason));
      // Before the cleanup, so a scenario's injected failure cannot reach it.
      await useRealFileSystem();
      await rm(root, { recursive: true, force: true });
    }

    expect([...produced].sort()).toEqual([...intelStoreAbsenceReasons].sort());
  });

  it("reports no absence reason when the projection is read", async () => {
    await writeProjection(tempDir, projection());

    const loaded = await loadIntelGraph(tempDir);

    expect(loaded.fileGraph).toBeDefined();
    expect(loaded.storeAbsenceReason).toBeUndefined();
  });
});

describe("reading the intel instance id the last scan recorded", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-intel-provenance-"));
    await mkdir(path.join(tempDir, ".visp", "cache"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeProvenance(value: unknown): Promise<void> {
    await writeFile(
      path.join(tempDir, ".visp", "cache", "intel-scan.json"),
      JSON.stringify(value),
      "utf8"
    );
  }

  /**
   * The compatibility direction that matters at the reader: an artifact written
   * before the absence field exists is still a valid record of a store, and the
   * gate that matches on its instance id must go on matching.
   */
  it("reads a store recorded by a Kit that wrote no absence reason", async () => {
    await writeProvenance({
      generatedAt: "2026-01-01T00:00:00.000Z",
      store: {
        repositoryInstanceId: "urn:visp-intel:repository-instance:1.0:sha256:repo",
        headSnapshotId: SNAPSHOT,
        indexedFileCount: 3
      }
    });

    expect(await readScanIntelInstanceId(tempDir)).toBe(
      "urn:visp-intel:repository-instance:1.0:sha256:repo"
    );
  });

  it("reports no instance id for a null store written before the reason existed", async () => {
    await writeProvenance({ generatedAt: "2026-01-01T00:00:00.000Z", store: null });

    expect(await readScanIntelInstanceId(tempDir)).toBeUndefined();
  });

  it("reports no instance id whatever the reason says", async () => {
    for (const storeAbsenceReason of intelStoreAbsenceReasons) {
      await writeProvenance({
        generatedAt: "2026-01-01T00:00:00.000Z",
        store: null,
        storeAbsenceReason
      });

      expect(await readScanIntelInstanceId(tempDir)).toBeUndefined();
    }
  });
});
