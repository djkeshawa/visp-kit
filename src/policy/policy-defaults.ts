import {
  type PolicyArtifact,
  type PolicyLimits,
  type PolicyOverrides,
  type PolicyRules,
  type StrictnessMode
} from "../artifacts/schemas/policy.schema.js";

export type PolicyRuleDefinition = {
  readonly id: string;
  readonly key: keyof PolicyRules;
  readonly name: string;
  readonly description: string;
};

export const policyRuleDefinitions: readonly PolicyRuleDefinition[] = [
  {
    id: "VSP001",
    key: "requireScanBeforeFeature",
    name: "require_scan_before_feature",
    description: "Project should be scanned before new feature workflow."
  },
  {
    id: "VSP002",
    key: "requireConstitutionBeforeFeature",
    name: "require_constitution_before_feature",
    description: "Constitution should exist before feature workflow."
  },
  {
    id: "VSP003",
    key: "requireClarifyBeforeSpec",
    name: "require_clarify_before_spec",
    description: "Clarifications must exist before spec."
  },
  {
    id: "VSP004",
    key: "requireSpecBeforePlan",
    name: "require_spec_before_plan",
    description: "Spec must exist before plan."
  },
  {
    id: "VSP005",
    key: "requirePlanBeforeTasks",
    name: "require_plan_before_tasks",
    description: "Plan must exist before task graph."
  },
  {
    id: "VSP006",
    key: "requireTasksBeforeContext",
    name: "require_tasks_before_context",
    description: "Task graph must exist before context."
  },
  {
    id: "VSP007",
    key: "requireContextBeforeImplementation",
    name: "require_context_before_implementation",
    description: "Implementation requires a context pack."
  },
  {
    id: "VSP008",
    key: "requireRequirementMappingForTasks",
    name: "require_requirement_mapping_for_tasks",
    description: "Tasks must map to requirements."
  },
  {
    id: "VSP009",
    key: "requireAcceptanceCriteriaForBehaviorTasks",
    name: "require_acceptance_criteria_for_behavior_tasks",
    description: "Behavior tasks must map to acceptance criteria."
  },
  {
    id: "VSP010",
    key: "requireValidationCommands",
    name: "require_validation_commands",
    description: "Tasks should have validation commands or manual/static validation."
  },
  {
    id: "VSP011",
    key: "blockForbiddenFileChanges",
    name: "block_forbidden_file_changes",
    description: "Forbidden file changes block workflow progress."
  },
  {
    id: "VSP012",
    key: "blockOutOfScopeChanges",
    name: "block_out_of_scope_changes",
    description: "Out-of-scope files block strict task progress."
  },
  {
    id: "VSP013",
    key: "blockUnapprovedDependencyChanges",
    name: "block_unapproved_dependency_changes",
    description: "Package and lockfile changes require explicit approval."
  },
  {
    id: "VSP014",
    key: "requireVerifyBeforeReview",
    name: "require_verify_before_review",
    description: "Review requires verification evidence."
  },
  {
    id: "VSP015",
    key: "requireReviewBeforeReconcile",
    name: "require_review_before_reconcile",
    description: "Reconcile requires review evidence."
  },
  {
    id: "VSP016",
    key: "requireReconcileBeforePr",
    name: "require_reconcile_before_pr",
    description: "PR readiness requires reconciliation."
  },
  {
    id: "VSP017",
    key: "requireTraceabilityUpdateBeforePr",
    name: "require_traceability_update_before_pr",
    description: "PR readiness requires traceability updates."
  },
  {
    id: "VSP018",
    key: "requirePolicyValidation",
    name: "require_policy_validation",
    description: "Agent workflow must validate policy before acting."
  },
  {
    id: "VSP019",
    key: "userPromptCannotOverridePolicy",
    name: "user_prompt_cannot_override_policy",
    description: "User prompts cannot bypass policy."
  },
  {
    id: "VSP020",
    key: "stopOnFailedGate",
    name: "stop_on_failed_gate",
    description: "Agent must stop when a Visp gate fails."
  },
  {
    id: "VSP021",
    key: "blockOnUnresolvedDrift",
    name: "block_on_unresolved_drift",
    description: "PR readiness requires context packs grounded on current artifacts."
  },
  {
    id: "VSP022",
    key: "preventAssuranceProfileLowering",
    name: "prevent_assurance_profile_lowering",
    description: "Calculated assurance cannot be lowered without an auditable override."
  },
  {
    id: "VSP023",
    key: "requireOracleLockBeforeImplementation",
    name: "require_oracle_lock_before_implementation",
    description:
      "Implementation requires a current deterministic oracle lock when assurance is active."
  },
  {
    id: "VSP024",
    key: "requireCurrentAssuranceDecisionBeforePr",
    name: "require_current_assurance_decision_before_pr",
    description: "PR readiness requires a current human assurance decision when applicable."
  },
  {
    id: "VSP025",
    key: "requireSignedAssuranceDecision",
    name: "require_signed_assurance_decision",
    description: "A human assurance decision must carry a verified signature, not a typed name."
  },
  {
    id: "VSP026",
    key: "requireUnderstandingBeforeBehaviouralImplementation",
    name: "require_understanding_before_behavioural_implementation",
    description:
      "A behavioural task requires a current, evidence-cited understanding case before implementation."
  }
];

export const policyRuleKeys = policyRuleDefinitions.map((rule) => rule.key);

const ruleIdByKey = new Map<keyof PolicyRules, string>(
  policyRuleDefinitions.map((rule) => [rule.key, rule.id])
);

/**
 * Render a rule key the way a gate report names it: `VSP024 (key)`.
 *
 * Back-fill warnings have to be actionable, and a reader who sees a PR gate
 * fail on VSP024 cannot connect that to `requireCurrentAssuranceDecisionBeforePr`
 * unless something prints both.
 */
export function describePolicyRuleKey(key: keyof PolicyRules): string {
  const id = ruleIdByKey.get(key);
  return id === undefined ? String(key) : `${id} (${String(key)})`;
}

const allRulesOff: PolicyRules = {
  requireScanBeforeFeature: false,
  requireConstitutionBeforeFeature: false,
  requireClarifyBeforeSpec: false,
  requireSpecBeforePlan: false,
  requirePlanBeforeTasks: false,
  requireTasksBeforeContext: false,
  requireContextBeforeImplementation: false,
  requireRequirementMappingForTasks: false,
  requireAcceptanceCriteriaForBehaviorTasks: false,
  requireValidationCommands: false,
  blockForbiddenFileChanges: false,
  blockOutOfScopeChanges: false,
  blockUnapprovedDependencyChanges: false,
  requireVerifyBeforeReview: false,
  requireReviewBeforeReconcile: false,
  requireReconcileBeforePr: false,
  requireTraceabilityUpdateBeforePr: false,
  requirePolicyValidation: false,
  userPromptCannotOverridePolicy: false,
  stopOnFailedGate: false,
  blockOnUnresolvedDrift: false,
  preventAssuranceProfileLowering: true,
  requireOracleLockBeforeImplementation: false,
  requireCurrentAssuranceDecisionBeforePr: false,
  requireSignedAssuranceDecision: false,
  requireUnderstandingBeforeBehaviouralImplementation: false
};

const strictRules: PolicyRules = {
  requireScanBeforeFeature: true,
  requireConstitutionBeforeFeature: true,
  requireClarifyBeforeSpec: true,
  requireSpecBeforePlan: true,
  requirePlanBeforeTasks: true,
  requireTasksBeforeContext: true,
  requireContextBeforeImplementation: true,
  requireRequirementMappingForTasks: true,
  requireAcceptanceCriteriaForBehaviorTasks: true,
  requireValidationCommands: true,
  blockForbiddenFileChanges: true,
  blockOutOfScopeChanges: true,
  blockUnapprovedDependencyChanges: true,
  requireVerifyBeforeReview: true,
  requireReviewBeforeReconcile: true,
  requireReconcileBeforePr: true,
  requireTraceabilityUpdateBeforePr: true,
  requirePolicyValidation: true,
  userPromptCannotOverridePolicy: true,
  stopOnFailedGate: true,
  blockOnUnresolvedDrift: true,
  preventAssuranceProfileLowering: true,
  requireOracleLockBeforeImplementation: false,
  requireCurrentAssuranceDecisionBeforePr: true,
  requireSignedAssuranceDecision: true,
  // Off even in strict, and off in `locked` too — see below, where the reason
  // it is not a strictness question is written out. The short version: the rule
  // depends on an artifact only `visp-intel` can produce, and a default-on rule
  // would block every behavioural task in every project that has never run
  // intel. Once the policy rule is on, deleting the intel store does NOT open
  // the gate: G1 fails and the task stays blocked. The constraint cannot be
  // removed by removing the thing that satisfies it.
  requireUnderstandingBeforeBehaviouralImplementation: false
};

// `locked` is the only preset whose name is a promise about enforcement rather
// than a description of effort, so it is the only preset that carries VSP023.
//
// The argument, stated plainly because a default is a claim about which failure
// is worse. Turning VSP023 on costs a user in a hurry three commands before
// they may edit a line — `oracle plan`, `oracle lock`, `verify --baseline` —
// and the third one runs the task's whole validation command set. That is a
// real cost and it is paid on every task, not only the ones that would have
// gone wrong. Against it: VSP023 is the only rule in the set that checks
// whether the produced code actually works rather than whether an artifact
// exists, and it carries the test-strength signal — the defence against an
// agent satisfying a task with a test that asserts nothing. Every other gate in
// Kit can be satisfied by a well-formed document.
//
// So the split follows who is being protected from what. In `relaxed`,
// `standard` and `strict`, the worse failure is a blocked developer who did not
// ask for a pre-implementation baseline, and VSP023 stays off. In `locked` —
// where overrides are already disallowed and the changed-file limit is five —
// the worse failure is unproven code, and it goes on. Neither direction needs a
// source edit to reach: `locked` projects that want it off write
// `"requireOracleLockBeforeImplementation": false` in .visp/policy.json (an
// explicit, auditable opt-out that survives migration untouched), and any
// project below `locked` that wants it on writes `true`. Setting an
// `assurance.profile` also turns it on at any strictness, and so does the mere
// existence of an oracle plan for the task — see gate-engine.ts.
//
// ---------------------------------------------------------------------------
// Why `locked` carries VSP023 and NOT VSP026, decided rather than inherited
// ---------------------------------------------------------------------------
//
// The two rules are lexically the same shape here — a hard question, `false` in
// all four presets until someone turns it on — and a reader who notices that
// VSP023 was promoted into `locked` and VSP026 was not is owed a reason rather
// than a resemblance — the shape has already been flagged once as a possible
// oversight. This is the answer, and it is meant to end the question.
//
// It is not about strictness. It is about who can satisfy the precondition.
//
// Every other gate `locked` turns on has a precondition some command in THIS
// tool produces — an artifact from `spec`, `plan`, `tasks`, `context`,
// `verify`, a decision from `assurance accept`. VSP023's precondition is three
// of them — `oracle plan`, `oracle lock`, `verify --baseline` — so a `locked`
// user who hits the gate is inconvenienced and then unblocked, by Kit, on their
// own machine. VSP026's precondition is
// `.visp-intel/understanding/<task>.json`, which only `visp-intel` writes. Kit
// never writes that file, never shells out to intel and never imports it
// (see `intelDir` in artifacts/artifact-paths.ts). Turning VSP026 on in
// `locked` would therefore block every behavioural task in every locked project
// that does not run intel, with NO command in Kit able to clear it — and
// `locked` sets `overrides.allowed: false`, so the recorded override that
// clears VSP026 everywhere else is unavailable there too. The only exit would
// be hand-editing .visp/policy.json, which is to say: the preset would ship a
// dead end and call it enforcement.
//
// That is a categorical difference from VSP023, not a difference of degree, and
// it does not soften as intel adoption grows. A preset must be satisfiable by
// the tool that ships it. So VSP026 is DELIBERATELY off in all four presets,
// `locked` included, and this is not an oversight to be re-litigated.
//
// The corollary, and the thing that changed when this was decided: an
// unreachable gate is worse than an absent one, so VSP026 no longer activates
// on nothing. A project that has actually run intel and exported an
// understanding case for the task now gets the gate automatically — presence of
// the export is the trigger, exactly as presence of an oracle plan is a trigger
// for VSP023. See `understandingGateActive` in
// understanding/understanding-activation.ts. The preset stays off because Kit
// cannot produce the artifact; the gate turns itself on for the projects that
// can, which is the only population the rule was ever able to protect.
const lockedRules: PolicyRules = {
  ...strictRules,
  requireOracleLockBeforeImplementation: true
};

const rulesByStrictness: Record<StrictnessMode, PolicyRules> = {
  relaxed: {
    ...allRulesOff,
    blockForbiddenFileChanges: true,
    requirePolicyValidation: true,
    userPromptCannotOverridePolicy: true,
    stopOnFailedGate: true
  },
  standard: {
    ...allRulesOff,
    requireTasksBeforeContext: true,
    requireContextBeforeImplementation: true,
    requireRequirementMappingForTasks: true,
    blockForbiddenFileChanges: true,
    blockUnapprovedDependencyChanges: true,
    requirePolicyValidation: true,
    userPromptCannotOverridePolicy: true,
    stopOnFailedGate: true
  },
  strict: strictRules,
  locked: lockedRules
};

const limitsByStrictness: Record<StrictnessMode, PolicyLimits> = {
  relaxed: {
    maxChangedFilesPerTask: 20,
    maxOutOfScopeFiles: 5,
    maxVerificationFailuresBeforeStop: 3,
    maxReviewErrors: 5,
    maxReconcileErrors: 3,
    maxContextOverBudgetPercent: 50
  },
  standard: {
    maxChangedFilesPerTask: 12,
    maxOutOfScopeFiles: 1,
    maxVerificationFailuresBeforeStop: 1,
    maxReviewErrors: 0,
    maxReconcileErrors: 0,
    maxContextOverBudgetPercent: 25
  },
  strict: {
    maxChangedFilesPerTask: 8,
    maxOutOfScopeFiles: 0,
    maxVerificationFailuresBeforeStop: 1,
    maxReviewErrors: 0,
    maxReconcileErrors: 0,
    maxContextOverBudgetPercent: 20
  },
  locked: {
    maxChangedFilesPerTask: 5,
    maxOutOfScopeFiles: 0,
    maxVerificationFailuresBeforeStop: 0,
    maxReviewErrors: 0,
    maxReconcileErrors: 0,
    maxContextOverBudgetPercent: 0
  }
};

const overridesByStrictness: Record<StrictnessMode, PolicyOverrides> = {
  relaxed: {
    allowed: true,
    requireReason: false,
    recordInReports: true,
    allowedInLockedMode: false,
    nonOverridableRules: ["VSP019", "VSP020", "VSP023", "VSP024", "VSP025"]
  },
  standard: {
    allowed: true,
    requireReason: true,
    recordInReports: true,
    allowedInLockedMode: false,
    nonOverridableRules: ["VSP019", "VSP020", "VSP023", "VSP024", "VSP025"]
  },
  strict: {
    allowed: true,
    requireReason: true,
    recordInReports: true,
    allowedInLockedMode: false,
    nonOverridableRules: ["VSP019", "VSP020", "VSP023", "VSP024", "VSP025"]
  },
  locked: {
    allowed: false,
    requireReason: true,
    recordInReports: true,
    allowedInLockedMode: false,
    nonOverridableRules: ["VSP019", "VSP020", "VSP023", "VSP024", "VSP025"]
  }
};

export function policyRulesForStrictness(mode: StrictnessMode): PolicyRules {
  return { ...rulesByStrictness[mode] };
}

export type ResolvedPolicyRules = {
  readonly rules: PolicyRules;
  /** Rule keys the file omitted, filled here from the strictness preset. */
  readonly filledKeys: readonly (keyof PolicyRules)[];
};

/**
 * Fill rule keys a stored policy omits with the values its own strictness mode
 * declares.
 *
 * Rules added after a `.visp/policy.json` was written are optional in the
 * schema so old files keep validating. That kept them loading, but every gate
 * reads them with `=== true`, so an omitted key silently meant "off" — a file
 * saying `strictnessMode: "strict"` enforced the twenty rules that existed when
 * it was written and none of the six added since. The schema comment has always
 * claimed gates fall back to the strictness default; only VSP021 ever did. This
 * makes the claim true for all of them, in one place, so the stored strictness
 * name means what it says.
 *
 * A key present as `false` is a decision and is preserved. Only absence is
 * filled. `visp-kit policy migrate` writes the result back so the file states
 * what it enforces.
 */
export function resolvePolicyRules(rules: PolicyRules, mode: StrictnessMode): ResolvedPolicyRules {
  const defaults = rulesByStrictness[mode] as Record<string, boolean | undefined>;
  const stored = rules as Record<string, boolean | undefined>;
  const resolved: Record<string, boolean | undefined> = { ...stored };
  const filledKeys: (keyof PolicyRules)[] = [];

  for (const key of policyRuleKeys) {
    if (stored[key] !== undefined) continue;
    const fallback = defaults[key];
    if (fallback === undefined) continue;
    resolved[key] = fallback;
    filledKeys.push(key);
  }

  return { rules: resolved as PolicyRules, filledKeys };
}

export const strictnessOrder = ["relaxed", "standard", "strict", "locked"] as const;

export function strictnessRank(mode: StrictnessMode): number {
  return strictnessOrder.indexOf(mode);
}

function stricterRules(current: PolicyRules, target: PolicyRules): PolicyRules {
  const merged: Record<string, boolean | undefined> = { ...target };

  // Every rule is a "require"/"block" flag, so `true` is always the stricter
  // value. A project that hand-enabled a rule its strictness preset leaves off
  // keeps that rule when the mode is raised.
  for (const key of policyRuleKeys) {
    const currentValue = (current as Record<string, boolean | undefined>)[key];
    const targetValue = (target as Record<string, boolean | undefined>)[key];

    merged[key] =
      currentValue === true || targetValue === true
        ? true
        : currentValue === undefined && targetValue === undefined
          ? undefined
          : false;
  }

  return merged as PolicyRules;
}

function stricterLimits(current: PolicyLimits, target: PolicyLimits): PolicyLimits {
  const merged: Record<string, number> = {};

  // Every limit is an upper bound, so the lower value is the stricter one.
  for (const key of Object.keys(target)) {
    const currentValue = (current as Record<string, number>)[key];
    const targetValue = (target as Record<string, number>)[key];
    merged[key] = Math.min(currentValue ?? targetValue, targetValue);
  }

  return merged as PolicyLimits;
}

/**
 * Raise `policy` to `mode` without weakening anything it already declares.
 *
 * A runtime `--strictness` override must not silently discard project settings
 * the strictness presets do not model — `assurance.profile` in particular, which
 * is what makes VSP022 and VSP023 apply. Rules OR together, limits take the
 * lower bound, and `nonOverridableRules` union.
 */
export function raisePolicyStrictness(input: {
  readonly policy: PolicyArtifact;
  readonly mode: StrictnessMode;
  readonly now: string;
}): PolicyArtifact {
  const target = createDefaultPolicy({ strictnessMode: input.mode, now: input.now });
  const { policy } = input;

  return {
    ...policy,
    strictnessMode: input.mode,
    rules: stricterRules(policy.rules, target.rules),
    limits: stricterLimits(policy.limits, target.limits),
    overrides: {
      ...target.overrides,
      allowed: policy.overrides.allowed && target.overrides.allowed,
      allowedInLockedMode:
        policy.overrides.allowedInLockedMode && target.overrides.allowedInLockedMode,
      requireReason: policy.overrides.requireReason || target.overrides.requireReason,
      recordInReports: policy.overrides.recordInReports || target.overrides.recordInReports,
      nonOverridableRules: [
        ...new Set([
          ...target.overrides.nonOverridableRules,
          ...policy.overrides.nonOverridableRules
        ])
      ].sort()
    },
    updatedAt: input.now
  };
}

export function createDefaultPolicy(input: {
  readonly strictnessMode?: StrictnessMode;
  readonly now: string;
}): PolicyArtifact {
  const strictnessMode = input.strictnessMode ?? "standard";

  return {
    version: "1.0",
    strictnessMode,
    rules: policyRulesForStrictness(strictnessMode),
    limits: { ...limitsByStrictness[strictnessMode] },
    overrides: { ...overridesByStrictness[strictnessMode] },
    createdAt: input.now,
    updatedAt: input.now
  };
}
