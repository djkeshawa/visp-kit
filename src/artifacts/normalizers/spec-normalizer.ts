const validValidationMethods = new Set(["unit", "integration", "e2e", "manual", "static"]);

const validRequirementSources = new Set(["user", "clarification", "derived"]);

type MutableObject = Record<string, unknown>;

export type SpecNormalizationResult = {
  readonly value: unknown;
  readonly changes: readonly string[];
};

function isObject(value: unknown): value is MutableObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compact(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function normalizeValidationMethod(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const normalized = compact(value);

  if (validValidationMethods.has(normalized)) return normalized;

  if (
    [
      "test",
      "tests",
      "testing",
      "automated test",
      "automated tests",
      "unit test",
      "unit tests"
    ].includes(normalized)
  ) {
    return "unit";
  }

  if (["integration test", "integration tests"].includes(normalized)) {
    return "integration";
  }

  if (
    ["end to end", "end to end test", "end to end tests", "e2e test", "e2e tests"].includes(
      normalized
    )
  ) {
    return "e2e";
  }

  if (
    [
      "review",
      "manual review",
      "human review",
      "qa review",
      "acceptance review",
      "inspection"
    ].includes(normalized)
  ) {
    return "manual";
  }

  if (
    [
      "lint",
      "linting",
      "typecheck",
      "type check",
      "type checking",
      "static analysis",
      "compile",
      "compilation",
      "build"
    ].includes(normalized)
  ) {
    return "static";
  }

  return undefined;
}

function normalizeRequirementSource(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const normalized = compact(value);

  if (validRequirementSources.has(normalized)) return normalized;

  if (["user request", "request", "prompt", "idea"].includes(normalized)) {
    return "user";
  }

  if (["clarify", "clarifications", "clarification answer"].includes(normalized)) {
    return "clarification";
  }

  if (
    [
      "constitution",
      "plan",
      "scan",
      "code",
      "codebase",
      "inferred",
      "assumption",
      "system",
      "generated"
    ].includes(normalized)
  ) {
    return "derived";
  }

  return undefined;
}

function assumptionId(prefix: string, index: number): string {
  const number = String(index + 1).padStart(3, "0");
  return `${prefix}${number}`;
}

function descriptionFromObject(value: MutableObject): string | undefined {
  for (const key of ["description", "text", "assumption", "summary"]) {
    const field = value[key];
    if (typeof field === "string") return field.trim() || "TBD";
  }

  return undefined;
}

function normalizeAssumptions(
  value: unknown,
  pathLabel: string,
  idPrefix: string,
  changes: string[]
): unknown {
  if (!Array.isArray(value)) return value;

  return value.map((entry, index) => {
    const fallbackId = assumptionId(idPrefix, index);

    if (typeof entry === "string") {
      changes.push(`${pathLabel}.${index}: converted string assumption to object`);
      return {
        id: fallbackId,
        description: entry.trim() || "TBD"
      };
    }

    if (!isObject(entry)) return entry;

    const description = descriptionFromObject(entry);
    if (description === undefined) return entry;

    const existingId =
      typeof entry.id === "string" && entry.id.trim() !== "" ? entry.id.trim() : fallbackId;
    const normalized = { id: existingId, description };

    if (
      entry.id !== normalized.id ||
      entry.description !== normalized.description ||
      Object.keys(entry).length !== 2
    ) {
      changes.push(`${pathLabel}.${index}: normalized assumption object`);
    }

    return normalized;
  });
}

function normalizeCriterion(criterion: unknown, pathLabel: string, changes: string[]): unknown {
  if (!isObject(criterion)) return criterion;

  const output: MutableObject = { ...criterion };
  const normalizedMethod = normalizeValidationMethod(output.validationMethod);

  if (normalizedMethod !== undefined && output.validationMethod !== normalizedMethod) {
    changes.push(
      `${pathLabel}.validationMethod: ${String(output.validationMethod)} -> ${normalizedMethod}`
    );
    output.validationMethod = normalizedMethod;
  }

  return output;
}

function normalizeRequirement(requirement: unknown, index: number, changes: string[]): unknown {
  if (!isObject(requirement)) return requirement;

  const output: MutableObject = { ...requirement };
  const pathLabel = `requirements.${index}`;
  const normalizedSource = normalizeRequirementSource(output.source);

  if (normalizedSource !== undefined && output.source !== normalizedSource) {
    changes.push(`${pathLabel}.source: ${String(output.source)} -> ${normalizedSource}`);
    output.source = normalizedSource;
  }

  output.assumptions = normalizeAssumptions(
    output.assumptions,
    `${pathLabel}.assumptions`,
    `${typeof output.id === "string" && output.id.trim() !== "" ? output.id : "REQ"}-ASM`,
    changes
  );

  if (Array.isArray(output.acceptanceCriteria)) {
    output.acceptanceCriteria = output.acceptanceCriteria.map((criterion, criterionIndex) =>
      normalizeCriterion(criterion, `${pathLabel}.acceptanceCriteria.${criterionIndex}`, changes)
    );
  }

  return output;
}

export function normalizeSpecArtifact(value: unknown): SpecNormalizationResult {
  if (!isObject(value)) {
    return { value, changes: [] };
  }

  const changes: string[] = [];
  const output: MutableObject = { ...value };

  output.assumptions = normalizeAssumptions(output.assumptions, "assumptions", "ASM", changes);

  if (Array.isArray(output.acceptanceCriteria)) {
    output.acceptanceCriteria = output.acceptanceCriteria.map((criterion, index) =>
      normalizeCriterion(criterion, `acceptanceCriteria.${index}`, changes)
    );
  }

  if (Array.isArray(output.requirements)) {
    output.requirements = output.requirements.map((requirement, index) =>
      normalizeRequirement(requirement, index, changes)
    );
  }

  return { value: output, changes };
}
