import {
  type RiskFactor,
  type RiskLevel,
  type TaskClass
} from "../artifacts/schemas/common.schema.js";
import { type AssuranceProfile } from "../artifacts/schemas/evidence.schema.js";

const profileRank: Readonly<Record<AssuranceProfile, number>> = {
  routine: 0,
  behavioral: 1,
  critical: 2
};

const taskClassProfile: Readonly<Record<TaskClass, AssuranceProfile>> = {
  documentation: "routine",
  regression_test: "routine",
  refactor: "routine",
  localized_bug: "behavioral",
  bounded_feature: "behavioral",
  cross_file_change: "behavioral",
  migration: "critical",
  security: "critical"
};

const riskLevelProfile: Readonly<Record<RiskLevel, AssuranceProfile>> = {
  low: "routine",
  medium: "behavioral",
  high: "critical"
};

const dependencyFiles = new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "cargo.toml",
  "go.mod",
  "go.sum",
  "package-lock.json",
  "package.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "pyproject.toml",
  "requirements.txt",
  "yarn.lock"
]);

const criticalAreaPattern =
  /(^|\/)(api|auth|authentication|authorization|crypto|cryptography|deploy|deployment|helm|infra|k8s|kubernetes|migrations?|permissions?|schema|schemas|security|terraform)(\/|\.|$)/u;

export type AssuranceProfileReason = {
  readonly source:
    | "task_class"
    | "risk_level"
    | "risk_factor"
    | "changed_area"
    | "policy"
    | "override";
  readonly code: string;
  readonly profile: AssuranceProfile;
};

export type AssuranceLoweringOverride = {
  readonly overrideId: string;
  readonly ruleId: string;
  readonly reason: string;
};

export type AssuranceProfileSelectionInput = {
  readonly taskClass: TaskClass;
  readonly riskLevel: RiskLevel;
  readonly riskFactors: readonly RiskFactor[];
  readonly changedPaths: readonly string[];
  readonly policyProfile?: AssuranceProfile;
  readonly loweringOverride?: AssuranceLoweringOverride;
};

export type AssuranceProfileSelection = {
  readonly calculatedProfile: AssuranceProfile;
  readonly selectedProfile: AssuranceProfile;
  readonly policyProfile: AssuranceProfile | null;
  readonly appliedOverrideId: string | null;
  readonly reasons: readonly AssuranceProfileReason[];
};

function maxProfile(profiles: readonly AssuranceProfile[]): AssuranceProfile {
  return profiles.reduce<AssuranceProfile>(
    (strongest, profile) => (profileRank[profile] > profileRank[strongest] ? profile : strongest),
    "routine"
  );
}

function normalizePath(value: string): string {
  return value
    .replaceAll("\\", "/")
    .replace(/^\.\/+/u, "")
    .toLowerCase();
}

function changedAreaReason(changedPath: string): AssuranceProfileReason | undefined {
  const normalized = normalizePath(changedPath);
  const basename = normalized.split("/").at(-1) ?? normalized;

  if (dependencyFiles.has(basename) || normalized.startsWith(".github/workflows/")) {
    return {
      source: "changed_area",
      code: normalized,
      profile: "critical"
    };
  }

  if (!normalized.startsWith("docs/") && criticalAreaPattern.test(normalized)) {
    return {
      source: "changed_area",
      code: normalized,
      profile: "critical"
    };
  }

  return undefined;
}

function sortReasons(
  reasons: readonly AssuranceProfileReason[]
): readonly AssuranceProfileReason[] {
  return [...reasons].sort(
    (left, right) =>
      left.source.localeCompare(right.source) ||
      left.code.localeCompare(right.code) ||
      profileRank[left.profile] - profileRank[right.profile]
  );
}

function validLoweringOverride(
  override: AssuranceLoweringOverride | undefined
): override is AssuranceLoweringOverride {
  return (
    override !== undefined &&
    override.ruleId === "VSP022" &&
    /^OVR\d{3,}$/u.test(override.overrideId) &&
    override.reason.trim().length >= 12
  );
}

export function selectAssuranceProfile(
  input: AssuranceProfileSelectionInput
): AssuranceProfileSelection {
  const reasons: AssuranceProfileReason[] = [
    {
      source: "task_class",
      code: input.taskClass,
      profile: taskClassProfile[input.taskClass]
    },
    {
      source: "risk_level",
      code: input.riskLevel,
      profile: riskLevelProfile[input.riskLevel]
    },
    ...input.riskFactors.map(
      (factor): AssuranceProfileReason => ({
        source: "risk_factor",
        code: factor.code,
        profile: "critical"
      })
    ),
    ...input.changedPaths
      .map(changedAreaReason)
      .filter((reason): reason is AssuranceProfileReason => reason !== undefined)
  ];
  const calculatedProfile = maxProfile(reasons.map((reason) => reason.profile));
  const policyProfile = input.policyProfile ?? null;
  let selectedProfile = calculatedProfile;
  let appliedOverrideId: string | null = null;

  if (policyProfile !== null) {
    if (profileRank[policyProfile] >= profileRank[calculatedProfile]) {
      selectedProfile = policyProfile;
      reasons.push({
        source: "policy",
        code: "policy_profile",
        profile: policyProfile
      });
    } else if (validLoweringOverride(input.loweringOverride)) {
      selectedProfile = policyProfile;
      appliedOverrideId = input.loweringOverride.overrideId;
      reasons.push({
        source: "override",
        code: input.loweringOverride.overrideId,
        profile: policyProfile
      });
    } else {
      reasons.push({
        source: "policy",
        code: "policy_lowering_requires_override",
        profile: calculatedProfile
      });
    }
  }

  return {
    calculatedProfile,
    selectedProfile,
    policyProfile,
    appliedOverrideId,
    reasons: sortReasons(reasons)
  };
}
