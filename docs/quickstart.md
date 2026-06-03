# Quickstart

This guide shows the shortest practical Visp Kit loop for an existing TypeScript project.

## Install Locally

```bash
git clone https://github.com/djkeshawa/visp-kit.git
cd visp-kit
pnpm install
pnpm build
pnpm link --global
visp --help
```

## Initialize A Project

From the target project root:

```bash
visp init --agent codex --preset typescript --budget lean
visp scan
visp constitution --preset typescript --budget lean
```

What this creates:

- `.visp/project.json`
- `.visp/config.json`
- `.visp/status.json`
- `.visp/cache/*`
- `.visp/memory/*`
- `.visp/prompts/*`
- optional Codex guidance files when `--agent codex` is used

## Start A Feature

```bash
visp feature "Add note pinning"
visp clarify
visp spec
visp plan
visp tasks
```

These commands create deterministic templates and prompt files. Fill or refine the generated artifacts with your AI tool or by hand.

## Compile Task Context

```bash
visp context --next
```

This writes:

```text
.visp/features/<feature>/context/T001.context.md
.visp/features/<feature>/context/T001.context.json
.visp/features/<feature>/context/T001.prompt.md
.visp/prompts/current-task.prompt.md
```

Use `.visp/prompts/current-task.prompt.md` with Codex or another coding agent.

## Verify, Review, Reconcile

After implementation:

```bash
visp verify --task T001
visp review --task T001
visp reconcile --task T001
```

If reconciliation passes or has accepted warnings:

```bash
visp reconcile --task T001 --update-traceability
```

## Prepare A PR Summary

```bash
visp pr
```

This writes:

```text
.visp/features/<feature>/pr.md
.visp/features/<feature>/pr.json
.visp/prompts/pr.prompt.md
```

## Use The Guide Commands

```bash
visp status
visp next --explain
visp doctor
```

These commands summarize state, recommend the next step, and diagnose project health.
