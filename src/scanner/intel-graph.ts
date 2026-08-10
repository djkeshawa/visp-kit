import { stat } from "node:fs/promises";

import { intelGraphArtifactPath, scanMetaArtifactPath } from "../artifacts/artifact-paths.js";
import {
  intelGraphSchema,
  type IntelGraph,
  type IntelGraphEntity
} from "../artifacts/schemas/intel-graph.schema.js";
import { pathExists, readJsonFile } from "../core/file-system.js";
import { toPosixPath } from "../core/paths.js";

/**
 * A repository export is intel's whole graph, and on a large repository that
 * is a very large document. Kit reads it with `JSON.parse`, so an unbounded
 * read is an unbounded allocation inside `visp-kit scan`. Past this size the
 * graph is treated as absent — scan degrades to its own file analysis, which
 * is exactly what it did before intel existed, instead of dying.
 */
export const INTEL_GRAPH_MAX_BYTES = 64 * 1024 * 1024;

export type IntelGraphProjection = {
  readonly repositoryInstanceId: string;
  readonly headSnapshotId: string;
  /** Repository-relative source paths intel indexed, in the head snapshot. */
  readonly filePaths: readonly string[];
  /** File paths holding at least one `test` or `fixture` entity. */
  readonly testFilePaths: readonly string[];
  /** file path -> resolved internal file paths it imports or depends on. */
  readonly internalEdges: ReadonlyMap<string, readonly string[]>;
  /** file path -> external module names it imports. */
  readonly externalEdges: ReadonlyMap<string, readonly string[]>;
};

function normalize(value: string): string {
  return toPosixPath(value).replace(/^\.\//u, "");
}

const dependencyRelationKinds = new Set(["imports", "depends_on"]);
const testEntityKinds = new Set(["test", "fixture"]);

/**
 * Collapse intel's entity graph onto the file grain Kit's `module-map.json`
 * speaks in.
 *
 * Every join in here is on `id`. `canonicalName` and `symbol` are display
 * strings and two entities can share either one; joining on a name is how the
 * Phase 19 false edges were built, and the artifact this feeds is exactly the
 * kind of thing that would quietly inherit them.
 */
export function projectIntelGraph(graph: IntelGraph): IntelGraphProjection {
  const inSnapshot = graph.entities.filter((entity) => entity.snapshotId === graph.headSnapshotId);
  const fileById = new Map<string, string>();
  const externalById = new Map<string, string>();
  const filePaths = new Set<string>();
  const testFilePaths = new Set<string>();

  for (const entity of inSnapshot) {
    if (entity.path !== undefined && entity.path.length > 0) {
      const filePath = normalize(entity.path);
      fileById.set(entity.id, filePath);
      filePaths.add(filePath);
      if (testEntityKinds.has(entity.kind)) testFilePaths.add(filePath);
      continue;
    }

    externalById.set(entity.id, externalName(entity));
  }

  const internalEdges = new Map<string, Set<string>>();
  const externalEdges = new Map<string, Set<string>>();

  for (const relation of graph.relations) {
    if (!dependencyRelationKinds.has(relation.kind)) continue;

    const source = fileById.get(relation.sourceId);
    if (source === undefined) continue;

    const targetFile = fileById.get(relation.targetId);

    if (targetFile !== undefined) {
      // A file importing itself is not a dependency; it is the `contains` edge
      // seen from the wrong side once entities collapse onto their file.
      if (targetFile === source) continue;
      const bucket = internalEdges.get(source) ?? new Set<string>();
      bucket.add(targetFile);
      internalEdges.set(source, bucket);
      continue;
    }

    const external = externalById.get(relation.targetId);
    if (external === undefined || external.length === 0) continue;
    const bucket = externalEdges.get(source) ?? new Set<string>();
    bucket.add(external);
    externalEdges.set(source, bucket);
  }

  return {
    repositoryInstanceId: graph.repositoryInstanceId,
    headSnapshotId: graph.headSnapshotId,
    filePaths: [...filePaths].sort((a, b) => a.localeCompare(b)),
    testFilePaths: [...testFilePaths].sort((a, b) => a.localeCompare(b)),
    internalEdges: sortedMap(internalEdges),
    externalEdges: sortedMap(externalEdges)
  };
}

function externalName(entity: IntelGraphEntity): string {
  const raw = entity.symbol ?? entity.canonicalName;
  // Intel names an external symbol by its module and member. Kit's artifact
  // lists modules, so a member suffix is dropped rather than emitted as a
  // dependency nobody can install.
  return raw.split("#")[0]?.trim() ?? "";
}

function sortedMap(input: Map<string, Set<string>>): ReadonlyMap<string, readonly string[]> {
  return new Map(
    [...input.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => [key, [...values].sort((a, b) => a.localeCompare(b))] as const)
  );
}

/**
 * The intel repository instance the last scan saw, if any.
 *
 * Read from scan meta rather than from the graph so the gate compares a case
 * against what Kit actually indexed, not against whatever graph file happens
 * to be on disk right now.
 */
export async function readScanIntelInstanceId(targetPath: string): Promise<string | undefined> {
  const meta = await readJsonFile<Record<string, unknown>>(scanMetaArtifactPath(targetPath));

  if (!meta.ok) return undefined;

  const intel = meta.value.intel;

  if (intel === null || typeof intel !== "object") return undefined;

  const id = (intel as Record<string, unknown>).repositoryInstanceId;

  return typeof id === "string" && id.length > 0 ? id : undefined;
}

export type IntelGraphLoad = {
  readonly projection?: IntelGraphProjection;
  readonly warnings: readonly string[];
};

/**
 * Load intel's graph if this project has one. Absence is not a failure and
 * never will be: every path out of here that is not a usable graph returns
 * `undefined` plus a warning, and scan carries on with its own analysis.
 */
export async function loadIntelGraph(targetPath: string): Promise<IntelGraphLoad> {
  const graphPath = intelGraphArtifactPath(targetPath);
  const exists = await pathExists(graphPath);

  if (!exists.ok) {
    return { warnings: [`Unable to access intel graph: ${exists.error.message}`] };
  }

  if (!exists.value) return { warnings: [] };

  try {
    const info = await stat(graphPath);

    if (info.size > INTEL_GRAPH_MAX_BYTES) {
      return {
        warnings: [
          `Intel graph is ${info.size} bytes, above the ${INTEL_GRAPH_MAX_BYTES}-byte read limit; used Kit's own file analysis.`
        ]
      };
    }
  } catch (error) {
    return {
      warnings: [`Unable to size intel graph: ${(error as Error).message}`]
    };
  }

  const json = await readJsonFile<unknown>(graphPath);

  if (!json.ok) {
    return { warnings: [`Intel graph is unreadable: ${json.error.message}`] };
  }

  const parsed = intelGraphSchema.safeParse(json.value);

  if (!parsed.success) {
    return {
      warnings: [
        `Intel graph does not match the expected export shape: ${parsed.error.issues[0]?.message ?? "unknown error"}`
      ]
    };
  }

  const projection = projectIntelGraph(parsed.data);

  if (projection.filePaths.length === 0) {
    return {
      warnings: ["Intel graph indexed no files in its head snapshot; used Kit's own file analysis."]
    };
  }

  return { projection, warnings: [] };
}
