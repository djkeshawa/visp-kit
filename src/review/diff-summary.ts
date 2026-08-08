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
    // Project-root files the TOOLCHAIN creates during setup, not the user.
    //
    // On a first real feature `visp check` reported five out-of-scope files
    // and four of them were these: `.mcp.json` from `visp setup`, `AGENTS.md`
    // from the agent installer, `visp-memory.yaml` from `visp-memory init`.
    // Every task in every project would violate scope for having been set up.
    //
    // These are user-editable in principle, which is why this took a decision
    // rather than being obvious. It goes this way because the cost is
    // asymmetric: counting them means a guaranteed false violation on every
    // task forever, while excluding them means a deliberate hand-edit of a
    // generated config does not surface in review — and that edit is not
    // feature work, which is what task scope is about. A task that genuinely
    // means to change one names it in allowedFiles, and then it is in scope by
    // construction.
    filePath === ".mcp.json" ||
    filePath === "AGENTS.md" ||
    filePath === "visp-memory.yaml" ||
    // `visp setup` installs the generic (host-neutral) tool assets, and this
    // is the one that lands at the project root.
    filePath === "visp-hyper-instructions.md" ||
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

/**
 * Files a task can never be blamed for changing.
 *
 * Deliberately DISTINCT from `isGeneratedVispReviewFile`, and the distinction
 * is the whole point. That predicate answers "did Visp write this?", and three
 * integrity paths depend on the answer — the assurance diff snapshot,
 * candidate-evidence fingerprints, and code identity. Widening it to cover
 * `.visp/` was tried first and quietly disabled tamper detection: an
 * integration test that plants a doctored assurance case and requires
 * rejection started passing.
 *
 * This one answers a different question — "is this the user's feature work?" —
 * and only scope reporting asks it. Kit's own artifact directory is never
 * feature work in either direction, so it is exempt here and stays fully
 * visible everywhere else.
 *
 * Without this, `visp check` on a real project reported SIXTEEN out-of-scope
 * files, among them the spec, plan, clarifications and task graph the workflow
 * had just told the user to fill in. The task was blamed for doing what it was
 * instructed to do.
 */
export function isExemptFromTaskScope(filePath: string): boolean {
  // Two zones under `.visp/` are NOT exempt, because scope validation is one of
  // the surfaces that catches a planted file. `.visp/state/` holds
  // implementation authorization and the assurance directories hold evidence;
  // a file appearing in either that Visp did not write is a forgery, and it
  // must keep surfacing. Everywhere else under `.visp/` is ordinary workflow
  // output the user was told to edit.
  const inSecurityZone =
    filePath.startsWith(".visp/state/") ||
    /^\.visp\/features\/[^/]+\/assurance\//u.test(filePath);
  if (inSecurityZone) return isGeneratedVispReviewFile(filePath);

  // .gitignore was deliberately VISIBLE here once: the escape hatch was
  // "commit it and the finding clears". Base-commit diffs (round 4) killed
  // that hatch — a committed .gitignore edit now stays inside the task's
  // window forever, so a hygiene entry (ignoring the app's own runtime data
  // file) permanently failed the active task. It cannot authorize code, the
  // toolchain itself appends to it, and the phase detector already ignores
  // it; the earlier decision is superseded.
  return (
    filePath === ".gitignore" ||
    filePath.startsWith(".visp/") ||
    isGeneratedVispReviewFile(filePath)
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
