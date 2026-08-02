import { createHash } from "node:crypto";
import path from "node:path";
import { type ZodType } from "zod";

import { writeArtifact } from "../artifacts/artifact-writer.js";
import { createArtifactValidationError } from "../artifacts/validation-error.js";
import { type VispError } from "../core/errors.js";
import { pathExists, readTextFile, writeTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";

/**
 * `skipped` means the file already held exactly what would have been written.
 * `stale` means it exists, differs from what the current inputs produce, and was
 * left alone because `--force` was absent.
 *
 * The distinction matters: silently skipping a stale artifact leaves a pack or
 * plan bound to superseded inputs, and the failure then surfaces several
 * commands later as an unexplained binding error. Callers must surface `stale`.
 */
export type AgentFileAction = "created" | "updated" | "overwritten" | "skipped" | "stale";

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

/** True when the action put bytes on disk. `skipped` and `stale` did not. */
export function wroteFile(action: AgentFileAction): boolean {
  return action !== "skipped" && action !== "stale";
}

/**
 * A file left on disk holding superseded content. Callers must report these
 * rather than treat them as no-ops.
 */
export function isStale(action: AgentFileAction): boolean {
  return action === "stale";
}

function validateFile(file: AgentPlannedFile, displayPath: string): Result<void, VispError> {
  if (file.kind === "text") return ok(undefined);

  const validation = file.schema.safeParse(file.value);

  if (!validation.success) {
    return err(
      createArtifactValidationError(validation.error, file.artifactName, displayPath, file.schema)
    );
  }

  return ok(undefined);
}

/**
 * Exactly what `writeAgentPlannedFile` would write for this file, so an existing
 * file can be byte-compared against it. Returns `undefined` when the planned
 * contents cannot be determined, which is treated as stale rather than as
 * unchanged — an unknown answer must not read as "already correct".
 */
function plannedContents(file: AgentPlannedFile): string | undefined {
  if (file.kind === "text") return file.contents;

  const parsed = file.schema.safeParse(file.value);

  if (!parsed.success) return undefined;

  const serialized = JSON.stringify(parsed.data, null, 2);

  return serialized === undefined ? undefined : `${serialized}\n`;
}

export function generatedContentHash(contents: string): string {
  return `sha256:${createHash("sha256").update(contents, "utf8").digest("hex")}`;
}

/** The exact bytes this plan would write, for refuse-and-report messages. */
export function plannedFileContents(file: AgentPlannedFile): string | undefined {
  return plannedContents(file);
}

export async function writeAgentPlannedFile(
  targetPath: string,
  file: AgentPlannedFile,
  options: {
    readonly force: boolean;
    readonly dryRun: boolean;
    readonly alwaysUpdate?: boolean;
    /**
     * D-118 decision 4: sha256 of this file's bytes as previously generated.
     * When the on-disk bytes still match it, the user never touched the file
     * and a changed template regenerates silently. When they differ, the file
     * carries user edits and is refused (`stale`) — never overwritten.
     */
    readonly recordedHash?: string;
  }
): Promise<Result<AgentWriteResult, VispError>> {
  const displayPath = relativePath(targetPath, file.path);
  const validation = validateFile(file, displayPath);

  if (!validation.ok) return validation;

  const exists = await pathExists(file.path);

  if (!exists.ok) return exists;

  if (exists.value && !options.force && !options.alwaysUpdate) {
    // Distinguish "already correct" from "superseded". Byte-comparing against
    // exactly what the writer would emit is what makes the answer trustworthy:
    // writeArtifact serialises through the schema, so parse first and compare
    // the parsed projection rather than the caller's raw value.
    const planned = plannedContents(file);
    const current = await readTextFile(file.path);

    if (!current.ok) return current;

    if (planned !== undefined && current.value === planned) {
      return ok({ path: displayPath, action: "skipped" });
    }

    // Unmodified-but-superseded: the disk bytes are exactly what a previous
    // version generated, so there is nothing of the user's to preserve.
    if (
      planned !== undefined &&
      options.recordedHash !== undefined &&
      generatedContentHash(current.value) === options.recordedHash
    ) {
      if (!options.dryRun) {
        const write =
          file.kind === "artifact"
            ? await writeArtifact(file.path, file.schema, file.value, {
                artifactName: file.artifactName
              })
            : await writeTextFile(file.path, file.contents);
        if (!write.ok) return write;
      }
      return ok({ path: displayPath, action: "updated" });
    }

    return ok({ path: displayPath, action: "stale" });
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
