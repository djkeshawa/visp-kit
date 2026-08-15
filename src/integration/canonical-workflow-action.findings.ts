/**
 * Findings, declared values, and the path spelling every canonical field uses.
 *
 * These are the primitives the rest of the canonical action builder is written
 * in: a `Finding` is how the builder reports that an input was unusable, and a
 * `DeclaredValue` is how it says "absent, and here is why" instead of guessing.
 * Extracted from `canonical-workflow-action.ts` so that file holds the protocol
 * logic rather than its vocabulary.
 */
import { createHash } from "node:crypto";

import { type RiskFactor } from "../artifacts/schemas/common.schema.js";
import {
  canonicalJsonV1,
  compareUtf16CodeUnits,
  type Sha256Hash,
  sortedUnique
} from "./canonical-json.js";
import {
  type DeclaredNotApplicableReason,
  type DeclaredUnavailableReason,
  type DeclaredValue,
  type Finding
} from "./canonical-workflow-action.types.js";

/** Records a finding, and says whether it invalidates the action's decision. */
export type AddFinding = (finding: Finding, invalidatesDecision?: boolean) => void;

export function unavailable<T>(reasonCode: DeclaredUnavailableReason): DeclaredValue<T> {
  return { state: "unavailable", reasonCode };
}

export function notApplicable<T>(reasonCode: DeclaredNotApplicableReason): DeclaredValue<T> {
  return { state: "not_applicable", reasonCode };
}

export function available<T>(value: T): DeclaredValue<T> {
  return { state: "available", value };
}

export function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort(compareUtf16CodeUnits);
}

export function normalizeRiskFactors(factors: readonly RiskFactor[]): RiskFactor[] {
  const duplicates = duplicateValues(factors.map((factor) => factor.code));
  if (duplicates.length > 0) {
    throw new TypeError(
      `canonical-workflow-action: duplicate risk factor codes: ${duplicates.join(", ")}`
    );
  }

  return factors
    .map((factor) => ({ ...factor }))
    .sort((left, right) => compareUtf16CodeUnits(left.code, right.code));
}

export function normalizeEvidence(evidence: readonly string[]): string[] {
  return sortedUnique(evidence);
}

export function findingComparator(left: Finding, right: Finding): number {
  const fields: Array<[string, string]> = [
    [left.code, right.code],
    [left.source, right.source],
    [left.severity, right.severity],
    [left.effect, right.effect],
    [left.message, right.message],
    [left.recommendation, right.recommendation],
    [left.evidence.join("\0"), right.evidence.join("\0")]
  ];

  for (const [leftValue, rightValue] of fields) {
    const comparison = compareUtf16CodeUnits(leftValue, rightValue);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

export function normalizedFindings(findings: readonly Finding[]): Finding[] {
  const unique = new Map<string, Finding>();

  for (const finding of findings) {
    const normalized = { ...finding, evidence: normalizeEvidence(finding.evidence) };
    unique.set(canonicalJsonV1(normalized), normalized);
  }

  return [...unique.values()].sort(findingComparator);
}

export function canonicalFindingReference(finding: Finding): Sha256Hash {
  const normalized = { ...finding, evidence: normalizeEvidence(finding.evidence) };
  return `sha256:${createHash("sha256").update(canonicalJsonV1(normalized)).digest("hex")}`;
}

export function invalidPathFinding(input: string): Finding {
  return {
    code: "VISP.CONTRACT.INVALID_PROJECT_PATH",
    source: "contract",
    severity: "error",
    effect: "uncertain",
    message: `Project path is not a safe relative path: ${JSON.stringify(input)}.`,
    recommendation: "Use a project-relative path without absolute or traversal segments.",
    evidence: [input]
  };
}

export function normalizeProjectPath(input: string, addFinding: AddFinding): string | undefined {
  const normalized = input.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const unsafe =
    normalized.length === 0 ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) ||
    segments.some((segment) => segment === "." || segment === "..");

  if (unsafe) {
    addFinding(invalidPathFinding(input), true);
    return undefined;
  }

  const compact = segments.filter((segment) => segment.length > 0).join("/");
  if (compact.length === 0) {
    addFinding(invalidPathFinding(input), true);
    return undefined;
  }

  return compact;
}

export function normalizePathSetWithPresentation(
  paths: readonly string[],
  addFinding: AddFinding
): { readonly values: string[]; readonly presentation: string[] } {
  const normalized: string[] = [];
  const presentation: string[] = [];
  for (const input of paths) {
    const result = normalizeProjectPath(input, addFinding);
    if (result === undefined) continue;
    normalized.push(result);
    presentation.push(input);
  }
  return { values: sortedUnique(normalized), presentation };
}
