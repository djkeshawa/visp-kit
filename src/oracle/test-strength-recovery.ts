import { type OracleTestStrengthEvidence } from "../artifacts/schemas/oracle-plan.schema.js";

/**
 * What to do when a test pinned by the locked oracle has changed.
 *
 * LC-121: the previous message recommended re-planning with
 * `--pre-approved-test <path> --force` for "a test that is the task's declared
 * deliverable". That recovery cannot work for such a task. `pre_approved`
 * evidence is hash-pinned at plan time exactly like `pre_existing` — the flag
 * only records that a human approved the file, it does not exempt it — so the
 * pin simply moves to whatever the file contains at re-plan time and breaks
 * again on the next edit. A task whose deliverable IS the test would have to
 * re-plan and re-lock after every save, which is the deadlock the exemption
 * exists to prevent.
 *
 * `task_deliverable` is the only exemption, and it is declared in the task
 * graph before planning rather than requested at the command line: the task's
 * `taskClass` must be `regression_test` and the path must appear in that task's
 * `expectedFiles`. Both are hash-bound in the task graph, so the exemption
 * cannot be granted after the fact by the implementer who benefits from it.
 * That constraint is the point, and this message states it instead of pointing
 * at a flag that looks like it would do the same thing.
 */
export function testStrengthChangedMessage(input: {
  readonly evidence: OracleTestStrengthEvidence;
  readonly taskId: string;
}): string {
  const path = input.evidence.path;

  return [
    `Test-strength evidence changed: ${path}.`,
    "The locked oracle pins this file by hash, so any edit to it invalidates the lock.",
    "",
    "Pick the case that applies:",
    `- The edit was accidental: restore the file (\`git checkout -- ${path}\`) and re-run.`,
    "- The test is now final and a human accepts the new content: re-plan with " +
      `\`visp-kit oracle plan --task ${input.taskId} --pre-approved-test ${path} --force\`, ` +
      "then lock again. This re-pins the file at its current content — it does not " +
      "exempt it, so the next edit fails the same way.",
    `- Writing this test is what ${input.taskId} exists to do, so it will keep changing: ` +
      "no flag can allow that. The task graph must declare it in advance — set " +
      `\`taskClass: "regression_test"\` on ${input.taskId} and list ${path} in its ` +
      "`expectedFiles` — then re-run `visp-kit context`, `oracle plan` and `oracle lock`. " +
      "Kit then records the file as the task's own deliverable, exempt from the pin, " +
      "with a mandatory review hotspot so a reviewer is told the test was self-authored."
  ].join("\n");
}
