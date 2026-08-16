const validValidationMethods = new Set(["unit", "integration", "e2e", "manual", "static"]);

const validRequirementSources = new Set(["user", "clarification", "derived"]);

type MutableObject = Record<string, unknown>;

export type SpecNormalizationResult = {
  readonly value: unknown;
  readonly changes: readonly string[];
  /**
   * Why the spec cannot be normalized at all, one message per conflicting
   * acceptance criterion id. Non-empty means the caller must refuse the spec.
   */
  readonly conflicts: readonly string[];
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

function criterionId(value: unknown): string | undefined {
  if (!isObject(value)) return undefined;

  return typeof value.id === "string" && value.id.trim() !== "" ? value.id.trim() : undefined;
}

/**
 * A criterion reduced to a form two declarations of it can be compared by.
 *
 * Key order carries no meaning in an acceptance criterion, so it is removed
 * before comparing; anything else surviving here is a difference the author
 * wrote on purpose.
 */
function canonicalForm(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalForm).join(",")}]`;

  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalForm(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}

/**
 * Ids that name two *different* criteria across the lists the mirror merges.
 *
 * The mirror unions by id, which is sound only while an id names one criterion.
 * When two declarations of `AC002` disagree there is no resolution Kit can
 * compute and none it may pick: last-wins silently rewrites an acceptance claim
 * the author stated, first-wins silently discards one, and either way the
 * disagreement disappears into an artifact that verify, review and the
 * traceability matrix all treat as the contract for what "done" means. Choosing
 * would make Kit the author of an acceptance claim nobody wrote.
 *
 * So Kit refuses. A spec whose criterion ids are ambiguous is malformed, and a
 * malformed strict contract fails closed rather than being repaired into one of
 * the two things it might have meant. The author resolves it by making the
 * declarations identical or by giving them different ids — both one edit, and
 * both a decision only they can make.
 */
function conflictingCriteria(input: {
  readonly topLevel: readonly unknown[];
  readonly requirements: readonly unknown[];
}): readonly string[] {
  /** criterion id -> canonical form -> the places that form was declared in. */
  const formsById = new Map<string, Map<string, Set<string>>>();

  const record = (criterion: unknown, origin: string): void => {
    const id = criterionId(criterion);

    if (id === undefined) return;

    const forms = formsById.get(id) ?? new Map<string, Set<string>>();
    const form = canonicalForm(criterion);
    const origins = forms.get(form) ?? new Set<string>();

    origins.add(origin);
    forms.set(form, origins);
    formsById.set(id, forms);
  };

  for (const criterion of input.topLevel) {
    record(criterion, "the top-level acceptanceCriteria list");
  }

  for (const requirement of input.requirements) {
    if (!isObject(requirement) || !Array.isArray(requirement.acceptanceCriteria)) continue;

    for (const criterion of requirement.acceptanceCriteria) {
      record(criterion, `requirement ${String(requirement.id)}`);
    }
  }

  return [...formsById]
    .filter(([, forms]) => forms.size > 1)
    .map(([id, forms]) => {
      const origins = [...new Set([...forms.values()].flatMap((set) => [...set]))];
      const where = origins.length > 1 ? origins.join(" and ") : `${origins[0]} twice`;

      return `acceptance criterion ${id} is declared with different content in ${where}`;
    });
}

/**
 * An acceptance criterion may be written inside its requirement, in the
 * top-level `acceptanceCriteria` list, or in both. The two validators disagree
 * about which one is authoritative: `validateSpec` requires the nested list and
 * `validateTaskGraph` resolves task references against the top-level one. A
 * spec that stated its criteria in only one place therefore passed
 * `spec --validate` and then failed `tasks --validate` on a criterion it plainly
 * declared, with no documented way to produce the other form.
 *
 * Mirroring makes the two lists one set. Nothing is relaxed — every criterion
 * still parses against the same schema and every reference still has to resolve.
 *
 * Returns the id conflicts that stopped it, empty when it mirrored.
 */
function mirrorAcceptanceCriteria(output: MutableObject, changes: string[]): readonly string[] {
  if (!Array.isArray(output.requirements)) return [];

  const topLevel = Array.isArray(output.acceptanceCriteria) ? [...output.acceptanceCriteria] : [];
  const conflicts = conflictingCriteria({ topLevel, requirements: output.requirements });

  // Both lists are left exactly as the author wrote them, so the error the
  // caller raises points at a file that still shows the disagreement.
  if (conflicts.length > 0) return conflicts;

  const topLevelIds = new Set(topLevel.map(criterionId).filter((id) => id !== undefined));

  output.requirements = output.requirements.map((requirement) => {
    if (!isObject(requirement) || !Array.isArray(requirement.acceptanceCriteria)) {
      return requirement;
    }

    const nestedIds = new Set(requirement.acceptanceCriteria.map(criterionId));

    for (const criterion of requirement.acceptanceCriteria) {
      const id = criterionId(criterion);

      if (id === undefined || topLevelIds.has(id)) continue;

      topLevel.push(criterion);
      topLevelIds.add(id);
      changes.push(`acceptanceCriteria: added ${id} from requirement ${String(requirement.id)}`);
    }

    const adopted = topLevel.filter(
      (criterion) =>
        isObject(criterion) &&
        criterion.requirementId === requirement.id &&
        !nestedIds.has(criterionId(criterion))
    );

    if (adopted.length === 0) return requirement;

    for (const criterion of adopted) {
      changes.push(
        `requirement ${String(requirement.id)}: added acceptance criterion ${String(criterionId(criterion))}`
      );
    }

    return {
      ...requirement,
      acceptanceCriteria: [...requirement.acceptanceCriteria, ...adopted]
    };
  });

  output.acceptanceCriteria = topLevel;

  return [];
}

export function normalizeSpecArtifact(value: unknown): SpecNormalizationResult {
  if (!isObject(value)) {
    return { value, changes: [], conflicts: [] };
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

  // After both lists have been normalized, so a criterion copied across carries
  // the corrected enum rather than the raw one — and so two declarations that
  // differ only by a spelling this normalizer corrects are not read as a
  // conflict.
  const conflicts = mirrorAcceptanceCriteria(output, changes);

  return { value: output, changes, conflicts };
}
