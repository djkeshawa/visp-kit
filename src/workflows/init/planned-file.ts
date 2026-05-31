import path from "node:path";
import { type ZodType } from "zod";

import { writeArtifact } from "../../artifacts/artifact-writer.js";
import { createArtifactValidationError } from "../../artifacts/validation-error.js";
import { VispError } from "../../core/errors.js";
import { pathExists, writeTextFile } from "../../core/file-system.js";
import { err, ok, type Result } from "../../core/result.js";
import { type InitFileAction } from "./init-summary.js";

export type ArtifactFile<T> = {
  readonly kind: "artifact";
  readonly path: string;
  readonly displayPath: string;
  readonly artifactName: string;
  readonly schema: ZodType<T>;
  readonly value: T;
};

export type TextFile = {
  readonly kind: "text";
  readonly path: string;
  readonly displayPath: string;
  readonly contents: string;
};

export type PlannedFile = ArtifactFile<unknown> | TextFile;

function displayPath(targetPath: string, filePath: string): string {
  return path.relative(targetPath, filePath).split(path.sep).join("/");
}

export function textFile(
  targetPath: string,
  filePath: string,
  contents: string
): TextFile {
  return {
    kind: "text",
    path: filePath,
    displayPath: displayPath(targetPath, filePath),
    contents
  };
}

export function artifactFile<T>(
  targetPath: string,
  filePath: string,
  artifactName: string,
  schema: ZodType<T>,
  value: T
): ArtifactFile<T> {
  return {
    kind: "artifact",
    path: filePath,
    displayPath: displayPath(targetPath, filePath),
    artifactName,
    schema,
    value
  };
}

function validatePlannedFile(file: PlannedFile): Result<void, VispError> {
  if (file.kind === "text") {
    return ok(undefined);
  }

  const validation = file.schema.safeParse(file.value);

  if (!validation.success) {
    return err(
      createArtifactValidationError(
        validation.error,
        file.artifactName,
        file.displayPath
      )
    );
  }

  return ok(undefined);
}

export async function writePlannedFile(
  file: PlannedFile,
  options: { readonly force: boolean; readonly dryRun: boolean }
): Promise<Result<InitFileAction, VispError>> {
  const validation = validatePlannedFile(file);

  if (!validation.ok) {
    return validation;
  }

  const exists = await pathExists(file.path);

  if (!exists.ok) {
    return exists;
  }

  if (exists.value && !options.force) {
    return ok({ path: file.displayPath, action: "skipped" });
  }

  const action = exists.value ? "overwritten" : "created";

  if (options.dryRun) {
    return ok({ path: file.displayPath, action });
  }

  const writeResult =
    file.kind === "artifact"
      ? await writeArtifact(file.path, file.schema, file.value, {
          artifactName: file.artifactName
        })
      : await writeTextFile(file.path, file.contents);

  if (!writeResult.ok) {
    return writeResult;
  }

  return ok({ path: file.displayPath, action });
}
