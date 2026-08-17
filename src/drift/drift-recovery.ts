import { type DriftFinding, type DriftRecoveryStep } from "../artifacts/schemas/drift.schema.js";

/**
 * The ordered sequence that actually clears the drift `drift` reports.
 *
 * LC-109: every finding carried a per-finding recommendation and the command
 * printed under `Next:` was the first one of them. Following it literally
 * cleared nothing, for two independent reasons:
 *
 * 1. `visp-kit context <id>` on an existing pack keeps the superseded file and
 *    still exits 0 — only `--force` regenerates it. The recommendation omitted
 *    `--force`, so the loop was: run the printed command, see the same finding.
 * 2. A context pack copies each included file's hash from the scan cache, while
 *    `drift` hashes the working tree. Regenerating a pack from a stale cache
 *    reproduces the stale hash forever, so `code_changed_after_context` needs
 *    `visp-kit scan` first — and a scan then invalidates the provenance of
 *    *every* pack, not only the flagged one.
 *
 * Point 2 is why the plan is a sequence rather than a per-finding hint: the
 * order matters, and a scan widens the set of packs that must be regenerated.
 * The detector is unchanged — this describes how to satisfy it, never what it
 * looks for.
 */
export function driftRecoveryPlan(input: {
  readonly findings: readonly DriftFinding[];
  /** Every task that currently has a context pack, not only the flagged ones. */
  readonly contextPackTaskIds: readonly string[];
}): readonly DriftRecoveryStep[] {
  const blocking = input.findings.filter((finding) => finding.severity !== "info");

  if (blocking.length === 0) return [];

  const steps: DriftRecoveryStep[] = [];
  const scanRequired = blocking.some((finding) => finding.kind === "code_changed_after_context");

  if (scanRequired) {
    steps.push({
      command: "visp-kit scan",
      reason:
        "Context packs take included-file hashes from the scan cache, so a pack regenerated " +
        "from a stale cache carries the same stale hash. Refresh the cache first."
    });
  }

  const packTasks = scanRequired
    ? [...new Set(input.contextPackTaskIds)].sort()
    : [
        ...new Set(
          blocking
            .filter(
              (finding) =>
                finding.kind === "stale_context_provenance" ||
                finding.kind === "code_changed_after_context"
            )
            .flatMap((finding) => (finding.taskId === null ? [] : [finding.taskId]))
        )
      ].sort();

  for (const taskId of packTasks) {
    steps.push({
      command: `visp-kit context ${taskId} --force`,
      reason: scanRequired
        ? `A scan invalidates every pack's provenance, so ${taskId} must be rebuilt too. ` +
          "Without --force the existing pack is kept and the finding survives."
        : `Rebuild the ${taskId} pack against current inputs. Without --force the existing ` +
          "pack is kept and the finding survives."
    });
  }

  for (const finding of blocking) {
    if (
      finding.kind === "stale_context_provenance" ||
      finding.kind === "code_changed_after_context"
    ) {
      continue;
    }

    if (steps.some((step) => step.command === finding.recommendation)) continue;

    steps.push({ command: finding.recommendation, reason: finding.evidence });
  }

  return steps;
}
