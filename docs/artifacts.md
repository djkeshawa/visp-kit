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
