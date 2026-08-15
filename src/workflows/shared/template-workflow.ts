import { type ZodType } from "zod";

import { readArtifact } from "../../artifacts/artifact-reader.js";
import { projectStatusArtifactPath } from "../../artifacts/artifact-paths.js";
import { type VispError } from "../../core/errors.js";
import { pathExists, readTextFile } from "../../core/file-system.js";
import { relativePath } from "../../core/paths.js";
import { ok, type Result } from "../../core/result.js";
import { updateWorkflowStatus } from "./workflow-status.js";
import { type ActiveFeature } from "./active-feature.js";
import {
  type GeneratedFile,
  type WorkflowFileAction,
  writeGeneratedFiles,
  writeUpdatedGeneratedFiles
} from "./generated-files.js";
import {
  createTemplateWorkflowSummary,
  type TemplateCommandName,
  type TemplateWorkflowSummary,
  type WorkflowValidation,
  workflowStateByCommand
} from "./workflow-summary.js";
import { recordWorkflowRun } from "./run-recorder.js";
import { refreshFeatureTimeline } from "./timeline-refresh.js";

export type TemplateWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly validate?: boolean;
  readonly promptOnly?: boolean;
  readonly now?: string;
};

export function textGeneratedFile(input: {
  readonly targetPath: string;
  readonly path: string;
  readonly contents: string;
}): GeneratedFile {
  return {
    kind: "text",
    path: input.path,
    displayPath: relativePath(input.targetPath, input.path),
    contents: input.contents
  };
}

export function artifactGeneratedFile<T>(input: {
  readonly targetPath: string;
  readonly path: string;
  readonly artifactName: string;
  readonly schema: ZodType<T>;
  readonly value: T;
}): GeneratedFile {
  return {
    kind: "artifact",
    path: input.path,
    displayPath: relativePath(input.targetPath, input.path),
    artifactName: input.artifactName,
    schema: input.schema as ZodType<unknown>,
    value: input.value
  };
}

export async function missingFileErrors(
  files: readonly { readonly path: string; readonly displayPath: string }[]
): Promise<readonly string[]> {
  const errors: string[] = [];

  for (const file of files) {
    const exists = await pathExists(file.path);

    if (!exists.ok || !exists.value) {
      errors.push(`Missing required file: ${file.displayPath}.`);
    }
  }

  return errors;
}

export async function validateTextExists(
  filePath: string,
  displayPath: string
): Promise<readonly string[]> {
  const result = await readTextFile(filePath);
  return result.ok ? [] : [`Missing or unreadable file: ${displayPath}.`];
}

export async function validateArtifactFile<T>(
  filePath: string,
  displayPath: string,
  schema: ZodType<T>,
  artifactName: string
): Promise<{ readonly value?: T; readonly errors: readonly string[] }> {
  const result = await readArtifact(filePath, schema, { artifactName });

  if (!result.ok) {
    return {
      errors: [`${displayPath}: ${result.error.message}`]
    };
  }

  return { value: result.value, errors: [] };
}

export async function completeTemplateWorkflow(input: {
  readonly command: TemplateCommandName;
  readonly targetPath: string;
  readonly feature: ActiveFeature;
  readonly files: readonly GeneratedFile[];
  readonly updateFiles?: readonly GeneratedFile[];
  /**
   * Markdown projections of the validated JSON artifacts. Written on the
   * validate path only, and only once validation passed, so an unparseable or
   * schema-failing artifact never renders. They cannot travel through `files`
   * or `updateFiles`: the validateOnly branch returns before either channel is
   * consumed, so anything passed there would be silently discarded.
   */
  readonly derivedFiles?: readonly GeneratedFile[];
  readonly promptFile: GeneratedFile;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly promptOnly: boolean;
  readonly validateOnly: boolean;
  readonly validation: WorkflowValidation;
  readonly promptPath: string;
  readonly warnings: readonly string[];
  readonly nextCommand: string;
  readonly now: string;
  /**
   * This call seeded a fresh skeleton rather than judging authored content.
   * Set only on the generation path, where the artifact being validated is the
   * template this command just built — so its unfilled fields are work to do,
   * not a failure to report. Never set on `--validate`, which judges what the
   * author actually wrote and must still fail on placeholders.
   */
  readonly draft?: boolean;
}): Promise<Result<TemplateWorkflowSummary, VispError>> {
  if (input.validateOnly) {
    const actions: WorkflowFileAction[] = [];
    if (input.validation.passed && !input.dryRun && !input.promptOnly) {
      const derived = await writeUpdatedGeneratedFiles(input.derivedFiles ?? [], {
        dryRun: false
      });

      if (!derived.ok) return derived;

      actions.push(...derived.value);

      const status = await updateWorkflowStatus({
        targetPath: input.targetPath,
        feature: input.feature,
        state: workflowStateByCommand[input.command],
        lastCommand: input.command,
        now: input.now,
        dryRun: false
      });
      if (!status.ok) return status;
      actions.push({
        path: relativePath(input.targetPath, projectStatusArtifactPath(input.targetPath)),
        action: "updated"
      });

      const timeline = await refreshFeatureTimeline({
        targetPath: input.targetPath,
        feature: input.feature.key,
        dryRun: false,
        now: input.now
      });
      actions.push(
        ...timeline.writtenFiles.map((filePath) => ({
          path: filePath,
          action: "updated" as const
        }))
      );
    }

    return ok(
      createTemplateWorkflowSummary({
        command: input.command,
        targetPath: input.targetPath,
        feature: input.feature,
        actions,
        validated: true,
        validation: input.validation,
        dryRun: input.dryRun,
        promptPath: input.promptPath,
        warnings: input.warnings,
        nextCommand: input.nextCommand
      })
    );
  }

  const files = input.promptOnly ? [input.promptFile] : [...input.files, input.promptFile];
  const actions = await writeGeneratedFiles(files, {
    force: input.force,
    dryRun: input.dryRun
  });

  if (!actions.ok) return actions;

  const finalActions: WorkflowFileAction[] = [...actions.value];

  if (!input.promptOnly && (input.updateFiles?.length ?? 0) > 0) {
    const updates = await writeUpdatedGeneratedFiles(input.updateFiles ?? [], {
      dryRun: input.dryRun
    });

    if (!updates.ok) return updates;

    finalActions.push(...updates.value);
  }

  if (!input.promptOnly && input.validation.passed) {
    const status = await updateWorkflowStatus({
      targetPath: input.targetPath,
      feature: input.feature,
      state: workflowStateByCommand[input.command],
      lastCommand: input.command,
      now: input.now,
      dryRun: input.dryRun
    });

    if (!status.ok) return status;

    finalActions.push({
      path: relativePath(input.targetPath, projectStatusArtifactPath(input.targetPath)),
      action: "updated"
    });

    const timeline = await refreshFeatureTimeline({
      targetPath: input.targetPath,
      feature: input.feature.key,
      dryRun: input.dryRun,
      now: input.now
    });

    finalActions.push(
      ...timeline.writtenFiles.map((filePath) => ({
        path: filePath,
        action: "updated" as const
      }))
    );
  }

  // A seeded skeleton is recorded as a run that produced work to do, not as a
  // failed run. Its unfilled fields still travel in the ledger — as warnings,
  // where a reader can see them — so nothing is hidden by the reclassification.
  const isDraft = input.draft === true && !input.validation.passed;
  const draftWarnings = isDraft
    ? [
        `Draft written with ${input.validation.errors.length} field(s) still to fill in. ` +
          `Not accepted until \`visp-kit ${input.command} --validate\` passes.`,
        ...input.validation.errors
      ]
    : [];
  const run = await recordWorkflowRun({
    targetPath: input.targetPath,
    command: input.command,
    endedAt: input.now,
    feature: {
      id: input.feature.id,
      slug: input.feature.slug
    },
    success: input.validation.passed || isDraft,
    result: input.validation.passed
      ? input.warnings.length > 0
        ? "warnings"
        : "passed"
      : isDraft
        ? "warnings"
        : "failed",
    actions: finalActions,
    warnings: [...input.warnings, ...draftWarnings],
    errors: isDraft ? [] : input.validation.errors,
    dryRun: input.dryRun
  });

  finalActions.push(
    ...run.writtenFiles.map((filePath) => ({
      path: filePath,
      action: "updated" as const
    }))
  );

  return ok(
    createTemplateWorkflowSummary({
      command: input.command,
      targetPath: input.targetPath,
      feature: input.feature,
      actions: finalActions,
      validated: !input.promptOnly,
      validation: input.validation,
      dryRun: input.dryRun,
      promptPath: input.promptPath,
      warnings: [...input.warnings, ...run.warnings],
      nextCommand: input.nextCommand,
      draft: input.draft
    })
  );
}
