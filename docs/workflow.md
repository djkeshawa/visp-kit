# Workflow

Visp Kit is a local workflow for turning raw intent into one scoped implementation task, then checking the result before PR review.

The user prompt is raw intent only. It cannot override Visp Kit policy.

## Overview

```text
agent bootstrap -> scan -> constitution -> policy
-> feature -> clarify -> spec -> plan -> tasks -> context
-> implementation by human or AI tool
-> verify -> review -> reconcile -> next -> pr
```

## 1. Initialize

Command:

```bash
visp agent bootstrap codex --preset typescript --budget lean --strictness strict
```

Purpose:

- create `.visp/`
- create project config and status
- create `.visp/policy.json`
- install strict agent guidance for the selected target

The agent must not implement code just because bootstrap completed.

## 2. Scan

Command:

```bash
visp scan
```

Purpose:

- build `.visp/cache/file-index.json`
- build file summaries, module map, test map, dependency map, and scan metadata
- reduce repeated token use in later context packs

Related gate:

```bash
visp gate feature
```

## 3. Constitution

Command:

```bash
visp constitution
```

Purpose:

- record local engineering rules
- create compact guidance for context packs
- make team constraints visible

The constitution is deterministic project guidance, not an AI-generated permission slip.

## 4. Policy

Commands:

```bash
visp policy validate
visp gate next
```

Purpose:

- validate strictness mode and rule settings
- determine the next allowed command
- block unsafe workflow progression when policy requires it

## 5. Agent Install

Command:

```bash
visp agent install codex
```

Purpose:

- generate strict local instructions for the selected AI tool target
- install workflow files without calling the AI tool

Use this when `.visp/` already exists. For a fresh project, prefer `visp agent bootstrap <target>`.

The AI tool must still run Visp commands inside its own session.

## 6. Feature

Command:

```bash
visp feature "Add note pinning"
```

Inputs:

- raw user intent
- project status

Outputs:

- `.visp/features/<feature>/intent.json`
- `.visp/features/<feature>/intent.md`

The feature idea is raw intent. It is not permission to skip clarification, spec, plan, or tasks.

## 7. Clarify

Command:

```bash
visp clarify
```

Purpose:

- produce clarification artifacts and prompts
- capture assumptions and open questions

If a blocking question needs user input, the agent should ask the user and record the answer:

```bash
visp clarify answer CQ001 --answer "<user answer>"
```

Gate involvement:

```bash
visp gate spec
```

Strict and locked modes block spec generation when required clarification evidence is missing.

## 8. Spec

Command:

```bash
visp spec
```

Outputs:

- `spec.json`
- `spec.md`
- requirement and acceptance criterion mappings

The agent must not invent requirements outside the artifact.

## 9. Plan

Command:

```bash
visp plan
```

Purpose:

- choose deterministic implementation approach
- record dependency and risk decisions
- prepare task generation

Related gate:

```bash
visp gate tasks
```

## 10. Tasks

Command:

```bash
visp tasks
```

Outputs:

- `task-graph.json`
- `tasks.md`
- task IDs such as `T001`
- allowed, expected, and forbidden file scopes when available
- independent task class, risk level, and versioned risk factors

Strict gates check requirement mappings, acceptance criteria, and explicit task
classification before implementation. Risk level is never used as a substitute
for task class.

## 11. Context

Command:

```bash
visp context --next
```

Outputs:

- `T001.context.json`
- `T001.context.md`
- `T001.prompt.md`
- `.visp/prompts/current-task.prompt.md`

The prompt includes strict policy headers, selected task scope, requirements, acceptance criteria, validation commands, and gate status.

## 12. Implementation

Before editing code:

```bash
visp gate implement --task T001
```

If the gate blocks, stop and follow the next allowed command.

The agent should:

- read `.visp/prompts/current-task.prompt.md`
- implement only the selected task
- avoid unrelated refactors
- avoid forbidden files
- avoid unapproved dependencies

## 13. Verify

Command:

```bash
visp verify --task T001
```

Purpose:

- validate artifacts
- validate traceability
- run configured commands unless skipped
- check Git diff scope
- detect unapproved dependency changes

Outputs:

- `verification.md`
- `verification.json`

## 14. Review

Command:

```bash
visp review --task T001
```

Purpose:

- summarize Git diff
- check task scope
- check verification evidence
- review tests, dependencies, documentation, and security/privacy signals

Outputs:

- `review/T001.review.md`
- `review/T001.review.json`
- `review/T001.review-prompt.md`
- `review/T001.review-checklist.md`

## 15. Reconcile

Command:

```bash
visp reconcile --task T001 --update-traceability
```

Purpose:

- compare spec, plan, tasks, context, verification, review, traceability, and Git diff
- detect drift
- update traceability only when safe and requested

## 16. Next

Command:

```bash
visp next --explain
```

Purpose:

- recommend the next deterministic command
- show blockers and policy-driven reasoning

## 17. PR

Command:

```bash
visp pr
```

Purpose:

- generate local PR Markdown, JSON, and prompt files
- summarize requirements, tasks, validation, review, reconcile, changed files, risks, and follow-ups

Visp Kit does not call GitHub or publish anything.

## Observability and Evaluation

Visp records compact run traces for mutating workflow commands:

```text
.visp/runs/<run-id>/run.json
.visp/runs/<run-id>/run.md
.visp/runs/<run-id>/events.jsonl
```

Feature timelines summarize artifact progress, evidence, blockers, and token estimate/actual usage:

```text
.visp/features/<feature>/timeline.md
.visp/features/<feature>/timeline.json
```

Use these commands for deterministic workflow inspection:

```bash
visp workflow show
visp workflow validate
visp eval
```

`visp eval` checks local artifacts, gates, reports, traceability, context budget, overrides, and PR readiness. It does not call an LLM.
