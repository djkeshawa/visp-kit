import { type ZodType } from "zod";

import { VispError } from "../core/errors.js";
import { readTextFile } from "../core/file-system.js";
import { err, ok, type Result } from "../core/result.js";
import { createArtifactValidationError } from "./validation-error.js";

export type ReadArtifactOptions = {
  readonly artifactName?: string;
};

export async function readArtifact<T>(
  artifactPath: string,
  schema: ZodType<T>,
  options: ReadArtifactOptions = {}
): Promise<Result<T, VispError>> {
  const text = await readTextFile(artifactPath);

  if (!text.ok) {
    return text;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return err(
      new VispError("VALIDATION_FAILED", `Invalid JSON in ${artifactPath}: ${message}`, {
        cause: error,
        details: { artifactPath }
      })
    );
  }

  const result = schema.safeParse(parsed);

  if (!result.success) {
    return err(
      createArtifactValidationError(
        result.error,
        options.artifactName ?? artifactPath,
        artifactPath
      )
    );
  }

  return ok(result.data);
}
