# ADR 0002: Additive Workflow Protocol Versioning

- **Status:** Accepted
- **Date:** 2026-07-12
- **Accepted:** 2026-07-16

## Context

Visp Kit already exposes machine-readable workflow and integration data consumed by Visp Hyper Agent and automation.

The next assurance design requires richer fields, but changing existing output in place would risk breaking users and external consumers.

The current implemented boundary includes WorkflowAction 2.0, 3.0, and 3.1 plus
integration contract 2.0, including orchestrator read contract 0.1. Kit also has an internal,
protocol-independent canonical workflow action at canonical version `1.0`.
P1-03 routes the existing WorkflowAction 2.0 CLI result through that canonical
meaning without publicly exporting the canonical action from the package root.
P1-04 adds WorkflowAction 3.0 as an explicit projection, while preserving v2
as the omitted-protocol default. P1-05 adds exact supported-version, default,
and schema-hash advertisement to integration contract 2.0 without changing the
default or claiming consumer support. P2-09 preserves the accepted 3.0 schema
and adds evidence-aware WorkflowAction 3.1 rather than changing an immutable
schema hash under an existing protocol name.

## Decision

Use additive, explicitly selected workflow-action protocols derived from one
canonical action.

Rules:

1. WorkflowAction 2.0 remains the current and initial default until a later
   recorded decision and compatibility evidence authorize a change.
2. WorkflowAction 3.0 and 3.1 are additive and explicitly requested; neither
   silently replaces v2 output. Accepted protocol schemas and hashes are
   immutable.
3. V2 and v3-family representations are derived from shared canonical
   meaning so their authoritative semantics cannot drift.
4. An unknown or malformed selected strict protocol fails closed.
5. Existing projects retain their configured behavior until explicitly upgraded.
6. Current compatibility claims cover exact tested Kit/consumer pairs only. No
   deprecation cycle or supported semver window is promised until it is defined
   and proven with packed compatibility-matrix evidence.
7. Both public runtime-derived schemas and their canonical parsed-JSON hashes
   exist in Kit. Integration contract 2.0 advertises those accepted immutable
   hashes together with the exact implemented protocol set and default.
8. A future v3 default requires a separate recorded decision after the relevant
   pilot and compatibility gates pass.
9. The internal canonical action is the shared source of meaning for versioned
   projections. WorkflowAction 2.0 is projected from it. An identity-excluded
   presentation trace may retain only legacy-safe path spelling/order, oracle
   ID order, and structured-finding references after validation against the
   canonical action; it cannot supply or override semantic content.

## Implemented advertisement metadata

Integration contract 2.0 emits this required top-level metadata after
`contractVersion`:

```json
{
  "protocols": {
    "workflowAction": {
      "supported": ["2.0", "3.0", "3.1"],
      "default": "2.0",
      "schemaHashes": {
        "2.0": "sha256:c63b279b1ce89f047b2be696a47e845a57adda7f8437892e211e3a4cfad39ed6",
        "3.0": "sha256:ceb45ad3a27a4172c4dbe7e7caacf473570f4578eda27744662a8ed094e96ce7",
        "3.1": "sha256:41ffa28fcd4476ea1812ff307df67a7ab7edb5b2cf4d6c11955d34d4aad74d4d"
      }
    }
  }
}
```

The supported array is a stable set presentation, not preference order.
Default describes omitted-protocol Kit behavior. Schema-hash keys correspond
exactly to supported versions and use canonical parsed-JSON hashes, not raw
file hashes. This metadata does not select or negotiate a protocol, establish
a package-semver range, or prove that a consumer supports v3. A legacy exact
contract 2.0 without this top-level property can imply only the documented v2
path; consumer-side validation and negotiation remain separate responsibilities.

## Implemented canonical action identity

Canonical workflow action version `1.0` uses dependency-free
`canonical-json-v1` serialization. It accepts strict JSON values, orders object
keys by ascending UTF-16 code units, preserves array order, uses ECMAScript
string and finite-number encoding, and emits compact UTF-8 without a BOM or
trailing newline. Unsupported values, sparse arrays, cycles, accessors, symbol
keys, proxy containers, and non-plain containers are rejected instead of
coerced.

The canonical builder normalizes schema-defined sets before serialization and
preserves declared order where order is semantic. Its `actionId` is:

```text
"sha256:" + lowercaseHex(SHA-256(
  UTF8("visp.workflow-action\0canonical-1.0\0")
  || canonical-json-v1(action without actionId)
))
```

The identity includes every supplied canonical semantic field other than
`actionId`, including canonical version, availability reason codes, exact
artifact hashes and text, findings, verdict, and `nextCommand`. It excludes
wire protocol version, wire schema hash, package version, CLI formatting,
timestamps, and Hyper/session/presentation metadata. Selecting the v2 or v3
wire representation therefore cannot create a different identity for the same
canonical action.

Fields without a current authoritative source remain explicitly unavailable;
P1-02 does not infer task class, risk factors, assurance profile, base commit,
operation limits, required evidence, or applied policy overrides.

For a feature stage without an active task, valid specification acceptance
criteria remain canonical validation oracles while claims remain
`not_applicable/no_active_task`. Canonical oracle order is stable by ID; the
validated v2 presentation trace retains source order so the existing v2 wire
representation does not invent criteria or silently reorder ordinary output.

Canonical task identity remains the selected ProjectState task. The exact
`next-task-needed` transition may name the deterministic next graph task as a
transition hint when the selected task is terminal; it does not replace the
canonical task. Other target, task, command, or source-identity contradictions
remain inconclusive.

## Implemented WorkflowAction 2.0 projection

The v2 builder performs one canonical build and then a strict lossy projection.
It maps expanded phases and read roles to their legacy spellings, removes the
validated `sha256:` prefix from read hashes, maps canonical scope and oracles,
and copies validation commands, assurance, verdict, and `nextCommand`. It does
not emit `actionId` or any v3-only field.

Before emission, the projector verifies the canonical `actionId`, hash shape,
safe presentation paths, exact normalized scope sets, oracle references, and
finding references. Unreferenced canonical blocking or uncertain findings are
still emitted, so presentation data cannot hide authority. A malformed trace
throws rather than falling back to the removed direct v2 construction path.
The public schema, field order, two-space CLI formatting, trailing newline, and
default protocol remain WorkflowAction 2.0.

The canonical mapping intentionally corrects five legacy heuristic outputs.
`scan-needed` and `constitution-needed` retain the legacy v2 `implement`
phase but use canonical setup scope with no writable paths instead of exposing
source paths from a retained task. `checklist-needed` now projects through
canonical `context` to v2 `task` with feature workflow scope.
`verification-failed` and `traceability-update-needed` now project through
canonical verification stages to v2 `verify` with no writable paths. The
former direct builder exposed active task source paths for all five states.
These exact scope-narrowing corrections are locked by state-level regressions;
they do not change the v2 schema or default and do not authorize other output
drift.

## Implemented WorkflowAction 3.0 projection

WorkflowAction 3.0 is a flat `protocolVersion` field followed by the complete
canonical action in canonical field order. It retains `canonicalVersion` and
the canonical `actionId`; it does not contain a wrapper, v2 presentation
metadata, or a wire schema hash. The projector recomputes and verifies the
canonical identity before strict parsing. Selecting v2 or v3 never changes
identity.

V3 uses strict closed objects, exact enums, safe normalized project paths,
prefixed lowercase SHA-256 hashes, structured findings, and the frozen
availability union. Available empty values remain distinct from unavailable
and not-applicable values. Top-level feature/task absence may be null;
existing nullable fields inside an applied override remain nested record
values. Kit does not infer currently unavailable Phase 2 evidence.

## Implemented WorkflowAction 3.1 projection

WorkflowAction 3.1 preserves 3.0 and advances the canonical action to version
`1.1`. Its domain-separated identity uses
`visp.workflow-action\0canonical-1.1\0` and includes a compact current-evidence
summary. The summary identifies the baseline or candidate artifact by path and
hash and carries exact Kit-supplied artifact, provider, result, freshness,
independence, and test-strength states. It intentionally excludes captured
stdout/stderr, operations, and other bulky evidence payloads.

Candidate evidence takes precedence and is exposed only after its content hash
and current plan, lock, authorization, baseline, cache, and provider bindings
validate. Its recorded implementation-workspace fingerprint must also match
the current task files, so changes after candidate verification make the
action inconclusive. Otherwise an existing invalid or stale artifact makes the
action inconclusive. A locked baseline is exposed only after the existing
authorization loader validates its raw hash, plan/provider bindings, and cache.
Missing ordinary evidence remains explicitly unavailable; a taskless action is
not applicable. Consumers render these values and never decide sufficiency.

## Implemented schemas and CLI selection

The single runtime Zod source generates committed draft 2020-12 schemas with
stable IDs:

- `urn:visp:schema:workflow-action:2.0`; and
- `urn:visp:schema:workflow-action:3.0`; and
- `urn:visp:schema:workflow-action:3.1`.

Artifacts are included in the package and checked before packing. Schema
hashes use dependency-free canonical-json-v1 over the parsed document, so
formatting changes do not alter the schema hash.

Kit accepts exact `visp next --format json --protocol 2.0`, `3.0`, or `3.1`.
Omitting the protocol preserves v2 bytes. Kit rejects `auto`, shorthand, unknown
versions, and protocol use without `--format json` before workflow evaluation.
The legacy `--json` flag remains the larger NextStep summary.

## Future compatibility testing

A protocol release is not complete until:

- Kit schema tests pass;
- Hyper adapter tests pass;
- exact packed Kit and Hyper packages pass the cross-repository matrix;
- CLI and MCP render equivalent canonical actions;
- malformed and unsupported contracts fail closed.

## Consequences

The projects may release independently, but current support claims remain
limited to exact tested pairs. A wider compatibility window requires packed
Kit/Hyper matrix evidence. The canonical builder remains internal. V2 remains
the default and unchanged projection; the v3 family is explicit and additive.
Kit packages all accepted schemas and computes their stable hashes; Hyper owns
selection and negotiation.
