/**
 * How a review decision reaches disk, and how it is kept honest once there.
 *
 * A decision is append-only: the decision file itself is created exclusively
 * and never rewritten, and a separate pointer names which one is current. The
 * two-step exists so a crash between them leaves a decision nobody points at
 * rather than a pointer to a decision that was never written.
 *
 * `withPointerLock` plus `assertExpectedPointer` is a compare-and-swap: the
 * pointer is re-read under the lock and checked against the value the caller
 * planned from, so a concurrent writer cannot have its decision silently
 * replaced by one that never saw it.
 *
 * Extracted from `review-decision.ts`, which now reads as decision logic rather
 * than as storage mechanics.
 */
import { randomUUID } from "node:crypto";
import { lstat, open, rename, rm } from "node:fs/promises";
import path from "node:path";

import { reviewDecisionHistoryArtifactPath } from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import {
  currentReviewDecisionPointerSchema,
  reviewDecisionSchema,
  type CurrentReviewDecisionPointer,
  type ReviewDecision
} from "../artifacts/schemas/review-decision.schema.js";
import { VispError, toVispError } from "../core/errors.js";
import {
  type ExclusiveFileIdentity,
  pathExists,
  readTextFile,
  withExclusiveDirectoryLock,
  writeTextFileExclusiveWithIdentity
} from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { canonicalJsonV1 } from "../integration/canonical-json.js";

export function pointerFor(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly decision: ReviewDecision;
}): CurrentReviewDecisionPointer {
  return {
    version: "1.0",
    featureId: input.decision.featureId,
    featureSlug: input.decision.featureSlug,
    taskId: input.decision.taskId,
    decisionPath: relativePath(
      input.targetPath,
      reviewDecisionHistoryArtifactPath(
        input.targetPath,
        input.featureKey,
        input.decision.taskId,
        input.decision.decisionHash
      )
    ),
    decisionHash: input.decision.decisionHash,
    updatedAt: input.decision.decidedAt
  };
}

export async function writeImmutableDecision(
  historyPath: string,
  decision: ReviewDecision
): Promise<
  Result<
    {
      readonly path: string;
      readonly createdIdentity?: ExclusiveFileIdentity;
    },
    VispError
  >
> {
  const serialized = `${JSON.stringify(decision, null, 2)}\n`;
  const written = await writeTextFileExclusiveWithIdentity(historyPath, serialized);
  if (written.ok) {
    return ok({ path: written.value.path, createdIdentity: written.value.identity });
  }

  if ((written.error.cause as NodeJS.ErrnoException | undefined)?.code !== "EEXIST") {
    return written;
  }

  const existing = await readArtifact(historyPath, reviewDecisionSchema, {
    artifactName: "review decision history"
  });
  if (!existing.ok) return existing;
  return canonicalJsonV1(existing.value) === canonicalJsonV1(decision)
    ? ok({ path: historyPath })
    : err(
        new VispError(
          "VALIDATION_FAILED",
          "Content-addressed review decision history already contains different content."
        )
      );
}

export async function withPointerLock<T>(
  pointerPath: string,
  operation: () => Promise<Result<T, VispError>>
): Promise<Result<T, VispError>> {
  return withExclusiveDirectoryLock(
    `${pointerPath}.lock`,
    "review decision pointer update",
    operation
  );
}

export async function assertExpectedPointer(
  pointerPath: string,
  expectedPointerRaw: string | undefined
): Promise<Result<void, VispError>> {
  const currentExists = await pathExists(pointerPath);
  if (!currentExists.ok) return currentExists;
  const currentRaw = currentExists.value ? await readTextFile(pointerPath) : ok(undefined);
  if (!currentRaw.ok) return currentRaw;
  return currentRaw.value === expectedPointerRaw
    ? ok(undefined)
    : err(
        new VispError(
          "VALIDATION_FAILED",
          "Current review decision pointer changed concurrently; retry the command."
        )
      );
}

export async function replacePointer(
  pointerPath: string,
  pointer: CurrentReviewDecisionPointer
): Promise<Result<string, VispError>> {
  const tempPath = path.join(
    path.dirname(pointerPath),
    `.${path.basename(pointerPath)}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    const handle = await open(tempPath, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(pointer, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tempPath, pointerPath);
    return ok(pointerPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    return err(toVispError(error, "FILE_SYSTEM_ERROR"));
  }
}

export async function writeAtomicPointer(
  pointerPath: string,
  pointer: CurrentReviewDecisionPointer,
  expectedPointerRaw: string | undefined
): Promise<Result<string, VispError>> {
  const parsed = currentReviewDecisionPointerSchema.safeParse(pointer);
  if (!parsed.success) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Invalid review decision pointer: ${parsed.error.issues[0]?.message ?? "unknown error"}.`
      )
    );
  }
  return withPointerLock(pointerPath, async () => {
    const expected = await assertExpectedPointer(pointerPath, expectedPointerRaw);
    return expected.ok ? replacePointer(pointerPath, parsed.data) : expected;
  });
}

export async function removeCreatedHistory(
  historyPath: string,
  identity: ExclusiveFileIdentity
): Promise<void> {
  try {
    const current = await lstat(historyPath);
    if (current.dev === identity.device && current.ino === identity.inode) {
      await rm(historyPath);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function publishDecisionAndPointer(input: {
  readonly historyPath: string;
  readonly decision: ReviewDecision;
  readonly pointerPath: string;
  readonly pointer: CurrentReviewDecisionPointer;
  readonly expectedPointerRaw: string | undefined;
}): Promise<Result<string, VispError>> {
  return withPointerLock(input.pointerPath, async () => {
    const expected = await assertExpectedPointer(input.pointerPath, input.expectedPointerRaw);
    if (!expected.ok) return expected;

    const history = await writeImmutableDecision(input.historyPath, input.decision);
    if (!history.ok) return history;
    const written = await replacePointer(input.pointerPath, input.pointer);
    if (!written.ok && history.value.createdIdentity !== undefined) {
      try {
        await removeCreatedHistory(input.historyPath, history.value.createdIdentity);
      } catch (error) {
        return err(toVispError(error, "FILE_SYSTEM_ERROR"));
      }
    }
    return written;
  });
}

export async function pointerRaw(
  pointerPath: string
): Promise<Result<string | undefined, VispError>> {
  const exists = await pathExists(pointerPath);
  if (!exists.ok) return exists;
  if (!exists.value) return ok(undefined);
  return readTextFile(pointerPath);
}
