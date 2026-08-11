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
pack switches shape. It carries the cited behavioural path, the open
hypotheses, a handful of entity signature lines, the affected tests, and at
most four snippets of at most forty lines instead of a full-length snippet for
every candidate file. **The graph itself is never in the prompt** — no entity
dump, no relation table, no adjacency.

Path membership is a **ranking signal, not a filter**. Every in-scope file
keeps its summary; the path decides who gets the expensive body:

1. entities on the cited path take snippet slots first;
2. at least two slots stay with the relevance ranking, whatever the path says;
3. a candidate scan could not summarise always gets a snippet, because a
   snippet is the only thing standing between it and a bare filename;
4. up to two files the path names that the ranking missed are **added**, not
   substituted — two because that is the path's snippet budget, and a file the
   ranking rejected is worth carrying only if the path can also show its code.

The guarantee that falls out of (2) and (4): **the bodied set with a case is a
superset of the bodied set without one.** More path information never removes
something the pack would otherwise have carried, so a thin path is never worse
than no path. `tests/integration/compact-context-pack.test.ts` asserts it.

What is not dropped: `reuseHelpers` (the helper list behind the only measured
behaviour win in this project, and not graph-derived), `constraints`,
`instructions`, `validationCommands`, `artifactProvenance`, `baseCommit`,
summaries for files that do not exist yet, and `trimming.heavilyTrimmed`.

### What the first version cost, measured

The first version of this made path membership a **filter**: a file the path
did not name lost its body. Over the 29 capability-eligible holdout tasks,
`balanced` budget, 87 runs
(`visp-dev/evidence/phase-21/ablation-linux-x64-node24-local.json`):

| | arm A (no case) | arm C (filter) | A→C |
|---|---|---|---|
| input tokens (mean) | 16,965 | 5,748 | −66.1% |
| bodied file recall | 0.483 | 0.105 | **−78.3%** |
| symbol recall | 0.646 | 0.127 | **−80.3%** |

This is not a hypothetical risk and it is no longer described as one. Intel
traces no path at all on 17 of those 29 tasks, and the selector inherited every
miss as a dropped file. **5,748 tokens at 0.105 recall is worse value than
16,965 at 0.483**, because the objective is localisation per token and not
minimum tokens. Phase 21 recorded P21-KIT-03's exit criterion as UNMET on that
result. The ranking-signal design above is the response; its re-measurement is
in the phase record.

### The per-pack number, and its provenance

Measured on this repository, one cross-file task, `balanced` budget, against a
**real** `visp-intel` understanding export
(`tests/fixtures/understanding/visp-kit-T001.export.json`, produced by
`repo index` + `task scope-proposal` + `understanding export` at `ab4cc4e`):
**12,017 input tokens before, 7,346 after — a 39% reduction.**

Reproduce it, from nothing:

```bash
git clone <this repository> && cd visp-kit && pnpm install
pnpm vitest run tests/integration/compact-context-pack.test.ts
# [P21-KIT-03] ... before=12017 after=7346 (39% reduction)
```

Two earlier figures stood here. Neither should be quoted.

**9,805 → 2,100 (79%)** came from a hand-written understanding case in the test
file, not from anything intel produced; the 79% is what a hand-written path
plus a body filter bought.

**9,807 → 5,922 (40%)** was a real export, but it was measured against a scan
cache read from `.visp/cache/`, which is gitignored. The test therefore only
ran in a checkout that happened to have run `visp-kit scan`, it failed in every
clean clone, and the cache it read was whatever the last local scan had left —
six days stale by the time anyone checked. The number in this document also
never matched the one the test printed on that stale cache, which was 9,809.

The measurement now generates its own scan cache with Kit's scanner over the
repository's **tracked** files, so it depends on the commit and on nothing
else. That is the whole reason the number moved: the pack is larger because it
is being selected over a current and complete index of ~650 files rather than a
six-day-old snapshot. The reduction is the same to within a point.

The test loads the real export, validates it against Kit's schema and objection
rules before using it, asserts the scan it measures against is repository-sized,
and prints both numbers on every run. It measures ONE pack, not a whole agent
run.

## Scan Cache

`visp-kit scan` writes compact cache artifacts:

```text
.visp/cache/file-index.json
.visp/cache/file-summaries.json
.visp/cache/module-map.json
.visp/cache/test-map.json
.visp/cache/dependency-map.json
.visp/cache/scan-meta.json
.visp/cache/intel-scan.json
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
