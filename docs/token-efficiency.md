# Token Efficiency

Visp Kit treats token efficiency as a product requirement.

The goal is not to send the whole repository to an AI tool. The goal is to send the smallest sufficient task context.

## Why It Matters

Large prompts can:

- cost more
- slow down the session
- hide the actual task
- encourage unrelated edits
- increase requirement drift

Small, traceable context helps agents implement one task at a time.

## Context Compiler

`visp-kit context` builds a context pack for one task.

It includes:

- selected task
- mapped requirements
- mapped acceptance criteria
- compact constitution rules
- relevant plan decisions
- selected file summaries
- snippets when useful
- allowed, expected, and forbidden files
- validation commands
- policy and gate status
- artifact provenance hashes for the spec, task graph, plan, policy, and project guidance that grounded the pack
- token estimate

It avoids:

- full repository dumps
- unrelated feature artifacts
- broad source file inclusion
- long chat history

## The compact pack

When `.visp-intel/understanding/<task-id>.json` holds a **current** case, the
pack switches shape. Instead of a file summary for every candidate file plus a
keyword-selected snippet, it carries the cited behavioural path, the open
hypotheses, a handful of entity signature lines, the affected tests, and at
most four snippets of at most forty lines — and only for entities on the path
or in the candidate change set.

A file off the path is still listed, still in scope, and arrives with
`Summary: withheld` rather than a body. Its detail is one `repo.entity` or
`repo.search` call away, which is cheaper than shipping it on the chance it is
needed. **The graph itself is never in the prompt** — no entity dump, no
relation table, no adjacency.

What is not dropped: `reuseHelpers` (the helper list behind the only measured
behaviour win in this project, and not graph-derived), `constraints`,
`instructions`, `validationCommands`, `artifactProvenance`, `baseCommit`,
summaries for files that do not exist yet, and `trimming.heavilyTrimmed`.

Measured on this repository, one cross-file task, `balanced` budget:
**9,805 input tokens before, 2,100 after — a 79% reduction.** The measurement
is in `tests/integration/compact-context-pack.test.ts`, which prints both
numbers on every run so the direction stays visible if it ever reverses. It
measures ONE pack, not a whole agent run.

The known risk is that path-membership selection inherits intel's resolution
miss rate, so a file that keyword relevance would have surfaced can now be
absent. The mitigation is `repo.search` on demand, not a fallback to bulk. If
localisation quality falls, the right response is to revert the selector and
report the direction, not to widen the pack.

## Scan Cache

`visp-kit scan` writes compact cache artifacts:

```text
.visp/cache/file-index.json
.visp/cache/file-summaries.json
.visp/cache/module-map.json
.visp/cache/test-map.json
.visp/cache/dependency-map.json
.visp/cache/scan-meta.json
```

These let Visp Kit select useful context without rereading every file into the task prompt.

## Budget Modes

Budget mode controls context size. Policy strictness controls workflow enforcement.

You can use lean context with strict policy:

```bash
visp-kit init --budget lean --strictness strict
```

Modes:

- `lean`: small day-to-day task context
- `balanced`: broader context for medium-risk work
- `strict`: larger but still task-scoped context for complex work

## Useful Commands

```bash
visp-kit context T001 --budget lean
visp-kit context T001 --max-tokens 6000
visp-kit budget
visp-kit budget --task T001
visp-kit budget --write-report
visp-kit budget --task T001 --record-usage --input-tokens 1200 --output-tokens 300 --write-report
```

`visp-kit budget` estimates context before implementation. Visp also refreshes `.visp/reports/budget-report.md` automatically after key feature workflow milestones such as `visp-kit tasks`, `visp-kit context`, `visp-kit verify`, `visp-kit review`, `visp-kit reconcile`, and `visp-kit pr`.

Visp cannot know true agent token usage unless the AI tool exposes it. After implementation, record actual usage with `--record-usage` when available. The value is stored in `.visp/budget.json` and shown in `.visp/reports/budget-report.md`.

When workflow tracing is enabled by normal Visp commands, recorded usage is also reflected in:

- `.visp/runs/<run-id>/run.json`
- `.visp/runs/<run-id>/run.md`
- `.visp/features/<feature>/timeline.md`

This lets a team compare estimated context cost with actual agent-reported usage for each feature task.

## Strict Prompts

Generated task prompts tell agents:

- the selected task is the only implementation target
- user prompts are raw intent only
- policy and gates override prompt requests
- unrelated files and dependencies are forbidden unless task scope allows them

This improves token efficiency because the agent should not read broad repository context when a scoped context pack exists.

## Team Practices

- Keep tasks small.
- Keep `allowedFiles` and `expectedFiles` accurate.
- Split over-budget tasks.
- Use snippets before full files.
- Run `visp-kit scan --changed` after major repository changes.
- Use `visp-kit review --diff-only` for focused diff inspection.
- Prefer `lean` until the task actually needs broader context.
