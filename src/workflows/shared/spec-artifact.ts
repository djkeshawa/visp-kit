import { writeArtifact } from "../../artifacts/artifact-writer.js";
import { normalizeSpecArtifact } from "../../artifacts/normalizers/spec-normalizer.js";
import { specArtifactSchema, type SpecArtifact } from "../../artifacts/schemas/spec.schema.js";
import { createArtifactValidationError } from "../../artifacts/validation-error.js";
import { type VispError } from "../../core/errors.js";
import { readJsonFile } from "../../core/file-system.js";
import { err, ok, type Result } from "../../core/result.js";

export type NormalizedSpecArtifact = {
  readonly value: SpecArtifact;
  readonly warnings: readonly string[];
};

function normalizationWarning(input: {
  readonly displayPath: string;
  readonly changes: readonly string[];
  readonly dryRun: boolean;
  readonly writeNormalized: boolean;
}): string {
  const prefix =
    input.dryRun || !input.writeNormalized
      ? `Would normalize ${input.displayPath}`
      : `Auto-normalized ${input.displayPath}`;
  const preview = input.changes.slice(0, 8).join("; ");
  const hidden = input.changes.length > 8 ? `; ${input.changes.length - 8} more change(s)` : "";

  return `${prefix}: ${preview}${hidden}.`;
}

export async function readSpecArtifactWithNormalization(input: {
  readonly artifactPath: string;
  readonly displayPath: string;
  readonly dryRun: boolean;
  readonly writeNormalized: boolean;
}): Promise<Result<NormalizedSpecArtifact, VispError>> {
  const raw = await readJsonFile<unknown>(input.artifactPath);

  if (!raw.ok) return raw;

  const normalized = normalizeSpecArtifact(raw.value);
  const parsed = specArtifactSchema.safeParse(normalized.value);

  if (!parsed.success) {
    return err(createArtifactValidationError(parsed.error, "spec", input.artifactPath));
  }

  const warnings =
    normalized.changes.length > 0
      ? [
          normalizationWarning({
            displayPath: input.displayPath,
            changes: normalized.changes,
            dryRun: input.dryRun,
            writeNormalized: input.writeNormalized
          })
        ]
      : [];

  if (normalized.changes.length > 0 && input.writeNormalized && !input.dryRun) {
    const write = await writeArtifact(input.artifactPath, specArtifactSchema, parsed.data, {
      artifactName: "spec"
    });

    if (!write.ok) return write;
  }

  return ok({ value: parsed.data, warnings });
}

export async function validateSpecArtifactWithNormalization(input: {
  readonly artifactPath: string;
  readonly displayPath: string;
  readonly dryRun: boolean;
  readonly writeNormalized: boolean;
}): Promise<{
  readonly value?: SpecArtifact;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}> {
  const result = await readSpecArtifactWithNormalization(input);

  if (!result.ok) {
    return {
      errors: [`${input.displayPath}: ${result.error.message}`],
      warnings: []
    };
  }

  return {
    value: result.value.value,
    errors: [],
    warnings: result.value.warnings
  };
}
