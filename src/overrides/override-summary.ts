import {
  type OverrideRecord,
  type OverrideScope
} from "../artifacts/schemas/override.schema.js";
import { type OverrideValidation } from "./override-validator.js";

export type OverrideWorkflowMode =
  | "create"
  | "list"
  | "show"
  | "revoke"
  | "validate";

export type OverrideWorkflowSummary = {
  readonly success: boolean;
  readonly mode: OverrideWorkflowMode;
  readonly targetPath: string;
  readonly overridesPath: string;
  readonly dryRun: boolean;
  readonly override: OverrideRecord | null;
  readonly overrides: readonly OverrideRecord[];
  readonly createdFiles: readonly string[];
  readonly updatedFiles: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly validation: OverrideValidation | null;
  readonly nextCommand: string;
};

export function scopeLabel(override: Pick<OverrideRecord, "scope" | "taskId" | "stage">): string {
  if (override.scope === "task") return `task ${override.taskId ?? "unknown"}`;
  if (override.scope === "stage") return `stage ${override.stage ?? "unknown"}`;
  return override.scope;
}

export function defaultNextCommand(input: {
  readonly scope: OverrideScope;
  readonly stage?: string;
  readonly taskId?: string;
}): string {
  if (input.stage !== undefined) {
    return input.taskId === undefined
      ? `visp gate ${input.stage}`
      : `visp gate ${input.stage} --task ${input.taskId}`;
  }

  return "visp gate next";
}
