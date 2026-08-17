# Command Reference

Most commands accept an optional `[path]`. If omitted, Visp Kit uses the current working directory.

Use `--json` for machine-readable output. JSON mode prints JSON only.

## `visp-kit init [path]`

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

Almost everything init writes goes under `.visp/`. The exceptions are files your
project already owns, so init names each one and says what happened to it:

```text
Project root:
  AGENTS.md — skipped
  AGENTS.visp.md — created
  .gitignore — updated
```

An existing `AGENTS.md` is never overwritten without `--force`; `AGENTS.visp.md`
is written beside it instead. The `.gitignore` line is a single appended `.visp/`
entry, added only inside a git repository and only when the file does not
already list it — the check is for that literal entry, not for whether git would
ignore `.visp/` by some broader pattern. `--dry-run` lists the same files
without writing them, and `--json` reports them as `projectRootFiles`.

Next: `visp-kit scan`

## `visp-kit scan [path]`

Purpose: scan project files and update `.visp/cache/`.

Common flags:

- `--changed`
- `--force`
- `--dry-run`
- `--json`

Next: `visp-kit constitution`

## `visp-kit constitution [path]`

Purpose: create or validate compact project rules.

Common flags:

- `--preset <preset>`
- `--budget lean|balanced|strict`
- `--validate`
- `--force`
- `--dry-run`
- `--json`

Next: `visp-kit policy validate`

## `visp-kit feature "idea" [path]`

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

Next: `visp-kit clarify`

## Drafts: `clarify`, `spec`, `plan`, `tasks`

These four commands have two modes, and they report differently.

**Without `--validate`** they seed a skeleton whose fields are placeholders for
you (or your AI coding tool) to fill in. That is the whole job, so the command
succeeds and exits `0`, with `"outcome": "draft"` in `--json` and the unfilled
fields listed as work to do. It is not an accepted artifact: `validation.passed`
stays `false`, the workflow state does not advance, and the next stage refuses
the file until you validate it.

**With `--validate`** they judge what you actually wrote. Placeholders fail
there, exactly as before.

The distinction exists because the generation path could not do anything else:
these templates contain the literal `TBD`, and the validator rejects `TBD`.
Calling that a validation FAILURE meant every first, correct invocation of all
four commands exited `1`, and agents spent turns trying to repair a tool that
was working.

## `visp-kit clarify [path]`

Purpose: generate or validate clarification artifacts.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--validate`
- `--force`
- `--dry-run`
- `--json`
- `--prompt-only`

Subcommands:

- `visp-kit clarify answer <question-id> [path]`

Answer flags:

- `--answer <text>`
- `--accept-default`
- `--feature <id-or-slug-or-folder>`
- `--dry-run`
- `--json`

Next: `visp-kit spec`

## `visp-kit spec [path]`

Purpose: generate or validate specification artifacts.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--validate`
- `--force`
- `--dry-run`
- `--json`
- `--prompt-only`

Next: `visp-kit plan`

## `visp-kit plan [path]`

Purpose: generate or validate implementation plan artifacts.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--validate`
- `--force`
- `--dry-run`
- `--json`
- `--prompt-only`

Next: `visp-kit tasks`

## `visp-kit tasks [path]`

Purpose: generate or validate task graph artifacts.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--validate`
- `--force`
- `--dry-run`
- `--json`
- `--prompt-only`

`--validate` also rewrites `traceability.json` once validation passes: each
entry's `taskIds` are re-derived from the task graph it just validated, since a
task states the requirements it implements. An entry a later stage promoted to
`covered` or `verified` keeps that status. Nothing is written when validation
fails or under `--dry-run`.

Next: `visp-kit context --next`

## `visp-kit context [task-id] [path]`

Purpose: compile a task-specific context pack and current task prompt.

Common flags:

- `--next`
- `--feature <id-or-slug-or-folder>`
- `--budget lean|balanced|strict`
- `--max-tokens <number>`
- `--include-full-files`
- `--snippet-cap on|off` (default `on`; `--include-full-files` turns it off for
  that invocation unless you also pass `--snippet-cap on`)
- `--prompt-only`
- `--force`
- `--dry-run`
- `--json`

Related gate: `visp-kit gate implement --task T001`

## `visp-kit oracle`

Purpose: generate, approve, lock, and validate task-bound implementation assurance.

Subcommands:

- `visp-kit oracle plan [path] --task T001`
- `visp-kit oracle validate [path] --task T001`
- `visp-kit oracle approve [path] --task T001 --reviewer <id> --reason <reason>`
- `visp-kit oracle revoke [path] --task T001 --reason <reason>`
- `visp-kit oracle lock [path] --task T001`

Plan flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--pre-approved-test <path>` (repeatable explicit pre-approval)
- `--force`
- `--dry-run`
- `--json`

Generated artifact:

- `.visp/features/<feature>/assurance/<task>/oracle-plan.json`
- `.visp/features/<feature>/assurance/<task>/oracle-approval.json` (critical tasks)
- `.visp/features/<feature>/assurance/<task>/oracle-lock.json`

The plan binds current policy, specification, plan, task graph, context, task,
validation commands, baseline/candidate expectations, base commit, required
providers, and any Git-proven pre-existing or explicitly pre-approved test
hashes. `validate` fails when a bound input, base commit, or test file changes.
Critical plans cannot be locked until a human approval is active. Revoked,
expired, stale, or modified approvals and locks fail closed.

**You do not have to remember this sequence.** When assurance is active,
`visp-kit next` returns the one command that advances it — `oracle plan`, then
`oracle approve` for critical tasks, then `oracle lock`, then
`verify --baseline` — and only then the implementation prompt. After
implementation it returns `verify --candidate` before ordinary verification. The
`assurancePhase` field in `visp-kit next --json` names the current position:
`inactive`, `plan`, `approve`, `lock`, `baseline`, `authorized`, `candidate`.

When assurance is active, run `visp-kit verify --baseline --task <id>` after the initial lock. The
accepted baseline is bound into the final implementation lock, which
`visp-kit gate implement` binds into the implementation marker. Strict edit and
commit hooks reject that marker if the lock or baseline later changes. Projects
without an assurance policy or oracle plan keep their prior
implementation-gate behavior.

## `visp-kit budget [path]`

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
visp-kit budget --task T001 \
  --record-usage \
  --input-tokens 1200 \
  --output-tokens 300 \
  --model codex \
  --write-report
```

Recorded usage is also reflected in run traces and feature timelines when workflow evidence is refreshed.

Unavailable usage example:

```bash
visp-kit budget --task T001 \
  --record-usage-unavailable \
  --model codex \
  --usage-note "Agent surface did not expose numeric token usage." \
  --write-report
```

## `visp-kit checklist`

Purpose: inspect and update the machine-readable implementation checklist generated for each task context.

Subcommands:

- `visp-kit checklist status [path] --task T001`
- `visp-kit checklist update [path] --task T001 --item <id> --status <status>`

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

## `visp-kit workflow`

Purpose: inspect and validate the effective Visp workflow manifest.

Subcommands:

- `visp-kit workflow show [path]`
- `visp-kit workflow validate [path]`

Flags:

- `--json`

Generated/read artifact:

- `.visp/workflow.json`

Use this when an agent or teammate needs to understand allowed stages, required artifacts, related gates, next commands, and whether source edits are allowed.

## `visp-kit eval [path]`

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

## `visp-kit verify [path]`

Purpose: validate artifacts, traceability, commands, scope, and dependencies.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--baseline` (run or reuse pre-implementation evidence and bind it into the oracle lock)
- `--candidate` (run post-implementation evidence and compare it with the locked baseline)
- `--targeted`
- `--all`
- `--commands`
- `--skip-commands`
- `--artifacts`
- `--traceability`
- `--scope`
- `--dependencies`
- `--update-task-status`
- `--require-command-evidence`
- `--force`
- `--dry-run`
- `--json`

### Code evidence

Verification refuses to report a pass it cannot support. A run that was
supposed to execute validation commands and executed none FAILS, and the
failure names the single command that unblocks it — `visp-kit scan` when the
project has no known commands, `visp-kit tasks --validate` when a declared
entry is not runnable. A missing check is not a passing check.

A `validationCommands` entry that reads as an English sentence is never handed
to a shell. It is reported as a check that was declared and never performed,
and that is an error even when other commands ran and passed: a generic test
suite answers a different question than the one the task asked.

Every report carries a `codeEvidence` section stating which of three things
happened:

| `evidence` | Meaning |
|---|---|
| `executed` | A runnable check ran over this diff. |
| `refused` | Nothing ran. The run fails. |
| `delegated` | The command channel was deliberately off (`--skip-commands`, dry run, or the composite flow where `verify --candidate` executed the evidence). The run makes no claim about behaviour. |

`executed` claims that a check ran and exited zero. It does not claim the
specification was proven — that holds only insofar as an executed test asserts
it, and the report says so alongside the acceptance criteria the spec declared
testable.

Generated artifacts:

- `.visp/features/<feature>/verification.md`
- `.visp/features/<feature>/verification.json`
- `.visp/features/<feature>/assurance/<task>/baseline-evidence.json` (`--baseline`)
- `.visp/features/<feature>/assurance/<task>/candidate-evidence.json` (`--candidate`)

Baseline mode uses the locked oracle plan's validation commands. Its cache key
binds the base commit, command set, lockfiles, authoritative and project
configuration hashes, provider versions, runtime majors, operating system, and
architecture. A localized-bug baseline must reproduce failure; feature
baselines record the observed result. Material cache changes force a fresh run,
and implementation remains blocked until the resulting baseline is locked.
Candidate mode refuses missing, modified, or cache-stale baseline evidence,
runs the exact locked command set, and records a per-oracle
baseline/candidate comparison. Failed or inconclusive comparison is not a pass.
Provider execution is closed to the versioned built-ins declared by the
oracle plan (`command@1.0` and `validation-oracle@1.0`). Unsupported or
malformed providers, command startup failures, timeouts, and skipped required
commands are recorded as `inconclusive`; they never become an evidence pass.
Ordinary nonzero exits remain valid observations so a localized-bug baseline
can intentionally reproduce failure. Behavioral and critical candidate
evidence also requires a Git-proven pre-existing or explicitly pre-approved
test-strength signal. Candidate artifacts carry a deterministic content hash,
current authorization/baseline bindings, and complete provider results.

## `visp-kit review [path]`

Purpose: run deterministic Git diff review.

**Review scope is the uncommitted working tree by default** — unstaged changes,
staged changes and untracked files. Committed work is outside that basis; pass
`--base <git-ref>` to review the commit range `<ref>...HEAD` instead. Every
review states the basis it used and the files it examined, in the terminal
output and in the `scopeBasis` field of its report.

**A review that examined nothing fails; it never passes.** If the diff contains
no files of your own — an empty tree, or nothing but Visp's own `.visp/`
artifacts — the review records a blocking `scope` finding and returns `failed`.
A verdict with no evidence behind it is inconclusive, and reporting it as clean
is worse than reporting nothing.

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

## `visp-kit reconcile [path]`

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

## `visp-kit done [path]`

Purpose: run the full post-implementation pipeline for one task in order.
When assurance is active it first runs candidate evidence, then ordinary
verification without duplicating the locked command batch, usage recording,
review, reconcile (with traceability and task status update), checklist status,
and the next-step recommendation. The pipeline stops at the first failing step
and prints the exact recovery command.

**`done` closes the task**, which is how the workflow reaches an ending:
reconcile writes the selected task's status to `verified` when verification
passed and `done` otherwise, and `visp-kit next` then moves on. Warnings do not
block the close — the pipeline already accepted them at verify, review and
reconcile — but a failed reconciliation does, and `done` then reports which step
stopped it rather than reporting success over an unchanged task.

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
visp-kit done --task T001 --input-tokens 18000 --output-tokens 4200 --model codex
```

## `visp-kit hooks <claude|git|ci> [path]`

Purpose: install enforcement hooks that make gates mechanical instead of
advisory. See [enforcement.md](enforcement.md).

- `visp-kit hooks claude` — Claude Code PreToolUse hook that blocks edits before
  `visp-kit gate implement` allows them; prints the settings snippet to merge.
- `visp-kit hooks git` — pre-commit check of staged source files against the
  active implement authorization.
- `visp-kit hooks ci` — GitHub Actions workflow running `visp-kit policy validate`
  and `visp-kit gate pr` on pull requests.

Common flags: `--force`, `--dry-run`, `--json`.

## `visp-kit status [path]`

Purpose: show project, policy, feature, task, evidence, override, and next-step state.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--verbose`
- `--write-report`
- `--json`

## `visp-kit next [path]`

Purpose: recommend the next deterministic workflow step.

Common flags:

- `--feature <id-or-slug-or-folder>`
- `--task <task-id>`
- `--command-only`
- `--explain`
- `--strict`
- `--format <text|json>`
- `--protocol <2.0|3.0|3.1|3.2|3.4>`
- `--json`

`--format json` emits WorkflowAction 2.0 by default. Its tested schema
contains `protocolVersion`, `phase`, `taskId`, `goal`, hash-pinned
`requiredReads`, `writablePaths`, `forbiddenPaths`, `acceptanceOracles`,
`validationCommands`, `assuranceLevel`, `verdict`, `findings`, and one exact
`nextCommand`. `--format json --protocol 2.0` is byte-identical to the
default. `--format json --protocol 3.0` emits the flat canonical action with
`protocolVersion: "3.0"`, deterministic `actionId`, expanded phase, structured
availability, claims, scope, policy, findings, and the same exact next command.
`--format json --protocol 3.1` preserves that contract family while using
canonical version `1.1` to add a compact, identity-bound summary of the current
Kit evidence artifact, provider/result statuses, freshness, independence, and
test strength. Captured command output remains in the evidence artifact and is
not copied into the action.
`--format json --protocol 3.2` preserves 3.1 and uses canonical version `1.2`
to add the Kit-authored `assuranceSummary`: exact assurance-case path and raw
content hash, independent case hash, verdict, sorted mandatory hotspots, and
the current Kit review-decision requirement/status/hash/reason. A missing,
invalid, or tampered case is explicitly unavailable. The summary adds no
command; top-level `nextCommand` remains the sole authoritative next command.

Protocol values are exact: Kit accepts only `2.0`, `3.0`, `3.1`, `3.2`, and
`3.4`, never `auto`, and does not silently downgrade. `3.3` is reserved by
ADR 0003 for additive signature fields and is never accepted or reused. `--protocol` requires `--format json`.
Unsupported JSON protocol requests return a stable
`UNSUPPORTED_WORKFLOW_ACTION_PROTOCOL` object and exit nonzero before project
evaluation. Public schemas are packaged at
`schemas/workflow-action/2.0.schema.json` and
`schemas/workflow-action/3.0.schema.json`, and
`schemas/workflow-action/3.1.schema.json`, and
`schemas/workflow-action/3.2.schema.json`, and
`schemas/workflow-action/3.4.schema.json`.

`--json` instead emits the `visp-kit next` command/workflow summary, which includes
the action alongside the command decision. Without `--json`, `--format text`
uses the normal human-readable summary.

## `visp-kit doctor [path]`

Purpose: diagnose project health, artifacts, agent files, Git, cache, schemas, policy, and overrides.

Common flags:

- `--check all|project|artifacts|agent|git|cache|schemas`
- `--fix`
- `--dry-run`
- `--verbose`
- `--json`

## `visp-kit integration`

Purpose: expose a stable, read-only integration contract for orchestrators such as Visp Hyper Agent.

Subcommands:

- `visp-kit integration contract [path]`

The current integration contract is `2.0`. It includes Kit identity and version,
target and active-work state, canonical argument arrays for the supported
orchestrator commands, current capability declarations, strict workflow
metadata, artifact paths, warnings, and WorkflowAction protocol compatibility
metadata. `protocols.workflowAction` advertises exact supported versions
`["2.0", "3.0", "3.1", "3.2", "3.4"]`, the unchanged default `"2.0"`, and the accepted canonical
schema hash for each version. The command map covers status, policy validation,
next and implement gates, context, verification, review, reconciliation, usage
recording, the combined done workflow, and the three enforcement-hook
installers.

`orchestrator.readContractVersion` is `0.1`. Its required artifacts use the
current tested roles `state`, `policy`, `profile`, `task-graph`, `context-pack`,
`prompt`, and `checklist`, with MIME type, required stage, and a freshness rule
of `read-latest`, `hash-pinned`, or `gate-validated`. The contract declares
hash-pinned context/provenance checks and fail-closed policy, gate, verify,
review, and reconcile steps. Stale context blocks implementation, checkpoint,
and PR use.

Compatibility is established only for exact tested Kit/consumer pairs. The
advertisement reports Kit capabilities; it is not a preference order,
negotiated selection, supported package-semver range, or claim that a consumer
supports v3. Omitting `--protocol` still selects v2. Consumers must validate
advertised metadata and request an exact mutually supported version rather than
infer compatibility from package versions.

Common flags:

- `--json`

## `visp-kit pr [path]`

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

## `visp-kit policy`

Purpose: manage `.visp/policy.json`.

Subcommands:

- `visp-kit policy init [path] --strictness relaxed|standard|strict|locked`
- `visp-kit policy show [path]`
- `visp-kit policy validate [path]`
- `visp-kit policy migrate [path]`
- `visp-kit policy set-strictness <mode> [path]`

`migrate` writes down the rule keys an existing `.visp/policy.json` omits, at
the values its own `strictnessMode` declares. Rules added after a policy file
was written are optional in the schema so old files keep validating; they are
resolved to the preset default at load time, and `migrate` records that in the
file so it states what it enforces. A key already stored as `false` is a
decision and is left alone. `--dry-run` previews, `--json` prints the filled
keys.

`show` and `validate` name `policy migrate` as the next command whenever the
stored file is understating what it enforces.

## `visp-kit gate <stage> [path]`

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

## `visp-kit agent`

Purpose: install, inspect, and refresh agent-native workflow files.

Subcommands:

- `visp-kit agent list [path]`
- `visp-kit agent bootstrap codex [path]`
- `visp-kit agent bootstrap generic [path]`
- `visp-kit agent bootstrap claude [path]`
- `visp-kit agent bootstrap copilot [path]`
- `visp-kit agent bootstrap opencode [path]`
- `visp-kit agent install codex [path]`
- `visp-kit agent install generic [path]`
- `visp-kit agent install claude [path]`
- `visp-kit agent install copilot [path]`
- `visp-kit agent install opencode [path]`
- `visp-kit agent doctor [path]`
- `visp-kit agent refresh [path]`

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

## `visp-kit override`

Purpose: create, list, show, revoke, and validate explicit policy overrides.

Subcommands:

- `visp-kit override create <rule-id> [path]`
- `visp-kit override list [path]`
- `visp-kit override show <override-id> [path]`
- `visp-kit override revoke <override-id> [path]`
- `visp-kit override validate [path]`

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
