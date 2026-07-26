import { type ZodType } from "zod";

import { type VispError } from "../core/errors.js";
import { writeJsonFile } from "../core/file-system.js";
import { err, type Result } from "../core/result.js";
import { createArtifactValidationError } from "./validation-error.js";

export type WriteArtifactOptions = {
  readonly artifactName?: string;
};

export async function writeArtifact<T>(
  artifactPath: string,
  schema: ZodType<T>,
  value: unknown,
  options: WriteArtifactOptions = {}
): Promise<Result<string, VispError>> {
  const result = schema.safeParse(value);

  if (!result.success) {
    return err(
      createArtifactValidationError(
        result.error,
        options.artifactName ?? artifactPath,
        artifactPath,
        schema
      )
    );
  }

  return writeJsonFile(artifactPath, result.data);
}
