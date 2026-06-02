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
): string {
  const highest = [...directoryNames]
    .sort()
    .map(parseFeatureNumber)
    .filter((value): value is number => value !== undefined)
    .reduce((current, value) => Math.max(current, value), 0);
  const next = highest + 1;

  if (next > 999) {
    throw new RangeError("Feature ID limit reached.");
  }

  return String(next).padStart(3, "0");
}

export function featureDirectoryForSlug(
  directoryNames: readonly string[],
  slug: string
): string | undefined {
  return [...directoryNames]
    .sort()
    .find(
      (name) =>
        validFeatureDirectoryPattern.test(name) && name.slice(4) === slug
    );
}

export function featureDirectoryName(id: string, slug: string): string {
  return `${id}-${slug}`;
}
