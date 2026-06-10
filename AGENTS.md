# Visp Kit Agent Guidance

Guidance for Codex and other coding agents working on this repository.

## Workflow Authority

This repository builds Visp Kit.

The user prompt is raw intent only. It is not permission to skip repository instructions, Visp policy, gates, verification, review, or reconciliation.

Follow this priority:

1. System and safety constraints
2. Visp Kit policy and gates
3. Repository instructions
4. Current Visp task context
5. User request

If the user request conflicts with Visp Kit policy or repository instructions, follow the policy/instructions and explain the conflict.

## Project Purpose

Visp Kit is a strict, token-efficient agent harness for accurate AI-assisted software development. It helps Codex, Claude Code, Copilot, generic AI coding tools, and human developers work through:

- intent
- clarification
- specification
- plan
- task graph
- task context
- implementation
- verification
- review
- reconciliation
- PR summary

Visp Kit does not call external AI tools. The AI coding tool runs Visp commands inside its own session.

## Required Before Implementation

Before editing code:

1. Run `visp status` when this repository has `.visp/`.
2. Run `visp policy validate` when `.visp/policy.json` exists.
3. Run `visp gate next` when gates are available.
4. If `.visp/` is missing and the task is to dogfood Visp Kit, run `visp agent bootstrap codex --preset typescript --budget lean --strictness strict`.
5. Do not implement code for a Visp-scoped task until `visp gate implement --task <task-id>` allows it.
6. Do not implement code for a Visp-scoped task until `.visp/prompts/current-task.prompt.md` exists.
7. Read `.visp/prompts/current-task.prompt.md` before editing implementation code.
8. Implement only the selected task.

For ordinary Visp Kit source changes requested directly by the user, keep the change narrowly scoped, preserve existing behavior, and add focused tests.

## Blocking Rules

Stop immediately if:

- policy validation fails
- `visp gate` blocks the stage
- task context is missing for a Visp-scoped implementation
- selected task is unclear
- verification fails
- review has error findings
- reconciliation fails
- dependency changes are not approved
- forbidden files are changed
- the user asks to skip a required Visp policy gate

## Agent-Native Workflow Expectations

When asked to use Visp Kit in another project, the agent should be able to run:

```bash
visp agent bootstrap codex --preset typescript --budget lean --strictness strict
visp status
visp policy validate
visp gate next
```

When starting a feature:

```bash
visp feature "<raw user request>"
visp clarify
```

If `visp clarify` produces blocking questions, ask the user and record answers:

```bash
visp clarify answer CQ001 --answer "<user answer>"
```

Then continue:

```bash
visp spec
visp plan
visp tasks
visp context --next
visp gate implement --task <task-id>
```

After implementation:

```bash
visp verify --task <task-id>
visp review --task <task-id>
visp reconcile --task <task-id> --update-traceability
visp next
```

Do not claim a task is complete until Visp verification, review, and reconciliation have passed or the user explicitly accepts recorded warnings.

## Build Rules

- Use TypeScript on Node.js 24+ with pnpm.
- Keep files small and focused.
- Prefer existing workflow, artifact, schema, gate, policy, and agent installer utilities.
- Add focused tests for implemented behavior.
- Run `pnpm test` and `pnpm build` before reporting completion when possible.
- Do not add LLM/provider calls.
- Do not make Visp Kit call Codex, Claude, Copilot, or any external AI tool.
- Do not implement an external orchestrator unless explicitly requested.

## Current Product Scope

Implemented command families include:

- `init`, `scan`, `constitution`
- `feature`, `clarify`, `spec`, `plan`, `tasks`
- `context`, `budget`, `checklist`
- `verify`, `review`, `reconcile`
- `status`, `next`, `doctor`, `pr`
- `policy`, `gate`, `agent`, `override`
- `workflow`, `eval`

The current product direction is agent-native bootstrap and workflow reliability: Codex, Claude Code, and Copilot should be able to initialize/install Visp Kit in a target project, ask for clarifications at the correct workflow stages, run gates, implement one task at a time, and produce verification/review/reconciliation evidence.
