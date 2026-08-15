import { type ProjectWorkflowState } from "../../artifacts/schemas/project.schema.js";
import { formatHeader, formatKeyValue } from "../../theme/terminal.js";
import { type ActiveFeature } from "./active-feature.js";
import { type WorkflowFileAction } from "./generated-files.js";
import { isStale } from "../../agent/agent-file-plan.js";

export type WorkflowValidation = {
  readonly passed: boolean;
  readonly errors: readonly string[];
};

export type TemplateCommandName = "clarify" | "spec" | "plan" | "tasks";

/**
 * What a template command actually did.
 *
 * `draft` exists because the generation path could not do anything else. These
 * four commands seed a skeleton whose fields are the literal "TBD", and the
 * validator they then run rejects "TBD" — by design, since an unfilled draft
 * must not advance the workflow. The result was a tool that generated a
 * document which could not pass its own validator, reported that as a
 * VALIDATION FAILURE, and exited 1. In the head-to-head run all four of
 * clarify/spec/plan/tasks "failed" on their first and only correct invocation,
 * and the agent spent turns trying to repair a tool that was working.
 *
 * The seeding is not the failure; calling it one was. A draft now reports as a
 * draft: exit 0, the unfilled fields listed as work to do rather than as
 * errors. Nothing downstream is relaxed — `validation.passed` stays false, the
 * workflow state is NOT advanced, and the gates (which read artifact readiness,
 * not artifact existence) still refuse the next stage until
 * `visp-kit <command> --validate` passes.
 */
export type TemplateWorkflowOutcome = "draft" | "passed" | "failed";

export type TemplateWorkflowSummary = {
  readonly success: boolean;
  readonly outcome: TemplateWorkflowOutcome;
  readonly command: TemplateCommandName;
  readonly targetPath: string;
  readonly feature: {
    readonly id: string;
    readonly slug: string;
    readonly path: string;
  };
  readonly createdFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly staleFiles: readonly string[];
  readonly overwrittenFiles: readonly string[];
  readonly updatedFiles: readonly string[];
  readonly validated: boolean;
  readonly validation: WorkflowValidation;
  readonly dryRun: boolean;
  readonly promptPath: string;
  readonly warnings: readonly string[];
  readonly nextCommand: string;
};

export function createTemplateWorkflowSummary(input: {
  readonly command: TemplateCommandName;
  readonly targetPath: string;
  readonly feature: ActiveFeature;
  readonly actions: readonly WorkflowFileAction[];
  readonly validated: boolean;
  readonly validation: WorkflowValidation;
  readonly dryRun: boolean;
  readonly promptPath: string;
  readonly warnings: readonly string[];
  readonly nextCommand: string;
  /** The command seeded a fresh skeleton. See {@link TemplateWorkflowOutcome}. */
  readonly draft?: boolean;
}): TemplateWorkflowSummary {
  const outcome: TemplateWorkflowOutcome =
    input.draft === true && !input.validation.passed
      ? "draft"
      : input.validation.passed
        ? "passed"
        : "failed";

  return {
    success: outcome !== "failed",
    outcome,
    command: input.command,
    targetPath: input.targetPath,
    feature: {
      id: input.feature.id,
      slug: input.feature.slug,
      path: input.feature.relativePath
    },
    createdFiles: input.actions
      .filter((entry) => entry.action === "created")
      .map((entry) => entry.path),
    skippedFiles: input.actions
      .filter((entry) => entry.action === "skipped")
      .map((entry) => entry.path),
    staleFiles: input.actions.filter((entry) => isStale(entry.action)).map((entry) => entry.path),
    overwrittenFiles: input.actions
      .filter((entry) => entry.action === "overwritten")
      .map((entry) => entry.path),
    updatedFiles: input.actions
      .filter((entry) => entry.action === "updated")
      .map((entry) => entry.path),
    validated: input.validated,
    validation: input.validation,
    dryRun: input.dryRun,
    promptPath: input.promptPath,
    warnings: input.warnings,
    nextCommand: input.nextCommand
  };
}

export function formatTemplateWorkflowSummary(summary: TemplateWorkflowSummary): string {
  const draft = summary.outcome === "draft";
  const lines = [
    formatHeader(
      summary.dryRun
        ? `Visp ${summary.command} dry run.`
        : draft
          ? `Visp ${summary.command} draft written.`
          : `Visp ${summary.command} template ready.`
    ),
    "",
    formatKeyValue("Feature", `${summary.feature.id}-${summary.feature.slug}`)
  ];

  if (summary.createdFiles.length > 0) {
    lines.push("", "Created:", ...summary.createdFiles.map((file) => `  ${file}`));
  }

  if (summary.skippedFiles.length > 0) {
    lines.push("", "Skipped:", ...summary.skippedFiles.map((file) => `  ${file}`));
  }

  if (summary.staleFiles.length > 0) {
    lines.push(
      "",
      "Stale (kept superseded content, not regenerated):",
      ...summary.staleFiles.map((file) => `  ${file}`),
      "",
      "These files exist but no longer match the current inputs. Downstream",
      "commands will fail to bind to them. Re-run with --force to regenerate."
    );
  }

  if (summary.overwrittenFiles.length > 0) {
    lines.push("", "Overwritten:", ...summary.overwrittenFiles.map((file) => `  ${file}`));
  }

  if (summary.updatedFiles.length > 0) {
    lines.push("", "Updated:", ...summary.updatedFiles.map((file) => `  ${file}`));
  }

  lines.push(
    "",
    formatKeyValue(
      draft ? "Draft" : "Validation",
      draft ? "not filled in yet" : summary.validation.passed ? "passed" : "failed"
    )
  );

  if (summary.validation.errors.length > 0) {
    lines.push(
      "",
      draft ? "Still to fill in:" : "Validation errors:",
      ...summary.validation.errors.map((error) => `  ${error}`)
    );
  }

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  if (draft) {
    lines.push(
      "",
      `This is a skeleton, not an accepted ${summary.command} artifact. ${summary.nextCommand}`,
      `will refuse it until the fields above are filled in and validation passes.`,
      "",
      "Next:",
      `  Use ${summary.promptPath} with your AI coding tool to fill in ${summary.feature.path}, then run:`,
      `  visp-kit ${summary.command} --validate`
    );
  } else if (summary.validation.passed) {
    lines.push(
      "",
      "Next:",
      `  Use ${summary.promptPath} with your AI coding tool, then run:`,
      `  visp-kit ${summary.command} --validate`,
      `  ${summary.nextCommand}`
    );
  } else {
    lines.push(
      "",
      `Validation failed. Fix the errors above in ${summary.feature.path}, then run:`,
      `  visp-kit ${summary.command} --validate`
    );
  }

  return `${lines.join("\n")}\n`;
}

export const workflowStateByCommand: Record<TemplateCommandName, ProjectWorkflowState> = {
  clarify: "clarification_ready",
  spec: "spec_ready",
  plan: "plan_ready",
  tasks: "tasks_ready"
};
