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
content** than scan without one. This is that measurement. It had never been
run; the numbers below replace an assumption.

**Method.** Each repository was copied to a scratch tree, indexed with
`visp-intel repo index`, and exported with `visp-intel repo export`. `visp-kit
scan` then ran twice per tree — once with no `.visp-intel/graph.json` and once
with it — and the two `module-map.json` files were compared. Ground truth is
derived from the repositories' own source text by a third resolver that reads
neither Kit's nor intel's output: an edge counts as correct only when the
importing file really contains an import that resolves to that file. **More
entries is not better; a wrong edge is worse than a missing one**, so precision
is reported before recall.

**Finding 1 — the graph does not fit.** With the standard export, three of the
four graphs exceed `INTEL_GRAPH_MAX_BYTES` (64 MiB) and `scan` degrades to its
own analysis, producing a module map **identical** to the no-store one:

| repository | export size | intel-backed today? |
| --- | --- | --- |
| visp-kit | 133.9 MB | no — over the read limit |
| visp-hyper-agent | 84.9 MB | no — over the read limit |
| llm-memory | 67.2 MB | no — over the limit by 0.1 % |
| visp-dev | 32.6 MB | yes |

So in shipped behaviour the answer on three of four repositories is *no
difference at all*. The rest of this section lifts the limit to answer the
content question the unit actually asks.

**Finding 2 — with the graph read, internal imports are equal or better, and
never wrong.** `internalImports` entries are compared as resolved target files:

| repository | arm | entries | joinable as-written | correct | wrong | precision | recall |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| visp-kit | no store | 1175 | 0 | 1066 | 0 | 1.000 | 0.994 |
| visp-kit | intel | 1072 | 1072 | 1072 | 0 | 1.000 | **0.999** |
| visp-hyper-agent | no store | 252 | 0 | 241 | 0 | 1.000 | 0.984 |
| visp-hyper-agent | intel | 241 | 241 | 241 | 0 | 1.000 | 0.984 |
| llm-memory | no store | 10 | 0 | 8 | 0 | 1.000 | 0.031 |
| llm-memory | intel | 170 | 165 | 164 | **1** | 0.994 | **0.643** |
| visp-dev | no store | 50 | 0 | 46 | 0 | 1.000 | 1.000 |
| visp-dev | intel | 46 | 46 | 46 | 0 | 1.000 | 1.000 |

"Joinable as-written" is the column that matters most and the one volume hides:
without a store, **zero** `internalImports` entries name a file — they are raw
specifiers like `../foo.js` that a consumer cannot open. The no-store recall
figures above are generous to the baseline, because the ground-truth resolver
was allowed to resolve those specifiers against every member file of the module;
Kit's own consumers cannot do that, which is why `linkageFromModuleMap` counts
only entries the file index knows.

The largest gain is on the Python repository, where Kit's summary-derived
importer sees almost nothing: 8 correct edges become 164, at the cost of the
single wrong edge in the whole measurement. The two TypeScript repositories are
a wash on correctness and a clear win on usability.

**Finding 3 — nothing else moves.** Module counts are identical in every
repository. `dependencyMap` is byte-identical with and without a store, as
designed. Intel's test-entity union added **zero** test files on all four
repositories, so that half of the union contributed nothing here.
`externalDependencies` precision is unchanged on the three JS/TS repositories
(1.000 both arms) and rises on llm-memory (0.34 → 0.47), where **both** arms are
wrong in the same way: Next.js `@/…` alias imports are internal and both arms
list them as external dependencies.

**Verdict: better where it is read, and read on one of four repositories.** The
content claim in P21-KIT-01 holds — nothing is worse, one repository is much
better — but the 64 MiB read limit, not the graph's content, is what decides
whether any of it reaches an artifact today.

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
