import { type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { type DriftFinding, type DriftKind } from "../artifacts/schemas/drift.schema.js";
import { type ImplementMarker } from "../artifacts/schemas/implement-marker.schema.js";
import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";
import { type VerificationReport } from "../artifacts/schemas/verification.schema.js";

export type DriftFindingDraft = Omit<DriftFinding, "id">;

/**
 * Current on-disk state supplied by the workflow: for every path referenced by
 * an artifact, whether it exists and (for hashed comparisons) its current
 * SHA256 content hash. Paths are repo-relative POSIX paths as stored in
 * artifacts.
 */
export type CurrentFileState = {
  readonly exists: (path: string) => boolean;
  readonly hash: (path: string) => string | undefined;
  /**
   * The canonical content hash of a retrieval input, for provenance entries
   * recorded with `hashScope: "content"`.
   *
   * `undefined` from this function means the check could not be RUN — the
   * artifact is not in a shape the reduction recognises — and never means the
   * input changed.
   */
  readonly contentHash?: (path: string, label: string) => string | undefined;
};

function draft(input: DriftFindingDraft): DriftFindingDraft {
  return input;
}

export function checkStaleContextProvenance(
  pack: ContextPack,
  files: CurrentFileState
): readonly DriftFindingDraft[] {
  return pack.artifactProvenance.flatMap((provenance) => {
    const contentScoped = provenance.hashScope === "content";
    const actual = contentScoped
      ? files.contentHash?.(provenance.path, provenance.label)
      : files.hash(provenance.path);

    // Three states, not two, for a content-scoped input: PRESENT, GONE, and
    // "could not check". Only the file's absence is a missing verdict. An
    // artifact that is on disk but whose canonical reduction could not be
    // computed is UNVERIFIED — it may be identical, it may not — and inferring
    // staleness from an unavailable check would report drift on the strength of
    // Kit's own inability to look.
    if (contentScoped && actual === undefined && files.exists(provenance.path)) {
      return [];
    }

    if (actual === undefined) {
      return [
        draft({
          kind: "stale_context_provenance",
          severity: "error",
          taskId: pack.taskId,
          file: provenance.path,
          expectedHash: provenance.hash,
          actualHash: null,
          evidence: `Context pack for ${pack.taskId} was grounded on ${provenance.label} (${provenance.path}), which no longer exists.`,
          recommendation: `Regenerate the context pack: visp-kit context ${pack.taskId}.`
        })
      ];
    }

    if (actual !== provenance.hash) {
      return [
        draft({
          kind: "stale_context_provenance",
          severity: "error",
          taskId: pack.taskId,
          file: provenance.path,
          expectedHash: provenance.hash,
          actualHash: actual,
          evidence: `${provenance.label} (${provenance.path}) changed after the context pack for ${pack.taskId} was compiled.`,
          recommendation: `Regenerate the context pack: visp-kit context ${pack.taskId}.`
        })
      ];
    }

    return [];
  });
}

export function checkCodeChangedAfterContext(
  pack: ContextPack,
  files: CurrentFileState
): readonly DriftFindingDraft[] {
  const taskInProgress =
    pack.selectedTask.status !== "done" && pack.selectedTask.status !== "verified";

  return pack.includedFiles.flatMap((file) => {
    const actual = files.hash(file.path);

    // New files the task is expected to create have no stable baseline.
    if (file.includeMode === "new-file") return [];
    if (actual === undefined || actual === file.hash) return [];

    return [
      draft({
        kind: "code_changed_after_context",
        severity: taskInProgress ? "error" : "warning",
        taskId: pack.taskId,
        file: file.path,
        expectedHash: file.hash,
        actualHash: actual,
        evidence: `${file.path} changed after the context pack for ${pack.taskId} was compiled.`,
        recommendation:
          pack.selectedTask.status === "done" || pack.selectedTask.status === "verified"
            ? `Task ${pack.taskId} is complete; regenerate context before reusing it.`
            : `Refresh the context pack (visp-kit context ${pack.taskId}) so the agent works from current code.`
      })
    ];
  });
}

function isConcretePath(value: string): boolean {
  const trimmed = value.trim();

  // Task scopes may carry TBD placeholders and descriptive rules (for example
  // "Dependency manifests unless approved"); only real paths are checkable.
  return trimmed.length > 0 && trimmed.toUpperCase() !== "TBD" && !trimmed.includes(" ");
}

export function checkScopePathMissing(
  taskGraph: TaskGraphArtifact,
  files: CurrentFileState
): readonly DriftFindingDraft[] {
  return taskGraph.tasks.flatMap((task) => {
    const findings: DriftFindingDraft[] = [];
    const taskComplete = task.status === "done" || task.status === "verified";

    for (const path of task.allowedFiles.filter(isConcretePath)) {
      if (!files.exists(path)) {
        findings.push(
          draft({
            kind: "scope_path_missing",
            severity: taskComplete ? "warning" : "error",
            taskId: task.id,
            file: path,
            expectedHash: null,
            actualHash: null,
            evidence: `allowedFiles entry ${path} for ${task.id} does not exist.`,
            recommendation: `Update ${task.id} allowedFiles or restore the file.`
          })
        );
      }
    }

    // expectedFiles are files-to-create: only flag them once the task claims
    // to be complete but the file still is not there. forbiddenFiles entries
    // are frequently descriptive rules rather than paths, so they are not
    // existence-checked at all.
    if (taskComplete) {
      for (const path of (task.expectedFiles ?? []).filter(isConcretePath)) {
        if (!files.exists(path)) {
          findings.push(
            draft({
              kind: "scope_path_missing",
              severity: "error",
              taskId: task.id,
              file: path,
              expectedHash: null,
              actualHash: null,
              evidence: `${task.id} is ${task.status} but expected file ${path} does not exist.`,
              recommendation: `Restore ${path} or reopen ${task.id}.`
            })
          );
        }
      }
    }

    return findings;
  });
}

export function checkMappedTestMissing(input: {
  readonly testMapPaths: readonly string[];
  readonly traceability?: TraceabilityMatrix;
  readonly files: CurrentFileState;
}): readonly DriftFindingDraft[] {
  const findings: DriftFindingDraft[] = [];
  const seen = new Set<string>();

  for (const path of input.testMapPaths) {
    if (!seen.has(path) && !input.files.exists(path)) {
      seen.add(path);
      findings.push(
        draft({
          kind: "mapped_test_missing",
          severity: "warning",
          taskId: null,
          file: path,
          expectedHash: null,
          actualHash: null,
          evidence: `Test file ${path} from the scan test map no longer exists.`,
          recommendation: "Run visp-kit scan to refresh the cache."
        })
      );
    }
  }

  for (const entry of input.traceability?.entries ?? []) {
    for (const path of entry.testPaths) {
      if (!seen.has(path) && !input.files.exists(path)) {
        seen.add(path);
        findings.push(
          draft({
            kind: "mapped_test_missing",
            severity: "warning",
            taskId: entry.taskIds[0] ?? null,
            file: path,
            expectedHash: null,
            actualHash: null,
            evidence: `Traceability maps ${entry.requirementId} to test ${path}, which no longer exists.`,
            recommendation: "Run visp-kit reconcile --update-traceability to refresh the mapping."
          })
        );
      }
    }
  }

  return findings;
}

export function checkSpecEditedAfterTasks(input: {
  readonly spec?: SpecArtifact;
  readonly taskGraph?: TaskGraphArtifact;
}): readonly DriftFindingDraft[] {
  if (input.spec === undefined || input.taskGraph === undefined) return [];
  if (input.spec.updatedAt <= input.taskGraph.updatedAt) return [];

  return [
    draft({
      kind: "spec_edited_after_tasks",
      severity: "warning",
      taskId: null,
      file: null,
      expectedHash: null,
      actualHash: null,
      evidence: `Spec was updated at ${input.spec.updatedAt}, after the task graph (${input.taskGraph.updatedAt}).`,
      recommendation: "Re-run visp-kit tasks so the task graph reflects the current spec."
    })
  ];
}

export function checkMarkerTaskMismatch(input: {
  readonly marker?: ImplementMarker;
  readonly taskGraph?: TaskGraphArtifact;
}): readonly DriftFindingDraft[] {
  if (input.marker === undefined || input.taskGraph === undefined) return [];

  const task = input.taskGraph.tasks.find((candidate) => candidate.id === input.marker?.taskId);

  if (task === undefined) {
    return [
      draft({
        kind: "marker_task_mismatch",
        severity: "error",
        taskId: input.marker.taskId,
        file: null,
        expectedHash: null,
        actualHash: null,
        evidence: `Implement authorization exists for ${input.marker.taskId}, but that task is not in the task graph.`,
        recommendation: `Re-run visp-kit gate implement --task <task-id> for a current task.`
      })
    ];
  }

  if (!markerMatchesTask(input.marker, task)) {
    return [
      draft({
        kind: "marker_task_mismatch",
        severity: "error",
        taskId: task.id,
        file: null,
        expectedHash: null,
        actualHash: null,
        evidence: `Task ${task.id} scope changed after its implement authorization was granted.`,
        recommendation: `Re-run visp-kit gate implement --task ${task.id} to authorize the current scope.`
      })
    ];
  }

  return [];
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();

  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function markerMatchesTask(marker: ImplementMarker, task: Task): boolean {
  return (
    sameList(marker.allowedFiles, task.allowedFiles) &&
    sameList(marker.expectedFiles, task.expectedFiles ?? []) &&
    sameList(marker.forbiddenFiles, task.forbiddenFiles ?? [])
  );
}

export function checkEvidencePredatesChange(input: {
  readonly verification?: VerificationReport;
  readonly taskGraph?: TaskGraphArtifact;
}): readonly DriftFindingDraft[] {
  if (input.verification === undefined || input.taskGraph === undefined) return [];
  if (input.verification.endedAt >= input.taskGraph.updatedAt) return [];

  return [
    draft({
      kind: "evidence_predates_change",
      severity: "warning",
      taskId: input.verification.taskId ?? null,
      file: null,
      expectedHash: null,
      actualHash: null,
      evidence: `Verification evidence ended at ${input.verification.endedAt}, before the task graph changed (${input.taskGraph.updatedAt}).`,
      recommendation: "Re-run visp-kit verify so evidence covers the current task definitions."
    })
  ];
}

export type DriftCheckInput = {
  readonly taskGraph?: TaskGraphArtifact;
  readonly spec?: SpecArtifact;
  readonly verification?: VerificationReport;
  readonly traceability?: TraceabilityMatrix;
  readonly marker?: ImplementMarker;
  readonly contextPacks: readonly ContextPack[];
  readonly testMapPaths: readonly string[];
  readonly files: CurrentFileState;
};

export function runDriftChecks(input: DriftCheckInput): readonly DriftFinding[] {
  const drafts: DriftFindingDraft[] = [
    ...input.contextPacks.flatMap((pack) => checkStaleContextProvenance(pack, input.files)),
    ...input.contextPacks.flatMap((pack) => checkCodeChangedAfterContext(pack, input.files)),
    ...(input.taskGraph === undefined ? [] : checkScopePathMissing(input.taskGraph, input.files)),
    ...checkMappedTestMissing({
      testMapPaths: input.testMapPaths,
      traceability: input.traceability,
      files: input.files
    }),
    ...checkSpecEditedAfterTasks(input),
    ...checkMarkerTaskMismatch(input),
    ...checkEvidencePredatesChange(input)
  ];

  return drafts.map((finding, index) => ({
    ...finding,
    id: `DRF-${String(index + 1).padStart(3, "0")}`
  }));
}

export function summarizeDriftFindings(
  findings: readonly DriftFinding[]
): Record<DriftKind, number> {
  const summary: Record<DriftKind, number> = {
    stale_context_provenance: 0,
    code_changed_after_context: 0,
    scope_path_missing: 0,
    mapped_test_missing: 0,
    spec_edited_after_tasks: 0,
    marker_task_mismatch: 0,
    evidence_predates_change: 0
  };

  for (const finding of findings) {
    summary[finding.kind] += 1;
  }

  return summary;
}
