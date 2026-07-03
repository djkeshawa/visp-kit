import { VispError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";

const validFeatureDirectoryPattern = /^(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseFeatureNumber(directoryName: string): number | undefined {
  const match = validFeatureDirectoryPattern.exec(directoryName);

  if (match === null) {
    return undefined;
  }

  return Number.parseInt(match[1] ?? "0", 10);
}

export function nextFeatureIdFromNames(
  directoryNames: readonly string[]
): Result<string, VispError> {
  const highest = [...directoryNames]
    .sort()
    .map(parseFeatureNumber)
    .filter((value): value is number => value !== undefined)
    .reduce((current, value) => Math.max(current, value), 0);
  const next = highest + 1;

  if (next > 999) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Feature ID limit reached: 999 feature folders already exist.",
        {
          recovery:
            "Archive or remove old feature folders under .visp/features/ before creating a new feature."
        }
      )
    );
  }

  return ok(String(next).padStart(3, "0"));
}

export function featureDirectoryForSlug(
  directoryNames: readonly string[],
  slug: string
): string | undefined {
  return [...directoryNames]
    .sort()
    .find((name) => validFeatureDirectoryPattern.test(name) && name.slice(4) === slug);
}

export function featureDirectoryName(id: string, slug: string): string {
  return `${id}-${slug}`;
}
