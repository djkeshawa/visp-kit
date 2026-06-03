# Basic TypeScript Example

This is a small fixture project for trying Visp Kit.

## Install

```bash
pnpm install
```

## Test

```bash
pnpm test
```

## Try Visp Kit Against This Project

From this directory, after building and linking Visp Kit:

```bash
visp init --agent codex --preset typescript --budget lean
visp scan
visp constitution --preset typescript --budget lean
visp feature "Add note pinning"
visp clarify
visp spec
visp plan
visp tasks
visp context --next
```

Then use:

```text
.visp/prompts/current-task.prompt.md
```

with your AI coding tool.
