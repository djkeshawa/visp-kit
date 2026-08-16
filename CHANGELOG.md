# Changelog

Notable changes to Visp Kit. Entries that change the behaviour of an existing
`.visp/` project are marked **Breaking** and say what breaks, why, and what the
remedy is.

This file records behaviour, not releases. A version heading appears when the
owner publishes that version; until then changes sit under Unreleased.

## Unreleased

### Breaking

#### A spec is refused when one acceptance criterion id names two different criteria

**What breaks.** `visp-kit spec --validate` and `visp-kit tasks` — the two
commands that read a spec through the normalizer — now fail with
`VALIDATION_FAILED` ("Invalid spec: ...") when the same acceptance criterion id
is declared more than once with different content, whether the copies sit in the
top-level `acceptanceCriteria` list and a requirement's list, or twice inside one
list. The error names each ambiguous id and where the copies were found. A spec
that loaded and ran yesterday can stop loading today; no artifact is rewritten
and nothing is deleted.

`plan`, `verify`, `review`, `oracle` and `reconcile` read the spec straight
through its Zod schema and are not affected. The refusal therefore stops an
ambiguous spec at the point where tasks are derived from it, which is before
implementation begins.

Criterion ids declared twice with *identical* content are unaffected. That is
the normal mirrored shape and it still normalizes to one criterion. Key order
and the spellings the normalizer already folds (for example a validation method
in a different case) do not count as different content.

**Why.** Kit merged the two lists by unioning on id. That is sound only while an
id names one criterion. When two declarations of `AC002` disagreed, both
survived into the artifact that `verify`, `review` and the traceability matrix
all treat as the definition of done — so "done" had two different meanings and
which one applied depended on which consumer read it first.

There is no resolution Kit may compute. Last-wins silently rewrites an
acceptance claim the author stated; first-wins silently discards one. Either way
Kit becomes the author of an acceptance claim nobody wrote, and the disagreement
disappears instead of being raised. A spec whose criterion ids are ambiguous is
malformed, and a malformed strict contract fails closed.

**Remedy.** One edit in `.visp/features/<feature>/spec.json`, and it is the
author's call which:

- the copies were meant to be the same criterion — make them byte-identical, or
  delete the duplicate and leave one declaration; or
- they were meant to be two criteria — give the second its own id, and add that
  id to `traceability.json` so the spec gate still passes.

Then re-run the command that refused. No flag, strictness mode or recorded
override restores the old merge, and none is planned. This is not a policy gate
that a project can relax — it is the spec failing to be a single well-formed
document, and the only alternative on offer is Kit inventing which acceptance
claim the author meant.

**How much existing work this affects.** Every `spec.json` in the Visp
development workspace was checked against the new rule — 14 specs across
`visp-hyper-agent`, `visp-dev` trial cells and the battle-ground project.
**Zero are refused.** The refusal fires on a spec that was already ambiguous,
which is rare because the mirrored shape is normally written by Kit itself.

#### The intel file-grain collapse now orders by UTF-16 code unit

**What breaks.** `visp-kit scan` on a project with a `.visp-intel/` projection
orders the collapsed file list and every dependency edge list by UTF-16 code
unit instead of by locale collation. `.visp/cache/module-map.json` can therefore
list the same dependencies in a different order than before — for example
`src/service/Router.ts` now sorts before `src/service/api.ts`. Content is
unchanged; only order is.

**Why.** The collapse rule is pinned by conformance vectors that visp-intel
publishes, and Kit's copy disagreed with them. `localeCompare` was also
host-dependent: the same projection could collapse into two different orders on
two machines with different ICU data or locale, which makes the artifact
non-reproducible.

**Remedy.** Re-run `visp-kit scan`. Nothing else is required. A diff of
`module-map.json` that shows only reordering is this change and is expected.
