# ADR 0003: Kit Verifies Review-Decision Signatures Locally

- **Status:** Accepted
- **Date:** 2026-07-26
- **Accepted:** 2026-07-26
- **Workspace decision:** D-066

## Context

`.visp/features/<feature>/assurance/<task>/review-decisions/<hex>.json` is the
artifact that records a human accepting or rejecting an assurance case. It is
bound tightly to everything around it: the assurance case hash, the policy file
hash, the full code state, the freshness inputs, the mandatory hotspot list, and
a content-addressed supersession chain whose filename is derived from
`decisionHash`. The schema recomputes that hash on every read, so editing a
stored decision in place is already rejected.

What none of that establishes is *who decided*. The record carries
`reviewerId`, a free-text string, and `identityAssurance: z.literal("self_declared")`
— a one-member literal that has always been a placeholder. `visp assurance accept
--reviewer alice` writes "alice" because the caller typed "alice".

This matters more here than it would in most systems, because the actor the gates
are designed to constrain is the same actor that can write the file. Edits under
`.visp/` are deliberately always allowed so the agent can maintain its own
artifacts. The security model is detect-not-prevent, and detection currently
covers content but not authorship.

Two commitments depend on closing that gap. Workspace rule 8 states that human
accountability is required for accepted changes. The accepted product primitive
places "the human decision" inside a portable change evidence capsule. Both are
claims a reviewer or auditor can test, and today both fail the test.

The obvious objection is the responsibility matrix, which assigns identity, SSO,
SCIM and RBAC exclusively to the Control Plane. Putting identity in Kit would
breach the boundary.

## Decision

Split the question in two.

**Kit verifies. Kit does not identify.** Kit answers exactly one question: is
this decision cryptographically bound to a valid signature from key fingerprint
`X`, and is that binding intact? It records the scheme, the fingerprint and the
verdict, and nothing else. It holds no roster, resolves no fingerprint to a
person, and never decides whether a key is permitted to approve anything.

**Control Plane identifies.** Mapping fingerprint to human, enforcing RBAC, and
distributing trusted-key sets stay private and stay in the Control Plane, which
wraps the local decision rather than replacing it.

Concretely:

1. `identityAssurance` widens from `z.literal("self_declared")` to a union that
   also admits `"ssh_signed"`. It already sits inside the hashed body, so it is
   covered by `decisionHash` without any identity-versioning problem.
2. A `signature { scheme, keyFingerprint, value, signedAt }` block is stored
   **outside** the hashed body and signs over the existing `decisionHash`.
   Outside matters: `reviewDecisionHistoryArtifactPath` derives the history
   filename from `decisionHash`, and keeping the signature out preserves that
   content-addressing.
3. Signing uses `ssh-keygen -Y sign` and verification uses
   `ssh-keygen -Y check-novalidate` through the existing `CommandRunner`. No new
   dependency. `check-novalidate` is the deliberate choice over full
   `-Y verify`: it confirms the signature is intact and reports which key
   produced it, without consulting an allowed-signers roster. That is precisely
   the Kit half of the split — full `-Y verify` would require an `-I` principal
   and a trusted-key list, which is the Control Plane's job.
4. Verification runs in `evaluateLoadedCurrentReviewDecision`, alongside the
   existing freshness, reconstructed-input and code-state checks, and surfaces
   through `ReviewDecisionCurrentness`. It cannot run in the schema
   `superRefine` as first sketched: Zod refinements are synchronous and
   `ssh-keygen` is a subprocess, and `loadDecisionHistoryGraph` parses every
   history file on every read, so spawning a process per parse would be both
   incorrect and slow. The schema still enforces the parts that are decidable
   synchronously — signature shape, and that `identityAssurance` and the
   presence of `signature` agree.
5. A new rule **VSP025** (`requireSignedAssuranceDecision`) is non-overridable,
   defaults off in `relaxed`/`standard`, and on in `strict`/`locked`.

## Consequences

- A local team can verify, offline, that a decision was signed by a key they
  hold the public half of. That is the property that makes "open trust, paid
  operation" true rather than aspirational, and it satisfies the prerequisite
  two Phase 7 revenue rows already declare.
- Kit interoperates with in-toto/SLSA vocabulary instead of inventing a closed
  certification language, as the strategy review directs.
- Existing unsigned decisions stay valid and keep reporting `"self_declared"`.
  VSP025 is off by default outside strict and locked, so no existing project
  changes behavior on upgrade.
- Kit still cannot tell you whether the signer was *allowed* to sign. In
  Community that is the operator's judgement; the answer arrives with the
  Control Plane. Saying so plainly is part of the contract — an honest limit
  documented is a selling point to a GRC buyer, and an undocumented one is a
  finding.
- Signature fields reaching an external consumer require an additive
  WorkflowAction 3.3. The accepted 3.0, 3.1 and 3.2 schema hashes are immutable
  and `pnpm schema:check` enforces that in `prepack`.
- This ADR does not authorize Control Plane implementation, hosted review
  workflows, or organization identity. Those remain out of scope for Phase 4.

## Alternatives considered

**Sigstore / keyless signing.** A stronger supply-chain story and a cleaner SLSA
mapping, but it adds a dependency and needs network access, which conflicts with
the local-first, no-network guarantee that makes Kit auditable offline. Revisit
if a customer requires transparency-log inclusion.

**Wait for the Control Plane (milestone K7).** K7 already plans authenticated
organization identity as a paid wrapper over the local decision, gated behind
three paid pilots. But the wrapper needs something to wrap. Deferring the local
half leaves rule 8 unenforceable in the meantime and blocks the very Phase 7 rows
that were supposed to fund it.

**Sign the whole decision body instead of `decisionHash`.** Rejected because the
history filename is derived from `decisionHash`; signing a superset would either
break content-addressing or require a second canonical projection for no gain.
