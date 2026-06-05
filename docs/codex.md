# Codex Usage

Visp Kit works with Codex without running Codex automatically.

Install Codex guidance:

```bash
visp agent bootstrap codex --preset typescript --budget lean --strictness strict
visp agent doctor --target codex
```

Generated files include:

```text
AGENTS.md or AGENTS.visp.md
.agents/skills/visp-feature/SKILL.md
.agents/skills/visp-task/SKILL.md
.agents/skills/visp-fix/SKILL.md
.agents/skills/visp-review/SKILL.md
.agents/skills/visp-pr/SKILL.md
```

## Core Rule

The user prompt is raw intent only. It can start a workflow, but it is not permission to skip Visp policy, context generation, gates, verification, review, or reconciliation.

## Feature Request

```text
$visp-feature
Add note pinning.
```

Codex should run Visp commands, generate artifacts, compile task context, and implement only one selected task.

When clarifications are needed, Codex should ask the user and then record answers:

```bash
visp clarify answer CQ001 --answer "<user answer>"
```

## Continue Task

```text
$visp-task
Continue with the next Visp task.
```

Codex should read:

```text
.visp/prompts/current-task.prompt.md
```

and implement only the selected task.

## After Implementation

Run:

```bash
visp verify --task T001
visp review --task T001
visp reconcile --task T001 --update-traceability
visp next
```

## Fix Mode

Use when verification, review, or reconciliation fails:

```text
$visp-fix
Fix the reported Visp issues for the current task.
```

Codex should fix only reported issues and avoid new feature scope.

## Review-Only Mode

```text
$visp-review
Review the current Visp task diff. Do not edit code.
```

## PR Mode

```text
$visp-pr
Prepare the Visp PR summary.
```

Codex should run `visp gate pr`, stop if blocked, and never call GitHub, commit, push, tag, or publish.
