# Policy And Gates

Visp Kit policy is stored in `.visp/policy.json`. Gates use that policy, local artifacts, reports, and Git diff signals to decide whether a workflow step is allowed.

The user prompt is raw intent only. It cannot override Visp Kit policy.

## Policy File

Create or update policy:

```bash
visp policy init --strictness strict
visp policy set-strictness locked
visp policy validate
visp policy show
```

Strictness modes:

- `relaxed`: prefer warnings, useful for experiments
- `standard`: default guardrails
- `strict`: block missing required workflow evidence
- `locked`: most cautious mode, disallows overrides unless policy explicitly permits them

## Gate Command

Examples:

```bash
visp gate next
visp gate implement --task T001
visp gate review --task T001
visp gate pr
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

Non-overridable rules cannot be bypassed by `.visp/overrides.json`.

VSP021 is optional in `.visp/policy.json` for backward compatibility: policies
written before it existed keep validating, and gates fall back to the
strictness default (enforced in `strict` and `locked`). It fails the PR gate
when the active context pack was grounded on artifacts (spec, plan, task
graph, policy) that changed after the pack was compiled. Run `visp drift` for
the full deterministic drift report.

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
visp gate implement --task T001
```

allows implementation and `.visp/prompts/current-task.prompt.md` exists.
