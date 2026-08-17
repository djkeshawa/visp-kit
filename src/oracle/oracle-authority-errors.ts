import { canonicalJsonV1 } from "../integration/canonical-json.js";

/**
 * Diagnostics for the oracle's "authoritative copy" checks.
 *
 * The oracle resolves every acceptance criterion from ONE place — the top-level
 * `acceptanceCriteria[]` array in the specification — and then requires every
 * other copy of that criterion to be byte-identical to it. Two copies exist by
 * design: the requirement carries a nested copy, and the context pack carries a
 * frozen copy taken when the pack was compiled.
 *
 * LC-112: the failure said only `<container> does not contain the authoritative
 * <id> criterion`. It named neither which of the copies it considered
 * authoritative, nor which field differed, nor how to fix it — the requirement
 * *did* list the criterion, so the message read as false. Three attempts on a
 * real project produced no oracle plan and therefore no assurance artifact at
 * all. Every message here names the authoritative source, the JSON path of the
 * copy that disagrees, the fields that differ, the fragment the copy must equal,
 * and the command that repairs it.
 */

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

/**
 * The field names whose values differ between the two copies. A field present
 * on only one side counts as differing, which is how an added or dropped key is
 * reported rather than silently passing.
 */
export function differingFields(authoritative: unknown, found: unknown): readonly string[] {
  const left = asRecord(authoritative);
  const right = asRecord(found);

  // The canonical encoder rejects `undefined` by design, so presence is checked
  // before value: a key on only one side is a difference, not an encoding error.
  const encode = (value: JsonRecord, key: string): string =>
    Object.hasOwn(value, key) ? canonicalJsonV1(value[key]) : "\0absent";

  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => encode(left, key) !== encode(right, key))
    .sort();
}

function fragment(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function describeDifference(input: {
  readonly authoritative: unknown;
  readonly found: unknown | undefined;
}): string {
  if (input.found === undefined) return "It is absent.";

  const fields = differingFields(input.authoritative, input.found);

  return fields.length === 0
    ? "It differs in field ordering or nesting."
    : `It differs in: ${fields.join(", ")}.`;
}

function message(input: {
  readonly subject: string;
  readonly jsonPath: string;
  readonly containerPath: string;
  readonly authoritativePath: string;
  readonly authoritative: unknown;
  readonly found: unknown | undefined;
  readonly recovery: string;
}): string {
  return [
    `${input.subject} does not match its authoritative definition.`,
    `Authoritative copy: ${input.authoritativePath}.`,
    `Copy that disagrees: ${input.jsonPath} in ${input.containerPath}.`,
    describeDifference({ authoritative: input.authoritative, found: input.found }),
    "It must equal this exactly:",
    fragment(input.authoritative),
    `Fix: ${input.recovery}`
  ].join("\n");
}

/**
 * The requirement's nested copy of a criterion disagrees with the top-level
 * array. Both live in the specification, so the repair is an edit to the spec.
 */
export function nestedCriterionMismatch(input: {
  readonly requirementId: string;
  readonly criterionId: string;
  readonly specPath: string;
  readonly authoritative: unknown;
  readonly found: unknown | undefined;
}): string {
  return message({
    subject: `Acceptance criterion ${input.criterionId} nested under requirement ${input.requirementId}`,
    jsonPath: `requirements[id=${input.requirementId}].acceptanceCriteria[id=${input.criterionId}]`,
    containerPath: input.specPath,
    authoritativePath: `acceptanceCriteria[id=${input.criterionId}] in ${input.specPath}`,
    authoritative: input.authoritative,
    found: input.found,
    recovery: `edit ${input.specPath} so the nested copy equals the top-level entry, then run \`visp-kit spec --validate\`.`
  });
}

/**
 * The context pack's frozen copy disagrees with the specification. The pack is
 * generated, so the repair is to regenerate it — and `--force` is required,
 * because `visp-kit context <id>` keeps an existing pack and still exits 0.
 * That omission is exactly what made this unrecoverable in practice.
 */
export function contextCopyMismatch(input: {
  readonly kind: "requirement" | "criterion";
  readonly entityId: string;
  readonly taskId: string;
  readonly specPath: string;
  readonly contextPath: string;
  readonly authoritative: unknown;
  readonly found: unknown | undefined;
}): string {
  const array =
    input.kind === "requirement" ? "includedRequirements" : "includedAcceptanceCriteria";
  const specArray = input.kind === "requirement" ? "requirements" : "acceptanceCriteria";
  const noun = input.kind === "requirement" ? "Requirement" : "Acceptance criterion";

  return message({
    subject: `${noun} ${input.entityId} in the context pack for ${input.taskId}`,
    jsonPath: `${array}[id=${input.entityId}]`,
    containerPath: input.contextPath,
    authoritativePath: `${specArray}[id=${input.entityId}] in ${input.specPath}`,
    authoritative: input.authoritative,
    found: input.found,
    recovery:
      `regenerate the pack with \`visp-kit context ${input.taskId} --force\`. ` +
      "Without --force the existing pack is kept and this error repeats unchanged."
  });
}
