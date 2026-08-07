// Two of these patterns are deliberately narrower than they look, because a
// project's own vocabulary must never be unvalidatable:
//
// - TODO is matched case-sensitively, unlike TBD/TBC. The marker convention is
//   uppercase; lowercase "todo" is an ordinary English word, and a project
//   whose domain IS todos (the first real one this was tried on) could never
//   validate: the feature slug — which the user cannot edit — and every honest
//   mention of the `todo` command were rejected as placeholders.
// - Angle brackets only count with whitespace inside. The templates Visp seeds
//   are multi-word phrases ("<describe your feature>"); single tokens like
//   `<title>` or `<div>` are CLI usage and markup notation, and the same
//   project's spec was rejected for quoting its own usage line.
const placeholderPatterns = [
  /\bTBD\b/iu,
  /\bTBC\b/iu,
  /\bTODO\b/u,
  /<[^>]*\s[^>]*>/u,
  /^placeholder$/iu
];

export function isPlaceholderText(value: string): boolean {
  const text = value.trim();
  return text.length === 0 || placeholderPatterns.some((pattern) => pattern.test(text));
}

/**
 * Why a string was judged a placeholder, phrased for the person fixing it.
 *
 * "plan.implementationApproach contains placeholder text." points at a field
 * that may hold a hundred words and says nothing about which of them offended.
 * A weak-model evaluation on a real project spent three rewrites on exactly
 * that message and drew the wrong conclusion about the cause — it decided the
 * validator wanted shorter prose, which is not a rule this file has.
 *
 * Naming the offending substring turns a guessing game into an edit.
 */
export function placeholderReason(value: string): string {
  const text = value.trim();
  if (text.length === 0) return "it is empty";

  const offenders = placeholderPatterns
    .map((pattern) => pattern.exec(text)?.[0])
    .filter((match): match is string => match !== undefined);

  return offenders.length === 0
    ? "it matches a placeholder pattern"
    : `it still contains ${offenders.map((match) => `"${match}"`).join(", ")}`;
}

export function concreteStrings(input: {
  readonly values: readonly string[];
  readonly label: string;
}): readonly string[] {
  return input.values.flatMap((value, index) =>
    isPlaceholderText(value)
      ? [`${input.label}[${index}] contains placeholder text: ${placeholderReason(value)}.`]
      : []
  );
}

export function concreteText(input: {
  readonly value: string;
  readonly label: string;
}): readonly string[] {
  return isPlaceholderText(input.value)
    ? [`${input.label} contains placeholder text: ${placeholderReason(input.value)}.`]
    : [];
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
    return isPlaceholderText(value)
      ? [`${path} contains placeholder text: ${placeholderReason(value)}.`]
      : [];
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
