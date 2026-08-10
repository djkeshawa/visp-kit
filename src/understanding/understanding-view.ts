import {
  type ContextUnderstanding,
  type ContextUnderstandingPathRow
} from "../artifacts/schemas/context-pack.schema.js";
import {
  type UnderstandingCaseExport,
  type UnderstandingResolutionEntry
} from "../artifacts/schemas/understanding.schema.js";

const MAX_PATH_ROWS = 12;
const MAX_HYPOTHESES = 5;
const MAX_SIGNATURES = 6;
const MAX_AFFECTED_TESTS = 8;
const MAX_UNKNOWNS = 5;

/**
 * The one place a zero-based intel line becomes a one-based editor line.
 *
 * `SourceSpan.start.line` and every `repo.*` answer are zero-based. Printing
 * one directly puts every row of the path one line off — a silent, systematic
 * localisation error that would land in the localisation metric as an intel
 * regression rather than as the rendering bug it is. Converting here, once,
 * means no other module has to remember.
 */
function displayLine(zeroBased: number | null): number | null {
  return zeroBased === null ? null : zeroBased + 1;
}

function hypothesisOrder(status: string): number {
  if (status === "unresolved") return 0;
  if (status === "refuted") return 1;
  return 2;
}

/**
 * Entities the pack is allowed to show code for: everything on the path plus
 * the declared candidate change set.
 *
 * Keyed by entity id throughout. File paths come out of `resolution` at the
 * end; they are never used to decide membership, because two entities can
 * share a file and a file can hold entities that are not on the path.
 */
export function pathMemberEntityIds(value: UnderstandingCaseExport): ReadonlySet<string> {
  const ids = new Set<string>(value.case.candidateChangeEntityIds);

  for (const row of value.path) {
    ids.add(row.sourceId);
    ids.add(row.targetId);
  }

  for (const id of value.case.entrypointIds) ids.add(id);

  return ids;
}

export function entityFilePaths(
  value: UnderstandingCaseExport,
  entityIds: Iterable<string>
): readonly string[] {
  const paths: string[] = [];

  for (const id of entityIds) {
    const entry = value.resolution[id];
    if (entry?.filePath != null && entry.filePath.length > 0) paths.push(entry.filePath);
  }

  return [...new Set(paths)];
}

function signatureRows(value: UnderstandingCaseExport): ContextUnderstanding["signatures"] {
  // Candidate change entities first: those are the ones being edited. Path
  // endpoints fill the remainder up to the budget.
  const ordered = [
    ...value.case.candidateChangeEntityIds,
    ...value.case.entrypointIds,
    ...value.path.flatMap((row) => [row.sourceId, row.targetId])
  ];
  const seen = new Set<string>();
  const rows: { entityId: string; entry: UnderstandingResolutionEntry }[] = [];

  for (const id of ordered) {
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = value.resolution[id];
    if (entry === undefined) continue;
    if (entry.filePath === null) continue;
    rows.push({ entityId: id, entry });
    if (rows.length >= MAX_SIGNATURES) break;
  }

  // ADR 0014 Q3 budgets "3-6" signature lines. Six is a cap Kit can enforce;
  // three is not a floor Kit can manufacture when the case cites fewer
  // resolvable entities than that, so a short list is emitted as-is.
  return rows.map((row) => ({
    entityId: row.entityId,
    displayName: row.entry.displayName,
    filePath: row.entry.filePath,
    line: displayLine(row.entry.startLine),
    signature: row.entry.signature
  }));
}

function pathRows(value: UnderstandingCaseExport): ContextUnderstandingPathRow[] {
  return value.path.slice(0, MAX_PATH_ROWS).map((row) => {
    const source = value.resolution[row.sourceId];
    const target = value.resolution[row.targetId];

    return {
      relationId: row.relationId,
      kind: row.kind,
      sourceId: row.sourceId,
      targetId: row.targetId,
      sourceDisplayName: source?.displayName ?? row.sourceId,
      sourceFilePath: source?.filePath ?? null,
      sourceLine: displayLine(source?.startLine ?? null),
      targetDisplayName: target?.displayName ?? row.targetId,
      targetFilePath: target?.filePath ?? null,
      targetLine: displayLine(target?.startLine ?? null),
      evidenceId: row.evidenceId
    };
  });
}

/**
 * The compact projection the pack carries (ADR 0014 Q3).
 *
 * `pathOrdering` is recorded as `cited` on purpose. Intel stores path relations
 * as a sorted set, so the order a navigator actually visited them in is
 * discarded before the exporter runs and no exporter can recover it. Calling
 * these rows a trace would be a claim the data cannot support.
 */
export function understandingView(input: {
  readonly export: UnderstandingCaseExport;
  readonly current: boolean;
  readonly currentnessReasons: readonly string[];
}): ContextUnderstanding {
  const value = input.export;
  const hypotheses = [...value.case.hypotheses]
    .sort(
      (left, right) =>
        hypothesisOrder(left.status) - hypothesisOrder(right.status) ||
        left.id.localeCompare(right.id)
    )
    .slice(0, MAX_HYPOTHESES)
    .map((hypothesis) => ({
      id: hypothesis.id,
      statement: hypothesis.statement,
      status: hypothesis.status,
      evidenceCount: hypothesis.evidenceIds.length
    }));
  const affectedTests = value.case.affectedTestIds.slice(0, MAX_AFFECTED_TESTS).map((id) => {
    const entry = value.resolution[id];
    return {
      entityId: id,
      filePath: entry?.filePath ?? null,
      line: displayLine(entry?.startLine ?? null)
    };
  });

  return {
    caseId: value.case.id,
    taskId: value.case.taskId,
    snapshotId: value.identity.snapshotId,
    repositoryInstanceId: value.identity.repositoryInstanceId,
    current: input.current,
    currentnessReasons: [...input.currentnessReasons],
    behaviouralQuestion: value.case.behavioralQuestion,
    pathOrdering: "cited",
    path: pathRows(value),
    hypotheses,
    signatures: signatureRows(value),
    affectedTests,
    // Ids only. ADR 0014 Q3 asks for "id + line + risk"; the five-field export
    // carries neither a risk nor a line for unknowns, and `resolution` is
    // entity-keyed so an unknown has nowhere to go. Inventing a shape here
    // would be Kit widening intel's channel on intel's behalf. See the VSP026
    // G5 finding, which says the same thing where it matters.
    unknownIds: value.case.unknownIds.slice(0, MAX_UNKNOWNS),
    counts: { ...value.counts }
  };
}
