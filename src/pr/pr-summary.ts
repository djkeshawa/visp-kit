import { type PrArtifact, type PrStatus } from "../artifacts/schemas/pr.schema.js";
import { type LoadedDiffFile } from "../review/diff-loader.js";
import { type ProjectState } from "../orchestrator/project-state.js";

function evidenceStatus(input: {
  readonly present: boolean;
  readonly passed?: boolean;
  readonly result?: string;
}): PrStatus {
  if (!input.present) return "missing";
  if (input.passed === false || input.result === "failed") return "blocked";
  if (input.result === "warnings") return "warnings";
  return "ready";
}

export function buildPrArtifact(input: {
  readonly state: ProjectState;
  readonly title: string;
  readonly changedFiles: readonly LoadedDiffFile[];
  readonly warnings: readonly string[];
  readonly generatedAt: string;
  readonly taskId?: string;
}): PrArtifact {
  const feature = input.state.selectedFeature;
  const specRequirements = input.state.spec?.requirements ?? [];
  const traceability = input.state.traceability?.entries ?? [];
  const tasks = input.taskId === undefined
    ? input.state.taskGraph?.tasks ?? []
    : (input.state.selectedTask === undefined ? [] : [input.state.selectedTask]);
  const verificationCommands = input.state.verification?.commandValidation.commands
    .filter((command) => !command.skipped)
    .map((command) => command.command) ?? [];
  const reviewWarnings = input.state.review?.warnings ?? [];
  const reconcileFollowUps = input.state.reconcile?.followUpSuggestions ?? [];
  const checklistItems = input.state.implementationChecklist?.items ?? [];
  const pendingRequired = checklistItems.filter((item) => item.required && item.status === "pending");
  const blockedRequired = checklistItems.filter((item) => item.required && item.status === "blocked");
  const usageItem = checklistItems.find((item) => item.id === "record-usage");
  const usage = input.state.actualUsage;
  const errors = [
    ...(input.state.verification?.success === false ? ["Verification failed."] : []),
    ...(input.state.review?.result === "failed" ? ["Review failed."] : []),
    ...(input.state.reconcile?.result === "failed" ? ["Reconciliation failed."] : []),
    ...(input.state.implementationChecklist === undefined ? ["Implementation checklist is missing."] : []),
    ...(pendingRequired.length > 0 || blockedRequired.length > 0
      ? ["Required implementation checklist items are incomplete."]
      : [])
  ];

  return {
    success: errors.length === 0,
    featureId: feature?.id ?? "unknown",
    featureSlug: feature?.slug ?? "unknown",
    title: input.title,
    summary: `Deliver ${input.title}.`,
    requirementsCovered: specRequirements.map((requirement) => {
      const linked = traceability.find((entry) => entry.requirementId === requirement.id);

      return {
        requirementId: requirement.id,
        acceptanceCriterionIds: linked?.acceptanceCriterionIds ?? requirement.acceptanceCriteria.map((criterion) => criterion.id),
        status: linked?.status === "missing" ? "missing" : "ready"
      };
    }),
    tasksIncluded: tasks.map((task) => ({
      taskId: task.id,
      title: task.title,
      status: task.status,
      evidence: [
        ...(input.state.verification?.taskId === task.id ? ["verification"] : []),
        ...(input.state.review?.taskId === task.id ? ["review"] : []),
        ...(input.state.reconcile?.taskId === task.id ? ["reconcile"] : [])
      ]
    })),
    changedFiles: input.changedFiles.map((file) => ({
      path: file.path,
      changeType: file.changeType,
      additions: file.additions,
      deletions: file.deletions,
      notes: file.isGeneratedVispFile ? "generated Visp artifact" : file.isTestFile ? "test change" : "implementation change"
    })),
    validationEvidence: {
      status: evidenceStatus({
        present: input.state.verification !== undefined,
        passed: input.state.verification?.success
      }),
      reportPath: input.state.selectedFeature === undefined
        ? null
        : `.visp/features/${input.state.selectedFeature.key}/verification.json`,
      summary: [
        ...(input.state.verification === undefined ? ["Verification missing."] : []),
        ...verificationCommands.map((command) => `Command run: ${command}`)
      ]
    },
    reviewEvidence: {
      status: evidenceStatus({
        present: input.state.review !== undefined,
        result: input.state.review?.result
      }),
      reportPath: input.state.review?.reportPath ?? null,
      summary: input.state.review === undefined
        ? ["Review missing."]
        : [`Review result: ${input.state.review.result}`, ...reviewWarnings]
    },
    reconcileEvidence: {
      status: evidenceStatus({
        present: input.state.reconcile !== undefined,
        result: input.state.reconcile?.result
      }),
      reportPath: input.state.reconcile?.reportPath ?? null,
      summary: input.state.reconcile === undefined
        ? ["Reconciliation missing."]
        : [`Reconciliation result: ${input.state.reconcile.result}`]
    },
    implementationChecklist: {
      status: input.state.implementationChecklist === undefined
        ? "missing"
        : pendingRequired.length > 0 || blockedRequired.length > 0 ? "incomplete" : "complete",
      pendingRequiredIds: pendingRequired.map((item) => item.id),
      blockedRequiredIds: blockedRequired.map((item) => item.id),
      usageStatus: usageItem?.status ?? "not_recorded",
      items: checklistItems
    },
    usage: {
      status: usage?.status ?? "not_recorded",
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
      source: usage?.source ?? null,
      model: usage?.model ?? null,
      recordedAt: usage?.recordedAt ?? null,
      note: usage?.note ?? null
    },
    risks: [
      `Feature risk: ${input.state.selectedFeature?.intent?.riskLevel ?? "unknown"}`,
      ...((input.state.plan?.risks ?? []).map((risk) => `${risk.id}: ${risk.description}`))
    ],
    rollback: [
      "Revert this PR.",
      "Restore previous changed files if needed."
    ],
    checklist: [
      "Requirements are covered.",
      "Acceptance criteria are covered.",
      "Tests were added or updated where needed.",
      "Validation commands passed or missing evidence is documented.",
      "Review findings are resolved or accepted.",
      "Reconciliation is complete.",
      "No unapproved dependencies were added.",
      "No unrelated refactoring was included.",
      "Security/privacy checklist reviewed where applicable."
    ],
    followUps: reconcileFollowUps.length === 0 ? ["None."] : reconcileFollowUps,
    warnings: [
      ...input.warnings,
      ...reviewWarnings,
      ...(usage?.status === "unavailable"
        ? ["Actual token usage was recorded as unavailable and needs human awareness."]
        : usage === undefined ? ["Actual token usage has not been recorded."] : [])
    ],
    errors,
    generatedAt: input.generatedAt
  };
}
