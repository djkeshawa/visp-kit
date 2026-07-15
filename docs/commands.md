# Command Reference

Most commands accept an optional `[path]`. If omitted, Visp Kit uses the current working directory.

Use `--json` for machine-readable output. JSON mode prints JSON only.

## `visp init [path]`

Purpose: initialize `.visp/`, project config, status, policy, and optional starter guidance.

Common flags:

- `--agent generic|codex|none`
- `--budget lean|balanced|strict`
- `--preset javascript|typescript|electron|react|node-api|go|java|python|rust|generic`
- `--strictness relaxed|standard|strict|locked`
- `--force`
- `--dry-run`
- `--json`

If `--preset` is omitted, Visp Kit auto-detects from project manifests.

Next: `visp scan`

## `visp scan [path]`

Purpose: scan project files and update `.visp/cache/`.

Common flags:

- `--changed`
- `--force`
- `--dry-run`
- `--json`

Next: `visp constitution`

## `visp constitution [path]`

Purpose: create or validate compact project rules.

Common flags:

- `--preset <preset>`
- `--budget lean|balanced|strict`
- `--validate`
- `--force`
- `--dry-run`
- `--json`

Next: `visp policy validate`

## `visp feature "idea" [path]`

Purpose: create a feature workspace from raw intent.

Common flags:

- `--budget lean|balanced|strict`
- `--risk low|medium|high`
- `--branch`
- `--no-branch`
- `--branch-name <name>`
- `--force`
- `--dry-run`
- `--json`

Next: `visp clarify`

## `visp clarify [path]`

Purpose: generate or validate clarification artifacts.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--validate`
- `--force`
- `--dry-run`
- `--json`
- `--prompt-only`

Subcommands:

- `visp clarify answer <question-id> [path]`

Answer flags:

- `--answer <text>`
- `--accept-default`
- `--feature <id-or-slug-or-folder>`
- `--dry-run`
- `--json`

Next: `visp spec`

## `visp spec [path]`

Purpose: generate or validate specification artifacts.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--validate`
- `--force`
- `--dry-run`
- `--json`
- `--prompt-only`

Next: `visp plan`

## `visp plan [path]`

Purpose: generate or validate implementation plan artifacts.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--validate`
- `--force`
- `--dry-run`
- `--json`
- `--prompt-only`

Next: `visp tasks`

## `visp tasks [path]`

Purpose: generate or validate task graph artifacts.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--validate`
- `--force`
- `--dry-run`
- `--json`
- `--prompt-only`

Next: `visp context --next`

## `visp context [task-id] [path]`

Purpose: compile a task-specific context pack and current task prompt.

Common flags:

- `--next`
- `--feature <id-or-slug-or-folder>`
- `--budget lean|balanced|strict`
- `--max-tokens <number>`
- `--include-full-files`
- `--prompt-only`
- `--force`
- `--dry-run`
- `--json`

Related gate: `visp gate implement --task T001`

## `visp budget [path]`

Purpose: estimate feature or task context token usage.

The budget report is also refreshed automatically after normal `tasks`, `context`, `verify`, `review`, `reconcile`, and `pr` workflow runs. Use this command directly when you want to inspect budget state or record actual agent-reported usage.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--budget lean|balanced|strict`
- `--max-tokens <number>`
- `--write-report`
- `--record-usage`
- `--record-usage-unavailable`
- `--input-tokens <number>`
- `--output-tokens <number>`
- `--total-tokens <number>`
- `--model <name>`
- `--usage-note <text>`
- `--dry-run`
- `--json`

Actual usage example:

```bash
visp budget --task T001 \
  --record-usage \
  --input-tokens 1200 \
  --output-tokens 300 \
  --model codex \
  --write-report
```

Recorded usage is also reflected in run traces and feature timelines when workflow evidence is refreshed.

Unavailable usage example:

```bash
visp budget --task T001 \
  --record-usage-unavailable \
  --model codex \
  --usage-note "Agent surface did not expose numeric token usage." \
  --write-report
```

## `visp checklist`

Purpose: inspect and update the machine-readable implementation checklist generated for each task context.

Subcommands:

- `visp checklist status [path] --task T001`
- `visp checklist update [path] --task T001 --item <id> --status <status>`

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--item <id>`
- `--status pending|done|not_applicable|unavailable|blocked`
- `--reason <text>`
- `--evidence <text>`
- `--dry-run`
- `--json`

Generated/read artifacts:

- `.visp/features/<feature>/context/<task>.implementation-checklist.json`
- `.visp/features/<feature>/context/<task>.implementation-checklist.md`

## `visp workflow`

Purpose: inspect and validate the effective Visp workflow manifest.

Subcommands:

- `visp workflow show [path]`
- `visp workflow validate [path]`

Flags:

- `--json`

Generated/read artifact:

- `.visp/workflow.json`

Use this when an agent or teammate needs to understand allowed stages, required artifacts, related gates, next commands, and whether source edits are allowed.

## `visp eval [path]`

Purpose: run deterministic workflow-quality evaluation.

Flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--strict`
- `--write-report`
- `--dry-run`
- `--json`

Generated artifacts:

- `.visp/reports/evaluation-report.md`
- `.visp/reports/evaluation-report.json`

Evaluation checks workflow completeness, policy/gate health, traceability, context budget, implementation checklist progress, evidence reports, overrides, and PR readiness. It does not call an LLM.

## `visp verify [path]`

Purpose: validate artifacts, traceability, commands, scope, and dependencies.

Common flags:

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

Generated artifacts:

- `.visp/features/<feature>/verification.md`
- `.visp/features/<feature>/verification.json`

## `visp review [path]`

Purpose: run deterministic Git diff review.

Common flags:

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

Generated artifacts:

- `.visp/features/<feature>/review/T001.review.md`
- `.visp/features/<feature>/review/T001.review.json`
- `.visp/features/<feature>/review/T001.review-prompt.md`
- `.visp/features/<feature>/review/T001.review-checklist.md`

## `visp reconcile [path]`

Purpose: compare spec, plan, tasks, context, evidence, traceability, and Git diff.

Common flags:

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

Generated artifacts:

- `.visp/features/<feature>/reconcile/T001.reconcile.md`
- `.visp/features/<feature>/reconcile/T001.reconcile.json`
- `.visp/features/<feature>/reconcile/T001.reconcile-prompt.md`

## `visp done [path]`

Purpose: run the full post-implementation pipeline for one task in order —
verify, usage recording, review, reconcile (with traceability update),
checklist status check, and next-step recommendation. The pipeline stops at
the first failing step and prints the exact recovery command.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>` (required)
- `--input-tokens <n>` and `--output-tokens <n>` to record actual usage
- `--usage-unavailable` when the agent surface does not expose numeric usage
- `--model <model>`
- `--usage-note <note>`
- `--dry-run`
- `--json`

Example:

```bash
visp done --task T001 --input-tokens 18000 --output-tokens 4200 --model codex
```

## `visp hooks <claude|git|ci> [path]`

Purpose: install enforcement hooks that make gates mechanical instead of
advisory. See [enforcement.md](enforcement.md).

- `visp hooks claude` — Claude Code PreToolUse hook that blocks edits before
  `visp gate implement` allows them; prints the settings snippet to merge.
- `visp hooks git` — pre-commit check of staged source files against the
  active implement authorization.
- `visp hooks ci` — GitHub Actions workflow running `visp policy validate`
  and `visp gate pr` on pull requests.

Common flags: `--force`, `--dry-run`, `--json`.

## `visp status [path]`

Purpose: show project, policy, feature, task, evidence, override, and next-step state.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--verbose`
- `--write-report`
- `--json`

## `visp next [path]`

Purpose: recommend the next deterministic workflow step.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--command-only`
- `--explain`
- `--strict`
- `--format <text|json>`
- `--json`

`--format json` emits the current WorkflowAction 2.0 action. Its tested schema
contains `protocolVersion`, `phase`, `taskId`, `goal`, hash-pinned
`requiredReads`, `writablePaths`, `forbiddenPaths`, `acceptanceOracles`,
`validationCommands`, `assuranceLevel`, `verdict`, `findings`, and one exact
`nextCommand`. It does not advertise or negotiate a later protocol.

`--json` instead emits the `visp next` command/workflow summary, which includes
the action alongside the command decision. Without `--json`, `--format text`
uses the normal human-readable summary.

## `visp doctor [path]`

Purpose: diagnose project health, artifacts, agent files, Git, cache, schemas, policy, and overrides.

Common flags:

- `--check all|project|artifacts|agent|git|cache|schemas`
- `--fix`
- `--dry-run`
- `--verbose`
- `--json`

## `visp integration`

Purpose: expose a stable, read-only integration contract for orchestrators such as Visp Hyper Agent.

Subcommands:

- `visp integration contract [path]`

The current integration contract is `2.0`. It includes Kit identity and version,
target and active-work state, canonical argument arrays for the supported
orchestrator commands, current capability declarations, strict workflow
metadata, artifact paths, and warnings. The command map covers status, policy
validation, next and implement gates, context, verification, review,
reconciliation, usage recording, the combined done workflow, and the three
enforcement-hook installers.

`orchestrator.readContractVersion` is `0.1`. Its required artifacts use the
current tested roles `state`, `policy`, `profile`, `task-graph`, `context-pack`,
`prompt`, and `checklist`, with MIME type, required stage, and a freshness rule
of `read-latest`, `hash-pinned`, or `gate-validated`. The contract declares
hash-pinned context/provenance checks and fail-closed policy, gate, verify,
review, and reconcile steps. Stale context blocks implementation, checkpoint,
and PR use.

Compatibility is established only for exact tested Kit/consumer pairs. Contract
2.0 does not currently advertise WorkflowAction v3, schema hashes, a supported
semver range, or protocol negotiation.

Common flags:

- `--json`

## `visp pr [path]`

Purpose: generate local PR Markdown, JSON, and prompt files. This does not call GitHub.

Common flags:

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

## `visp policy`

Purpose: manage `.visp/policy.json`.

Subcommands:

- `visp policy init [path] --strictness relaxed|standard|strict|locked`
- `visp policy show [path]`
- `visp policy validate [path]`
- `visp policy set-strictness <mode> [path]`

## `visp gate <stage> [path]`

Purpose: evaluate deterministic policy gates.

Stages:

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

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--strictness relaxed|standard|strict|locked`
- `--explain`
- `--dry-run`
- `--json`

Blocked gates exit non-zero.

## `visp agent`

Purpose: install, inspect, and refresh agent-native workflow files.

Subcommands:

- `visp agent list [path]`
- `visp agent bootstrap codex [path]`
- `visp agent bootstrap generic [path]`
- `visp agent bootstrap claude [path]`
- `visp agent bootstrap copilot [path]`
- `visp agent bootstrap opencode [path]`
- `visp agent install codex [path]`
- `visp agent install generic [path]`
- `visp agent install claude [path]`
- `visp agent install copilot [path]`
- `visp agent install opencode [path]`
- `visp agent doctor [path]`
- `visp agent refresh [path]`

Common install flags:

- `--strictness relaxed|standard|strict|locked`
- `--preset javascript|typescript|electron|react|node-api|go|java|python|rust|generic` for bootstrap
- `--budget lean|balanced|strict` for bootstrap
- `--force`
- `--dry-run`
- `--json`

If bootstrap omits `--preset`, Visp Kit auto-detects before creating `.visp/config.json`.

Doctor flags:

- `--target codex|generic|claude|copilot|opencode`
- `--fix`
- `--dry-run`
- `--json`

Refresh flags:

- `--target codex|generic|claude|copilot|opencode|all`
- `--force`
- `--dry-run`
- `--json`

## `visp override`

Purpose: create, list, show, revoke, and validate explicit policy overrides.

Subcommands:

- `visp override create <rule-id> [path]`
- `visp override list [path]`
- `visp override show <override-id> [path]`
- `visp override revoke <override-id> [path]`
- `visp override validate [path]`

Create flags:

- `--reason <text>`
- `--scope project|feature|task|stage`
- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--stage setup|feature|clarify|spec|plan|tasks|context|implement|verify|review|reconcile|pr`
- `--expires <iso-date-or-duration>`
- `--dry-run`
- `--json`

List flags:

- `--active`
- `--revoked`
- `--expired`
- `--rule <rule-id>`
- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--json`

Overrides require a meaningful reason, do not hide the issue, and are visible in gate/readiness reports.
