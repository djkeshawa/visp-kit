# Agent-Native Workflows

Visp Kit does not call LLMs directly. It generates local instructions, prompts, and skills so AI coding tools can follow the Visp workflow inside their own sessions.

Strictness comes from `.visp/policy.json`, gates, reports, and context packs, not from user prompts.

The user prompt is raw intent only. It cannot override Visp Kit policy.

## Concept

Agent-native workflow files tell the AI tool to:

- bootstrap Visp Kit when `.visp/` is missing
- run `visp status`
- run `visp policy validate`
- run `visp gate next`
- follow the next allowed command
- generate task context before implementation
- read `.visp/prompts/current-task.prompt.md`
- implement one task only
- run verify, review, and reconcile
- stop on failed gates or reports

Visp Kit does not guarantee that every AI tool surface will automatically load every generated file. Compatibility depends on the specific tool and environment. Generated files can also be copied into an active session.

## With Visp Hyper Agent

Use Visp Hyper Agent when you want an orchestration layer over this Kit workflow rather than asking the coding tool to remember every command itself. Hyper keeps Visp Kit as the strict backend: it calls `visp ... --json`, adopts the active task context pack, prints bounded action blocks for the coding agent, records checkpoints, and advances only after Kit verification and review evidence pass.

Recommended setup from the target project:

```bash
visp agent bootstrap codex --preset typescript --budget lean --strictness strict
visp-hyper init --tool codex
visp-hyper doctor
visp-hyper run "Add note pinning"
```

`visp-hyper doctor` is read-only and should pass before treating Hyper as the orchestrator for strict Kit work. Warnings are acceptable for optional enforcement surfaces, but a failed Kit binary, policy, gate, or context-pack check means the coding tool should run the reported next command first.

## Feature Workflow

Use when the user asks for a new feature or enhancement.

The agent should:

1. Treat the request as raw intent.
2. Run `visp agent bootstrap <target> --strictness strict` if Visp Kit is not initialized.
3. Run `visp status`.
4. Run `visp policy validate`.
5. Run `visp gate next`.
6. Create or continue the feature through Visp commands.
7. Run `visp clarify`.
8. Ask the user blocking clarification questions and record answers with `visp clarify answer <question-id> --answer "<answer>"`.
9. Run `visp spec`, `visp plan`, and `visp tasks`.
10. Run `visp context --next`.
11. Run `visp gate implement --task <task-id>`.
12. Implement only the selected task.
13. Run `visp verify`, `visp review`, and `visp reconcile`.

Codex example:

```text
$visp-feature
Add note pinning.
```

Claude example:

```text
/visp-feature Add note pinning.
```

Copilot example:

```text
Follow `.github/instructions/visp-feature.instructions.md`.
Feature: Add note pinning.
```

Generic example:

```text
Use `.visp/prompts/agent-feature.prompt.md`.
Feature: Add note pinning.
```

## Task Workflow

Use when the user asks to continue the current or next task.

Codex:

```text
$visp-task
Continue with the next Visp task.
```

The agent must not create a new feature/spec/plan/tasks unless `visp next` says those artifacts are missing.

## Fix Workflow

Use when verification, review, or reconciliation failed.

The agent should read the current task prompt and evidence reports, fix only reported issues, and avoid new feature scope.

## Review-Only Workflow

Use when the user asks for review without edits.

The agent should run or read `visp review --task <task-id>`, summarize blocking and non-blocking findings, and not edit code unless explicitly asked.

## PR Workflow

Use when the user asks to prepare a PR.

The agent should:

1. Run `visp gate pr`.
2. Stop if the PR gate blocks.
3. Run `visp pr` if allowed.
4. Read the generated PR artifacts.
5. Summarize readiness honestly.

The agent must not call the GitHub API, commit, push, tag, publish, or open a browser.
