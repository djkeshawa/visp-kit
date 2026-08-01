import { constants, type Stats } from "node:fs";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

import { type ZodType, type ZodTypeDef } from "zod";

import { VispError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { createArtifactValidationError } from "./validation-error.js";

export type ReadArtifactOptions = {
  readonly artifactName?: string;
};

export type ReadArtifactStateOptions = ReadArtifactOptions & {
  readonly staleAfter?: Date;
};

type ArtifactReadMetadata = {
  readonly path: string;
  readonly modifiedAt: string;
};

export type PresentArtifact<T> = ArtifactReadMetadata & {
  readonly state: "present";
  readonly value: T;
};

export type MissingArtifact = {
  readonly state: "missing";
  readonly path: string;
  readonly reason: string;
};

export type StaleArtifact<T> = ArtifactReadMetadata & {
  readonly state: "stale";
  readonly value: T;
  readonly staleAfter: string;
  readonly reason: string;
};

export type UnreadableArtifactIssue = "io" | "invalid_json" | "invalid_schema";

export type UnreadableArtifact = {
  readonly state: "unreadable";
  readonly path: string;
  readonly issue: UnreadableArtifactIssue;
  readonly reason: string;
};

export type ArtifactReadState<T> =
  | PresentArtifact<T>
  | MissingArtifact
  | StaleArtifact<T>
  | UnreadableArtifact;

type NodeError = Error & { readonly code?: string };

function isNodeError(error: unknown): error is NodeError {
  return error instanceof Error;
}

type ArtifactFileRead = {
  readonly ok: true;
  readonly content: Buffer;
  readonly modifiedAt: string;
};

type DecodedArtifactFileRead = {
  readonly ok: true;
  readonly text: string;
  readonly modifiedAt: string;
};

type ArtifactFileFailure = {
  readonly ok: false;
  readonly state: MissingArtifact | UnreadableArtifact;
  readonly error: VispError;
};

function artifactFileFailure(error: unknown, artifactPath: string): ArtifactFileFailure {
  const missing = isNodeError(error) && error.code === "ENOENT";
  const legacyError = new VispError(
    missing ? "FILE_NOT_FOUND" : "FILE_SYSTEM_ERROR",
    `Unable to read ${artifactPath}.`,
    { cause: error, details: { path: artifactPath } }
  );

  if (missing) {
    return {
      ok: false,
      state: {
        state: "missing",
        path: artifactPath,
        reason: `Artifact is missing at ${artifactPath}.`
      },
      error: legacyError
    };
  }

  return {
    ok: false,
    state: {
      state: "unreadable",
      path: artifactPath,
      issue: "io",
      reason: `Unable to read ${artifactPath}: ${error instanceof Error ? error.message : String(error)}`
    },
    error: legacyError
  };
}

function decodeArtifactFile(
  file: ArtifactFileRead,
  artifactPath: string,
  issue: Extract<UnreadableArtifactIssue, "invalid_json" | "invalid_schema">
): DecodedArtifactFileRead | ArtifactFileFailure {
  try {
    // Keep the previous BOM behavior while rejecting replacement decoding. A
    // malformed byte sequence must never become schema-valid U+FFFD content.
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(file.content);
    return { ok: true, text, modifiedAt: file.modifiedAt };
  } catch (error) {
    const message = `Invalid UTF-8 in ${artifactPath}.`;
    return {
      ok: false,
      state: {
        state: "unreadable",
        path: artifactPath,
        issue,
        reason: message
      },
      error: new VispError("VALIDATION_FAILED", message, {
        cause: error,
        details: { artifactPath }
      })
    };
  }
}

async function readArtifactFile(
  artifactPath: string,
  containedRootPath?: string
): Promise<ArtifactFileRead | ArtifactFileFailure> {
  let artifactFile: FileHandle;

  try {
    const nonBlocking = constants.O_NONBLOCK ?? 0;
    artifactFile =
      containedRootPath === undefined
        ? await open(artifactPath, constants.O_RDONLY | nonBlocking)
        : await openContainedArtifactFile(containedRootPath, artifactPath);
  } catch (error) {
    return artifactFileFailure(error, artifactPath);
  }

  try {
    const fileStats = await artifactFile.stat();
    assertRegularArtifactFile(fileStats);
    const content = await artifactFile.readFile();
    return { ok: true, content, modifiedAt: fileStats.mtime.toISOString() };
  } catch (error) {
    return artifactFileFailure(error, artifactPath);
  } finally {
    await artifactFile.close().catch(() => undefined);
  }
}

async function openContainedArtifactFile(
  rootPath: string,
  artifactPath: string
): Promise<FileHandle> {
  const lexicalRootPath = path.resolve(rootPath);
  const lexicalArtifactPath = path.resolve(artifactPath);
  const relativeArtifactPath = path.relative(lexicalRootPath, lexicalArtifactPath);
  assertContainedPath(lexicalRootPath, lexicalArtifactPath);

  const rootRealPath = await realpath(lexicalRootPath);
  const expectedRealPath = path.resolve(rootRealPath, relativeArtifactPath);

  return await openContainedArtifactFileAttempt(
    lexicalRootPath,
    rootRealPath,
    lexicalArtifactPath,
    expectedRealPath
  );
}

async function openContainedArtifactFileAttempt(
  lexicalRootPath: string,
  rootRealPath: string,
  lexicalArtifactPath: string,
  expectedRealPath: string
): Promise<FileHandle> {
  await assertNoSymlinkComponents(lexicalRootPath, lexicalArtifactPath);

  let artifactRealPath: string;
  try {
    artifactRealPath = await realpath(lexicalArtifactPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      // A dangling link also makes realpath report ENOENT. Recheck the directory
      // entries so it remains an unsafe/unreadable path rather than being
      // mistaken for an absent artifact.
      await assertNoSymlinkComponents(lexicalRootPath, lexicalArtifactPath);
    }
    throw error;
  }
  assertContainedPath(rootRealPath, artifactRealPath);
  if (artifactRealPath !== expectedRealPath) {
    throw new Error("Artifact path must not traverse a symbolic link below the reader root.");
  }

  const noFollow = constants.O_NOFOLLOW ?? 0;
  const nonBlocking = constants.O_NONBLOCK ?? 0;
  const openFlags = constants.O_RDONLY | noFollow | nonBlocking;
  const artifactFile = await open(artifactRealPath, openFlags);
  try {
    const openedStats = await artifactFile.stat();
    assertRegularArtifactFile(openedStats);
    const currentArtifactRealPath = await realpath(lexicalArtifactPath);
    assertContainedPath(rootRealPath, currentArtifactRealPath);
    if (currentArtifactRealPath !== artifactRealPath) {
      throw new Error("Artifact path changed while it was being opened.");
    }

    // Deliberately no inode re-check here. The open above is O_NOFOLLOW, so the
    // descriptor is pinned to one inode and nothing that happens afterwards can
    // change the bytes this read returns. Comparing dev/ino against a second
    // open only detects an atomic rename — which is exactly how Kit writes, and
    // is harmless by construction. It also cannot catch the race worth catching:
    // a swap between the realpath check and the open leaves both opens observing
    // the substituted inode, so they agree and the check passes.
    //
    // The earlier version retried that comparison sixteen times and then
    // reported `unreadable`, which reintroduced on the read side the very defect
    // atomic writes were added to remove: mistaking an ordinary write for
    // corruption. Measured at ~2.5% false `unreadable` under rename pressure.
    // The path comparison above stays: it guards the lexical path, and a rename
    // of the leaf cannot make it fire.
    return artifactFile;
  } catch (error) {
    await artifactFile.close().catch(() => undefined);
    throw error;
  }
}

function assertRegularArtifactFile(stats: Stats): void {
  if (!stats.isFile()) {
    throw new Error("Artifact path must name a regular file.");
  }
}

async function assertNoSymlinkComponents(rootPath: string, artifactPath: string): Promise<void> {
  const relativePath = path.relative(rootPath, artifactPath);
  assertContainedPath(rootPath, artifactPath);

  let currentPath = rootPath;
  for (const segment of relativePath.split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, segment);
    try {
      if ((await lstat(currentPath)).isSymbolicLink()) {
        throw new Error("Artifact path must not traverse a symbolic link below the reader root.");
      }
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return;
      throw error;
    }
  }
}

function assertContainedPath(rootPath: string, candidatePath: string): void {
  const pathFromRoot = path.relative(rootPath, candidatePath);
  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(pathFromRoot)
  ) {
    throw new Error("Artifact path must resolve within the reader root.");
  }
}

type ResolvedArtifactState<T> =
  | {
      readonly ok: true;
      readonly state: PresentArtifact<T> | StaleArtifact<T>;
    }
  | {
      readonly ok: false;
      readonly state: MissingArtifact | UnreadableArtifact;
      readonly error: VispError;
    };

function withFreshness<T>(
  artifactPath: string,
  value: T,
  modifiedAt: string,
  options: ReadArtifactStateOptions
): PresentArtifact<T> | StaleArtifact<T> {
  if (options.staleAfter !== undefined && Date.parse(modifiedAt) < options.staleAfter.getTime()) {
    return {
      state: "stale",
      path: artifactPath,
      value,
      modifiedAt,
      staleAfter: options.staleAfter.toISOString(),
      reason: `Artifact at ${artifactPath} is older than the required freshness boundary ${options.staleAfter.toISOString()}.`
    };
  }

  return { state: "present", path: artifactPath, value, modifiedAt };
}

async function resolveArtifactState<Output, Input = Output>(
  artifactPath: string,
  schema: ZodType<Output, ZodTypeDef, Input>,
  options: ReadArtifactStateOptions = {},
  containedRootPath?: string
): Promise<ResolvedArtifactState<Output>> {
  if (options.staleAfter !== undefined && Number.isNaN(options.staleAfter.getTime())) {
    throw new TypeError("staleAfter must be a valid Date.");
  }

  const file = await readArtifactFile(artifactPath, containedRootPath);
  if (!file.ok) return file;
  const decoded = decodeArtifactFile(file, artifactPath, "invalid_json");
  if (!decoded.ok) return decoded;

  let parsed: unknown;

  try {
    parsed = JSON.parse(decoded.text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      state: {
        state: "unreadable",
        path: artifactPath,
        issue: "invalid_json",
        reason: `Invalid JSON in ${artifactPath}: ${message}`
      },
      error: new VispError("VALIDATION_FAILED", `Invalid JSON in ${artifactPath}: ${message}`, {
        cause: error,
        details: { artifactPath }
      })
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const validationError = createArtifactValidationError(
      result.error,
      options.artifactName ?? artifactPath,
      artifactPath,
      schema
    );
    return {
      ok: false,
      state: {
        state: "unreadable",
        path: artifactPath,
        issue: "invalid_schema",
        reason: validationError.message
      },
      error: validationError
    };
  }

  return {
    ok: true,
    state: withFreshness(artifactPath, result.data, decoded.modifiedAt, options)
  };
}

export async function readArtifactState<Output, Input = Output>(
  artifactPath: string,
  schema: ZodType<Output, ZodTypeDef, Input>,
  options: ReadArtifactStateOptions = {}
): Promise<ArtifactReadState<Output>> {
  return (await resolveArtifactState(artifactPath, schema, options)).state;
}

export async function readContainedArtifactState<Output, Input = Output>(
  rootPath: string,
  artifactPath: string,
  schema: ZodType<Output, ZodTypeDef, Input>,
  options: ReadArtifactStateOptions = {}
): Promise<ArtifactReadState<Output>> {
  return (await resolveArtifactState(artifactPath, schema, options, rootPath)).state;
}

export async function readTextArtifactState<Output, Input = Output>(
  artifactPath: string,
  schema: ZodType<Output, ZodTypeDef, Input>,
  options: ReadArtifactStateOptions = {}
): Promise<ArtifactReadState<Output>> {
  if (options.staleAfter !== undefined && Number.isNaN(options.staleAfter.getTime())) {
    throw new TypeError("staleAfter must be a valid Date.");
  }

  const file = await readArtifactFile(artifactPath);
  if (!file.ok) return file.state;
  const decoded = decodeArtifactFile(file, artifactPath, "invalid_schema");
  if (!decoded.ok) return decoded.state;

  const result = schema.safeParse(decoded.text);
  if (!result.success) {
    const validationError = createArtifactValidationError(
      result.error,
      options.artifactName ?? artifactPath,
      artifactPath,
      schema
    );
    return {
      state: "unreadable",
      path: artifactPath,
      issue: "invalid_schema",
      reason: validationError.message
    };
  }

  return withFreshness(artifactPath, result.data, decoded.modifiedAt, options);
}

export async function readContainedTextArtifactState<Output, Input = Output>(
  rootPath: string,
  artifactPath: string,
  schema: ZodType<Output, ZodTypeDef, Input>,
  options: ReadArtifactStateOptions = {}
): Promise<ArtifactReadState<Output>> {
  if (options.staleAfter !== undefined && Number.isNaN(options.staleAfter.getTime())) {
    throw new TypeError("staleAfter must be a valid Date.");
  }

  const file = await readArtifactFile(artifactPath, rootPath);
  if (!file.ok) return file.state;
  const decoded = decodeArtifactFile(file, artifactPath, "invalid_schema");
  if (!decoded.ok) return decoded.state;

  const result = schema.safeParse(decoded.text);
  if (!result.success) {
    const validationError = createArtifactValidationError(
      result.error,
      options.artifactName ?? artifactPath,
      artifactPath,
      schema
    );
    return {
      state: "unreadable",
      path: artifactPath,
      issue: "invalid_schema",
      reason: validationError.message
    };
  }

  return withFreshness(artifactPath, result.data, decoded.modifiedAt, options);
}

export async function readArtifact<Output, Input = Output>(
  artifactPath: string,
  schema: ZodType<Output, ZodTypeDef, Input>,
  options: ReadArtifactOptions = {}
): Promise<Result<Output, VispError>> {
  const result = await resolveArtifactState(artifactPath, schema, options);
  return result.ok ? ok(result.state.value) : err(result.error);
}
