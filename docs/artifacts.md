# Artifacts

Visp Kit stores deterministic local artifacts in `.visp/`.

## Root Artifacts

```text
.visp/project.json
.visp/config.json
.visp/status.json
.visp/policy.json
.visp/overrides.json
.visp/workflow.json
.visp/budget.json
```

- `project.json`: detected project profile.
- `config.json`: Visp preset, budget, and agent configuration.
- `status.json`: active feature, active task, state, and last command.
- `policy.json`: strictness mode, policy rules, limits, and override settings.
- `overrides.json`: explicit, auditable policy exceptions.
- `workflow.json`: stage, gate, artifact, source-edit, and next-command contract.
- `budget.json`: budget estimates and actual token usage records.

## Cache

```text
.visp/cache/
  file-index.json
  file-summaries.json
  module-map.json
  test-map.json
  dependency-map.json
  scan-meta.json
```

The scan cache reduces repeated token usage.

## Memory

```text
.visp/memory/
  constitution.md
  constitution.compact.md
  project-summary.md
  patterns.md
```

The compact constitution is used in context packs. The full constitution is not sent by default.

## Feature Workspace

```text
.visp/features/001-add-note-pinning/
  intent.json
  intent.md
  clarifications.json
  clarifications.md
  spec.json
  spec.md
  plan.json
  plan.md
  task-graph.json
  tasks.md
  traceability.json
  traceability.md
  timeline.json
  timeline.md
```

Each task in `task-graph.json` keeps three independent classification fields:

- `taskClass`: `localized_bug`, `bounded_feature`, `cross_file_change`,
  `regression_test`, `refactor`, `migration`, `security`, or `documentation`;
- `riskLevel`: `low`, `medium`, or `high`; and
- `riskFactors`: versioned factor records such as `public_api`, `schema`,
  `dependency`, `concurrency`, or `data_migration`.

Legacy task graphs without class or factors remain readable. A graph cannot be
marked ready until both are explicit. An empty `riskFactors` array means no
factors apply; an omitted field means the legacy source did not declare them.

## Context

```text
.visp/features/<feature>/context/
  T001.context.md
  T001.context.json
  T001.prompt.md
```

`T001.context.json` includes `artifactProvenance`: SHA-256 fingerprints for the
spec/task graph/plan/policy/project guidance artifacts present when the context
pack was compiled. Orchestrators can use this to explain and later audit exactly
which local artifacts grounded the handoff.

## Evidence

```text
.visp/features/<feature>/verification.md
.visp/features/<feature>/verification.json
.visp/features/<feature>/review/T001.review.md
.visp/features/<feature>/review/T001.review.json
.visp/features/<feature>/reconcile/T001.reconcile.md
.visp/features/<feature>/reconcile/T001.reconcile.json
.visp/reports/evaluation-report.md
.visp/reports/evaluation-report.json
```

Phase 2 evidence contracts distinguish requirements from results:

- a requirement binds a versioned provider to a command, validation oracle,
  static check, security check, or human review and accepts only `passed`;
- a result records the provider version, command or inspection, input hashes,
  timestamps, captured/referenced output, freshness, independence, and outcome;
- outcomes are `passed`, `failed`, `inconclusive`, or `not_applicable`;
- `failed` and `inconclusive` require a reason, while `not_applicable` also
  requires an auditable rule or override; and
- missing, mismatched, stale, or freshness-unknown results never satisfy a
  strict evidence requirement.

The stable assurance-profile vocabulary is `routine`, `behavioral`, and
`critical`. Profile selection and provider execution are introduced by later
Phase 2 tasks; defining these schemas does not infer a profile or run a tool.

## Run Traces

```text
.visp/runs/index.json
.visp/runs/RUN001/run.json
.visp/runs/RUN001/run.md
.visp/runs/RUN001/events.jsonl
```

Run traces record compact command, gate, artifact, budget, and evidence events. They do not store large diffs, full prompts, or source file contents.

## PR

```text
.visp/features/<feature>/pr.md
.visp/features/<feature>/pr.json
.visp/prompts/pr.prompt.md
```

## Agent Metadata

```text
.visp/agent/installed-targets.json
.visp/agent/agent-guide.md
.visp/agent/workflow-map.json
.visp/agent/capabilities.json
```

Agent metadata records installed guidance targets such as Codex, generic, Claude, and Copilot. Capabilities describe how those tools are expected to consume Visp guidance; Visp still does not run the tools directly.

## Generated Files

Visp reports and prompts are generated outputs. They are safe to overwrite by the command that creates them. Source implementation files are never modified by Visp Kit commands.
