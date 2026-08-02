import path from "node:path";

import { contextChecklistJsonPath } from "../artifacts/artifact-paths.js";
import {
  implementationChecklistStatusSchema,
  type ImplementationChecklistArtifact,
  type ImplementationChecklistStatus
} from "../artifacts/schemas/implementation-checklist.schema.js";
import { VispError } from "../core/errors.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import {
  getImplementationChecklistSummary,
  implementationChecklistSteps,
  readImplementationChecklist,
  updateImplementationChecklistItem,
  type ImplementationChecklistStep,
  type ImplementationChecklistSummary
} from "../context/implementation-checklist.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { resolveActiveFeature, type ActiveFeature } from "./shared/active-feature.js";

export type ChecklistStatusWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
};

export type ChecklistUpdateWorkflowOptions = ChecklistStatusWorkflowOptions & {
  readonly itemId?: string;
  readonly status?: ImplementationChecklistStatus;
  readonly reason?: string;
  readonly evidence?: string;
  readonly dryRun?: boolean;
  readonly now?: string;
};

export type ChecklistWorkflowSummary = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly feature: {
    readonly id: string;
    readonly slug: string;
  };
  readonly taskId: string;
  readonly checklistPath: string;
  readonly checklistJsonPath: string;
  readonly checklist: ImplementationChecklistArtifact | null;
  readonly summary: ImplementationChecklistSummary;
  readonly updatedItemId: string | null;
  readonly dryRun: boolean;
  readonly warnings: readonly string[];
  readonly nextCommand: string;
};

function targetPathFrom(options: { readonly targetPath?: string; readonly cwd?: string }): string {
  return path.resolve(options.cwd ?? process.cwd(), options.targetPath ?? ".");
}

function taskIdFrom(taskId: string | undefined): Result<string, VispError> {
  if (taskId === undefined || taskId.trim().length === 0) {
    return err(new VispError("VALIDATION_FAILED", "Checklist commands require --task <task-id>."));
  }

  return ok(taskId.trim());
}

function stepFrom(itemId: string | undefined): Result<ImplementationChecklistStep, VispError> {
  if (itemId === undefined || itemId.trim().length === 0) {
    return err(new VispError("VALIDATION_FAILED", "Checklist update requires --item <id>."));
  }

  const normalized = itemId.trim() as ImplementationChecklistStep;

  if (!implementationChecklistSteps.includes(normalized)) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Unknown checklist item: ${itemId}. Valid items: ${implementationChecklistSteps.join(", ")}.`
      )
    );
  }

  return ok(normalized);
}

function statusFrom(
  status: ImplementationChecklistStatus | undefined
): Result<ImplementationChecklistStatus, VispError> {
  const parsed = implementationChecklistStatusSchema.safeParse(status);

  if (!parsed.success) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Checklist update requires --status pending|done|not_applicable|unavailable|blocked."
      )
    );
  }

  return ok(parsed.data);
}

async function base(input: ChecklistStatusWorkflowOptions): Promise<
  Result<
    {
      readonly targetPath: string;
      readonly feature: ActiveFeature;
      readonly taskId: string;
    },
    VispError
  >
> {
  const targetPath = targetPathFrom(input);
  const feature = await resolveActiveFeature({
    targetPath,
    feature: input.feature
  });

  if (!feature.ok) return feature;

  const taskId = taskIdFrom(input.taskId);

  if (!taskId.ok) return taskId;

  return ok({
    targetPath,
    feature: feature.value,
    taskId: taskId.value
  });
}

export async function runChecklistStatusWorkflow(
  options: ChecklistStatusWorkflowOptions = {}
): Promise<Result<ChecklistWorkflowSummary, VispError>> {
  const resolved = await base(options);

  if (!resolved.ok) return resolved;

  const checklist = await readImplementationChecklist({
    targetPath: resolved.value.targetPath,
    featureKey: resolved.value.feature.key,
    taskId: resolved.value.taskId
  });

  if (!checklist.ok) return checklist;

  const summary = await getImplementationChecklistSummary({
    targetPath: resolved.value.targetPath,
    featureKey: resolved.value.feature.key,
    taskId: resolved.value.taskId
  });

  if (!summary.ok) return summary;

  return ok({
    success:
      summary.value.exists &&
      summary.value.pendingRequired.length === 0 &&
      summary.value.blockedRequired.length === 0,
    targetPath: resolved.value.targetPath,
    feature: {
      id: resolved.value.feature.id,
      slug: resolved.value.feature.slug
    },
    taskId: resolved.value.taskId,
    checklistPath: summary.value.path,
    checklistJsonPath: summary.value.jsonPath,
    checklist: checklist.value ?? null,
    summary: summary.value,
    updatedItemId: null,
    dryRun: false,
    warnings: summary.value.exists ? [] : ["Implementation checklist is missing."],
    nextCommand:
      summary.value.pendingRequired.length > 0 || summary.value.blockedRequired.length > 0
        ? `visp-kit checklist status --task ${resolved.value.taskId}`
        : `visp-kit verify --task ${resolved.value.taskId}`
  });
}

export async function runChecklistUpdateWorkflow(
  options: ChecklistUpdateWorkflowOptions = {}
): Promise<Result<ChecklistWorkflowSummary, VispError>> {
  const resolved = await base(options);

  if (!resolved.ok) return resolved;

  const item = stepFrom(options.itemId);
  if (!item.ok) return item;

  const status = statusFrom(options.status);
  if (!status.ok) return status;

  if (
    (status.value === "blocked" ||
      status.value === "not_applicable" ||
      status.value === "unavailable") &&
    (options.reason?.trim() ?? "").length === 0
  ) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "--reason is required when checklist status is blocked, not_applicable, or unavailable."
      )
    );
  }

  const updated = await updateImplementationChecklistItem({
    targetPath: resolved.value.targetPath,
    featureKey: resolved.value.feature.key,
    taskId: resolved.value.taskId,
    itemId: item.value,
    status: status.value,
    evidence: options.evidence,
    reason: options.reason,
    dryRun: options.dryRun ?? false,
    now: options.now
  });

  if (!updated.ok) return updated;

  const jsonPath = contextChecklistJsonPath(
    resolved.value.targetPath,
    resolved.value.feature.key,
    resolved.value.taskId
  );
  const summary = await getImplementationChecklistSummary({
    targetPath: resolved.value.targetPath,
    featureKey: resolved.value.feature.key,
    taskId: resolved.value.taskId
  });

  if (!summary.ok) return summary;

  return ok({
    success: true,
    targetPath: resolved.value.targetPath,
    feature: {
      id: resolved.value.feature.id,
      slug: resolved.value.feature.slug
    },
    taskId: resolved.value.taskId,
    checklistPath: summary.value.path,
    checklistJsonPath: relativePath(resolved.value.targetPath, jsonPath),
    checklist: updated.value,
    summary: summary.value,
    updatedItemId: item.value,
    dryRun: options.dryRun ?? false,
    warnings: [],
    nextCommand: `visp-kit checklist status --task ${resolved.value.taskId}`
  });
}

export function formatChecklistSummary(summary: ChecklistWorkflowSummary): string {
  const pending = summary.summary.pendingRequired.map((item) => `  ${item.id}: ${item.label}`);
  const blocked = summary.summary.blockedRequired.map((item) => `  ${item.id}: ${item.label}`);
  const lines = [
    formatHeader(
      summary.updatedItemId === null ? "Visp checklist status" : "Visp checklist updated"
    ),
    "",
    formatKeyValue("Feature", `${summary.feature.id}-${summary.feature.slug}`),
    formatKeyValue("Task", summary.taskId),
    formatKeyValue("Checklist", summary.summary.exists ? "present" : "missing"),
    formatKeyValue("Required", String(summary.summary.required)),
    formatKeyValue("Done", String(summary.summary.done)),
    formatKeyValue("Unavailable", String(summary.summary.unavailable)),
    formatKeyValue("Blocked", String(summary.summary.blocked)),
    formatKeyValue("Usage", summary.summary.usageStatus)
  ];

  if (summary.updatedItemId !== null) {
    lines.push(formatKeyValue("Updated item", summary.updatedItemId));
  }

  if (pending.length > 0) {
    lines.push("", "Pending required:", ...pending);
  }

  if (blocked.length > 0) {
    lines.push("", "Blocked required:", ...blocked);
  }

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  lines.push("", "Files:", `  ${summary.checklistJsonPath}`, `  ${summary.checklistPath}`);
  lines.push("", "Next:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
