// Whether an upstream artifact is USABLE, as opposed to merely present.
//
// The gates and the workflow commands disagreed about this for Kit's whole
// life, and the disagreement was invisible because each side was internally
// consistent. The commands ran the semantic validators. The gates called
// `exists()`. So `visp-kit gate plan` answered "allowed" for the placeholder
// spec that `visp-kit spec` itself generates — every field the literal string
// "TBD" — while `visp-kit plan` refused that exact file.
//
// That is not a lenient gate. It is a check that passes for a reason other
// than the thing it names: VSP004 says "Spec exists and has requirements" and
// was read by every consumer as "you may plan from this spec". The gate is the
// authority Hyper's composite loop, the generated hooks, and any external
// orchestrator are told to trust, so an agent holding that answer proceeds to
// write a plan against placeholders.
//
// The repair is deliberately NOT a second copy of the readiness rules that
// happens to agree today. Both sides now read the same validators through this
// module, so they cannot drift apart again.
//
// The invariant, stated once: THE GATE MUST NOT AUTHORIZE WHAT THE PRODUCT
// WILL THEN REFUSE. Every function here mirrors the check its stage's command
// actually performs — no stricter, or the gate blocks work the product would
// have accepted, which is the same defect wearing the opposite sign.

import { type ProjectState } from "../orchestrator/project-state.js";
import { validateClarifications } from "../validators/validate-clarifications.js";
import { validatePlan } from "../validators/validate-plan.js";
import { validateSpec } from "../validators/validate-spec.js";
import { validateTaskGraph } from "../validators/validate-task-graph.js";

export type ArtifactReadiness =
  /** Present and accepted by the same validator the command applies. */
  | { readonly state: "ready" }
  /** Not on disk at all. Unparseable files are NOT missing — see `unreadable`. */
  | { readonly state: "missing" }
  /** Present but the command would reject it (including unparseable files). */
  | { readonly state: "incomplete"; readonly errors: readonly string[] };

/** Validator errors run to whole JSON documents; gate evidence has to stay readable. */
const MAX_REPORTED_ERRORS = 3;
const MAX_ERROR_LENGTH = 160;

function condense(error: string): string {
  const collapsed = error.replace(/\s+/gu, " ").trim();
  return collapsed.length > MAX_ERROR_LENGTH
    ? `${collapsed.slice(0, MAX_ERROR_LENGTH - 1)}…`
    : collapsed;
}

/**
 * Render an incomplete readiness as gate evidence: the first few real reasons,
 * plus an honest count of what was elided. Never a bare "invalid" — the reader
 * has to be able to act on it without running a second command.
 */
export function readinessEvidence(errors: readonly string[]): string {
  const shown = errors.slice(0, MAX_REPORTED_ERRORS).map(condense);
  const hidden = errors.length - shown.length;
  return hidden > 0 ? `${shown.join(" ")} (+${hidden} more)` : shown.join(" ");
}

/**
 * An artifact that exists but cannot be parsed is NOT missing.
 *
 * Treating it as missing sent `next` to the GENERATE command, which validated
 * a freshly seeded draft and reported THAT draft's all-TBD errors — phantom
 * complaints about content the user's file never held, while the real cause
 * (a JSON parse failure `visp-kit status` was reporting correctly at the same
 * moment) went unmentioned. The state loader already records the parse error;
 * readiness turns it into an `incomplete` whose errors ARE the real problem,
 * which routes the reader to `--validate` — a command that reports faithfully
 * and never overwrites their file.
 */
function unreadable(state: ProjectState, artifactName: string): ArtifactReadiness | undefined {
  // The loader records workflow-artifact parse failures in warnings and core
  // ones in errors; an unreadable file must be caught wherever it landed.
  const recorded = [...state.errors, ...state.warnings].find((message) =>
    message.startsWith(`${artifactName} is unreadable:`)
  );
  if (recorded === undefined) return undefined;
  return {
    state: "incomplete",
    errors: [recorded, "Repair or restore the file by hand; regenerating would overwrite it."]
  };
}

/**
 * Mirrors `visp-kit spec`, which refuses to write a specification until
 * `validateClarifications` passes on the clarifications artifact.
 */
export function clarificationsReadiness(state: ProjectState): ArtifactReadiness {
  const artifact = state.clarifications;
  if (artifact === undefined) return unreadable(state, "clarifications") ?? { state: "missing" };
  const validation = validateClarifications(artifact);
  return validation.passed ? { state: "ready" } : { state: "incomplete", errors: validation.errors };
}

/**
 * Mirrors `visp-kit plan`, which refuses until `validateSpec({ spec })` passes.
 *
 * Traceability is deliberately not passed in. The plan command validates the
 * spec alone, so requiring a complete traceability matrix here would block a
 * stage the product accepts.
 */
export function specReadiness(state: ProjectState): ArtifactReadiness {
  const artifact = state.spec;
  if (artifact === undefined) return unreadable(state, "spec") ?? { state: "missing" };
  const validation = validateSpec({ spec: artifact });
  return validation.passed ? { state: "ready" } : { state: "incomplete", errors: validation.errors };
}

/**
 * Mirrors `visp-kit tasks`, which refuses until `validatePlan` passes.
 */
export function planReadiness(state: ProjectState): ArtifactReadiness {
  const artifact = state.plan;
  if (artifact === undefined) return unreadable(state, "plan") ?? { state: "missing" };
  const validation = validatePlan(artifact);
  return validation.passed ? { state: "ready" } : { state: "incomplete", errors: validation.errors };
}

/**
 * Mirrors `visp-kit tasks --validate`, which runs `validateTaskGraph`.
 *
 * The three functions above were added by D-132; this one was missed, and the
 * gap was not cosmetic. `nextAllowedCommand` asked only whether a task graph
 * EXISTED, so a half-filled one never produced `visp-kit tasks --validate` —
 * and the coordinator, which advances by replaying that answer, had no way to
 * resume through this stage. It was one of the eight places a user was forced
 * back to the engine binary.
 *
 * `validateTaskGraph` needs the spec to check that task requirement and
 * criterion ids resolve. A missing spec is reported as `missing` rather than
 * guessed at: the spec check runs earlier in `nextAllowedCommand`, so this is
 * only reachable defensively.
 */
export function taskGraphReadiness(state: ProjectState): ArtifactReadiness {
  const artifact = state.taskGraph;
  if (artifact === undefined || state.spec === undefined) {
    return unreadable(state, "task graph") ?? { state: "missing" };
  }
  const validation = validateTaskGraph({
    taskGraph: artifact,
    spec: state.spec,
    traceability: state.traceability
  });
  return validation.passed ? { state: "ready" } : { state: "incomplete", errors: validation.errors };
}
