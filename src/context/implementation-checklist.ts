import { contextChecklistJsonPath, contextChecklistPath } from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import {
  implementationChecklistArtifactSchema,
  type ImplementationChecklistArtifact,
  type ImplementationChecklistItem,
  type ImplementationChecklistStatus
} from "../artifacts/schemas/implementation-checklist.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists, writeTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";

export type ImplementationChecklistStep =
  | "read-context"
  | "gate-implement"
  | "implement-selected-task"
  | "scope-check"
  | "tests-updated"
  | "record-usage"
  | "verify"
  | "review"
  | "reconcile";

export type ImplementationChecklistSummary = {
  readonly exists: boolean;
  readonly path: string;
  readonly jsonPath: string;
  readonly total: number;
  readonly required: number;
  readonly done: number;
  readonly unavailable: number;
  readonly notApplicable: number;
  readonly blocked: number;
  readonly pendingRequired: readonly ImplementationChecklistItem[];
  readonly blockedRequired: readonly ImplementationChecklistItem[];
  readonly usageStatus: ImplementationChecklistStatus | "not_recorded";
};

type ChecklistIdentity = {
  readonly featureId: string;
  readonly featureSlug: string;
  readonly taskId: string;
};

const itemLabels: Record<ImplementationChecklistStep, string> = {
  "read-context":
    "Read the context pack and current task prompt. Mark done: `visp-kit checklist update --task <task-id> --item read-context --status done`",
  "gate-implement": "Confirm `visp-kit gate implement --task <task-id>` allows implementation.",
  "implement-selected-task":
    "Implement only <task-id>. Mark done: `visp-kit checklist update --task <task-id> --item implement-selected-task --status done`",
  "scope-check":
    "Keep changes inside allowed/expected files. Mark done: `visp-kit checklist update --task <task-id> --item scope-check --status done`",
  "tests-updated":
    "Update or add tests when behavior changes. Mark done: `visp-kit checklist update --task <task-id> --item tests-updated --status done`",
  "record-usage": "Record actual token usage, or mark it unavailable with a reason.",
  verify: "Run validation commands or report why they could not run.",
  review: "Run `visp-kit review --task <task-id>`.",
  reconcile: "Run `visp-kit reconcile --task <task-id> --update-traceability`."
};

export const implementationChecklistSteps: readonly ImplementationChecklistStep[] = [
  "read-context",
  "gate-implement",
  "implement-selected-task",
  "scope-check",
  "tests-updated",
  "verify",
  "record-usage",
  "review",
  "reconcile"
];

export const agentMarkedChecklistSteps: readonly ImplementationChecklistStep[] = [
  "read-context",
  "implement-selected-task",
  "scope-check",
  "tests-updated"
];

function identityFromFeatureKey(featureKey: string, taskId: string): ChecklistIdentity {
  const match = /^(\d{3})-(.+)$/.exec(featureKey);

  return {
    featureId: match?.[1] ?? featureKey,
    featureSlug: match?.[2] ?? featureKey,
    taskId
  };
}

function labelFor(step: ImplementationChecklistStep, taskId: string): string {
  return itemLabels[step].replaceAll("<task-id>", taskId).replace("selected task", taskId);
}

export function createImplementationChecklistArtifact(
  input: ChecklistIdentity & {
    readonly generatedAt: string;
  }
): ImplementationChecklistArtifact {
  return {
    version: "1.0",
    featureId: input.featureId,
    featureSlug: input.featureSlug,
    taskId: input.taskId,
    generatedAt: input.generatedAt,
    updatedAt: input.generatedAt,
    items: implementationChecklistSteps.map((step) => ({
      id: step,
      label: labelFor(step, input.taskId),
      status: "pending",
      required: true,
      evidence: null,
      reason: null,
      updatedAt: input.generatedAt
    }))
  };
}

function itemMark(status: ImplementationChecklistStatus): string {
  if (status === "done" || status === "not_applicable" || status === "unavailable") {
    return "x";
  }

  return " ";
}

function itemSuffix(item: ImplementationChecklistItem): string {
  const details = [
    item.status !== "pending" && item.status !== "done" ? item.status : undefined,
    item.evidence === null || item.evidence === undefined || item.evidence.length === 0
      ? undefined
      : `evidence: ${item.evidence}`,
    item.reason === null || item.reason === undefined || item.reason.length === 0
      ? undefined
      : `reason: ${item.reason}`
  ].filter((part): part is string => part !== undefined);

  return details.length === 0 ? "" : ` (${details.join("; ")})`;
}

export function renderImplementationChecklistMarkdown(
  artifact: ImplementationChecklistArtifact
): string {
  const items = artifact.items
    .map((item) => `- [${itemMark(item.status)}] ${item.label}${itemSuffix(item)}`)
    .join("\n");

  return `# Implementation Checklist: ${artifact.taskId}

Feature: ${artifact.featureId}-${artifact.featureSlug}
Task: ${artifact.taskId}
Generated: ${artifact.generatedAt}
Updated: ${artifact.updatedAt}

JSON source of truth: ${artifact.taskId}.implementation-checklist.json

Agents should update this checklist while implementing the selected task. If token usage is unavailable, record that explicitly instead of inventing counts.

${items}
`;
}

async function loadChecklist(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly taskId: string;
}): Promise<Result<ImplementationChecklistArtifact | undefined, VispError>> {
  const jsonPath = contextChecklistJsonPath(input.targetPath, input.featureKey, input.taskId);
  const exists = await pathExists(jsonPath);

  if (!exists.ok) return exists;
  if (!exists.value) return ok(undefined);

  return readArtifact(jsonPath, implementationChecklistArtifactSchema, {
    artifactName: "implementation checklist"
  });
}

async function writeChecklist(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly artifact: ImplementationChecklistArtifact;
  readonly dryRun: boolean;
}): Promise<Result<void, VispError>> {
  if (input.dryRun) return ok(undefined);

  const jsonPath = contextChecklistJsonPath(
    input.targetPath,
    input.featureKey,
    input.artifact.taskId
  );
  const markdownPath = contextChecklistPath(
    input.targetPath,
    input.featureKey,
    input.artifact.taskId
  );
  const json = await writeArtifact(
    jsonPath,
    implementationChecklistArtifactSchema,
    input.artifact,
    { artifactName: "implementation checklist" }
  );

  if (!json.ok) return json;

  const markdown = await writeTextFile(
    markdownPath,
    renderImplementationChecklistMarkdown(input.artifact)
  );

  if (!markdown.ok) return markdown;
  return ok(undefined);
}

function nextArtifact(input: {
  readonly current: ImplementationChecklistArtifact | undefined;
  readonly targetPath: string;
  readonly featureKey: string;
  readonly taskId: string;
  readonly now: string;
}): ImplementationChecklistArtifact {
  return (
    input.current ??
    createImplementationChecklistArtifact({
      ...identityFromFeatureKey(input.featureKey, input.taskId),
      generatedAt: input.now
    })
  );
}

export async function updateImplementationChecklistItem(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly taskId: string;
  readonly itemId: ImplementationChecklistStep;
  readonly status: ImplementationChecklistStatus;
  readonly evidence?: string;
  readonly reason?: string;
  readonly dryRun: boolean;
  readonly now?: string;
}): Promise<Result<ImplementationChecklistArtifact, VispError>> {
  const now = input.now ?? new Date().toISOString();
  const current = await loadChecklist(input);

  if (!current.ok) return current;

  if (current.value === undefined) {
    const markdownExists = await pathExists(
      contextChecklistPath(input.targetPath, input.featureKey, input.taskId)
    );

    if (!markdownExists.ok) return markdownExists;
    if (!markdownExists.value) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Implementation checklist is missing for ${input.taskId}. Run \`visp-kit context ${input.taskId}\` first.`,
          { recovery: `visp-kit context ${input.taskId}` }
        )
      );
    }
  }

  const artifact = nextArtifact({
    current: current.value,
    targetPath: input.targetPath,
    featureKey: input.featureKey,
    taskId: input.taskId,
    now
  });
  const found = artifact.items.some((item) => item.id === input.itemId);

  if (!found) {
    return err(new VispError("VALIDATION_FAILED", `Unknown checklist item: ${input.itemId}.`));
  }

  const updated: ImplementationChecklistArtifact = {
    ...artifact,
    updatedAt: now,
    items: artifact.items.map((item) =>
      item.id === input.itemId
        ? {
            ...item,
            status: input.status,
            evidence: input.evidence?.trim() || item.evidence || null,
            reason: input.reason?.trim() || item.reason || null,
            updatedAt: now
          }
        : item
    )
  };
  const write = await writeChecklist({
    targetPath: input.targetPath,
    featureKey: input.featureKey,
    artifact: updated,
    dryRun: input.dryRun
  });

  if (!write.ok) return write;
  return ok(updated);
}

export async function markImplementationChecklistSteps(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly taskId: string;
  readonly steps: readonly ImplementationChecklistStep[];
  readonly dryRun: boolean;
  readonly status?: ImplementationChecklistStatus;
  readonly evidence?: string;
  readonly reason?: string;
  readonly now?: string;
}): Promise<Result<void, VispError>> {
  for (const step of input.steps) {
    const updated = await updateImplementationChecklistItem({
      targetPath: input.targetPath,
      featureKey: input.featureKey,
      taskId: input.taskId,
      itemId: step,
      status: input.status ?? "done",
      evidence: input.evidence,
      reason: input.reason,
      dryRun: input.dryRun,
      now: input.now
    });

    if (!updated.ok) {
      if (updated.error.message.includes("Implementation checklist is missing")) {
        return ok(undefined);
      }

      return updated;
    }
  }

  return ok(undefined);
}

export function summarizeImplementationChecklist(
  artifact: ImplementationChecklistArtifact | undefined,
  displayPath: string,
  jsonDisplayPath: string
): ImplementationChecklistSummary {
  if (artifact === undefined) {
    return {
      exists: false,
      path: displayPath,
      jsonPath: jsonDisplayPath,
      total: 0,
      required: 0,
      done: 0,
      unavailable: 0,
      notApplicable: 0,
      blocked: 0,
      pendingRequired: [],
      blockedRequired: [],
      usageStatus: "not_recorded"
    };
  }

  const required = artifact.items.filter((item) => item.required);
  const pendingRequired = required.filter((item) => item.status === "pending");
  const blockedRequired = required.filter((item) => item.status === "blocked");
  const usage = artifact.items.find((item) => item.id === "record-usage");

  return {
    exists: true,
    path: displayPath,
    jsonPath: jsonDisplayPath,
    total: artifact.items.length,
    required: required.length,
    done: artifact.items.filter((item) => item.status === "done").length,
    unavailable: artifact.items.filter((item) => item.status === "unavailable").length,
    notApplicable: artifact.items.filter((item) => item.status === "not_applicable").length,
    blocked: artifact.items.filter((item) => item.status === "blocked").length,
    pendingRequired,
    blockedRequired,
    usageStatus: usage?.status ?? "not_recorded"
  };
}

export function implementationChecklistStatusLine(summary: ImplementationChecklistSummary): string {
  if (!summary.exists) return "Implementation checklist: missing.";

  return `Implementation checklist: ${summary.pendingRequired.length} pending required, ${summary.blockedRequired.length} blocked required, usage ${summary.usageStatus}.`;
}

export async function readImplementationChecklist(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly taskId: string;
}): Promise<Result<ImplementationChecklistArtifact | undefined, VispError>> {
  return loadChecklist(input);
}

export async function getImplementationChecklistSummary(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly taskId: string;
}): Promise<Result<ImplementationChecklistSummary, VispError>> {
  const artifact = await loadChecklist(input);

  if (!artifact.ok) return artifact;

  return ok(
    summarizeImplementationChecklist(
      artifact.value,
      relativePath(
        input.targetPath,
        contextChecklistPath(input.targetPath, input.featureKey, input.taskId)
      ),
      relativePath(
        input.targetPath,
        contextChecklistJsonPath(input.targetPath, input.featureKey, input.taskId)
      )
    )
  );
}
