# ADR 0001: Visp Kit Is the Authoritative Workflow and Assurance Engine

- **Status:** Proposed
- **Date:** 2026-07-12

## Context

Visp Kit and Visp Hyper Agent both participate in AI-assisted development workflows. As features expanded, both projects acquired concepts related to tasks, scope, validation, evidence, review, and progression.

If both projects independently decide strict workflow semantics, their behavior can drift. A host-facing orchestrator may then report a different permission or completion state than the engine that owns policy and evidence.

## Decision

Visp Kit is the sole authority for Kit-backed workflow semantics, including:

- active feature and task;
- workflow permission;
- strictness and policy;
- allowed, expected, and forbidden file scope;
- acceptance claims;
- required evidence;
- verification;
- review;
- reconciliation;
- assurance profile and verdict;
- overrides;
- PR readiness.

Visp Kit exposes these decisions through versioned machine-readable contracts and local artifacts.

Visp Kit does not:

- execute an LLM;
- manage coding-host sessions;
- coordinate subagents;
- own organization identity, billing, or enterprise dashboards.

## Invariants

1. Missing required evidence is never silently converted into a pass.
2. Unknown or malformed strict inputs fail closed.
3. Public contracts are versioned.
4. Protocol evolution is additive during the documented compatibility window.
5. Host-specific products consume Kit results rather than recreating them.
6. Public local assurance remains complete without enterprise services.
7. No automatic merge and no AI-only approval.

## Consequences

### Positive

- one source of strict truth;
- consistent CLI, hook, CI, Hyper, and MCP behavior;
- stronger auditability;
- independent host adapters;
- clear public/private boundary.

### Cost

- Kit contracts must become complete enough for external orchestrators;
- contract compatibility requires cross-repository tests;
- some existing Hyper logic will be removed or limited to fallback mode after coverage is proven.

## Follow-up

- inventory current contract gaps;
- define the canonical action model;
- add additive v3 support;
- publish schema hashes;
- add packed Kit/Hyper compatibility tests.
