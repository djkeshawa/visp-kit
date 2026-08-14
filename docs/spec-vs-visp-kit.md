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

## Install Order

Install and initialize Spec Kit first when you want it to own the planning
artifacts. Its maintained install path is GitHub based:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z
specify version
specify init my-project --integration copilot
cd my-project
```

Replace `vX.Y.Z` with the Spec Kit release tag you intend to use, and choose
the Spec Kit integration for your coding surface. After that, bootstrap Visp Kit
inside the same project:

```bash
visp-kit agent bootstrap codex --preset typescript --budget lean --strictness strict
visp-kit policy validate
visp-kit gate next
```

Visp Kit does not vendor, install, wrap, or call Spec Kit. The two tools remain
separate local workflows: Spec Kit can produce the planning artifacts, and Visp
Kit gates implementation and evidence.

## What Happens After The Plan

Spec-driven planning tools end at the task list. Nothing checks that the agent
actually stayed inside the task, ran the tests, or produced evidence. Visp Kit
adds that layer:

| Concern | Spec Kit | Visp Kit |
| --- | --- | --- |
| Requirements and tasks | Yes | Yes |
| Deterministic stage gates | No | `visp-kit gate`, `visp-kit next` |
| Mechanical enforcement | No | Claude PreToolUse hook, git pre-commit, CI evidence check |
| Task-scoped context with token budgets | No | `visp-kit context`, `visp-kit budget` |
| Verification / review / reconciliation evidence | No | `visp-kit done`, `.visp/` reports |
| Traceability from requirement to diff | No | `visp-kit reconcile --update-traceability` |
| Audit trail (overrides, runs, timelines) | No | `.visp/overrides.json`, `.visp/runs/`, timelines |

## Visp Kit Additions

- repository scanning and cache artifacts
- compact project memory
- task-specific context compilation
- deterministic token estimates and budget modes
- one-command evidence pipeline (`visp-kit done`)
- enforcement hooks (`visp-kit hooks claude|git|ci`)
- verification, review, and reconciliation reports
- traceability updates and PR summaries grounded in evidence
- `status`, `next`, and `doctor` orchestration

## When Visp Kit Helps Most

Use Visp Kit when:

- the repository is already large (brownfield work)
- company teams have token budgets
- you want the workflow enforced by the tooling rather than by the model's
  willingness to follow instructions (whether this makes any model produce
  better output is **unmeasured** — see the honest limits in the README)
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
