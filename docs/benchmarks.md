# Benchmarks

Visp Kit's differentiators are mechanically measurable. This page defines the
methodology, what each metric means, and how to reproduce the numbers on your
own machine. No numbers on this page are published as universal claims:
everything is deterministic and reproducible locally with:

```bash
pnpm build
scripts/benchmark-strict-workflow.sh
```

The script runs the full strict workflow (init → scan → constitution →
feature → clarify → spec → plan → tasks → context → gate), then:

1. stages a deliberately out-of-scope edit and proves the generated
   pre-commit hook blocks the commit,
2. edits the spec after context compilation and proves `visp-kit drift` fails
   closed,
3. prints the deterministic benchmark metrics from
   `visp-kit eval --benchmark --json`.

## Metrics

All metrics come from artifacts on disk — never from an LLM.

| Metric | Definition | Source |
| --- | --- | --- |
| Context reduction ratio | `1 - averageContextTokens / wholeRepoTokenBaseline`, where the baseline is what sending every scanned file would cost (`Σ file sizeBytes / 4`) | context packs + `.visp/cache/file-index.json` |
| Evidence completeness | Fraction of the 10 workflow artifacts (clarifications … PR) present for the active feature | `visp-kit status` artifact summary |
| Artifact validation rate | Fraction of present artifacts that pass their Zod schema | artifact readers |
| Drift findings | Error/warning counts from the last `visp-kit drift` report | `.visp/reports/drift-report.json` |

## Does an intel store make `scan` better? Measured on four repositories

P21-KIT-01 says scan with an intel store must produce **equal-or-better
content** than scan without one.

> **An earlier version of this section published different figures, at no named
> commit, and they do not reproduce.** It reported llm-memory as 170 entries /
> 164 correct / **1 wrong** / recall 0.643 against a no-store 10 / 8 / 0.031,
> and `externalDependencies` precision rising 0.34 → 0.47 with *both* arms
> wrongly listing Next.js `@/…` aliases as external. Every one of those numbers
> is superseded by the table below; **do not quote them.** They erred *against*
> the graph — the measured result is better than the published one — and they
> are recorded here rather than deleted, because a number that did not
> reproduce is the thing this section now exists to avoid repeating.

### Method

Everything below is at named commits.

- Trees: `visp-kit` `9d59cc2`, `visp-hyper-agent` `7813320`, `llm-memory`
  `ddda824`, `visp-dev` `d157dbf`, each materialised with `git archive` into a
  scratch directory, so no `.git` is present and every arm reports the same
  "Git metadata unavailable" warning.
- `visp-intel` `f4c5b3b`, index profile `baseline`, Git identity off, one fresh
  store per tree, kept outside the tree.
- Kit: this commit (parent `9d59cc2`), built with `pnpm build`.
- Linux x64, Node v24.15.0.

```bash
visp-intel repo index   <tree> --store <store>
visp-intel repo export     --store <store> --repository <id> --output arch/<r>.json
visp-intel repo projection --store <store> --repository <id> --output proj/<r>.json
# then, per arm, in its own copy of the tree:
visp-kit init --json <copy> && visp-kit scan --json <copy>
```

Ground truth is derived from the repositories' own source text by a third
resolver that reads neither Kit's nor intel's output: an entry counts as correct
only when a member file of that module really contains an import that resolves
to that file. TypeScript resolution follows the `.js`→`.ts` convention,
`index.*` and `tsconfig` `paths`; Python resolution follows package
`__init__.py` and PEP 420 namespace packages. **More entries is not better; a
wrong edge is worse than a missing one**, so precision comes before recall, and
every claimed edge was scored — with a hand sample of four per repository read
back in the source. Module maps were compared with `generatedAt` removed, and
each intel arm was re-run in a second clean copy: **all four reproduce
byte-for-byte.**

### Finding 1 — the archival export never reached three of the four

Scan used to read `.visp-intel/graph.json`, the archival `repo export`. Measured
at the commits above, that file is over Kit's then read limit of 64 MiB on three
of the four repositories, so scan warned and degraded — and its `module-map.json`
came out **identical, byte for byte, to the no-store arm**. Arm B, "current
tools plus intel's graph", was therefore not a test of the graph on those three.

| repository | archival `repo export` | consumer projection | projection ÷ archival | old 64 MiB limit |
| --- | ---: | ---: | ---: | --- |
| visp-kit | 134,303,258 B (128.1 MiB) | 1,985,713 B (1.89 MiB) | 1.478% | **exceeded 2.0×** |
| visp-hyper-agent | 84,784,143 B (80.9 MiB) | 1,169,013 B (1.11 MiB) | 1.379% | **exceeded 1.3×** |
| llm-memory | 67,139,517 B (64.03 MiB) | 1,109,080 B (1.06 MiB) | 1.652% | **exceeded by 0.05%** |
| visp-dev | 35,886,711 B (34.2 MiB) | 544,707 B (532 KiB) | 1.518% | under |

Verified by running Kit at `9d59cc2` and Kit at this commit over the same trees
and hashing the resulting module maps (`generatedAt` removed):

| repository | `9d59cc2` no store | `9d59cc2` + archival export | here + projection |
| --- | --- | --- | --- |
| visp-kit | `8d1698eb9b2f1ca5` | `8d1698eb9b2f1ca5` — degraded | `528647ca2eb358cc` |
| visp-hyper-agent | `8c01d37903c2e8ed` | `8c01d37903c2e8ed` — degraded | `840cbbc327ce35ba` |
| llm-memory | `d8ebdcc2f0549b22` | `d8ebdcc2f0549b22` — degraded | `ddaf490079a68add` |
| visp-dev | `c7987aabf4932697` | `2e113f0e235ef9c9` | `2e113f0e235ef9c9` |

Two things to read off the last row. On the one repository where the archival
export **did** fit, the projection produces the **identical module map** — so
the projection is not a cheaper approximation of the export, it is the same
answer at 1.5% of the bytes. And the seam is now live on **four of four**
repositories instead of one.

Scan reading the export at all was the defect. The read limit is now 16 MiB,
intel's own bound on a projection, and it names the artifact it refused.

### Finding 2 — internal imports: never wrong, and finally openable

`internalImports` entries scored as resolved target files. The no-store arm is
given the benefit of the doubt exactly as before: its raw specifiers are
resolved against every member file of the module, which Kit's own consumers
cannot do.

| repository | arm | entries | joinable as-written | correct | wrong | precision | recall | ground truth |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| visp-kit | no store | 1181 | 0 | 1180 | 0 | 1.000 | 0.994 | 1079 |
| visp-kit | projection | 1078 | **1078** | 1078 | 0 | 1.000 | **0.999** | 1079 |
| visp-hyper-agent | no store | 252 | 0 | 252 | 0 | 1.000 | 0.984 | 245 |
| visp-hyper-agent | projection | 241 | **241** | 241 | 0 | 1.000 | 0.984 | 245 |
| llm-memory | no store | 4 | 0 | 4 | 0 | 1.000 | 0.023 | 172 |
| llm-memory | projection | 165 | **165** | 165 | 0 | 1.000 | **0.959** | 172 |
| visp-dev | no store | 56 | 0 | 56 | 0 | 1.000 | 1.000 | 52 |
| visp-dev | projection | 52 | **52** | 52 | 0 | 1.000 | 1.000 | 52 |

**Zero wrong edges in either arm, on all four repositories** — including the
Python one, where the earlier published table reported one. "Joinable
as-written" is the column volume hides: without a store, **not one**
`internalImports` entry names a file a consumer can open; with the projection,
every one does.

The Python repository is where recall moves: **4 correct edges become 165**,
0.023 → 0.959. Kit's summary-derived importer classifies almost every
`visp_memory.…` import as external, so its internal map was four entries for the
281 files it had indexed. The three TypeScript repositories are a wash on
correctness — recall within 0.005, precision 1.000 in both arms — and a total
change in usability.

What the projection arm misses is worth naming: 7 edges on llm-memory, all of
the form `from . import ai` inside `src/visp_memory/server/routers/__init__.py`;
5 on visp-hyper-agent; 1 on visp-kit. Missing, not wrong.

### Finding 3 — external dependencies, where the no-store arm is actually wrong

An `externalDependencies` entry that resolves to a file inside the repository is
not an external dependency:

| repository | arm | entries | internal files mislabelled | precision |
| --- | --- | ---: | ---: | ---: |
| visp-kit | no store | 89 | 0 | 1.000 |
| visp-kit | projection | 86 | 0 | 1.000 |
| visp-hyper-agent | both arms | 75 | 0 | 1.000 |
| llm-memory | no store | 306 | **162** | **0.471** |
| llm-memory | projection | 140 | 0 | **1.000** |
| visp-dev | both arms | 29 | 0 | 1.000 |

On llm-memory the no-store arm lists 138 internal `visp_memory.*` Python modules
and 24 Next.js `@/…` aliases as third-party dependencies. The projection arm
lists none of them, and no entry it does list resolves to a file in the
repository.

**Against that, the projection arm drops entries the no-store arm had right.**
Six across the four repositories, all judged by hand:

- visp-kit `src/agent`: `node:child_process` and `node:fs`, both genuinely
  imported at the top of `src/agent/hooks/hook-templates.ts`. **Two real
  external dependencies lost.**
- visp-kit `tests`: `fs`, which is *not* an import at all — it comes from
  `require('fs')` inside a string literal in
  `tests/integration/done.command.test.ts:236`. Dropping it is a fix.
- llm-memory: `__future__` (twice), `git` and `secrets`. Four real losses.

No entry appears in the projection arm that does not appear in the no-store arm,
on any repository.

### Finding 4 — nothing else moves

Module counts, member files and test files are identical in every repository and
every arm; `dependency-map.json` is byte-identical with and without a store, as
designed, because its fields are versions, scripts and lockfiles that a code
graph does not carry. Intel's test-entity union added **zero** test files on all
four repositories, so that half of the union again contributed nothing.

### Verdict

**Better on all four repositories, and now actually read on all four.** Internal
imports: nothing wrong in either arm, every entry openable where before none
was, and recall 0.023 → 0.959 on the repository whose language Kit's own
analysis handles worst. External dependencies: one repository goes from 47% to 100%
precision, against six genuine entries lost across the other three. The seam
carries data now; whether that improves anything an agent does is a separate
measurement, and this section is not evidence for it.

## Category comparison vs other spec-driven tools

The table below compares *mechanisms*, not scores. Where another tool has no
mechanism, no number can exist for it — that absence is the comparison.

| Capability | Visp Kit | GitHub Spec Kit | OpenSpec | BMAD |
| --- | --- | --- | --- | --- |
| Deterministic stage gates with exit codes | `visp-kit gate <stage>` | no | no | no |
| Mechanical drift detection (spec↔context↔code hashes) | `visp-kit drift` + PR-gate rule VSP021 | no | no | no |
| Enforcement hooks that fail closed (editor + git + CI) | `visp-kit hooks claude\|git\|ci` | no | no | no |
| Task-scoped context packs with token budgets | `visp-kit context`, `visp-kit budget` | no | no | no |
| Provenance hashes on generated context | SHA256 per grounding artifact | no | no | no |
| Evidence pipeline (verify/review/reconcile artifacts) | `visp-kit done` | no | no | partial (agent role docs) |
| Requirement→diff traceability | `visp-kit reconcile --update-traceability` | no | partial (delta specs) | no |
| Reproducible benchmark harness | `scripts/benchmark-strict-workflow.sh` | no | no | no |

## What this does not measure

Outcome quality — whether an agent following Visp produces better code than an
agent following another framework — requires an LLM-in-the-loop study with
controlled prompts, models, and tasks. Visp Kit never calls an LLM, so this
repository only publishes the mechanical layer: what is enforced, what is
detected, and what it costs in context tokens. Latency numbers printed by the
script are environment-dependent; treat them as local observations only.
