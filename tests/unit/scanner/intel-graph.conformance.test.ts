import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { intelProjectionSchema } from "../../../src/artifacts/schemas/intel-projection.schema.js";
import { collapseToFileGraph, loadIntelGraph } from "../../../src/scanner/intel-graph.js";

/**
 * LC-28: the file-grain collapse rule has more than one implementation — Kit's
 * `collapseToFileGraph` is one of them — and intel pins the rule with
 * conformance vectors so the copies cannot drift silently. This suite runs
 * Kit's copy against the vendored vectors; a divergence goes red HERE, in Kit's
 * own CI, instead of surfacing later as a module map that disagrees with the
 * graph intel published. Provenance and the deliberately-unconformed subset are
 * recorded in the fixture directory's VENDORED.md.
 */
const VECTOR_DIR = path.join(__dirname, "..", "..", "fixtures", "vectors", "file-grain-collapse");

function vectorBytes(name: string): Buffer {
  return readFileSync(path.join(VECTOR_DIR, name));
}

function vectorJson<T>(name: string): T {
  return JSON.parse(vectorBytes(name).toString("utf8")) as T;
}

type ExpectedEdgeList = readonly { readonly file: string; readonly targets: readonly string[] }[];

type ExpectedFileGrain = {
  readonly collapseVersion: string;
  readonly identity: { readonly repositoryInstanceId: string; readonly headSnapshotId: string };
  readonly expected: {
    readonly filePaths: readonly string[];
    readonly testFilePaths: readonly string[];
    readonly dependencyEdges: ExpectedEdgeList;
    readonly externalDependencies: ExpectedEdgeList;
    readonly testEdges: ExpectedEdgeList;
    readonly counts: Record<string, number>;
  };
};

type Manifest = {
  readonly documents: Record<string, { readonly bytes: number; readonly sha256: string }>;
  readonly fixtureSources: { readonly bytes: number; readonly sha256: string };
};

function edgeList(edges: ReadonlyMap<string, readonly string[]>): ExpectedEdgeList {
  return [...edges.entries()].map(([file, targets]) => ({ file, targets }));
}

function pairCount(edges: ReadonlyMap<string, readonly string[]>): number {
  return [...edges.values()].reduce((total, targets) => total + targets.length, 0);
}

describe("file-grain collapse conformance vectors", () => {
  it("holds the exact bytes the manifest pins, so the pin cannot rot in place", () => {
    const manifest = vectorJson<Manifest>("manifest.json");
    const pinned = { ...manifest.documents, "fixture-sources.json": manifest.fixtureSources };

    for (const [name, expected] of Object.entries(pinned)) {
      const bytes = vectorBytes(name);

      expect(bytes.byteLength, `${name} byte length`).toBe(expected.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), `${name} sha256`).toBe(
        expected.sha256
      );
    }
  });

  it("collapses the pinned projection to exactly the pinned file grain, order included", () => {
    const vector = vectorJson<ExpectedFileGrain>("expected-file-grain.json");
    const projection = intelProjectionSchema.parse(vectorJson<unknown>("projection.json"));

    const collapsed = collapseToFileGraph(projection);

    expect(collapsed.repositoryInstanceId).toBe(vector.identity.repositoryInstanceId);
    expect(collapsed.headSnapshotId).toBe(vector.identity.headSnapshotId);
    // toEqual on arrays asserts the order too, which is part of the contract:
    // UTF-16 code unit ascending, never locale collation. The fixture's
    // `src/service/Router.ts` / `src/service/api.ts` pair exists to tell the
    // two orderings apart.
    expect(collapsed.filePaths).toEqual(vector.expected.filePaths);
    expect(collapsed.testFilePaths).toEqual(vector.expected.testFilePaths);
    expect(edgeList(collapsed.internalEdges)).toEqual(vector.expected.dependencyEdges);
    expect(edgeList(collapsed.externalEdges)).toEqual(vector.expected.externalDependencies);
    expect(edgeList(collapsed.testEdges)).toEqual(vector.expected.testEdges);
  });

  it("reproduces the pinned counts for every shape Kit collapses", () => {
    const vector = vectorJson<ExpectedFileGrain>("expected-file-grain.json");
    const projection = intelProjectionSchema.parse(vectorJson<unknown>("projection.json"));

    const collapsed = collapseToFileGraph(projection);

    expect(collapsed.filePaths.length).toBe(vector.expected.counts.files);
    expect(collapsed.testFilePaths.length).toBe(vector.expected.counts.testFiles);
    expect(pairCount(collapsed.internalEdges)).toBe(vector.expected.counts.dependencyEdges);
    expect(pairCount(collapsed.externalEdges)).toBe(vector.expected.counts.externalDependencies);
    expect(pairCount(collapsed.testEdges)).toBe(vector.expected.counts.testEdges);
  });

  describe("the superseded projection", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-collapse-vectors-"));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    // Intel ships no stale flag, only two snapshot ids; refusing to build a
    // module map from a projection of a superseded snapshot is Kit's own
    // judgement, and this vector is the pinned case for it.
    it("is refused by loadIntelGraph, because its snapshot is no longer head", async () => {
      await mkdir(path.join(tempDir, ".visp-intel", "projection"), { recursive: true });
      await writeFile(
        path.join(tempDir, ".visp-intel", "projection", "graph.json"),
        vectorBytes("projection-superseded.json")
      );

      const load = await loadIntelGraph(tempDir);

      expect(load.fileGraph).toBeUndefined();
      expect(load.warnings.join("\n")).toContain("was not the repository head");
    });
  });
});
