# ADR 0007: Kit↔Hyper Compatibility Is a Pinned Pair, Never a Version Range

- **Status:** Accepted
- **Date:** 2026-08-15
- **Supersedes:** the `visp-hyper-agent >= 0.6.0` claim in `README.md`

## Context

One contract — which build of Hyper this engine works with — was stated three
incompatible ways, in three files, none of which referenced the others:

| Where | What it said | Kind |
|---|---|---|
| `visp-hyper-agent/package.json` | `peerDependencies: { "visp-kit": ">=0.2.3 <0.7.0" }` | version range |
| `visp-dev/src/machine-scope.mjs` | kit floor `[0, 4]`, hyper floor `[0, 7]` | a different range |
| `visp-dev/compatibility.json` | `"model": "exact-pair"`, "Compatibility is pinned by commit and artifact hash, never by a version range." | denies ranges exist |

Kit's own `README.md` carried a fourth: `visp-hyper-agent >= 0.6.0`. This ADR
retires that one and states the rule the other three must be reconciled to.

The disagreement is not academic. On the exact pair npm serves today —
`visp-kit@0.5.0` / `visp-hyper-agent@0.8.0` — `visp setup` clears the
machine-scope floors and prints `visp-kit: 0.5.0 — ok`, `visp (coordinator):
0.8.0 — ok`, `Setup complete.`, while `visp-dev doctor` reads the same
machine's `compatibility.json`, finds `supportedRelease: null` and
`registryState.supersedesEvidencedPair: true`, and answers `installable:
false` — "this matrix makes no support claim about that pair." Same machine,
same product, two answers inside a minute, in a user's first hour. That is the
three-doctors defect recurring in a new pair.

Three further facts decide the question:

1. **A version string is not an identity here.** `compatibility.json` records
   `version: null` on all four evidenced pairs and pins `commit`, `tree`, and
   `tarballSha256` instead, with the note that the same version string already
   carries different content on this project. A range over version strings
   therefore ranges over something that does not identify a build.
2. **The widest range admits a pairing the same file calls hazardous.** The
   peer range's floor, `visp-kit@0.2.3`, is exactly the version
   `registryState.hazard` says must not be installed alongside current Hyper,
   because 0.2.3 still declares the `visp` binary Hyper now owns (ADR 0005) and
   whichever installs last silently wins the name. The declared dependency
   permits what the product's own evidence forbids.
3. **The real seam is protocol, not semver.** What Kit and Hyper must agree on
   is a WorkflowAction protocol version and its canonical schema hash, both
   advertised by integration contract 2.0 and both already fail-closed
   (ADR 0002). No evidenced pair in the matrix negotiates above 3.2; Kit now
   emits 3.4. A semver range cannot express that, and did not catch it.

## Decision

**Exact-pair is the correct model. It is the only one of the three backed by
evidence, and the only one whose unit of comparison identifies a build.** The
two ranges are conveniences that state a support claim nobody measured, so each
must be either *derived from the pinned data* or *removed*. Because
`compatibility.json` deliberately does not record version strings, nothing
truthful can be derived — so both are removed, and each is replaced by a check
against the pinned data.

Kit's rules:

1. Kit publishes **no** supported semver range for `visp-hyper-agent`, in
   `README.md`, in `docs/`, in `package.json`, or in any command output. A
   regression test enforces this.
2. Kit's compatibility statement is a pointer, not a claim: the authority is
   the pinned matrix Visp Dev publishes, and the user-facing check is
   `visp-dev doctor`.
3. Kit's own enforceable contract stays where it already is and is unchanged by
   this ADR: `visp-kit integration contract` advertises the exact supported
   WorkflowAction protocol versions and their immutable canonical schema
   hashes, and unknown or unsupported protocols fail closed.
4. `visp-kit` remains installable and useful on its own. Nothing here makes Kit
   depend on Hyper or on Visp Dev.

## What the other two statements must say

Kit does not own these files. They are specified here precisely enough to apply
without re-deriving the reasoning.

### `visp-hyper-agent/package.json` — remove the peer range

Delete both blocks:

```json
"peerDependencies": {
  "visp-kit": ">=0.2.3 <0.7.0"
},
"peerDependenciesMeta": {
  "visp-kit": {
    "optional": true
  }
}
```

Rationale for removal rather than narrowing: the dependency was already
`optional: true`, so npm never enforced it; Hyper does not import `visp-kit` as
a module, it spawns the `visp-kit` binary; and no honest replacement range
exists, because the matrix records no version strings. A narrowed range would
be the same lie with better bounds. The floor it publishes today is the one
build the hazard field forbids.

Replace the erased guarantee with a runtime check, not a manifest field. At the
point where Hyper first talks to Kit it already reads integration contract 2.0;
that read must additionally:

- require an exact match in `protocols.workflowAction.supported` for the
  version Hyper is about to request, and verify
  `protocols.workflowAction.schemaHashes[version]` against Hyper's own copy of
  that hash;
- fail closed on a missing `protocols` block (a legacy contract implies the v2
  path only, per ADR 0002) with an error naming the requested version and the
  advertised set;
- state in the failure text that compatibility is pinned by commit and artifact
  hash and point at `visp-dev doctor`, so the message does not send the reader
  looking for a version to bump.

Hyper's README and docs must drop any "works with visp-kit X.Y+" phrasing for
the same reason.

### `visp-dev/src/machine-scope.mjs` — remove the floors, delegate to the matrix

Delete the floor table and `meetsFloor`:

```js
const REQUIRED = {
  kit:   { binary: "visp-kit", floor: [0, 4] },
  hyper: { binary: "visp",     floor: [0, 7] }
};
```

`meetsFloor` compares major and minor only, so its patch component was
decorative — but that is a bug in a mechanism that should not exist, and fixing
the comparison would only make a wrong answer more precise.

`visp setup` keeps exactly one job: presence and runnability of each binary.
Report those as `present` / `not found`, never as `ok`, because `ok` is a
support word and setup is not entitled to it. For the support verdict, setup
must call the **same** `installability()` used by `visp-dev doctor` — one
function, one answer — and print its result verbatim. Concretely, on today's
served pair setup must end with the matrix's `installable: false` and its
reason, not with `Setup complete.` `Setup complete.` is only printable when
`installability()` returns installable.

If a version floor is ever genuinely needed again (for example a Node or pnpm
engine bound), it must compare the full semver triple and must not be described
as a compatibility claim.

### `visp-dev/compatibility.json` — keep the model, close the gap it leaves

The model is right and stays: `"model": "exact-pair"` and the note are the
correct statement of the contract, and the other two are being reconciled to
them. Two additions make it usable as the single source rather than merely
correct:

- Record the version string of each pinned pair alongside `commit`, `tree`, and
  `tarballSha256`, replacing the current `version: null`, and label it
  explicitly as display-only provenance that must not be range-matched. Today a
  consumer cannot even report *which* versions the evidence covers without
  guessing.
- Add an explicit top-level negative — a `versionRanges: null` field, or the
  equivalent in the note — so that the absence of a range reads as a decision
  rather than as an omission a future maintainer helpfully fills in.

The `registryState.provenance` block already states correctly that no evidence
exists for the served `0.5.0` / `0.8.0` pair. That is why `installable: false`
is the right answer today, and why setup must stop contradicting it.

## Consequences

- Kit's README no longer answers "which Hyper do I need?" with a number. It
  answers with a check. That is a worse soundbite and a true statement.
- Kit minor releases stop being compatibility events. `0.7.0` crossing an
  invented `< 0.7.0` boundary was never a real break, and npm warning about it
  was noise that trained users to ignore npm warnings.
- Until the evidence pipeline re-runs against the served pair, the honest
  user-facing answer is "unevidenced", from every command that speaks. Making
  three commands agree on "unevidenced" is the fix; making one of them say
  "Setup complete" is not.
- Anyone wanting a supported pair has one route: get the pair into the matrix
  with a green run on both platforms against identical artifacts.
