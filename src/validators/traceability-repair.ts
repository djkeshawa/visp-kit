import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";

/** The part of a task this guidance needs: its ID and what it claims to implement. */
export type UntracedTask = {
  readonly id: string;
  readonly requirementIds: readonly string[];
  readonly acceptanceCriterionIds: readonly string[];
};

/**
 * A task's traceability is repaired one of two ways, and which one depends on
 * something the author cannot see from the error: whether `traceability.json`
 * already has an entry for the requirement.
 *
 * With an entry, the repair is a one-line edit to its `taskIds`. Without one,
 * "add to the taskIds of REQ001" is unsatisfiable — there is no `taskIds` array
 * to add to, and the entry the author has to write instead has eight fields,
 * none of which the message showed. Both cases used to print that one sentence.
 */
type Repair = {
  readonly extend: Map<string, string[]>;
  readonly author: Map<string, string[]>;
};

function partition(input: {
  readonly untracedTasks: readonly UntracedTask[];
  readonly traceability: TraceabilityMatrix;
}): Repair {
  const entryRequirementIds = new Set(
    input.traceability.entries.map((entry) => entry.requirementId)
  );
  const extend = new Map<string, string[]>();
  const author = new Map<string, string[]>();

  for (const task of input.untracedTasks) {
    // The check reads `taskIds` as one flat set, so listing the task under any
    // one of its requirements clears it. Extending an entry that already exists
    // is the cheaper repair, so a task only asks for a new entry when none of
    // its requirements has one.
    const existing = task.requirementIds.filter((id) => entryRequirementIds.has(id));
    const target = existing.length > 0 ? extend : author;
    const requirementIds = existing.length > 0 ? existing : task.requirementIds;

    for (const requirementId of requirementIds) {
      const tasks = target.get(requirementId);
      if (tasks === undefined) target.set(requirementId, [task.id]);
      else tasks.push(task.id);
    }
  }

  return { extend, author };
}

/**
 * The entry to append for a requirement that has none, filled in far enough
 * that pasting it satisfies the check that printed it.
 *
 * `status` is `partial` rather than `missing` because the entry arrives with
 * its tasks already linked and its files and tests still empty — the same
 * transition the traceability template applies when tasks land on an entry.
 */
function additionFor(input: {
  readonly requirementId: string;
  readonly taskIds: readonly string[];
  readonly untracedTasks: readonly UntracedTask[];
  readonly spec?: SpecArtifact;
}): Record<string, unknown> {
  const fromSpec = input.spec?.acceptanceCriteria
    .filter((criterion) => criterion.requirementId === input.requirementId)
    .map((criterion) => criterion.id);
  const fromTasks = [
    ...new Set(
      input.untracedTasks
        .filter((task) => input.taskIds.includes(task.id))
        .flatMap((task) => task.acceptanceCriterionIds)
    )
  ];

  return {
    requirementId: input.requirementId,
    acceptanceCriterionIds: fromSpec ?? fromTasks,
    taskIds: [...input.taskIds],
    filePaths: [],
    testPaths: [],
    status: "partial"
  };
}

/**
 * Errors for tasks that `traceability.json` does not list, one per repair kind.
 *
 * Tasks that name no requirement are the caller's to report: an entry can only
 * exist for a requirement that exists, so there is nothing to point them at.
 */
export function untracedTaskErrors(input: {
  readonly untracedTasks: readonly UntracedTask[];
  readonly traceability: TraceabilityMatrix;
  readonly spec?: SpecArtifact;
}): readonly string[] {
  const anchored = input.untracedTasks.filter((task) => task.requirementIds.length > 0);

  if (anchored.length === 0) return [];

  const { extend, author } = partition({
    untracedTasks: anchored,
    traceability: input.traceability
  });
  const errors: string[] = [];

  if (extend.size > 0) {
    const listed = [...new Set([...extend.values()].flat())].join(", ");
    const repairs = [...extend]
      .map(
        ([requirementId, taskIds]) => `  ${requirementId}: add ${taskIds.join(", ")} to its taskIds`
      )
      .join("\n");

    errors.push(
      `traceability.json does not list ${listed}.\n` +
        `  Each one's requirement already has an entry, so extend it in traceability.json:\n${repairs}`
    );
  }

  if (author.size > 0) {
    const listed = [...new Set([...author.values()].flat())].join(", ");
    const additions = [...author].map(([requirementId, taskIds]) =>
      additionFor({ requirementId, taskIds, untracedTasks: anchored, spec: input.spec })
    );

    errors.push(
      `traceability.json does not list ${listed}, and has no entry for ` +
        `${[...author.keys()].join(", ")} to add them to.\n` +
        `  Append to "entries" in traceability.json:\n  ${JSON.stringify(additions)}`
    );
  }

  return errors;
}
