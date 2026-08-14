# Token Efficiency

Visp Kit treats token efficiency as a product requirement.

The goal is not to send the whole repository to an AI tool. The goal is to send the smallest sufficient task context.

> **Read this before the numbers below: a smaller pack is not a smaller bill.**
> Everything on this page measures **one context pack**. A Visp session is a
> pack plus a workflow — clarify, spec, plan, tasks, verify, review, reconcile —
> and in our own end-to-end runs that workflow cost **several times** a bare
> agent's total tokens, and several times the wall clock. The savings here are
> real and they are a line item inside a larger bill, not the bottom line.
> Anyone quoting a figure from this page as a claim that Visp is cheaper than
> not using Visp is quoting it against its own measurement.

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

## The compact snippet cap

**At most four snippets of at most forty lines, instead of a full-length
snippet for every candidate file.** It is on by default in every budget mode,
and `--snippet-cap off` (or `"contextSnippetCap": false` in `.visp/config.json`)
restores the older uncapped shape. Every pack records which one it got, in
`snippetCapApplied`.

This is a separate mechanism from the understanding case below, and until
`visp-kit 0.6.0` it was not: the cap fired if and only if a current case was
present, so nothing could measure the two apart and no configuration of any
released binary applied the cap on its own.

### What the cap is worth, measured without the graph

21 capability-eligible tasks, `balanced` budget, cap versus no cap with no
graph, no store and no understanding case on either side — **measured against
the shipped binary** (`visp-kit` `develop` `56ff1af`, one build, no patch), so
arm A is `--snippet-cap off`, arm F takes the shipped default, and each arm
records the `snippetCapApplied` Kit itself reported rather than the one the
harness asked for
(`visp-dev/evidence/phase-23/arm-a-f-shipped-kit-56ff1af-linux-x64-node24-local.json`,
re-aggregated on the 21-record cohort in
`visp-dev/evidence/phase-24/cohort-21-restatement.json`, reproduced in
`visp-dev` with `pnpm ablation:shipped-kit:verify`):

| | no cap | cap | delta |
|---|---|---|---|
| input tokens (mean) | 14,539.048 | 7,343.333 | **−49.49%** |
| bodied file recall | 0.4382395382 | 0.4382395382 | **0.0000** |
| bodied precision | 0.132067 | 0.132067 | 0.0000 |
| files bodied (mean) | 7.952 | 7.952 | 0.000 |
| symbol recall | 0.6333333 | 0.6333333 | **0.0000** |

**Why 21 and not 28.** Rule 2 of the holdout — a capability claim may cite only
author-independent records — was enforced by reading each record's contamination
*prose* for a marker string. Prose is written by a person and can be wrong, and
on seven `mongo-exporter` records it was: each said "history not authored here"
while its own `provenance.author` named this workspace's committer. Eligibility
now reads the field, and the capability cohort falls from 28 to 21.

**Do not read the vanished symbol-recall cost as an improvement.** On 28 the cap
cost symbol recall (0.6288 → 0.6141); on 21 it costs exactly none. That is not
the cap getting cheaper. Every row where the cap dropped a symbol was a
`mongo-exporter` row, and those are the rows that left. A figure that improves
because the cases where it failed were removed has not improved. The same
applies to any intel-favourable number restated on this cohort: `mongo-exporter`
is Rust, intel has no Rust grammar, and its graph-conditioned arms were
definitionally inert on all seven.

Bodied file recall is the same floating-point number on the cohort **and on
every task individually**; recall fell on none of them.
`tests/integration/compact-context-pack.test.ts` pins that as a property —
capped and uncapped packs over this repository must select the same files, in
the same order, with the same summaries — so a future change that makes the cap
alter file selection fails the suite rather than quietly invalidating the table
above.

**Read the recall row narrowly.** The harness marks a file "bodied" when its
pack entry carries a non-empty summary, and Kit summarises every file it lists —
so `filesBodied` equals `filesListed` on every row above, and bodied recall is
arithmetically identical to listed recall. It is not a second, independent
measurement. **Bit-identical bodied recall means the capped pack NAMES THE SAME
FILES; it says nothing about how much of each file survives** — and the cap cuts
source text from a full-length snippet per listed file down to at most four
files at forty lines. The honest one-line reading of the −49.49% is **"the same
file list for half the tokens"**, not "the same information".

**Why the default is on.** On the 28-record cohort the uncapped default produced
a pack that exceeded the ceiling its own budget mode declares on 15 of 28 tasks,
against 0 of 28 capped. That over-budget count has not been re-aggregated on the
21-record cohort, so it is quoted here as the 28-record figure it is. The trade
is one flag wide.

**What the number does not cover.** The −49.49% was measured on **two
repositories** (one of which now contributes only regression records), in
**`balanced` mode only** — while Kit ships the cap on by default in **all three**
budget modes. The constant in `lean` and `strict` is an extrapolation from the
balanced measurement, not a result. Anyone citing the figure to justify the
default in another mode, or on another repository, is quoting past the evidence.

**The retired pairs, and why they moved.** Two superseded figures for the same
finding, in the order they were retired.

**−52.01%** (16,709.607 → 8,019.393,
`visp-dev/evidence/phase-23/arm-f-ablation-linux-x64-node24-local.json`) came
from a `visp-dev` measurement build in which the cap was reached by handing the
selector an empty cited path, so **neither endpoint is producible by the binary
that ships this default**. Re-running the same two arms over the same 28 tasks
against shipped `56ff1af` adds a flat ~292 tokens to **both** arms — pack
bookkeeping added since, not a cap effect, and a near-equal constant on both
sides of a ratio moves it toward zero — plus 0–7 tokens on the capped arm only,
where a snippet with no case is now labelled "Highest-ranked file within the
snippet cap" instead of "Highest-ranked file off the cited path". Subtracting
the flat component reproduces the older pair to the digit, and every non-token
metric was identical on all 28 tasks in both arms.

**−51.08%** (17,002.071 → 8,317.000) is the same shipped-binary measurement on
the 28-record cohort, before the seven author-dependent records were
reclassified. No arm was re-run to reach −49.49%; the committed result rows were
re-aggregated with those seven dropped.

Both retired figures are the same finding at a different denominator: the
halving holds and moves only in the second digit. **Quote −49.49%.**

## The compact pack

When `.visp-intel/understanding/<task-id>.json` holds a **current** case, the
pack switches shape on top of the cap. It carries the cited behavioural path,
the open hypotheses, a handful of entity signature lines and the affected tests,
and it drops the project summary and patterns free text. **The graph itself is
never in the prompt** — no entity dump, no relation table, no adjacency.

The case does not turn the snippet cap on and the cap does not turn the case's
compaction on. Withholding the whole-repository free text is a claim that
somebody authored task-scoped evidence for this task; the cap is not that, and
the packs behind the −49.49% carried both sections. (That −49.49% is a
same-file-list saving measured in `balanced` mode; its unchanged bodied recall
means the pack named the same files, not that it carried the same information.)

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
**12,074 input tokens uncapped, 7,381 with the cap and the case — a 39%
reduction**, from a clean clone at the commit that added this paragraph.

And, since the cap and the case became separate inputs, the same run splits that
39% by what produced it:

| | input tokens |
|---|---|
| uncapped, no case | 12,074 |
| **cap only, no case** | **6,702** |
| cap plus the real case | 7,381 |

**The cap is all of the saving and more.** The case then spends 679 tokens
promoting files onto the cited path and adding path-only files, which is what it
is for — it buys localisation, not tokens. That is the same direction as the
28-task result, where adding the whole intel pipeline on top of the cap cost
+19.52% tokens for +1.54% bodied file recall. (That arm-F-to-arm-D comparison is
still a measurement-build figure: only arms A and F were re-run on the shipped
binary, so quote it for direction, not for shipped arithmetic.)

Reproduce it, from nothing:

```bash
git clone <this repository> && cd visp-kit && pnpm install
pnpm vitest run tests/integration/compact-context-pack.test.ts
# [P21-KIT-03] ... before=12074 after=7381 (39% reduction)
# [cap attribution] visp-kit T001: uncapped=12074 capped=6702 capped+case=7381
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
