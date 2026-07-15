# ADR 0002: Additive Workflow Protocol Versioning

- **Status:** Accepted
- **Date:** 2026-07-12
- **Accepted:** 2026-07-16

## Context

Visp Kit already exposes machine-readable workflow and integration data consumed by Visp Hyper Agent and automation.

The next assurance design requires richer fields, but changing existing output in place would risk breaking users and external consumers.

The current implemented boundary is WorkflowAction 2.0 and integration contract
2.0, including orchestrator read contract 0.1. WorkflowAction v3 is design
context for a later authorized phase; it is not currently implemented or
emitted by Kit.

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

## Future deterministic action identity

A future v3 `actionId` should be derived from canonical action inputs rather than generated randomly.

Material inputs should include:

- protocol version;
- phase;
- task ID;
- policy hash;
- specification/task/oracle hashes;
- baseline or base-commit identity;
- exact next command.

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
Kit/Hyper matrix evidence.
