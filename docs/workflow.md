# Workflow Guide

Visp Kit is a local workflow for turning a feature idea into a traceable implementation task, then checking the result before PR review.

## Workflow Overview

```text
init
scan
constitution
feature
clarify
spec
plan
tasks
context
implementation by human or AI agent
verify
review
reconcile
pr
```

## 1. Initialize

```bash
visp init --agent codex --preset typescript --budget lean
```

Use `--agent none` if you do not want agent guidance files.

## 2. Scan

```bash
visp scan
```

The scan builds a reusable project index and compact file summaries. This reduces repeated context cost in later prompts.

## 3. Constitution

```bash
visp constitution --preset typescript --budget lean
```

The constitution records local rules such as small functions, no unapproved dependencies, and task-scope discipline.

## 4. Feature Workspace

```bash
visp feature "Add note pinning"
```

This creates a stable folder such as:

```text
.visp/features/001-add-note-pinning/
```

## 5. Clarify, Spec, Plan, Tasks

```bash
visp clarify
visp spec
visp plan
visp tasks
```

These commands write structured JSON, readable Markdown, and prompt files. They do not call an LLM.

## 6. Context

```bash
visp context --next
```

The context compiler selects the smallest sufficient context for the selected task. It includes linked requirements, acceptance criteria, compact rules, relevant plan decisions, selected file summaries/snippets, constraints, validation commands, and token estimates.

## 7. Implement

Use:

```text
.visp/prompts/current-task.prompt.md
```

with Codex or another agent. Implement only the selected task.

## 8. Verify

```bash
visp verify --task T001
```

Verification checks artifacts, traceability, configured validation commands, Git diff scope, and dependency-sensitive files.

## 9. Review

```bash
visp review --task T001
```

Review summarizes the Git diff, task scope, verification status, tests, dependency changes, and security/privacy checklist.

## 10. Reconcile

```bash
visp reconcile --task T001
```

Reconciliation compares spec, plan, task, context, verification, review, traceability, and Git diff. If safe:

```bash
visp reconcile --task T001 --update-traceability
```

## 11. PR Summary

```bash
visp pr
```

This creates a factual PR summary without calling the GitHub API.

## Daily Use

```bash
visp status
visp next
visp doctor
```

- `status` shows where the project is.
- `next` recommends the next command.
- `doctor` checks health and configuration.
