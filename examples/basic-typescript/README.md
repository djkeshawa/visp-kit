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
visp-kit init --agent codex --preset typescript --budget lean
visp-kit scan
visp-kit constitution --preset typescript --budget lean
visp-kit feature "Add note pinning"
visp-kit clarify
visp-kit spec
visp-kit plan
visp-kit tasks
visp-kit context --next
```

Then use:

```text
.visp/prompts/current-task.prompt.md
```

with your AI coding tool.
