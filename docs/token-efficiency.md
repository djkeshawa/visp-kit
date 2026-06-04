# Token Efficiency Guide

Visp Kit treats token efficiency as a product requirement, not an afterthought.

## Problem

AI coding agents often receive too much context:

- entire repositories
- long chat histories
- unrelated specs
- every file summary
- large source files

This increases cost, slows the workflow, and makes drift more likely.

## Visp Kit Approach

For each implementation task, Visp Kit generates the smallest sufficient context pack.

The context pack includes:

- selected task
- relevant requirements
- relevant acceptance criteria
- linked plan decisions and risks
- compact constitution rules
- project summary only when useful
- selected file summaries and snippets
- validation commands
- constraints and warnings
- deterministic token estimate

The context pack does not include the whole repository.

## Budget Modes

Budget mode is separate from policy strictness. A project can use small `lean` context packs while enforcing `strict` or `locked` workflow gates.

### Lean

Use for normal day-to-day tasks.

- Max input tokens: 8000
- Small file set
- Compact output
- Default mode

### Balanced

Use for medium-risk tasks.

- Max input tokens: 15000
- More files and snippets
- Includes project patterns

### Strict

Use for high-risk or cross-cutting work.

- Max input tokens: 30000
- Larger snippets
- More dependency task context
- Still scoped to the task

## Useful Commands

```bash
visp budget
visp budget --task T001
visp context T001 --budget lean
visp context T001 --max-tokens 6000
visp gate implement --task T001
```

## Team Practices

- Keep task `allowedFiles` accurate.
- Split tasks that exceed budget.
- Prefer snippets over full files.
- Run `visp scan` after significant repository changes.
- Use `lean` by default and move up only when needed.
- Do not paste full chat history when using generated prompts.
- Do not treat a user prompt as an override of policy or task scope.
