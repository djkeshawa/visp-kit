import { isSafeIntelTaskId, understandingExportArtifactPath } from "../artifacts/artifact-paths.js";
import { optionalArtifact } from "../artifacts/optional-artifact.js";
import {
  understandingCaseExportSchema,
  type UnderstandingCaseExport
} from "../artifacts/schemas/understanding.schema.js";

/**
 * Ids the `resolution` map is allowed to hold: exactly the closure reachable
 * from `case`, nothing else.
 *
 * A key Kit cannot reach from the case is intel widening its own channel — it
 * would be evidence nobody asked for, arriving through a contract that says it
 * cannot. ADR 0014 Q1 lets Kit reject such an export, so it does.
 */
export function resolutionClosure(
  caseValue: UnderstandingCaseExport["case"],
  path: UnderstandingCaseExport["path"]
): ReadonlySet<string> {
  const ids = new Set<string>([
    ...caseValue.entrypointIds,
    ...caseValue.candidateChangeEntityIds,
    ...caseValue.affectedUnchangedEntityIds,
    ...caseValue.affectedTestIds,
    ...caseValue.validationSuggestions.flatMap((suggestion) => suggestion.entityIds)
  ]);

  // `case.relationIds` carries relation ids, not entity ids; the endpoints only
  // become reachable through the rows in `path`, which is why the closure is
  // computed over both and not over the case alone.
  for (const row of path) {
    ids.add(row.sourceId);
    ids.add(row.targetId);
  }

  return ids;
}

/**
 * Structural objections that make an export unusable as evidence.
 *
 * Each one is a disagreement inside the artifact itself, not a disagreement
 * with the repository (that is staleness, decided separately). An artifact
 * that contradicts itself is not stale evidence, it is not evidence.
 */
export function understandingExportObjections(value: UnderstandingCaseExport): readonly string[] {
  const objections: string[] = [];

  // Checked first and separately: authority is the whole reason Kit is allowed
  // to read intel output at all.
  if (value.case.authority !== "descriptive") {
    objections.push(`case.authority is "${value.case.authority}", not "descriptive".`);
  }

  if (value.case.authorizationEffect !== "none") {
    objections.push(`case.authorizationEffect is "${value.case.authorizationEffect}", not "none".`);
  }

  if (objections.length > 0) return objections;

  if (value.case.snapshotId !== value.identity.snapshotId) {
    objections.push("case.snapshotId and identity.snapshotId name different snapshots.");
  }

  const countMismatches: string[] = [];
  const expected: readonly (readonly [string, number, number])[] = [
    ["entrypoints", value.counts.entrypoints, value.case.entrypointIds.length],
    ["pathRelations", value.counts.pathRelations, value.path.length],
    ["candidateChanges", value.counts.candidateChanges, value.case.candidateChangeEntityIds.length],
    [
      "affectedUnchanged",
      value.counts.affectedUnchanged,
      value.case.affectedUnchangedEntityIds.length
    ],
    ["affectedTests", value.counts.affectedTests, value.case.affectedTestIds.length],
    ["unknowns", value.counts.unknowns, value.case.unknownIds.length]
  ];

  for (const [name, counted, actual] of expected) {
    if (counted !== actual) countMismatches.push(`${name} (${counted} vs ${actual})`);
  }

  if (countMismatches.length > 0) {
    // The gate reads `counts` instead of walking arrays. That is only sound
    // while the two agree, so a disagreement disqualifies the whole artifact
    // rather than picking a winner.
    objections.push(`counts disagree with the case arrays: ${countMismatches.join(", ")}.`);
  }

  const closure = resolutionClosure(value.case, value.path);
  const unreferenced = Object.keys(value.resolution).filter((id) => !closure.has(id));

  if (unreferenced.length > 0) {
    objections.push(
      `resolution holds ${unreferenced.length} key(s) unreachable from the case, e.g. ${unreferenced[0]}.`
    );
  }

  const unresolved = [...closure].filter((id) => value.resolution[id] === undefined);

  if (unresolved.length > 0) {
    objections.push(
      `resolution is partial: ${unresolved.length} cited id(s) have no entry, e.g. ${unresolved[0]}.`
    );
  }

  return objections;
}

export type UnderstandingCurrentness = {
  readonly current: boolean;
  readonly reasons: readonly string[];
};

/**
 * Staleness is EXPRESSED by intel and DECIDED here (ADR 0014 Q1).
 *
 * The identity comparison is on `repositoryInstanceId`, never on a directory
 * path: a re-clone or a sibling worktree mounted at the same path is a
 * different repository instance and must not inherit another instance's case.
 *
 * A stale case never fails a command. It simply does not satisfy the gate and
 * is not rendered into the pack.
 */
export function understandingCurrentness(input: {
  readonly export: UnderstandingCaseExport;
  readonly scanRepositoryInstanceId?: string;
  readonly baseCommit?: string;
}): UnderstandingCurrentness {
  const identity = input.export.identity;
  const reasons: string[] = [];

  if (identity.snapshotId !== identity.headSnapshotId) {
    reasons.push("the indexed snapshot is behind repository head");
  }

  if (input.scanRepositoryInstanceId === undefined) {
    reasons.push("scan meta records no intel repository instance id to match against");
  } else if (input.scanRepositoryInstanceId !== identity.repositoryInstanceId) {
    reasons.push("the case belongs to a different repository instance");
  }

  if (input.baseCommit === undefined) {
    reasons.push("the context pack records no base commit to match against");
  } else if (identity.gitCommit === null) {
    reasons.push("the repository was indexed without git identity");
  } else if (identity.gitCommit !== input.baseCommit) {
    reasons.push("the case was exported at a different commit");
  }

  if (identity.dirty !== false) {
    reasons.push(
      identity.dirty === null
        ? "the worktree cleanliness is unknown"
        : "the worktree was dirty at export time"
    );
  }

  return { current: reasons.length === 0, reasons };
}

/**
 * Read the export for one task. Absence degrades: missing, unreadable,
 * schema-invalid and self-contradictory all yield a warning plus `undefined`,
 * which is today's behaviour exactly.
 */
export async function readUnderstandingExport(input: {
  readonly targetPath: string;
  readonly taskId: string;
  readonly warnings: string[];
}): Promise<UnderstandingCaseExport | undefined> {
  if (!isSafeIntelTaskId(input.taskId)) {
    input.warnings.push(
      `Task id ${input.taskId} cannot name an understanding export file; skipped.`
    );
    return undefined;
  }

  const value = await optionalArtifact({
    path: understandingExportArtifactPath(input.targetPath, input.taskId),
    schema: understandingCaseExportSchema,
    artifactName: "understanding case export",
    warnings: input.warnings
  });

  if (value === undefined) return undefined;

  if (value.case.taskId !== input.taskId) {
    input.warnings.push(
      `Understanding case export names task ${value.case.taskId}, not ${input.taskId}; ignored.`
    );
    return undefined;
  }

  const objections = understandingExportObjections(value);

  if (objections.length > 0) {
    input.warnings.push(`Understanding case export rejected: ${objections.join(" ")}`);
    return undefined;
  }

  return value;
}
