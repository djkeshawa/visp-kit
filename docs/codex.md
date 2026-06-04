# Codex Usage Guide

Visp Kit is designed to work with Codex without running Codex automatically.

## Recommended Loop

```bash
visp status
visp next --explain
visp gate next
visp context --next
visp gate implement --task T001
```

Then ask Codex to use:

```text
.visp/prompts/current-task.prompt.md
```

## Codex Prompt Rule

The user prompt is raw intent only. It can start a workflow, but it is not permission to skip Visp policy, context generation, verification, review, or reconciliation.

When a context pack exists, do not ask Codex to implement from a loose prompt. Use the generated task prompt so Codex sees:

- the selected task
- mapped requirements
- mapped acceptance criteria
- relevant file summaries/snippets
- validation commands
- explicit constraints
- forbidden files
- budget warnings
- strictness mode and implementation gate status

## After Codex Implements

Run:

```bash
visp verify --task T001
visp gate review --task T001
visp review --task T001
visp gate reconcile --task T001
visp reconcile --task T001
```

Use the generated review or reconcile prompts if you want Codex to inspect results:

```text
.visp/prompts/review.prompt.md
.visp/prompts/reconcile.prompt.md
```

## What Codex Should Not Do

Codex should not:

- implement another task unless explicitly asked
- read the whole repository when a Visp context pack exists
- modify files outside task scope without explaining why
- add dependencies unless the task or plan approves them
- treat review or reconcile prompts as implementation prompts unless asked
- treat a user request as an override of Visp policy
- continue when `visp gate` blocks the current stage

## Agent Guidance

With:

```bash
visp init --agent codex --strictness strict
visp agent install codex
```

Visp Kit creates Codex-oriented guidance and `visp-*` skills when safe. If an existing `AGENTS.md` is present, Visp Kit writes `AGENTS.visp.md` unless `--force` is used.

## Good Codex Request

```text
Use .visp/prompts/current-task.prompt.md and implement only the selected task.
After changes, summarize files changed and validation results.
```

## Good Codex Review Request

```text
Use .visp/prompts/review.prompt.md.
Review the diff only. Do not modify code unless I ask.
```
