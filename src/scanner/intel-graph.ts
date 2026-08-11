import { stat } from "node:fs/promises";

import {
  intelExportArtifactPath,
  intelProjectionArtifactPath,
  intelScanArtifactPath
} from "../artifacts/artifact-paths.js";
import {
  intelProjectionSchema,
  type IntelProjection
} from "../artifacts/schemas/intel-projection.schema.js";
import { intelScanProvenanceSchema } from "../artifacts/schemas/intel-scan.schema.js";
import { pathExists, readJsonFile } from "../core/file-system.js";
import { toPosixPath } from "../core/paths.js";

/** How the two intel artifacts are named in a warning a human has to act on. */
const PROJECTION_DISPLAY_PATH = ".visp-intel/projection/graph.json";
const EXPORT_DISPLAY_PATH = ".visp-intel/graph.json";

/**
 * Kit reads the projection with `JSON.parse`, so an unbounded read is an
 * unbounded allocation inside `visp-kit scan`. Past this size the projection is
 * treated as absent — scan degrades to its own file analysis, which is exactly
 * what it did before intel existed, instead of dying.
 *
 * 16 MiB, because that is intel's OWN encoded bound
 * (`GRAPH_PROJECTION_MAX_ENCODED_BYTES`): intel refuses to build a projection
 * larger than this, so a file above it is not a projection intel produced.
 *
 * The previous limit was 64 MiB and it was sized for the archival export, which
 * is the wrong artifact and roughly seventy times larger. Measured at named
 * commits, the projections are 1.89 MiB (`visp-kit` `9d59cc2`), 1.12 MiB
 * (`visp-hyper-agent` `7813320`), 1.06 MiB (`llm-memory` `ddda824`) and 532 KiB
 * (`visp-dev` `d157dbf`) — the largest has 8.4x headroom here, where its
 * archival export exceeded the old, larger limit by 2x.
 */
export const INTEL_PROJECTION_MAX_BYTES = 16 * 1024 * 1024;

export type IntelFileGraph = {
  readonly repositoryInstanceId: string;
  readonly headSnapshotId: string;
  /** Repository-relative source paths intel indexed, in the projected snapshot. */
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

const dependencyEdgeKinds = new Set(["imports", "depends_on"]);
const testNodeKinds = new Set(["test", "fixture"]);

function columnIndex(columns: readonly string[], name: string): number {
  // The schema refuses a table missing a column Kit reads, so this is total by
  // the time it runs.
  return columns.indexOf(name);
}

function cellNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/**
 * Collapse intel's consumer projection onto the file grain Kit's
 * `module-map.json` speaks in.
 *
 * Every join in here is on ROW INDEX. Intel's contract is explicit that a node
 * `name` is display-only and that two entities named `handler` in two files are
 * two identities; joining on a name is how the Phase 19 false edges were built,
 * and the artifact this feeds is exactly the kind of thing that would quietly
 * inherit them.
 */
export function collapseToFileGraph(projection: IntelProjection): IntelFileGraph {
  const nodePathColumn = columnIndex(projection.nodes.columns, "path");
  const nodeKindColumn = columnIndex(projection.nodes.columns, "kind");
  const nodeNameColumn = columnIndex(projection.nodes.columns, "name");
  const edgeSourceColumn = columnIndex(projection.edges.columns, "source");
  const edgeTargetColumn = columnIndex(projection.edges.columns, "target");
  const edgeKindColumn = columnIndex(projection.edges.columns, "kind");

  const filePaths = new Set<string>();
  const testFilePaths = new Set<string>();
  /** node row index -> its repository-relative path, absent for a node with none. */
  const pathByRow = new Map<number, string>();
  /** node row index -> the module name an import of it names, for a pathless node. */
  const externalByRow = new Map<number, string>();

  projection.nodes.rows.forEach((row, index) => {
    const pathCode = cellNumber(row[nodePathColumn]);
    const kindCode = cellNumber(row[nodeKindColumn]);
    const kind = kindCode === undefined ? undefined : projection.dictionaries.nodeKinds[kindCode];

    if (pathCode !== undefined) {
      const dictionaryPath = projection.dictionaries.paths[pathCode];

      if (dictionaryPath === undefined) return;

      const filePath = normalize(dictionaryPath);

      pathByRow.set(index, filePath);
      filePaths.add(filePath);
      if (kind !== undefined && testNodeKinds.has(kind)) testFilePaths.add(filePath);
      return;
    }

    externalByRow.set(index, externalName(row[nodeNameColumn]));
  });

  const internalEdges = new Map<string, Set<string>>();
  const externalEdges = new Map<string, Set<string>>();

  for (const row of projection.edges.rows) {
    const kindCode = cellNumber(row[edgeKindColumn]);
    const kind = kindCode === undefined ? undefined : projection.dictionaries.edgeKinds[kindCode];

    if (kind === undefined || !dependencyEdgeKinds.has(kind)) continue;

    const sourceRow = cellNumber(row[edgeSourceColumn]);
    const targetRow = cellNumber(row[edgeTargetColumn]);

    if (sourceRow === undefined || targetRow === undefined) continue;

    const source = pathByRow.get(sourceRow);

    if (source === undefined) continue;

    const targetFile = pathByRow.get(targetRow);

    if (targetFile !== undefined) {
      // A file importing itself is not a dependency; it is the `contains` edge
      // seen from the wrong side once entities collapse onto their file.
      if (targetFile === source) continue;
      const bucket = internalEdges.get(source) ?? new Set<string>();
      bucket.add(targetFile);
      internalEdges.set(source, bucket);
      continue;
    }

    const external = externalByRow.get(targetRow);

    if (external === undefined || external.length === 0) continue;

    const bucket = externalEdges.get(source) ?? new Set<string>();
    bucket.add(external);
    externalEdges.set(source, bucket);
  }

  return {
    repositoryInstanceId: projection.identity.repositoryInstanceId,
    headSnapshotId: projection.identity.headSnapshotId,
    filePaths: [...filePaths].sort((a, b) => a.localeCompare(b)),
    testFilePaths: [...testFilePaths].sort((a, b) => a.localeCompare(b)),
    internalEdges: sortedMap(internalEdges),
    externalEdges: sortedMap(externalEdges)
  };
}

function externalName(cell: unknown): string {
  // Intel elides a name that is itself an identifier to `null`; the repository
  // node is the case that matters here, and it is not a module anybody imports.
  if (typeof cell !== "string") return "";
  // Intel names an external symbol by its module and member. Kit's artifact
  // lists modules, so a member suffix is dropped rather than emitted as a
  // dependency nobody can install.
  return cell.split("#")[0]?.trim() ?? "";
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
 * Read from scan's own provenance record rather than from the graph, so the
 * gate compares a case against what Kit actually indexed, not against whatever
 * graph file happens to be on disk right now.
 *
 * That record used to be an `intel` key on `.visp/cache/scan-meta.json` and is
 * now `.visp/cache/intel-scan.json`. There is deliberately NO fallback to the
 * old key: keeping a reader for it would keep the artifact-contract change
 * alive in everything but name. A project last scanned before this change has
 * no provenance file, so `understandingCurrentness` reports that it has nothing
 * to match against and the behavioural gate stays closed until the project is
 * re-scanned — the safe direction, and one `visp-kit scan` away.
 */
export async function readScanIntelInstanceId(targetPath: string): Promise<string | undefined> {
  const raw = await readJsonFile<unknown>(intelScanArtifactPath(targetPath));

  if (!raw.ok) return undefined;

  const parsed = intelScanProvenanceSchema.safeParse(raw.value);

  if (!parsed.success || parsed.data.store === null) return undefined;

  return parsed.data.store.repositoryInstanceId;
}

export type IntelGraphLoad = {
  readonly fileGraph?: IntelFileGraph;
  readonly warnings: readonly string[];
};

/**
 * Load intel's consumer projection if this project has one. Absence is not a
 * failure and never will be: every path out of here that is not a usable
 * projection returns no file graph plus, where a human could act on it, a
 * warning — and scan carries on with its own analysis.
 *
 * A project with no `.visp-intel/` at all is the common case and stays silent.
 * A project holding the ARCHIVAL export and no projection is warned, because
 * that project has intel and is one command away from scan reading it; scan
 * used to read that file and no longer does.
 */
export async function loadIntelGraph(targetPath: string): Promise<IntelGraphLoad> {
  const projectionPath = intelProjectionArtifactPath(targetPath);
  const exists = await pathExists(projectionPath);

  if (!exists.ok) {
    return { warnings: [`Unable to access ${PROJECTION_DISPLAY_PATH}: ${exists.error.message}`] };
  }

  if (!exists.value) return { warnings: await missingProjectionWarnings(targetPath) };

  try {
    const info = await stat(projectionPath);

    if (info.size > INTEL_PROJECTION_MAX_BYTES) {
      return {
        warnings: [
          `Intel consumer projection ${PROJECTION_DISPLAY_PATH} is ${info.size} bytes, above the ${INTEL_PROJECTION_MAX_BYTES}-byte read limit; used Kit's own file analysis.`
        ]
      };
    }
  } catch (error) {
    return {
      warnings: [`Unable to size ${PROJECTION_DISPLAY_PATH}: ${(error as Error).message}`]
    };
  }

  const json = await readJsonFile<unknown>(projectionPath);

  if (!json.ok) {
    return { warnings: [`Intel consumer projection is unreadable: ${json.error.message}`] };
  }

  const parsed = intelProjectionSchema.safeParse(json.value);

  if (!parsed.success) {
    return {
      warnings: [
        `${PROJECTION_DISPLAY_PATH} does not match intel's consumer-projection shape: ${parsed.error.issues[0]?.message ?? "unknown error"}. Rebuild it with \`visp-intel repo projection\`; the archival \`repo export\` is a different artifact and scan no longer reads it.`
      ]
    };
  }

  // Staleness is Kit's call: intel states both snapshot ids and carries no
  // stale/ready flag. Kit's judgement is narrow and so is this warning — rows
  // material in a snapshot that is not the head describe a tree that is not
  // this one, and a module map is a statement about this one. It does NOT
  // detect a projection older than the working tree: both ids move together
  // when the repository is re-indexed, and nothing in the artifact can tell Kit
  // when that last happened.
  if (parsed.data.identity.snapshotId !== parsed.data.identity.headSnapshotId) {
    return {
      warnings: [
        `Intel consumer projection ${PROJECTION_DISPLAY_PATH} describes a snapshot that was not the repository head when it was built; used Kit's own file analysis.`
      ]
    };
  }

  const fileGraph = collapseToFileGraph(parsed.data);

  if (fileGraph.filePaths.length === 0) {
    return {
      warnings: [
        "Intel consumer projection indexed no files in its snapshot; used Kit's own file analysis."
      ]
    };
  }

  return { fileGraph, warnings: [] };
}

async function missingProjectionWarnings(targetPath: string): Promise<readonly string[]> {
  const archival = await pathExists(intelExportArtifactPath(targetPath));

  if (!archival.ok || !archival.value) return [];

  return [
    `Found ${EXPORT_DISPLAY_PATH} but no ${PROJECTION_DISPLAY_PATH}; scan reads the consumer projection now. Run \`visp-intel repo projection\` to make the graph reach the module map.`
  ];
}
