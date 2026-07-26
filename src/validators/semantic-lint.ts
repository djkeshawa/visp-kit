const placeholderPatterns = [/\bTBD\b/iu, /\bTBC\b/iu, /\bTODO\b/iu, /<[^>]+>/u, /^placeholder$/iu];

export function isPlaceholderText(value: string): boolean {
  const text = value.trim();
  return text.length === 0 || placeholderPatterns.some((pattern) => pattern.test(text));
}

export function concreteStrings(input: {
  readonly values: readonly string[];
  readonly label: string;
}): readonly string[] {
  return input.values.flatMap((value, index) =>
    isPlaceholderText(value) ? [`${input.label}[${index}] contains placeholder text.`] : []
  );
}

export function concreteText(input: {
  readonly value: string;
  readonly label: string;
}): readonly string[] {
  return isPlaceholderText(input.value) ? [`${input.label} contains placeholder text.`] : [];
}

export function isTautologicalCriterion(input: {
  readonly criterion: string;
  readonly requirementTitle: string;
  readonly requirementDescription: string;
}): boolean {
  const normalize = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, " ")
      .trim();
  const criterion = normalize(input.criterion);
  return (
    criterion.length < 12 ||
    criterion === normalize(input.requirementTitle) ||
    criterion === normalize(input.requirementDescription)
  );
}

export function hasConcreteCommand(commands: readonly string[]): boolean {
  return commands.some((command) => !isPlaceholderText(command));
}

export function hasConcretePath(paths: readonly string[]): boolean {
  return paths.some((path) => !isPlaceholderText(path));
}

export function placeholderFindings(value: unknown, path = "artifact"): readonly string[] {
  if (typeof value === "string") {
    return isPlaceholderText(value) ? [`${path} contains placeholder text.`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => placeholderFindings(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      placeholderFindings(item, `${path}.${key}`)
    );
  }
  return [];
}
