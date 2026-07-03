import { type ZodError } from "zod";

import { VispError } from "../core/errors.js";

function formatIssuePath(path: readonly (string | number)[]): string {
  return path.length > 0 ? path.map(String).join(".") : "(root)";
}

export function formatValidationError(error: ZodError, artifactName = "artifact"): string {
  const lines = [`Invalid ${artifactName}:`];

  for (const issue of error.issues) {
    lines.push(`- ${formatIssuePath(issue.path)}: ${issue.message}`);
  }

  return lines.join("\n");
}

export function createArtifactValidationError(
  error: ZodError,
  artifactName: string,
  artifactPath?: string
): VispError {
  return new VispError("VALIDATION_FAILED", formatValidationError(error, artifactName), {
    cause: error,
    details: {
      artifactName,
      artifactPath,
      issues: error.issues.map((issue) => ({
        path: formatIssuePath(issue.path),
        message: issue.message,
        code: issue.code
      }))
    }
  });
}
