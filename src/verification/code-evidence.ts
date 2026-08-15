import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";
import {
  type CodeEvidenceSection,
  type VerificationCommandResult
} from "../artifacts/schemas/verification.schema.js";
import {
  rejectedCommandMessages,
  type ValidationCommandClassification
} from "./command-classifier.js";

/**
 * Did anything in this run look at the code?
 *
 * The head-to-head evaluation shipped a browser game that wiped its own screen
 * six seconds after it started, from a two-line screen-wrap bug, while its own
 * 299-line specification had ruled that behaviour out in writing. Every gate
 * passed. None of them could have caught it: each one ran either before the
 * code existed or against an empty diff, and the verification stage — the one
 * stage whose job is to execute something — reported success having executed
 * nothing at all. Zero commands was a `skipped` section and a warning, and a
 * warning does not fail a run.
 *
 * That is the difference between ceremony that runs AROUND code and a check
 * that runs ON it. This module is the second one. It answers a question with
 * only three honest answers:
 *
 * - `executed`  — a command ran over the produced code and the run may stand
 *                 on it.
 * - `refused`   — nothing ran, so there is nothing to stand on. NOT a pass:
 *                 the run fails and names the command that would fix it.
 * - `delegated` — this invocation deliberately skipped its command channel
 *                 (`--skip-commands`, or the composite that runs candidate
 *                 evidence separately). The report says so in those words, so
 *                 no reader mistakes it for evidence that was collected.
 *
 * **What a `passed` code-evidence section does and does not claim.** It claims
 * an executable check ran over this diff and exited zero. It does NOT claim the
 * spec's meaning was verified — proving that a game does not clear its own
 * screen requires a test that asserts it, and only the author can write that
 * one. What Kit can do deterministically is refuse to call an unexecuted check
 * a pass, and name the acceptance criteria the spec declared provable so the
 * gap is visible rather than implied.
 */
export type CodeEvidenceInput = {
  /** True when this invocation was supposed to run validation commands. */
  readonly commandChannelEnabled: boolean;
  readonly commandResults: readonly VerificationCommandResult[];
  /** Entries that were rejected before execution, with reasons. */
  readonly rejectedCommands: readonly ValidationCommandClassification[];
  /** Files the diff reports as changed, artifacts included. */
  readonly changedFiles: readonly string[];
  readonly spec?: SpecArtifact;
  readonly traceability?: TraceabilityMatrix;
  readonly task?: Task;
  /** True when a project profile supplied at least one runnable command. */
  readonly projectHasCommands: boolean;
  readonly dryRun: boolean;
};

export type CodeEvidenceEvaluation = {
  readonly section: CodeEvidenceSection;
  readonly errors: readonly string[];
  /** Set when the evaluation refuses; the single command that unblocks it. */
  readonly nextCommand: string | null;
};

/**
 * Kit's own bookkeeping is not the project's code. A run whose only changed
 * file is `.visp/status.json` has not produced anything to verify.
 */
function isProducedCode(filePath: string): boolean {
  const normalized = filePath.replace(/\\/gu, "/");
  return !normalized.startsWith(".visp/") && !normalized.includes("/.visp/");
}

/**
 * The acceptance criteria this specification declared provable.
 *
 * Narrowed to the verified task when traceability binds criteria to it, so the
 * message names the criteria that task was supposed to satisfy rather than the
 * whole feature's.
 */
function assertedCriterionIds(input: CodeEvidenceInput): readonly string[] {
  const spec = input.spec;
  if (spec === undefined) return [];

  const testable = spec.acceptanceCriteria
    .filter((criterion) => criterion.testable !== false)
    .map((criterion) => criterion.id);

  if (input.task === undefined || input.traceability === undefined) return testable;

  const boundToTask = new Set(
    input.traceability.entries
      .filter((entry) => entry.taskIds.includes(input.task?.id ?? ""))
      .flatMap((entry) => entry.acceptanceCriterionIds)
  );
  const narrowed = testable.filter((id) => boundToTask.has(id));

  return narrowed.length > 0 ? narrowed : testable;
}

function refusalMessage(input: {
  readonly asserted: readonly string[];
  readonly rejectedCount: number;
  readonly changedCode: readonly string[];
}): string {
  const scope =
    input.changedCode.length > 0
      ? `${input.changedCode.length} changed file(s) were not examined by anything`
      : "nothing examined the code";
  const criteria =
    input.asserted.length > 0
      ? ` The specification declares ${input.asserted.join(", ")} testable, and no executed ` +
        `check could have proven any of them.`
      : "";
  const rejected =
    input.rejectedCount > 0
      ? ` ${input.rejectedCount} declared validation entr${input.rejectedCount === 1 ? "y was" : "ies were"} ` +
        `not runnable (listed above).`
      : "";

  return (
    `No validation command was executed, so ${scope}. Verification refuses to report a ` +
    `pass it cannot support.${rejected}${criteria}`
  );
}

function refusalNextCommand(input: {
  readonly rejectedCount: number;
  readonly projectHasCommands: boolean;
  readonly task?: Task;
}): string {
  if (input.rejectedCount > 0) return "visp-kit tasks --validate";
  if (!input.projectHasCommands) return "visp-kit scan";
  return input.task === undefined
    ? "visp-kit verify --all"
    : `visp-kit verify --task ${input.task.id} --all`;
}

export function evaluateCodeEvidence(input: CodeEvidenceInput): CodeEvidenceEvaluation {
  const executed = input.commandResults.filter((result) => !result.skipped);
  const passed = executed.filter((result) => result.success);
  const changedCode = input.changedFiles.filter(isProducedCode);
  const asserted = assertedCriterionIds(input);
  const rejectedEntries = input.rejectedCommands.map((entry) => ({
    command: entry.command,
    kind: entry.kind === "placeholder" ? ("placeholder" as const) : ("prose" as const),
    reason: entry.reason ?? "it is not runnable"
  }));

  const base = {
    executedCommands: executed.length,
    passedCommands: passed.length,
    rejectedCommands: rejectedEntries,
    changedCodeFiles: [...changedCode],
    assertedCriteria: [...asserted]
  };
  /**
   * A declared check that cannot run is an error even when something else did.
   *
   * Discovered while writing the regression test for this module. A task whose
   * only entry was "Manually open index.html and check the snake wraps" fell
   * through the selector's fallback to the project's generic `pnpm test`, that
   * suite passed — it has no test for screen wrapping, nobody wrote one —
   * and verification reported PASSED. The evidence was real and answered a
   * different question than the one the task asked. Reporting the unrunnable
   * entry as a warning would leave that intact, because a warning does not
   * fail a run and the whole defect is a run that did not fail.
   */
  const rejectionErrors =
    rejectedEntries.length === 0
      ? []
      : [
          ...rejectedCommandMessages(input.rejectedCommands),
          `${rejectedEntries.length} declared validation entr${rejectedEntries.length === 1 ? "y" : "ies"} ` +
            `could not be executed, so ${rejectedEntries.length === 1 ? "the check it names was" : "the checks they name were"} ` +
            `never performed — whatever else ran answered a different question. ` +
            `Next: \`visp-kit tasks --validate\`.`
        ];

  // --dry-run reports a plan, not a verdict. Refusing here would make the
  // preview of a run fail for not being the run.
  if (input.dryRun) {
    return {
      section: {
        ...base,
        status: "skipped",
        evidence: "delegated",
        warnings: ["Dry run: no command executed, so this run is not evidence about the code."],
        errors: []
      },
      errors: [],
      nextCommand: null
    };
  }

  if (!input.commandChannelEnabled && executed.length === 0) {
    return {
      section: {
        ...base,
        status: rejectionErrors.length > 0 ? "failed" : "skipped",
        evidence: "delegated",
        warnings: [
          "Command execution was skipped for this run, so it carries no evidence about the " +
            "code itself. Whatever passes here is a statement about artifacts, not behaviour."
        ],
        errors: rejectionErrors
      },
      errors: rejectionErrors,
      nextCommand: rejectionErrors.length > 0 ? "visp-kit tasks --validate" : null
    };
  }

  if (executed.length === 0) {
    const message = refusalMessage({
      asserted,
      rejectedCount: rejectedEntries.length,
      changedCode
    });
    const next = refusalNextCommand({
      rejectedCount: rejectedEntries.length,
      projectHasCommands: input.projectHasCommands,
      task: input.task
    });

    const errors = [...rejectionErrors, `${message} Next: \`${next}\`.`];

    return {
      section: { ...base, status: "failed", evidence: "refused", warnings: [], errors },
      errors,
      nextCommand: next
    };
  }

  return {
    section: {
      ...base,
      status: rejectionErrors.length > 0 || passed.length !== executed.length ? "failed" : "passed",
      evidence: "executed",
      warnings:
        asserted.length > 0
          ? [
              `Executed checks ran over this diff. They do not by themselves prove ` +
                `${asserted.join(", ")}; that holds only insofar as an executed test asserts it.`
            ]
          : [],
      errors: rejectionErrors
    },
    errors: rejectionErrors,
    nextCommand: rejectionErrors.length > 0 ? "visp-kit tasks --validate" : null
  };
}
