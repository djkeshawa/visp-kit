import { readdir } from "node:fs/promises";

import {
  featureArtifactDir,
  featureIntentArtifactPath,
  featuresArtifactDir,
  projectStatusArtifactPath
} from "../../artifacts/artifact-paths.js";
import { readArtifact } from "../../artifacts/artifact-reader.js";
import { featureIntentSchema, type FeatureIntent } from "../../artifacts/schemas/feature.schema.js";
import { projectStatusSchema, type ProjectStatus } from "../../artifacts/schemas/project.schema.js";
import { VispError, toVispError } from "../../core/errors.js";
import { pathExists } from "../../core/file-system.js";
import { relativePath, vispDir } from "../../core/paths.js";
import { err, ok, type Result } from "../../core/result.js";
import { parseFeatureNumber } from "../../features/feature-id.js";

export type ActiveFeature = {
  readonly id: string;
  readonly slug: string;
  readonly key: string;
  readonly path: string;
  readonly relativePath: string;
  readonly intent: FeatureIntent;
};

async function ensureVisp(targetPath: string): Promise<Result<void, VispError>> {
  const exists = await pathExists(vispDir(targetPath));

  if (!exists.ok) return exists;
  if (!exists.value) {
    return err(
      new VispError("VALIDATION_FAILED", "Visp Kit is not initialized. Run `visp init` first.")
    );
  }

  return ok(undefined);
}

async function activeSelector(targetPath: string): Promise<Result<string, VispError>> {
  const status = await readArtifact(projectStatusArtifactPath(targetPath), projectStatusSchema, {
    artifactName: "project status"
  });

  if (!status.ok) return status;

  return selectorFromStatus(status.value);
}

function selectorFromStatus(status: ProjectStatus): Result<string, VispError> {
  const selector =
    status.activeFeaturePath?.split("/").at(-1) ??
    status.activeFeatureId ??
    status.activeFeatureSlug;

  if (selector === undefined || selector === null || selector.trim().length === 0) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        'No active feature found. Run `visp feature "<idea>"` first or pass --feature.'
      )
    );
  }

  return ok(selector);
}

async function featureDirectoryNames(
  targetPath: string
): Promise<Result<readonly string[], VispError>> {
  try {
    const entries = await readdir(featuresArtifactDir(targetPath), {
      withFileTypes: true
    });

    return ok(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    );
  } catch (error) {
    return err(toVispError(error, "FILE_SYSTEM_ERROR"));
  }
}

function slugFromKey(key: string): string {
  return key.slice(4);
}

function findMatchingFeature(
  names: readonly string[],
  selector: string
): Result<string, VispError> {
  const normalized = selector.trim();
  const exact = names.filter((name) => name === normalized);

  if (exact.length === 1) return ok(exact[0] ?? normalized);

  const byId = names.filter((name) => name.startsWith(`${normalized}-`));
  const bySlug = names.filter((name) => slugFromKey(name) === normalized);
  const matches = [...new Set([...exact, ...byId, ...bySlug])].sort();

  if (matches.length === 0) {
    return err(new VispError("VALIDATION_FAILED", `Feature not found: ${selector}.`));
  }

  if (matches.length > 1) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Feature selector "${selector}" is ambiguous. Use the full feature folder name.`
      )
    );
  }

  return ok(matches[0] ?? normalized);
}

export async function resolveActiveFeature(input: {
  readonly targetPath: string;
  readonly feature?: string;
}): Promise<Result<ActiveFeature, VispError>> {
  const initialized = await ensureVisp(input.targetPath);

  if (!initialized.ok) return initialized;

  const selector =
    input.feature === undefined ? await activeSelector(input.targetPath) : ok(input.feature);

  if (!selector.ok) return selector;

  const names = await featureDirectoryNames(input.targetPath);

  if (!names.ok) return names;

  const key = findMatchingFeature(names.value, selector.value);

  if (!key.ok) return key;

  const id = parseFeatureNumber(key.value);

  if (id === undefined) {
    return err(new VispError("VALIDATION_FAILED", `Invalid feature folder: ${key.value}.`));
  }

  const intent = await readArtifact(
    featureIntentArtifactPath(input.targetPath, key.value),
    featureIntentSchema,
    { artifactName: "feature intent" }
  );

  if (!intent.ok) return intent;

  const featurePath = featureArtifactDir(input.targetPath, key.value);

  return ok({
    id: String(id).padStart(3, "0"),
    slug: slugFromKey(key.value),
    key: key.value,
    path: featurePath,
    relativePath: relativePath(input.targetPath, featurePath),
    intent: intent.value
  });
}
