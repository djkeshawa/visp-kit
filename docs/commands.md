# Command Reference

All commands accept an optional `[path]` unless noted. If omitted, Visp Kit uses the current working directory.

Use `--json` for machine-readable output. JSON mode prints JSON only.

## Setup

### `visp init [path]`

Initialize `.visp/`.

Flags:

- `--agent generic|codex|none`
- `--budget lean|balanced|strict`
- `--preset javascript|typescript|electron|react|node-api|generic`
- `--force`
- `--dry-run`
- `--json`

### `visp scan [path]`

Scan the project and update cache artifacts.

Common flags:

- `--changed`
- `--force`
- `--dry-run`
- `--json`

### `visp constitution [path]`

Generate or validate project rules.

Common flags:

- `--preset <preset>`
- `--budget lean|balanced|strict`
- `--validate`
- `--force`
- `--dry-run`
- `--json`

## Feature Planning

### `visp feature "idea" [path]`

Create a feature workspace.

Flags:

- `--budget lean|balanced|strict`
- `--risk low|medium|high`
- `--branch`
- `--no-branch`
- `--branch-name <name>`
- `--force`
- `--dry-run`
- `--json`

### `visp clarify [path]`

Generate or validate clarification artifacts.

### `visp spec [path]`

Generate or validate specification artifacts.

### `visp plan [path]`

Generate or validate implementation plan artifacts.

### `visp tasks [path]`

Generate or validate task graph artifacts.

Template workflow commands support:

- `--feature <id-or-slug-or-folder>`
- `--validate`
- `--force`
- `--dry-run`
- `--json`

## Context And Budget

### `visp context <task-id> [path]`

Compile a context pack for a task.

### `visp context --next [path]`

Compile a context pack for the next ready task.

Flags:

- `--feature <id-or-slug-or-folder>`
- `--budget lean|balanced|strict`
- `--max-tokens <number>`
- `--include-full-files`
- `--prompt-only`
- `--force`
- `--dry-run`
- `--json`

### `visp budget [path]`

Estimate feature or task token usage.

Flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--budget lean|balanced|strict`
- `--max-tokens <number>`
- `--write-report`
- `--dry-run`
- `--json`

## Evidence Gates

### `visp verify [path]`

Run deterministic verification gates.

Flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--targeted`
- `--all`
- `--commands`
- `--skip-commands`
- `--artifacts`
- `--traceability`
- `--scope`
- `--dependencies`
- `--update-task-status`
- `--force`
- `--dry-run`
- `--json`

### `visp review [path]`

Run deterministic diff review.

Flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--diff-only`
- `--staged`
- `--unstaged`
- `--base <git-ref>`
- `--prompt-only`
- `--checklist-only`
- `--skip-verification`
- `--force`
- `--dry-run`
- `--json`

### `visp reconcile [path]`

Compare artifacts, evidence, traceability, and Git diff.

Flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--staged`
- `--unstaged`
- `--base <git-ref>`
- `--update-traceability`
- `--update-task-status`
- `--prompt-only`
- `--force`
- `--dry-run`
- `--json`

## Orchestration

### `visp status [path]`

Show project, feature, task, artifact, and evidence state.

Flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--verbose`
- `--write-report`
- `--json`

### `visp next [path]`

Recommend the next deterministic workflow step.

Flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--command-only`
- `--explain`
- `--strict`
- `--json`

### `visp doctor [path]`

Diagnose project health.

Flags:

- `--check all|project|artifacts|agent|git|cache|schemas`
- `--fix`
- `--dry-run`
- `--verbose`
- `--json`

### `visp pr [path]`

Generate PR Markdown, JSON, and prompt files. This does not call GitHub.

Flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--base <git-ref>`
- `--staged`
- `--unstaged`
- `--title <title>`
- `--prompt-only`
- `--force`
- `--dry-run`
- `--json`
