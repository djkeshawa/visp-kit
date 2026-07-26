import { type ZodType } from "zod";

import { writeArtifact } from "../../artifacts/artifact-writer.js";
import { type VispError } from "../../core/errors.js";
import { pathExists, readTextFile, writeTextFile } from "../../core/file-system.js";
import { err, ok, type Result } from "../../core/result.js";
import { createArtifactValidationError } from "../../artifacts/validation-error.js";

export type WorkflowFileAction = {
  readonly path: string;
  readonly action: "created" | "skipped" | "overwritten" | "updated" | "stale";
};

/**
 * `skipped` means the file already held exactly what would have been written.
 * `stale` means it exists, differs from what the current inputs produce, and was
 * left alone because `--force` was absent. Reporting both as "skipped" leaves a
 * superseded artifact bound to earlier inputs and surfaces the failure several
 * commands later as an unexplained binding error.
 */
export function wroteGeneratedFile(action: WorkflowFileAction["action"]): boolean {
  return action !== "skipped" && action !== "stale";
}

export type GeneratedFile =
  | {
      readonly kind: "text";
      readonly path: string;
      readonly displayPath: string;
      readonly contents: string;
    }
  | {
      readonly kind: "artifact";
      readonly path: string;
      readonly displayPath: string;
      readonly artifactName: string;
      readonly schema: ZodType<unknown>;
      readonly value: unknown;
    };

function validateFile(file: GeneratedFile): Result<void, VispError> {
  if (file.kind === "text") return ok(undefined);

  const result = file.schema.safeParse(file.value);

  if (result.success) return ok(undefined);

  return err(createArtifactValidationError(result.error, file.artifactName, file.displayPath));
}

/**
 * Exactly what the writer would emit for this file, so an existing file can be
 * byte-compared against it. `undefined` is treated as stale rather than
 * unchanged — an unknown answer must not read as "already correct".
 */
function plannedGeneratedContents(file: GeneratedFile): string | undefined {
  if (file.kind === "text") return file.contents;

  const parsed = file.schema.safeParse(file.value);

  if (!parsed.success) return undefined;

  const serialized = JSON.stringify(parsed.data, null, 2);

  return serialized === undefined ? undefined : `${serialized}\n`;
}

export async function writeGeneratedFiles(
  files: readonly GeneratedFile[],
  options: { readonly force: boolean; readonly dryRun: boolean }
): Promise<Result<readonly WorkflowFileAction[], VispError>> {
  const actions: WorkflowFileAction[] = [];

  for (const file of files) {
    const validation = validateFile(file);

    if (!validation.ok) return validation;

    const exists = await pathExists(file.path);

    if (!exists.ok) return exists;

    if (exists.value && !options.force) {
      const planned = plannedGeneratedContents(file);
      const current = await readTextFile(file.path);

      if (!current.ok) return current;

      actions.push({
        path: file.displayPath,
        action: planned !== undefined && current.value === planned ? "skipped" : "stale"
      });
      continue;
    }

    const action = exists.value ? "overwritten" : "created";
    actions.push({ path: file.displayPath, action });

    if (options.dryRun) continue;

    const result =
      file.kind === "text"
        ? await writeTextFile(file.path, file.contents)
        : await writeArtifact(file.path, file.schema, file.value, {
            artifactName: file.artifactName
          });

    if (!result.ok) return result;
  }

  return ok(actions);
}

export async function writeUpdatedGeneratedFiles(
  files: readonly GeneratedFile[],
  options: { readonly dryRun: boolean }
): Promise<Result<readonly WorkflowFileAction[], VispError>> {
  const actions: WorkflowFileAction[] = [];

  for (const file of files) {
    const validation = validateFile(file);

    if (!validation.ok) return validation;

    const exists = await pathExists(file.path);

    if (!exists.ok) return exists;

    actions.push({
      path: file.displayPath,
      action: exists.value ? "updated" : "created"
    });

    if (options.dryRun) continue;

    const result =
      file.kind === "text"
        ? await writeTextFile(file.path, file.contents)
        : await writeArtifact(file.path, file.schema, file.value, {
            artifactName: file.artifactName
          });

    if (!result.ok) return result;
  }

  return ok(actions);
}
