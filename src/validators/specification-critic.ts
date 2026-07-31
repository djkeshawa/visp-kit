import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";

/**
 * Refuse a specification that cannot be proven, before implementation starts.
 *
 * An error in the specification contaminates every step downstream: the plan,
 * the tasks, the evidence, and the verdict all inherit it, and the cheapest
 * moment to catch it is before any of them exist. The research reviewed for
 * Phase 8 calls this the highest-leverage component in an agent pipeline for
 * exactly that reason.
 *
 * **What this deliberately is not.** The research describes an intent gate that
 * detects semantic ambiguity and asks a targeted clarifying question. That needs
 * a model, and Kit does not call one — that is an architectural boundary, not a
 * deferral. This implements the structurally checkable subset: contradictions
 * and unprovable claims that can be read off declared fields without inferring
 * meaning. The remainder of the gap is real and recorded rather than disguised.
 *
 * **Blocking is earned, not assumed.** `false_block` is the metric the
 * evaluation protocol treats as deciding adoption, and a critic that rejects
 * good specifications is worse than none. So a finding is only `blocking` when
 * its false-positive rate is zero *by construction* — when it reads a
 * contradiction between two declared fields rather than judging whether prose is
 * good enough. Heuristic findings are returned as `advisory` and stay
 * non-blocking until measured on a real corpus.
 */

export type CriticSeverity = "blocking" | "advisory";

export type CriticFinding = {
  readonly code: string;
  readonly severity: CriticSeverity;
  readonly subject: string;
  readonly message: string;
};

/** Compare declared text without being defeated by spacing or capitalisation. */
function normalize(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLowerCase();
}

/**
 * A must-level requirement none of whose acceptance criteria is marked
 * testable. The specification is stating, in its own declared fields, that
 * something mandatory has no way to be proven. Reading two flags — no inference,
 * so no false positives.
 */
function unprovableMustRequirements(spec: SpecArtifact): CriticFinding[] {
  return spec.requirements
    .filter((requirement) => requirement.priority === "must")
    .filter((requirement) => {
      const criteria = [
        ...requirement.acceptanceCriteria,
        ...spec.acceptanceCriteria.filter((criterion) => criterion.requirementId === requirement.id)
      ];
      return criteria.length > 0 && criteria.every((criterion) => criterion.testable === false);
    })
    .map((requirement) => ({
      code: "must_requirement_not_testable",
      severity: "blocking" as const,
      subject: requirement.id,
      message:
        `${requirement.id} is a must-level requirement whose every acceptance criterion is marked ` +
        `testable: false. Nothing can prove it, so no evidence will ever satisfy it. Either mark a ` +
        `criterion testable and say how it is checked, or lower the priority.`
    }));
}

/**
 * A non-goal that names a requirement the same specification demands. One of
 * the two is wrong and only the author knows which.
 */
function nonGoalContradictsRequirement(spec: SpecArtifact): CriticFinding[] {
  const findings: CriticFinding[] = [];
  const byId = new Map(spec.requirements.map((requirement) => [requirement.id.toLowerCase(), requirement]));
  const byTitle = new Map(spec.requirements.map((requirement) => [normalize(requirement.title), requirement]));

  for (const entry of spec.outOfScope) {
    const normalized = normalize(entry);
    const titleMatch = byTitle.get(normalized);
    if (titleMatch) {
      findings.push({
        code: "non_goal_contradicts_requirement",
        severity: "blocking",
        subject: titleMatch.id,
        message:
          `Out-of-scope entry "${entry}" is the exact title of requirement ${titleMatch.id}. ` +
          `The specification both demands and excludes the same thing.`
      });
      continue;
    }
    // An out-of-scope line naming a requirement id outright.
    for (const token of normalized.split(/[^a-z0-9-]+/u)) {
      const idMatch = byId.get(token);
      if (idMatch) {
        findings.push({
          code: "non_goal_contradicts_requirement",
          severity: "blocking",
          subject: idMatch.id,
          message:
            `Out-of-scope entry "${entry}" names requirement ${idMatch.id}, which the specification ` +
            `also requires. The specification both demands and excludes it.`
        });
        break;
      }
    }
  }
  return findings;
}

/**
 * The same statement declared both a business rule and out of scope. Two
 * constraints that cannot both hold, read directly off the two lists.
 */
function contradictoryConstraints(spec: SpecArtifact): CriticFinding[] {
  const excluded = new Map(spec.outOfScope.map((entry) => [normalize(entry), entry]));
  return spec.businessRules
    .filter((rule) => excluded.has(normalize(rule)))
    .map((rule) => ({
      code: "constraint_contradicts_non_goal",
      severity: "blocking" as const,
      subject: rule,
      message:
        `"${rule}" is declared both a business rule and out of scope. It cannot be both required ` +
        `and excluded; delete whichever is wrong.`
    }));
}

/**
 * An acceptance criterion bound to a requirement that does not exist. Distinct
 * from the existing orphan check because it reports the criterion as unprovable
 * rather than as a traceability gap.
 */
function criteriaWithoutRequirement(spec: SpecArtifact): CriticFinding[] {
  const ids = new Set(spec.requirements.map((requirement) => requirement.id));
  return spec.acceptanceCriteria
    .filter((criterion) => !ids.has(criterion.requirementId))
    .map((criterion) => ({
      code: "criterion_without_requirement",
      severity: "blocking" as const,
      subject: criterion.id,
      message:
        `${criterion.id} is bound to requirement ${criterion.requirementId}, which this ` +
        `specification does not define. It proves nothing.`
    }));
}

/**
 * Descriptions that assert quality without naming anything observable.
 *
 * ADVISORY, and deliberately so. Unlike the checks above this one judges prose,
 * and the list below cannot be complete. The match is narrow on purpose — the
 * whole description must be one of these phrases, not merely contain one — so
 * that "works correctly when the token has expired" is untouched while "works
 * correctly" alone is flagged. It stays non-blocking until a false-positive rate
 * is measured on a real corpus.
 */
const VAGUE_ONLY = new Set([
  "it works",
  "works",
  "works correctly",
  "works as expected",
  "works properly",
  "behaves correctly",
  "is correct",
  "is fast",
  "is secure",
  "is reliable",
  "is user friendly",
  "is user-friendly",
  "no bugs",
  "looks good",
  "good performance",
  "acceptable performance"
]);

function unobservableCriteria(spec: SpecArtifact): CriticFinding[] {
  return spec.acceptanceCriteria
    .filter((criterion) => criterion.testable === true)
    .filter((criterion) => VAGUE_ONLY.has(normalize(criterion.description).replace(/[.!]+$/u, "")))
    .map((criterion) => ({
      code: "criterion_not_observable",
      severity: "advisory" as const,
      subject: criterion.id,
      message:
        `${criterion.id} is marked testable but its description names nothing observable. ` +
        `A test written from it would assert the author's opinion, not the system's behaviour.`
    }));
}

/**
 * Every finding, blocking first.
 *
 * Deterministic and pure: the same specification always yields the same
 * findings, in the same order. No LLM is called, here or anywhere beneath this.
 */
export function criticiseSpecification(spec: SpecArtifact): readonly CriticFinding[] {
  const findings = [
    ...unprovableMustRequirements(spec),
    ...nonGoalContradictsRequirement(spec),
    ...contradictoryConstraints(spec),
    ...criteriaWithoutRequirement(spec),
    ...unobservableCriteria(spec)
  ];
  return findings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "blocking" ? -1 : 1;
    return a.code.localeCompare(b.code) || a.subject.localeCompare(b.subject);
  });
}

/** The blocking subset, rendered for the existing error channel. */
export function blockingCriticFindings(spec: SpecArtifact): readonly string[] {
  return criticiseSpecification(spec)
    .filter((finding) => finding.severity === "blocking")
    .map((finding) => finding.message);
}

/**
 * What this critic cannot reach, stated so nobody assumes a clean run means a
 * good specification.
 *
 * - **Semantic ambiguity.** Two readings of one sentence that lead to different
 *   systems. Detecting it needs a model; Kit does not call one.
 * - **Missing requirements.** Nothing here notices what was never written down.
 * - **Assumptions without a validation deadline.** The assumption schema records
 *   an id and a description and has nowhere to put one. Adding the field is a
 *   schema change with a compatibility cycle, so it is recorded here rather than
 *   approximated.
 */
export const CRITIC_KNOWN_GAPS = Object.freeze([
  "semantic_ambiguity_requires_a_model",
  "missing_requirements_are_invisible",
  "assumption_validation_deadline_has_no_schema_field"
]);
