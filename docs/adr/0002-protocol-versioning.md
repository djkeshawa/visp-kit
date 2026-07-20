# ADR 0002: Additive Workflow Protocol Versioning

- **Status:** Accepted
- **Date:** 2026-07-12
- **Accepted:** 2026-07-16

## Context

Visp Kit already exposes machine-readable workflow and integration data consumed by Visp Hyper Agent and automation.

The next assurance design requires richer fields, but changing existing output in place would risk breaking users and external consumers.

The current implemented boundary is WorkflowAction 2.0 and integration contract
2.0, including orchestrator read contract 0.1. Kit also has an internal,
protocol-independent canonical workflow action at canonical version `1.0`.
P1-03 routes the existing WorkflowAction 2.0 CLI result through that canonical
meaning without publicly exporting the canonical action from the package root.
WorkflowAction v3 remains design context for a later authorized phase; it is
not currently implemented or emitted by Kit.

## Decision

Use additive, explicitly selected protocol evolution when a later phase
authorizes a new workflow protocol.

Rules:

1. WorkflowAction 2.0 remains the current and initial default until a later
   recorded decision and compatibility evidence authorize a change.
2. Any future v3 introduction must be additive and explicitly requested or
   negotiated; it must not silently replace v2 output.
3. Future v2 and v3 representations must be derived from one shared canonical
   meaning so their authoritative semantics cannot drift.
4. An unknown or malformed selected strict protocol fails closed.
5. Existing projects retain their configured behavior until explicitly upgraded.
6. Current compatibility claims cover exact tested Kit/consumer pairs only. No
   deprecation cycle or supported semver window is promised until it is defined
   and proven with packed compatibility-matrix evidence.
7. Protocol advertisement and schema hashes may be added only with the later
   authorized implementation and its contract tests.
8. A future v3 default requires a separate recorded decision after the relevant
   pilot and compatibility gates pass.
9. The internal canonical action is the shared source of meaning for versioned
   projections. WorkflowAction 2.0 is projected from it. An identity-excluded
   presentation trace may retain only legacy-safe path spelling/order, oracle
   ID order, and structured-finding references after validation against the
   canonical action; it cannot supply or override semantic content.

## Illustrative future contract metadata

The following JSON is a future target for an authorized v3 implementation. It
is not an object currently emitted by Kit:

That later contract design is expected to use a shape such as:

```json
{
  "protocols": {
    "workflowAction": {
      "supported": ["2.0", "3.0"],
      "default": "2.0",
      "schemaHashes": {
        "2.0": "...",
        "3.0": "..."
      }
    }
  }
}
```

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
timestamps, and Hyper/session/presentation metadata. Selecting v2 or a future
v3 representation therefore cannot create a different identity for the same
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
Kit/Hyper matrix evidence. The canonical builder remains internal; P1-03
removes the duplicate v2 read/decision builder while preserving the public v2
schema, default, CLI formatting, protocol advertisement, and supported wire
versions. V3, protocol selection, and advertisement changes remain separate
later work.
