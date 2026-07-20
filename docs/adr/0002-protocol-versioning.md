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
That canonical action is not publicly exported from the package root or
connected to the public CLI in P1-02. WorkflowAction v3 remains design context
for a later authorized phase; it is not currently implemented or emitted by
Kit.

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
9. The internal canonical action is the shared source of meaning for later
   projections. P1-02 does not route the existing v2 projection through it;
   that compatibility-sensitive change belongs to P1-03.

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
keys, and non-plain containers are rejected instead of coerced.

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
Kit/Hyper matrix evidence. The P1-02 canonical builder is internal and does not
change current v2 output, CLI behavior, protocol advertisement, or supported
wire versions. Its bounded duplication of current read collection is removed
when P1-03 makes v2 a projection of canonical meaning.
