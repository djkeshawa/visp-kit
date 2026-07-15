# ADR 0001: Visp Kit Is the Authoritative Workflow and Assurance Engine

- **Status:** Accepted
- **Date:** 2026-07-12
- **Accepted:** 2026-07-16

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

The current public boundary is WorkflowAction 2.0 and integration contract 2.0,
including orchestrator read contract 0.1. Authority ownership does not mean that
every desired future field already exists in those contracts. Documented
contract gaps remain gated follow-up work.

Visp Kit does not:

- execute an LLM;
- manage coding-host sessions;
- coordinate subagents;
- own organization identity, billing, or enterprise dashboards.

## Invariants

1. Missing required evidence is never silently converted into a pass.
2. Malformed or unavailable required strict authority fails closed.
3. Public contracts are versioned.
4. Current compatibility claims cover exact tested Kit/consumer pairs only. A
   wider support window requires packed compatibility-matrix evidence.
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

## Gated follow-up

The following items are design or later-phase work. This ADR does not authorize
their implementation during Phase 0:

- complete the inventory of current contract gaps;
- define a shared canonical action meaning;
- introduce WorkflowAction v3 additively after explicit authorization;
- publish schema hashes only with the corresponding implemented contracts; and
- add packed Kit/Hyper compatibility-matrix tests before claiming a wider
  compatibility window.
