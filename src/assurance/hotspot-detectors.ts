import { createHash } from "node:crypto";

import { type AssuranceCaseWithoutHash } from "../artifacts/schemas/assurance-case.schema.js";
import { type OraclePlan } from "../artifacts/schemas/oracle-plan.schema.js";
import { type OverrideRecord } from "../artifacts/schemas/override.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { isDependencyFile } from "../dependencies/dependency-files.js";
import { canonicalJsonV1, compareUtf16CodeUnits } from "../integration/canonical-json.js";
import { isTestFile, normalizeReviewPath } from "../review/diff-summary.js";
import { validateScope } from "../verification/scope-validator.js";

type ChangeUnit = AssuranceCaseWithoutHash["changeUnits"][number];
type Claim = AssuranceCaseWithoutHash["claims"][number];
type Comparison = AssuranceCaseWithoutHash["evidenceComparisons"][number];
type Hotspot = AssuranceCaseWithoutHash["hotspots"][number];
type Category = Hotspot["category"];

type Finding = Omit<Hotspot, "id">;

const severityByCategory: Record<Category, Pick<Hotspot, "severity" | "mandatory">> = {
  public_api: { severity: "high", mandatory: true },
  dependency: { severity: "high", mandatory: true },
  schema_migration: { severity: "high", mandatory: true },
  security: { severity: "critical", mandatory: true },
  concurrency: { severity: "high", mandatory: true },
  permissions: { severity: "critical", mandatory: true },
  deployment_configuration: { severity: "high", mandatory: true },
  test_deletion: { severity: "high", mandatory: true },
  test_weakening: { severity: "high", mandatory: true },
  validation_command_change: { severity: "high", mandatory: true },
  unmapped_change: { severity: "medium", mandatory: true },
  scope_expansion: { severity: "high", mandatory: true },
  oversized_scope: { severity: "high", mandatory: true },
  inconclusive_evidence: { severity: "medium", mandatory: true },
  override_usage: { severity: "high", mandatory: true },
  generated_behavior: { severity: "high", mandatory: true }
};

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareUtf16CodeUnits);
}

function unitPaths(unit: ChangeUnit): string[] {
  return unit.kind === "hunk"
    ? [normalizeReviewPath(unit.path)]
    : sortedUnique(
        [unit.beforePath, unit.afterPath]
          .filter((value): value is string => value !== undefined)
          .map(normalizeReviewPath)
      );
}

function claimsForUnits(claims: readonly Claim[], unitIds: readonly string[]): string[] {
  const ids = new Set(unitIds);
  return claims
    .filter((claim) => claim.changeUnitIds.some((id) => ids.has(id)))
    .map((claim) => claim.id)
    .sort(compareUtf16CodeUnits);
}

function finding(
  category: Category,
  input: Omit<Finding, "category" | "severity" | "mandatory">
): Finding {
  return {
    category,
    ...severityByCategory[category],
    ...input
  };
}

function hotspotId(value: Finding): string {
  const rank = value.severity === "critical" ? "0" : value.severity === "high" ? "1" : "2";
  const mandatory = value.mandatory ? "0" : "1";
  const digest = createHash("sha256")
    .update("visp.assurance-hotspot\0canonical-1.0\0", "utf8")
    .update(canonicalJsonV1(value), "utf8")
    .digest("hex");
  return `HS-${rank}${mandatory}-${digest}`;
}

export function detectAssuranceHotspots(input: {
  readonly changeUnits: readonly ChangeUnit[];
  readonly claims: readonly Claim[];
  readonly evidenceComparisons: readonly Comparison[];
  readonly task: Task;
  readonly oraclePlan: Pick<OraclePlan, "validationCommands">;
  readonly overrides: readonly OverrideRecord[];
  readonly unmappedChangeUnitIds: readonly string[];
  readonly generatedPaths?: readonly string[];
  readonly patchByChangeUnitId?: Readonly<Record<string, string>>;
  readonly maxScopePaths?: number;
}): Hotspot[] {
  const findings: Finding[] = [];
  const generated = new Set((input.generatedPaths ?? []).map(normalizeReviewPath));
  const scope = validateScope({
    changedFiles: sortedUnique(input.changeUnits.flatMap(unitPaths)),
    task: input.task,
    explicit: true,
    gitWarnings: []
  });
  const forbidden = new Set(scope.forbiddenChangedFiles);
  const outOfScope = new Set(scope.outOfScopeFiles);

  for (const unit of input.changeUnits) {
    const paths = unitPaths(unit);
    const claimIds = claimsForUnits(input.claims, [unit.id]);
    for (const path of paths) {
      const base = { path, changeUnitIds: [unit.id], claimIds };
      const patch = input.patchByChangeUnitId?.[unit.id] ?? "";
      if (
        /(^|\/)(api|public|exports?)(\/|\.|$)|(^|\/)index\.[cm]?[jt]sx?$/iu.test(path) ||
        /^[+-](?![+-])\s*export\s+(?:default\s+)?(?:async\s+)?(?:class|const|enum|function|interface|let|type|var|\{)/mu.test(
          patch
        )
      ) {
        findings.push(finding("public_api", { ...base, reason: "Public API surface changed." }));
      }
      if (isDependencyFile(path)) {
        findings.push(finding("dependency", { ...base, reason: "Dependency metadata changed." }));
      }
      if (/(^|\/)(schema|schemas|migrations?)(\/|\.|$)/iu.test(path)) {
        findings.push(
          finding("schema_migration", { ...base, reason: "Schema or migration changed." })
        );
      }
      if (/(auth|crypto|security|secret|token|session)/iu.test(path)) {
        findings.push(finding("security", { ...base, reason: "Security-sensitive code changed." }));
      }
      if (/(concurr|thread|worker|queue|mutex|semaphore|lock)/iu.test(path)) {
        findings.push(
          finding("concurrency", { ...base, reason: "Concurrency-sensitive code changed." })
        );
      }
      if (/(permission|authori[sz]ation|access-control|acl)/iu.test(path)) {
        findings.push(
          finding("permissions", { ...base, reason: "Permission enforcement changed." })
        );
      }
      if (unit.kind === "file" && unit.category === "mode" && unit.beforeMode !== unit.afterMode) {
        findings.push(
          finding("permissions", {
            ...base,
            reason: "Executable or file permission mode changed."
          })
        );
      }
      if (
        /(^|\/)(Dockerfile|compose|deploy|deployment|infrastructure|\.github|config)(\/|\.|$)|\.(ya?ml|toml|env)$/iu.test(
          path
        )
      ) {
        findings.push(
          finding("deployment_configuration", {
            ...base,
            reason: "Deployment or configuration changed."
          })
        );
      }
      if (isTestFile(path)) {
        const deletedFile =
          unit.kind === "file" && unit.beforePath !== undefined && unit.afterPath === undefined;
        const testDeclaration = /^\s*(?:test|it|describe)(?:\.(?:only|skip|todo))?\s*\(/u;
        const removedTests = patch
          .split("\n")
          .filter(
            (line) =>
              line.startsWith("-") && !line.startsWith("---") && testDeclaration.test(line.slice(1))
          ).length;
        const addedTests = patch
          .split("\n")
          .filter(
            (line) =>
              line.startsWith("+") && !line.startsWith("+++") && testDeclaration.test(line.slice(1))
          ).length;
        const assertionPattern =
          /\b(expect|assert|assertion|should|toBe|toEqual|toMatch|toThrow|fail)\b/iu;
        const removedAssertions = patch
          .split("\n")
          .filter(
            (line) =>
              line.startsWith("-") &&
              !line.startsWith("---") &&
              assertionPattern.test(line.slice(1))
          ).length;
        const addedAssertions = patch
          .split("\n")
          .filter(
            (line) =>
              line.startsWith("+") &&
              !line.startsWith("+++") &&
              assertionPattern.test(line.slice(1))
          ).length;
        const weakened = removedAssertions > addedAssertions;
        if (deletedFile || removedTests > addedTests) {
          findings.push(
            finding("test_deletion", { ...base, reason: "Test behavior was deleted." })
          );
        } else if (weakened) {
          findings.push(
            finding("test_weakening", { ...base, reason: "Test coverage was reduced." })
          );
        }
      }
      if (
        (/(^|\/)(package\.json|Makefile|justfile|vitest\.config|jest\.config|pytest\.ini|tox\.ini|\.github\/workflows)/iu.test(
          path
        ) &&
          /^[+-](?![+-]).*(?:test|typecheck|lint|build|coverage|run:)/imu.test(patch)) ||
        /^[+-](?![+-]).*validationCommands/imu.test(patch)
      ) {
        findings.push(
          finding("validation_command_change", {
            ...base,
            reason: "Validation command, script, or runner configuration changed."
          })
        );
      }
      if (generated.has(path) || /(^|\/)(generated|codegen|dist|build)(\/|\.|$)/iu.test(path)) {
        findings.push(
          finding("generated_behavior", {
            ...base,
            reason: "Generated behavior changed and requires source-level validation."
          })
        );
      }
      if (forbidden.has(path)) {
        findings.push(
          finding("scope_expansion", { ...base, reason: "Changed path is explicitly forbidden." })
        );
      } else if (outOfScope.has(path)) {
        findings.push(
          finding("scope_expansion", {
            ...base,
            reason: "Changed path is outside exact task scope."
          })
        );
      }
    }
  }

  for (const factor of input.task.riskFactors ?? []) {
    const category =
      factor.code === "public_api"
        ? "public_api"
        : factor.code === "concurrency"
          ? "concurrency"
          : factor.code === "permissions" || factor.code === "authorization"
            ? "permissions"
            : factor.code === "authentication" || factor.code === "cryptography"
              ? "security"
              : factor.code === "deployment"
                ? "deployment_configuration"
                : factor.code === "schema" || factor.code === "data_migration"
                  ? "schema_migration"
                  : factor.code === "dependency"
                    ? "dependency"
                    : undefined;
    if (category !== undefined) {
      findings.push(
        finding(category, {
          path: null,
          reason: `Task risk factor ${factor.code} requires review.`,
          changeUnitIds: input.changeUnits.map((unit) => unit.id).sort(compareUtf16CodeUnits),
          claimIds: input.claims.map((claim) => claim.id).sort(compareUtf16CodeUnits)
        })
      );
    }
  }

  if (
    canonicalJsonV1([...input.task.validationCommands]) !==
    canonicalJsonV1([...input.oraclePlan.validationCommands])
  ) {
    findings.push(
      finding("validation_command_change", {
        path: null,
        reason: "Task and locked oracle validation commands differ.",
        changeUnitIds: input.changeUnits.map((unit) => unit.id).sort(compareUtf16CodeUnits),
        claimIds: input.claims.map((claim) => claim.id).sort(compareUtf16CodeUnits)
      })
    );
  }

  for (const unitId of sortedUnique(input.unmappedChangeUnitIds)) {
    const unit = input.changeUnits.find((candidate) => candidate.id === unitId);
    findings.push(
      finding("unmapped_change", {
        path: unit === undefined ? null : (unitPaths(unit)[0] ?? null),
        reason: "Changed unit is not mapped to an authoritative claim.",
        changeUnitIds: [unitId],
        claimIds: []
      })
    );
  }

  const uniquePaths = sortedUnique(input.changeUnits.flatMap(unitPaths));
  if (uniquePaths.length > (input.maxScopePaths ?? 12)) {
    findings.push(
      finding("oversized_scope", {
        path: null,
        reason: `Change spans ${uniquePaths.length} paths.`,
        changeUnitIds: input.changeUnits.map((unit) => unit.id).sort(compareUtf16CodeUnits),
        claimIds: input.claims.map((claim) => claim.id).sort(compareUtf16CodeUnits)
      })
    );
  }

  for (const comparison of input.evidenceComparisons) {
    if (
      comparison.conclusion === "inconclusive" ||
      comparison.baseline.uncertainty.status !== "none" ||
      comparison.candidate.uncertainty.status !== "none"
    ) {
      findings.push(
        finding("inconclusive_evidence", {
          path: null,
          reason: `Evidence comparison ${comparison.id} is inconclusive.`,
          changeUnitIds: [],
          claimIds: [...comparison.claimIds]
        })
      );
    }
  }

  for (const override of [...input.overrides].sort((left, right) =>
    compareUtf16CodeUnits(left.id, right.id)
  )) {
    findings.push(
      finding("override_usage", {
        path: null,
        reason: `Active override ${override.id} applies: ${override.reason}`,
        changeUnitIds: [],
        claimIds: input.claims.map((claim) => claim.id).sort(compareUtf16CodeUnits)
      })
    );
  }

  const unique = new Map<string, Hotspot>();
  for (const draft of findings) {
    const value = { ...draft, id: hotspotId(draft) };
    unique.set(value.id, value);
  }
  return [...unique.values()].sort((left, right) => compareUtf16CodeUnits(left.id, right.id));
}
