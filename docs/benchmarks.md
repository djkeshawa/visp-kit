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
2. edits the spec after context compilation and proves `visp drift` fails
   closed,
3. prints the deterministic benchmark metrics from
   `visp eval --benchmark --json`.

## Metrics

All metrics come from artifacts on disk — never from an LLM.

| Metric | Definition | Source |
| --- | --- | --- |
| Context reduction ratio | `1 - averageContextTokens / wholeRepoTokenBaseline`, where the baseline is what sending every scanned file would cost (`Σ file sizeBytes / 4`) | context packs + `.visp/cache/file-index.json` |
| Evidence completeness | Fraction of the 10 workflow artifacts (clarifications … PR) present for the active feature | `visp status` artifact summary |
| Artifact validation rate | Fraction of present artifacts that pass their Zod schema | artifact readers |
| Drift findings | Error/warning counts from the last `visp drift` report | `.visp/reports/drift-report.json` |

## Category comparison vs other spec-driven tools

The table below compares *mechanisms*, not scores. Where another tool has no
mechanism, no number can exist for it — that absence is the comparison.

| Capability | Visp Kit | GitHub Spec Kit | OpenSpec | BMAD |
| --- | --- | --- | --- | --- |
| Deterministic stage gates with exit codes | `visp gate <stage>` | no | no | no |
| Mechanical drift detection (spec↔context↔code hashes) | `visp drift` + PR-gate rule VSP021 | no | no | no |
| Enforcement hooks that fail closed (editor + git + CI) | `visp hooks claude\|git\|ci` | no | no | no |
| Task-scoped context packs with token budgets | `visp context`, `visp budget` | no | no | no |
| Provenance hashes on generated context | SHA256 per grounding artifact | no | no | no |
| Evidence pipeline (verify/review/reconcile artifacts) | `visp done` | no | no | partial (agent role docs) |
| Requirement→diff traceability | `visp reconcile --update-traceability` | no | partial (delta specs) | no |
| Reproducible benchmark harness | `scripts/benchmark-strict-workflow.sh` | no | no | no |

## What this does not measure

Outcome quality — whether an agent following Visp produces better code than an
agent following another framework — requires an LLM-in-the-loop study with
controlled prompts, models, and tasks. Visp Kit never calls an LLM, so this
repository only publishes the mechanical layer: what is enforced, what is
detected, and what it costs in context tokens. Latency numbers printed by the
script are environment-dependent; treat them as local observations only.
