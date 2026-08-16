# Provenance of this vendored directory

Everything beside this file is **intel's**, copied verbatim. `README.md` is intel's
too and describes intel's regeneration workflow, not Kit's; Kit does not regenerate
these bytes, it conforms to them. Do not edit any file here — a divergence between
Kit's collapse and these vectors is a finding in Kit, never a vector problem.

## Where they came from

| | |
| --- | --- |
| source repository | `visp-intel`, same workspace |
| source path | `evaluation/vectors/file-grain-collapse/` |
| source commit | `1378c412359955a25f176aabc6363659e928c031` (committed, clean tree at copy time) |
| collapse version | `1.1` |
| copied | 2026-08-16 |

Content is pinned twice: by that commit id, and by `manifest.json`, which carries a
SHA-256 and byte length for every document.

`biome.json` excludes `tests/fixtures/vectors` from the formatter for this reason.
Biome would reformat these documents on sight, which changes their bytes and breaks
both the manifest hashes and the byte-for-byte correspondence with intel's copy. The
exclusion is what keeps `lint:fix` from silently un-vendoring them.
`tests/unit/scanner/intel-graph.conformance.test.ts` verifies the manifest hashes on
every run, so a re-vendor that changes bytes fails there and updates this file
deliberately or not at all. If intel republishes the vectors, the hashes move and that
test goes red — which is the intended way to find out.

## What Kit conforms to, and what it does not

Conformed, in `tests/unit/scanner/intel-graph.conformance.test.ts`:

- the collapse of `projection.json` by `collapseToFileGraph` — file set, test files,
  dependency edges, external dependencies, test edges, and the ORDER of every list,
  which the contract pins as UTF-16 code unit ascending and never locale collation;
- the counts for those five collapsed shapes;
- `projection-superseded.json` being refused by `loadIntelGraph`, because its
  `snapshotId` is not its `headSnapshotId`. Intel ships no `stale` flag; that
  judgement is Kit's and lives in `loadIntelGraph`.

Not conformed, deliberately:

- `expected.ascribedEdges` and the counts derived from it (`ascribedEdges`,
  `pathlessSourceEdges`, `selfEdges`). That block carries every edge kind intel
  ascribes — `defines`, `writes`, `calls` — and Kit collapses only the dependency
  and test kinds `module-map.json` speaks in. Asserting the full block would be
  asserting a shape Kit does not build.
- `expected.unparsedFilePaths` and `counts.unparsedFiles`, the 1.1 addition.
  `IntelFileGraph` does not yet distinguish an unparsed file from an isolated one;
  the vectors' `src/native/engine.rs` case documents why that distinction matters.
  Adding the field to Kit's collapse is a capability change, not a conformance fix,
  and is left to its own ticket.
- `expected-neighbourhoods.json`. Kit has no neighbourhood walk; there is nothing to
  conform.

## Holdout

`fixture-sources.json` is eight small files authored inside `visp-intel` for this
purpose. Nothing here derives from a benchmark repository, a measured project, or any
held-out task, and nothing that does may ever be added.
