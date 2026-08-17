import { type ProjectState } from "../../orchestrator/project-state.js";
import {
  ran,
  skipped,
  type EvaluationCheckDraft,
  type EvaluationInspection
} from "../evaluation-coverage.js";

function taskScopedCommand(command: string, state: ProjectState): string {
  return state.selectedTask === undefined
    ? `Run visp-kit ${command}.`
    : `Run visp-kit ${command} --task ${state.selectedTask.id}.`;
}

function evidenceFinding(input: {
  readonly state: ProjectState;
  readonly title: string;
  readonly description: string;
  readonly command: string;
}): EvaluationCheckDraft {
  return {
    category: "evidence",
    severity: "error",
    title: input.title,
    description: input.description,
    recommendation: taskScopedCommand(input.command, input.state),
    file: input.state.selectedFeature?.relativePath ?? null,
    ...(input.state.selectedTask === undefined ? {} : { taskId: input.state.selectedTask.id })
  };
}

/**
 * The evidence artifacts eval reads rather than produces: context budget,
 * verification, review, reconciliation and PR readiness.
 *
 * Each one is skipped by name when its artifact is absent. That is the half of
 * LC-108 that mattered: eval used to fold "the review reported no failure" and
 * "there is no review" into the same silence, so a project with no evidence at
 * all evaluated exactly like a project whose evidence was clean.
 */
export function evidenceChecks(state: ProjectState): readonly EvaluationInspection[] {
  const contextPack = state.contextPack;
  const verification = state.verification;
  const review = state.review;
  const reconcile = state.reconcile;
  const pr = state.pr;

  return [
    contextPack === undefined
      ? skipped("context budget", "no context pack is compiled for the selected task")
      : ran(
          "context budget",
          contextPack.overBudget
            ? [
                {
                  category: "budget",
                  severity: "warning",
                  title: "Context is over budget",
                  description: contextPack.recommendation,
                  recommendation: "Split the task or lower context scope.",
                  file: state.selectedFeature?.relativePath ?? null,
                  ...(state.selectedTask === undefined ? {} : { taskId: state.selectedTask.id })
                }
              ]
            : []
        ),
    verification === undefined
      ? skipped("verification evidence", "no verification report has been produced")
      : ran(
          "verification evidence",
          verification.success === false
            ? [
                evidenceFinding({
                  state,
                  title: "Verification failed",
                  description: "Latest verification evidence reports failure.",
                  command: "verify"
                })
              ]
            : []
        ),
    review === undefined
      ? skipped("review evidence", "no review report has been produced")
      : ran(
          "review evidence",
          review.result === "failed"
            ? [
                evidenceFinding({
                  state,
                  title: "Review failed",
                  description: "Latest review report has blocking findings.",
                  command: "review"
                })
              ]
            : []
        ),
    reconcile === undefined
      ? skipped("reconciliation evidence", "no reconciliation report has been produced")
      : ran(
          "reconciliation evidence",
          reconcile.result === "failed"
            ? [
                evidenceFinding({
                  state,
                  title: "Reconciliation failed",
                  description: "Latest reconciliation report has blocking drift.",
                  command: "reconcile"
                })
              ]
            : []
        ),
    pr === undefined
      ? skipped("pr readiness", "no PR summary has been generated")
      : ran(
          "pr readiness",
          pr.errors.length > 0
            ? [
                {
                  category: "pr",
                  severity: "error",
                  title: "PR summary has errors",
                  description: "The generated PR artifact reports blocking issues.",
                  recommendation: "Fix the PR readiness issues and rerun visp-kit pr.",
                  file: state.selectedFeature?.relativePath ?? null
                }
              ]
            : []
        )
  ];
}
