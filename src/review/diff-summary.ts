import { type ReviewChangedFile } from "../artifacts/schemas/review.schema.js";
import { idSchema } from "../artifacts/schemas/common.schema.js";

import { isDependencyFile as isKnownDependencyFile } from "../dependencies/dependency-files.js";

export function normalizeReviewPath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function isDependencyFile(filePath: string): boolean {
  return isKnownDependencyFile(filePath);
}

export function isTestFile(filePath: string): boolean {
  const normalized = normalizeReviewPath(filePath).toLowerCase();

  return (
    /(^|\/)(tests?|__tests__)\//.test(normalized) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
    /_test\.go$/.test(normalized) ||
    /(?:test|tests)\.java$/.test(normalized) ||
    /(^|\/)test_[^/]+\.py$/.test(normalized) ||
    /_test\.py$/.test(normalized) ||
    /_test\.rs$/.test(normalized)
  );
}

export function isGeneratedVispReviewFile(filePath: string): boolean {
  const taskMarker = /^\.visp\/state\/implement-allowed\/([^/]+)\.json$/.exec(filePath);
  const isImplementMarker =
    filePath === ".visp/state/implement-allowed.json" ||
    (taskMarker !== null && idSchema.safeParse(taskMarker[1]).success);

  return (
    isImplementMarker ||
    // `.visp/hyper/` belongs to visp-hyper-agent, not to Kit and not to the
    // user. Kit's allowlist is maintained per-path and had never heard of the
    // sibling product, so every Hyper command — including the ones that drive
    // Kit — wrote `.visp/hyper/state.json` and Kit then reported it as an
    // unattributed out-of-scope source change against the user's task.
    //
    // Dogfooding surfaced it immediately: `visp check` on a first real feature
    // failed with the toolchain's own state files listed as scope violations.
    // Using the products together made their own gate fail.
    filePath.startsWith(".visp/hyper/") ||
    filePath.startsWith(".visp/reports/") ||
    filePath.startsWith(".visp/cache/") ||
    filePath.startsWith(".visp/runs/") ||
    filePath.startsWith(".visp/agent/") ||
    filePath.startsWith(".visp/presets/") ||
    filePath === ".visp/status.json" ||
    filePath === ".visp/project.json" ||
    filePath === ".visp/budget.json" ||
    filePath === ".visp/workflow.json" ||
    filePath === ".visp/memory/patterns.md" ||
    filePath === ".visp/memory/project-summary.md" ||
    /^\.visp\/prompts\/.+\.prompt\.md$/.test(filePath) ||
    /^\.visp\/features\/[^/]+\/timeline\.(json|md)$/.test(filePath) ||
    // Feature markdown is a derived view of the validated JSON beside it: the
    // validate paths and reconcile's task-status mutation regenerate it, so it
    // is tool-owned and must not surface as an unattributed scope finding.
    /^\.visp\/features\/[^/]+\/(spec|plan|tasks|clarifications|traceability)\.md$/.test(filePath) ||
    filePath === ".visp/prompts/review.prompt.md" ||
    filePath === ".visp/prompts/reconcile.prompt.md" ||
    /^\.visp\/features\/[^/]+\/context\/[^/]+\.implementation-checklist\.(json|md)$/.test(
      filePath
    ) ||
    /^\.visp\/features\/[^/]+\/review\//.test(filePath) ||
    /^\.visp\/features\/[^/]+\/review\.(json|md)$/.test(filePath) ||
    /^\.visp\/features\/[^/]+\/review-(prompt|checklist)\.md$/.test(filePath) ||
    /^\.visp\/features\/[^/]+\/reconcile\//.test(filePath) ||
    /^\.visp\/features\/[^/]+\/reconcile\.(json|md)$/.test(filePath) ||
    /^\.visp\/features\/[^/]+\/reconcile-prompt\.md$/.test(filePath) ||
    /^\.visp\/features\/[^/]+\/verification\.(json|md)$/.test(filePath) ||
    isGeneratedAssuranceFile(filePath)
  );
}

const generatedAssuranceFileNames = new Set([
  "assurance-case.json",
  "assurance-case.md",
  "baseline-evidence.json",
  "candidate-evidence.json",
  "diff-snapshot.json",
  "oracle-approval.json",
  "oracle-lock.json",
  "oracle-plan.json",
  "review-decision.json"
]);

/**
 * Only the files Visp itself writes under an assurance directory count as
 * generated. A catch-all over the directory would also hide anything an agent
 * dropped there from `codeIdentity`, `currentCodeMatches`, scope validation,
 * the candidate workspace fingerprints, and the hotspot detectors.
 */
function isGeneratedAssuranceFile(filePath: string): boolean {
  const assurance = /^\.visp\/features\/[^/]+\/assurance\/[^/]+\/(.+)$/.exec(filePath);

  if (assurance === null) return false;

  const remainder = assurance[1] ?? "";
  const history = /^review-decisions\/([a-f0-9]{64})\.json$/.exec(remainder);
  const historyTemporary =
    /^review-decisions\/\.[a-f0-9]{64}\.json\.\d+\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/u.exec(
      remainder
    );
  const pointerLockOwner =
    /^review-decision\.json\.lock\/owner-\d+-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/u.test(
      remainder
    );
  const pointerLockCandidateOwner =
    /^\.review-decision\.json\.lock\.(\d+)\.([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.candidate\/owner-\1-\2\.json$/u.test(
      remainder
    );

  return (
    history !== null ||
    historyTemporary !== null ||
    pointerLockOwner ||
    pointerLockCandidateOwner ||
    generatedAssuranceFileNames.has(remainder)
  );
}

export function summarizeDiff(input: {
  readonly changedFiles: readonly ReviewChangedFile[];
  readonly diffSource: string;
  readonly baseRef?: string | null;
}): {
  readonly filesChanged: number;
  readonly additions: number;
  readonly deletions: number;
  readonly truncatedFiles: number;
  readonly totalDiffTruncated: boolean;
  readonly diffSource: string;
  readonly baseRef: string | null;
} {
  return {
    filesChanged: input.changedFiles.length,
    additions: input.changedFiles.reduce((total, file) => total + file.additions, 0),
    deletions: input.changedFiles.reduce((total, file) => total + file.deletions, 0),
    truncatedFiles: input.changedFiles.filter((file) => file.diffTruncated).length,
    totalDiffTruncated: input.changedFiles.some((file) => file.diffTruncated),
    diffSource: input.diffSource,
    baseRef: input.baseRef ?? null
  };
}
