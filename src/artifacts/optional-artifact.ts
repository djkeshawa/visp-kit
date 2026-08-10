import { type ZodType } from "zod";

import { pathExists } from "../core/file-system.js";
import { readArtifact } from "./artifact-reader.js";

/**
 * Read an artifact that may legitimately be absent.
 *
 * Missing, inaccessible and schema-invalid all resolve to a warning plus
 * `undefined`, never an error. This is the degradation contract every optional
 * input into the context pack relies on: a project that has not produced the
 * artifact behaves exactly as it did before the artifact existed.
 *
 * It lived inside `context-compiler.ts` until the understanding-case export
 * needed the same path from the gate, which does not compile context. Moving
 * it here keeps ONE degradation behaviour rather than two that drift; the
 * warning strings are unchanged so existing callers read identically.
 */
export async function optionalArtifact<T>(input: {
  readonly path: string;
  readonly schema: ZodType<T>;
  readonly artifactName: string;
  readonly warnings: string[];
}): Promise<T | undefined> {
  const exists = await pathExists(input.path);

  if (!exists.ok) {
    input.warnings.push(`Unable to access optional ${input.artifactName}: ${exists.error.message}`);
    return undefined;
  }

  if (!exists.value) {
    input.warnings.push(`Optional artifact missing: ${input.artifactName}.`);
    return undefined;
  }

  const artifact = await readArtifact(input.path, input.schema, {
    artifactName: input.artifactName
  });

  if (!artifact.ok) {
    input.warnings.push(
      `Optional artifact unreadable: ${input.artifactName}. ${artifact.error.message}`
    );
    return undefined;
  }

  return artifact.value;
}
