# ADR 0002: Additive Workflow Protocol Versioning

- **Status:** Proposed
- **Date:** 2026-07-12

## Context

Visp Kit already exposes machine-readable workflow and integration data consumed by Visp Hyper Agent and automation.

The next assurance design requires richer fields, but changing existing output in place would risk breaking users and external consumers.

## Decision

Introduce WorkflowAction v3 additively.

Rules:

1. v2 remains readable for one documented deprecation cycle.
2. The initial default remains v2.
3. Kit advertises supported protocol versions and schema hashes.
4. Consumers request an explicit protocol or negotiate the highest mutually supported version.
5. Kit derives v2 and v3 from one canonical internal action model.
6. Unknown requested protocols fail clearly.
7. Hyper must fail closed when a selected strict contract is unknown or malformed.
8. Existing projects retain their configured behavior until explicitly upgraded.
9. New strict projects may default to v3 only after the pilot gate passes.

## Required contract metadata

The integration contract should expose:

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

## Deterministic action identity

V3 `actionId` should be derived from canonical action inputs rather than generated randomly.

Material inputs should include:

- protocol version;
- phase;
- task ID;
- policy hash;
- specification/task/oracle hashes;
- baseline or base-commit identity;
- exact next command.

## Compatibility testing

A protocol release is not complete until:

- Kit schema tests pass;
- Hyper adapter tests pass;
- exact packed Kit and Hyper packages pass the cross-repository matrix;
- CLI and MCP render equivalent canonical actions;
- malformed and unsupported contracts fail closed.

## Consequences

The projects may release independently, but compatibility claims must be backed by the tested matrix.
