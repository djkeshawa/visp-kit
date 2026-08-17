import { VispError } from "../core/errors.js";
import { err, type Result } from "../core/result.js";

/**
 * The assurance chain is plan → approve (critical profile only) → lock →
 * `assurance generate`. Each step reads the previous step's artifact, and a
 * missing one surfaced as the reader's generic `Unable to read <absolute
 * path>.` — a message that names no command and does not say the step exists.
 *
 * LC-112: that is half of why no assurance artifact was produced in two
 * battleground rounds. `visp-kit assurance generate` said only that it could
 * not read `oracle-lock.json`; `visp-kit oracle lock` said only that it could
 * not read `oracle-approval.json`. Neither named the command that writes the
 * file it wanted.
 */
const prerequisites = {
  plan: {
    label: "Oracle plan",
    why: "The oracle plan is what binds the task's acceptance criteria to checkable oracles.",
    command: (taskId: string) => `visp-kit oracle plan --task ${taskId}`
  },
  approval: {
    label: "Oracle approval",
    why: "This task's assurance profile is `critical`, so the plan needs a recorded human approval before it can be locked.",
    command: (taskId: string) =>
      `visp-kit oracle approve --task ${taskId} --reviewer <id> --reason <reason>`
  },
  lock: {
    label: "Oracle lock",
    why: "The lock is what binds the approved plan to the implementation, and every assurance artifact is generated against it.",
    command: (taskId: string) => `visp-kit oracle lock --task ${taskId}`
  }
} as const;

export function oraclePrerequisiteMissing(input: {
  readonly artifact: keyof typeof prerequisites;
  readonly taskId: string;
  readonly artifactPath: string;
}): Result<never, VispError> {
  const prerequisite = prerequisites[input.artifact];

  return err(
    new VispError(
      "FILE_NOT_FOUND",
      `${prerequisite.label} is missing for ${input.taskId} (${input.artifactPath}). ` +
        `${prerequisite.why} Run \`${prerequisite.command(input.taskId)}\`.`,
      { details: { path: input.artifactPath } }
    )
  );
}
