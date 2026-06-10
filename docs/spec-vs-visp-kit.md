# Spec Kit And Visp Kit

Visp Kit is inspired by spec-first AI development and is designed to work
alongside tools like GitHub Spec Kit, not against them. The short version:

> Spec Kit structures the plan. Visp Kit enforces the execution.

## Spec-First Foundation

Both approaches value:

- requirements before implementation
- acceptance criteria
- task decomposition
- guided AI prompts
- review before merge

If your team already plans with Spec Kit (or any other method), you can keep
doing that and use Visp Kit for the part Spec Kit does not cover: what happens
after the plan, while the agent edits code.

## What Happens After The Plan

Spec-driven planning tools end at the task list. Nothing checks that the agent
actually stayed inside the task, ran the tests, or produced evidence. Visp Kit
adds that layer:

| Concern | Spec Kit | Visp Kit |
| --- | --- | --- |
| Requirements and tasks | Yes | Yes |
| Deterministic stage gates | No | `visp gate`, `visp next` |
| Mechanical enforcement | No | Claude PreToolUse hook, git pre-commit, CI evidence check |
| Task-scoped context with token budgets | No | `visp context`, `visp budget` |
| Verification / review / reconciliation evidence | No | `visp done`, `.visp/` reports |
| Traceability from requirement to diff | No | `visp reconcile --update-traceability` |
| Audit trail (overrides, runs, timelines) | No | `.visp/overrides.json`, `.visp/runs/`, timelines |

## Visp Kit Additions

- repository scanning and cache artifacts
- compact project memory
- task-specific context compilation
- deterministic token estimates and budget modes
- one-command evidence pipeline (`visp done`)
- enforcement hooks (`visp hooks claude|git|ci`)
- verification, review, and reconciliation reports
- traceability updates and PR summaries grounded in evidence
- `status`, `next`, and `doctor` orchestration

## When Visp Kit Helps Most

Use Visp Kit when:

- the repository is already large (brownfield work)
- company teams have token budgets
- you want cheaper or mid-tier models to follow the workflow accurately
- work must stay in task scope, mechanically
- dependencies need explicit approval
- audit trails matter
- PR summaries should be grounded in evidence

## What Visp Kit Avoids

Visp Kit avoids:

- built-in provider calls
- automatic AI execution
- sending the whole repository by default
- semantic claims it cannot determine locally
- replacing human review
