# Policy And Gates

Visp Kit policy is stored in `.visp/policy.json`. Gates use that policy, local artifacts, reports, and Git diff signals to decide whether a workflow step is allowed.

The user prompt is raw intent only. It cannot override Visp Kit policy.

## Policy File

Create or update policy:

```bash
visp-kit policy init --strictness strict
visp-kit policy set-strictness locked
visp-kit policy validate
visp-kit policy show
```

Strictness modes:

- `relaxed`: prefer warnings, useful for experiments
- `standard`: default guardrails
- `strict`: block missing required workflow evidence
- `locked`: most cautious mode, disallows overrides unless policy explicitly permits them

## Gate Command

Examples:

```bash
visp-kit gate next
visp-kit gate implement --task T001
visp-kit gate review --task T001
visp-kit gate pr
```

Allowed gates exit `0`. Blocked gates exit non-zero and report the next allowed command.

Gate reports are written to:

```text
.visp/reports/gate-report.md
```

Use `--dry-run` to avoid writing the report.

## Gate Stages

Supported stages:

- `next`
- `setup`
- `feature`
- `clarify`
- `spec`
- `plan`
- `tasks`
- `context`
- `implement`
- `verify`
- `review`
- `reconcile`
- `pr`

## Rule IDs

| Rule | Name | Typical blocking stage | Overridable |
|------|------|------------------------|-------------|
| VSP001 | require_scan_before_feature | feature, next | yes |
| VSP002 | require_constitution_before_feature | feature, next | yes |
| VSP003 | require_clarify_before_spec | spec, next | yes |
| VSP004 | require_spec_before_plan | plan, tasks, next | yes |
| VSP005 | require_plan_before_tasks | tasks, next | yes |
| VSP006 | require_tasks_before_context | context, implement, next | yes |
| VSP007 | require_context_before_implementation | implement, verify | yes |
| VSP008 | require_requirement_mapping_for_tasks | context, implement | yes |
| VSP009 | require_acceptance_criteria_for_behavior_tasks | context, implement | yes |
| VSP010 | require_validation_commands | context, implement, verify | yes |
| VSP011 | block_forbidden_file_changes | implement, pr | yes |
| VSP012 | block_out_of_scope_changes | implement, pr | yes |
| VSP013 | block_unapproved_dependency_changes | implement, pr | yes |
| VSP014 | require_verify_before_review | review, reconcile, pr | yes |
| VSP015 | require_review_before_reconcile | reconcile, pr | yes |
| VSP016 | require_reconcile_before_pr | pr | yes |
| VSP017 | require_traceability_update_before_pr | reconcile, pr | yes |
| VSP018 | require_policy_validation | setup, all workflow stages | yes, except locked policy may disallow |
| VSP019 | user_prompt_cannot_override_policy | all stages | no |
| VSP020 | stop_on_failed_gate | all stages | no |
| VSP021 | block_on_unresolved_drift | pr | yes |
| VSP022 | prevent_assurance_profile_lowering | task-aware gates | yes, with an auditable reason |
| VSP026 | require_understanding_before_behavioural_implementation | implement | yes, with an auditable reason |

Non-overridable rules cannot be bypassed by `.visp/overrides.json`.

VSP021 is optional in `.visp/policy.json` for backward compatibility: policies
written before it existed keep validating, and gates fall back to the
strictness default (enforced in `strict` and `locked`). It fails the PR gate
when the active context pack was grounded on artifacts (spec, plan, task
graph, policy) that changed after the pack was compiled. Run `visp-kit drift` for
the full deterministic drift report.

## VSP026 — understanding before behavioural implementation

VSP026 gates **behavioural** tasks only. A mechanical task passes through
untouched, and an ambiguous task counts as mechanical: under-gating a
behavioural task costs today's behaviour, while over-gating a trivial edit
teaches agents that the gate is noise and they then route around it everywhere.

It is **off by default in every strictness mode**. Enable it per project:

```json
{ "rules": { "requireUnderstandingBeforeBehaviouralImplementation": true } }
```

The classification is recorded in the gate report as `taskClassification`
whether or not the rule is enabled, so the rule's own accuracy can be measured.
It reads only declared, auditable inputs — the change surface
(`allowedFiles` ∪ `expectedFiles`), the declared fields (`taskClass`,
`riskFactors`, `blastRadius`, `reversibility`), the intel case when one is
current, and scan's repository model. It does **not** read `task.title`,
`task.description`, spec prose or the user prompt: intent is raw input under
VSP019, and prose is the one input an agent can rewrite to change its own gate.

### Every declared `taskClass` is mapped

The mapping from `taskClass` to a verdict is **total**, and total by
construction — `satisfies Record<TaskClass, …>` in
`src/gates/task-classification.ts` will not compile if a member of the enum has
no decision recorded against it.

| `taskClass` | verdict | rule |
|---|---|---|
| `localized_bug`, `bounded_feature`, `cross_file_change`, `migration`, `security`, `refactor` | behavioural | B1 |
| `documentation`, `regression_test` whose surface holds non-test **code** | behavioural | B4 |
| `documentation`, `regression_test` whose surface does not | mechanical | M1 |

`refactor` used to appear in neither list, so a task declaring it fell through
every rule to `ambiguous_default_mechanical` and was not gated. A refactor is a
change whose whole claim is *about* behaviour, so it is behavioural, and the
type-level totality is there so the next enum member cannot repeat the hole.

### A declared mechanical class holds only while the surface agrees

A `taskClass` is written by whoever wrote the task, so a rule that honours it
unconditionally lets a task choose its own gate. A verifier defeated VSP026 by
declaring `documentation` and editing source: the old rule had a catch-all
`M3_declared_mechanical_class` branch that accepted any declared mechanical
class whatever the surface held.

**B4** replaces that branch. A declared mechanical class is *refuted* when the
change surface holds a file that is positively known to be non-test executable
code, and a refuted class classifies **behavioural**. The evidence is scan's
own file index joined with the declared surface — never the declaration, never
prose.

Two properties keep this from becoming over-gating:

- **Contradicting evidence gates; absent evidence does not.** A file nobody has
  indexed and whose path does not say "code" is not in the refuting set. A task
  that declares nothing at all is still ungated, exactly as before.
- **"Code" is narrower than `isSourceFile`.** Scan marks Markdown, JSON, CSS and
  HTML as source files, so `isSourceFile` could never distinguish a
  documentation task from a source one — every `.md` file in this repository is
  `isSourceFile: true`, which is why M1 and M2 could not fire on the one class
  they were written for. B4 asks whether the language is a programming language
  (`isProgramFilePath`), which is what "non-test source file" was reaching for.

`visp-kit verify` re-runs the classification against the **realized** change
surface — the diff, not the declaration. When that realized surface refutes a
declared mechanical class, VSP026 fails at `verify` with an error, because at
that point the strongest available evidence says the declaration was wrong. It
is still clearable through the ordinary recorded override, and it is silent
while VSP026 is disabled. Every other mechanical→behavioural move at verify
stays a recorded warning: that is ordinary scope drift, which the scope rules
own, and blocking it here would be retroactive.

`mechanicalClassCorroboration` in `src/gates/task-classification.ts` is total
over the mechanical classes, so adding one fails to compile until someone
records what would corroborate it.

**The ambiguous default is now reachable only when no `taskClass` is
declared.** That case remains ungated on purpose: the rule reads declared
evidence, a task that declares nothing has no admissible evidence, and reading
prose to fill the gap is what VSP019 forbids. Note the consequence rather than
assume it away — VSP026 binds nothing before a planner has written a surface
and a class, so it is not the thing that catches an agent editing on a hunch
before scope exists. That gap is closed upstream instead: `visp-kit tasks
--validate` refuses a task graph whose tasks lack a `taskClass`, `riskFactors`
or a concrete allowed/expected file, and `taskGraphReadiness` mirrors the same
check in `visp-kit next`. A task graph written straight to disk bypasses both,
which is exactly what the Phase 21 ablation did and why it saw the ambiguous
default on 29 of 29.

The F1 risk-factor floor is likewise a total record over `riskFactorCodeValues`
rather than a partial set. `dependency`, `concurrency` and `deployment` are
recorded as **not** on the floor, with reasons; that is a decision, not an
omission, and it does not make such a task mechanical — it still reaches B1,
B2 and B3.

When the verdict is behavioural, each condition is a separate finding:

| Condition | Requires |
|-----------|----------|
| G1 | a current understanding case for this task |
| G2 | at least one entrypoint |
| G3 | at least one path relation, **or** an explicit unresolved scout status |
| G4 | at least one affected test, or a concrete validation command |
| G5 | cited unknowns resolved or named in an override reason |
| G6 | every candidate change entity inside the declared surface |

Clear it the same way as any other rule:

```bash
visp-kit override add --rule VSP026 --scope task --feature <feature> --task <id> \
  --reason "<at least twelve characters, auditable>"
```

There is no flag, no environment variable, and no silent policy escape. Once
the rule is on, deleting `.visp-intel/` does not open the gate — G1 fails and
the task stays blocked.

## Reading intel's artifacts

Kit reads two optional files from `.visp-intel/` and writes neither:

- `.visp-intel/graph.json` — a `visp-intel repo export` bundle. `scan` uses it
  to back `module-map.json` with resolved file-to-file imports and real
  external module names. `dependency-map.json` stays manifest-derived: its
  fields are package-manager facts (versions, scripts, lockfiles) that a code
  graph does not carry. Scan writes what it read to
  `.visp/cache/intel-scan.json`; the other scan artifacts are unchanged by the
  presence of a store.
- `.visp-intel/understanding/<task-id>.json` — the Understanding Case export,
  read by the context pack and by VSP026.

Both are optional in the strict sense: missing, unreadable or schema-invalid
each produce a warning and today's behaviour. Kit has no dependency on
`visp-intel`, imports no intel module, and never shells out to its CLI.

A case counts as **current** only when its snapshot equals repository head, its
`repositoryInstanceId` matches the one scan recorded, its `gitCommit` matches
the context pack's `baseCommit`, and it was exported from a clean worktree.
Matching on instance id rather than directory path is deliberate: a re-clone or
a sibling worktree at the same path is a different repository and must not
inherit another one's case. A stale case never fails a command — it simply does
not satisfy the gate and is not rendered into the prompt.

## Assurance Profile Selection

For classified tasks, Kit calculates the minimum assurance profile before
implementation:

- `routine` for low-risk documentation, regression-test, and refactor tasks;
- `behavioral` for localized bugs, bounded features, cross-file changes, and
  medium risk; and
- `critical` for security or migration tasks, high risk, declared risk factors,
  dependency manifests/lockfiles, deployment workflows, and critical code
  areas such as authentication, authorization, cryptography, schemas,
  permissions, and migrations.

The calculation uses the task's allowed and expected paths, so it is stable
before implementation. Documentation paths do not become critical merely
because they describe a critical subsystem.

A project may raise the selected profile with:

```json
{
  "assurance": {
    "profile": "critical"
  }
}
```

A configured profile below Kit's calculated minimum is blocked by `VSP022`.
Lowering requires a scoped, active override with a human reason; the canonical
v3 action retains the calculated profile until that override applies.

## Gates In Reports

Verification, review, reconcile, and PR artifacts include policy gate summaries where available. Gate output includes:

- strictness mode
- allowed or blocked result
- failed rules
- blocked commands
- next allowed command
- applied overrides

Overrides do not hide the failure. They downgrade an overridable blocking rule to a warning and record the override ID and reason.

## Agent Behavior

Generated agent guidance tells AI tools to run gates and stop when gates block. An agent should not implement code until:

```bash
visp-kit gate implement --task T001
```

allows implementation and `.visp/prompts/current-task.prompt.md` exists.
