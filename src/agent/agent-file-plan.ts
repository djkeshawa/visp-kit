import path from "node:path";
import { type ZodType } from "zod";

import { writeArtifact } from "../artifacts/artifact-writer.js";
import { createArtifactValidationError } from "../artifacts/validation-error.js";
import { type VispError } from "../core/errors.js";
import { pathExists, writeTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";

export type AgentFileAction = "created" | "updated" | "overwritten" | "skipped";

export type AgentTextFile = {
  readonly kind: "text";
  readonly path: string;
  readonly contents: string;
  readonly generated?: boolean;
};

export type AgentArtifactFile<T = unknown> = {
  readonly kind: "artifact";
  readonly path: string;
  readonly artifactName: string;
  readonly schema: ZodType<T>;
  readonly value: T;
  readonly generated?: boolean;
};

export type AgentPlannedFile = AgentTextFile | AgentArtifactFile;

export type AgentWriteResult = {
  readonly path: string;
  readonly action: AgentFileAction;
};

function validateFile(file: AgentPlannedFile, displayPath: string): Result<void, VispError> {
  if (file.kind === "text") return ok(undefined);

  const validation = file.schema.safeParse(file.value);

  if (!validation.success) {
    return err(createArtifactValidationError(validation.error, file.artifactName, displayPath));
  }

  return ok(undefined);
}

export async function writeAgentPlannedFile(
  targetPath: string,
  file: AgentPlannedFile,
  options: {
    readonly force: boolean;
    readonly dryRun: boolean;
    readonly alwaysUpdate?: boolean;
  }
): Promise<Result<AgentWriteResult, VispError>> {
  const displayPath = relativePath(targetPath, file.path);
  const validation = validateFile(file, displayPath);

  if (!validation.ok) return validation;

  const exists = await pathExists(file.path);

  if (!exists.ok) return exists;

  if (exists.value && !options.force && !options.alwaysUpdate) {
    return ok({ path: displayPath, action: "skipped" });
  }

  const action: AgentFileAction = exists.value
    ? options.alwaysUpdate && !options.force
      ? "updated"
      : "overwritten"
    : "created";

  if (!options.dryRun) {
    const write =
      file.kind === "artifact"
        ? await writeArtifact(file.path, file.schema, file.value, {
            artifactName: file.artifactName
          })
        : await writeTextFile(file.path, file.contents);

    if (!write.ok) return write;
  }

  return ok({ path: displayPath, action });
}

export function displayFilePath(targetPath: string, filePath: string): string {
  return relativePath(targetPath, path.resolve(filePath));
}
