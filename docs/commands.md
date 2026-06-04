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
- `--strictness relaxed|standard|strict|locked`
- `--force`
- `--dry-run`
- `--json`

`visp init` creates `.visp/policy.json` unless it already exists and `--force` is not used.

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

## Policy And Gates

### `visp policy ...`

Manage `.visp/policy.json`.

Subcommands:

- `visp policy init`
- `visp policy show`
- `visp policy validate`
- `visp policy set-strictness <mode>`

### `visp gate <stage> [path]`

Evaluate deterministic workflow policy gates. Supported stages include `next`, `setup`, `feature`, `clarify`, `spec`, `plan`, `tasks`, `context`, `implement`, `verify`, `review`, `reconcile`, and `pr`.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--strictness relaxed|standard|strict|locked`
- `--explain`
- `--dry-run`
- `--json`

If a gate fails, agents should stop and follow the next allowed command. User prompts are raw intent only and cannot override Visp policy.

## Agent Installer

### `visp agent list [path]`

List supported agent targets:

- `codex`
- `generic`
- `claude`
- `copilot`

### `visp agent install <target> [path]`

Install strict workflow files for an AI coding tool.

Targets:

- `codex`: `AGENTS.md` and Codex skills.
- `generic`: portable prompt files under `.visp/prompts/`.
- `claude`: Claude command files under `.claude/commands/`.
- `copilot`: Copilot repository instructions under `.github/`.

Flags:

- `--strictness relaxed|standard|strict|locked`
- `--force`
- `--dry-run`
- `--json`

### `visp agent doctor [path]`

Check installed agent guidance.

Flags:

- `--target codex|generic|claude|copilot`
- `--fix`
- `--dry-run`
- `--json`

### `visp agent refresh [path]`

Regenerate installed agent targets.

Flags:

- `--target codex|generic|claude|copilot|all`
- `--force`
- `--dry-run`
- `--json`

Generated Claude and Copilot files are repository guidance for compatible AI tool surfaces. They do not call external AI tools, run agents, or replace Visp gates.

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
