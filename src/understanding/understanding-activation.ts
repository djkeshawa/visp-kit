import { isSafeIntelTaskId, understandingExportArtifactPath } from "../artifacts/artifact-paths.js";
import { type PolicyArtifact } from "../artifacts/schemas/policy.schema.js";
import { pathExists } from "../core/file-system.js";

/**
 * Whether VSP026 governs this task.
 *
 * Two triggers, and the second is the reason this predicate exists at all:
 *
 *  1. VSP026 is enabled in `.visp/policy.json`. It is `false` in all four
 *     presets, `locked` included — see `policy-defaults.ts` for the argument,
 *     which is about who can produce the artifact, not about how strict the
 *     preset is.
 *  2. An understanding case export already exists for the task. A project that
 *     ran intel and exported a case for THIS task has produced the exact
 *     evidence the gate reads, so the gate is live from that moment whatever
 *     policy says.
 *
 * Trigger 2 is the whole of what changed here. VSP026 used to activate on
 * nothing: doing the right thing — running intel, exporting an understanding
 * case for the task — earned no gate, and the only route to one was
 * hand-editing policy. A gate no correct action can reach is a gate in name
 * only, and VSP023 has had the mirror-image trigger (`oraclePlanExists`) since
 * it shipped.
 *
 * PRESENCE, not currentness and not validity, for the same reason
 * `assuranceActive` reads `oraclePlanExists` rather than "the plan is good". A
 * stale or self-contradictory export keeps the gate ON and fails G1, so letting
 * a case rot cannot open a gate that exporting it closed. Deleting the file
 * does open it — that is true of the oracle plan too, and it is a visible
 * deletion of a named artifact rather than a silent lapse.
 *
 * There is deliberately NO `assurance.profile` trigger, which is the third
 * trigger VSP023 carries. An assurance profile asks for oracle evidence, and
 * Kit's own commands produce oracle evidence. Nothing in Kit produces an
 * understanding export. Activating VSP026 on a profile would block every
 * behavioural task in an assurance project that does not run intel, with no
 * command in this tool able to unblock it.
 */
export function understandingGateActive(input: {
  readonly policy: PolicyArtifact;
  readonly understandingExportExists: boolean;
}): boolean {
  return (
    input.policy.rules.requireUnderstandingBeforeBehaviouralImplementation === true ||
    input.understandingExportExists
  );
}

/**
 * Whether an understanding export FILE is on disk for this task.
 *
 * Absent means positively absent. `pathExists` distinguishes ENOENT (a clean
 * `false`) from every other access failure (an error), and only the first one
 * is evidence that the project produced no case. A file that is there but
 * cannot be stat'd counts as present, so a permissions problem fails the gate
 * closed with G1 naming it rather than silently switching the gate off — the
 * caller would otherwise be unable to tell "no case was exported" from "the
 * case could not be looked at".
 */
export async function understandingExportExists(input: {
  readonly targetPath: string;
  readonly taskId: string;
}): Promise<boolean> {
  // The same guard `readUnderstandingExport` applies. An id that cannot name a
  // file under `.visp-intel/understanding/` has no export there, and must not
  // be interpolated into a path to find out.
  if (!isSafeIntelTaskId(input.taskId)) return false;

  const result = await pathExists(understandingExportArtifactPath(input.targetPath, input.taskId));

  return !result.ok || result.value;
}
