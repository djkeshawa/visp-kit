import { type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { type ProjectProfile } from "../artifacts/schemas/project.schema.js";
import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { type VerificationReport } from "../artifacts/schemas/verification.schema.js";
import { type ReviewChangedFile } from "../artifacts/schemas/review.schema.js";
import { finding, type ReviewFindingDraft } from "./review-findings.js";

export function isBehaviorChangingTask(input: {
  readonly task?: Task;
  readonly changedFiles: readonly ReviewChangedFile[];
}): boolean {
  if (input.task === undefined) {
    return input.changedFiles.some((file) => /^(src|app|lib|server|client)\//.test(file.path));
  }

  const text = `${input.task.title} ${input.task.description}`.toLowerCase();

  return input.task.acceptanceCriterionIds.length > 0 ||
    input.task.riskLevel !== "low" ||
    /add|update|create|delete|validate|calculate|permission|api|persistence|state|workflow/.test(text) ||
    input.changedFiles.some((file) => /^(src|app|lib|server|client)\//.test(file.path));
}

function manualOrStaticOnly(input: {
  readonly task?: Task;
  readonly spec?: SpecArtifact;
}): boolean {
  if (input.task === undefined || input.spec === undefined) return false;
  if (input.task.acceptanceCriterionIds.length === 0) return false;

  const criteria = input.spec.acceptanceCriteria.filter((criterion) =>
    input.task?.acceptanceCriterionIds.includes(criterion.id)
  );

  return criteria.length > 0 &&
    criteria.every((criterion) =>
      criterion.validationMethod === "manual" || criterion.validationMethod === "static"
    );
}

export function reviewTestSignals(input: {
  readonly changedFiles: readonly ReviewChangedFile[];
  readonly task?: Task;
  readonly spec?: SpecArtifact;
  readonly contextPack?: ContextPack;
  readonly project?: ProjectProfile;
  readonly verification?: VerificationReport;
}): {
  readonly testReview: {
    readonly status: "passed" | "warnings" | "failed";
    readonly testsChanged: boolean;
    readonly validationCommandsKnown: boolean;
    readonly behaviorChanging: boolean;
    readonly verificationCommandsPassed: boolean;
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
  readonly findings: readonly ReviewFindingDraft[];
} {
  const warnings: string[] = [];
  const findings: ReviewFindingDraft[] = [];
  const testsChanged = input.changedFiles.some((file) => file.isTestFile);
  const validationCommandsKnown = Boolean(
    input.task?.validationCommands.length ||
      input.contextPack?.validationCommands.length ||
      input.project?.testCommands.length ||
      input.project?.typecheckCommands.length
  );
  const behaviorChanging = isBehaviorChangingTask({
    task: input.task,
    changedFiles: input.changedFiles
  });
  const verificationCommandsPassed = Boolean(
    input.verification?.commandValidation.commands.some((command) => !command.skipped) &&
      input.verification.summary.commandsFailed === 0
  );

  if (behaviorChanging && !testsChanged && !manualOrStaticOnly(input)) {
    const message = "Behavior-changing task has no changed test files.";
    warnings.push(message);
    findings.push(
      finding({
        category: "tests",
        severity: "warning",
        title: "No test files changed",
        description: "The task appears behavior-changing, but the diff does not include test files.",
        evidence: message,
        recommendation: "Add/update tests or document why existing/manual validation is sufficient.",
        relatedTaskId: input.task?.id ?? null,
        relatedRequirementIds: input.task?.requirementIds ?? [],
        relatedAcceptanceCriterionIds: input.task?.acceptanceCriterionIds ?? []
      })
    );
  }

  if (!validationCommandsKnown) {
    const message = "No validation commands are known for this review.";
    warnings.push(message);
    findings.push(
      finding({
        category: "tests",
        severity: "warning",
        title: "Validation commands missing",
        description: "Task, context, and project artifacts do not provide validation commands.",
        evidence: message,
        recommendation: "Run visp scan or add validationCommands to the task graph.",
        relatedTaskId: input.task?.id ?? null
      })
    );
  }

  if (verificationCommandsPassed) {
    findings.push(
      finding({
        category: "tests",
        severity: "info",
        title: "Verification commands passed",
        description: "The verification report recorded passing command results.",
        evidence: "verification summary commandsFailed is 0.",
        recommendation: "Use this as supporting validation evidence.",
        relatedTaskId: input.task?.id ?? null
      })
    );
  }

  return {
    testReview: {
      status: warnings.length > 0 ? "warnings" : "passed",
      testsChanged,
      validationCommandsKnown,
      behaviorChanging,
      verificationCommandsPassed,
      warnings,
      errors: []
    },
    findings
  };
}
