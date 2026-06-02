import { type ZodType } from "zod";

import { readArtifact } from "../../artifacts/artifact-reader.js";
import { projectStatusArtifactPath } from "../../artifacts/artifact-paths.js";
import { VispError } from "../../core/errors.js";
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
}): Promise<Result<TemplateWorkflowSummary, VispError>> {
  if (input.validateOnly) {
    return ok(
      createTemplateWorkflowSummary({
        command: input.command,
        targetPath: input.targetPath,
        feature: input.feature,
        actions: [],
        validated: true,
        validation: input.validation,
        dryRun: input.dryRun,
        promptPath: input.promptPath,
        warnings: input.warnings,
        nextCommand: input.nextCommand
      })
    );
  }

  const files =
    input.promptOnly
      ? [input.promptFile]
      : [...input.files, input.promptFile];
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
  }

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
      warnings: input.warnings,
      nextCommand: input.nextCommand
    })
  );
}
