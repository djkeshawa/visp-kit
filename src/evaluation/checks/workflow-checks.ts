import { type NextStep } from "../../orchestrator/next-step.js";
import { type ProjectState } from "../../orchestrator/project-state.js";
import {
  ran,
  skipped,
  type EvaluationCheckDraft,
  type EvaluationInspection
} from "../evaluation-coverage.js";

/**
 * Project-level readiness and the presence of the active feature's workflow
 * artifacts. Split out of `evaluation-engine.ts` when LC-108 turned the engine
 * from a list of problems into a record of named inspections.
 */
export function projectReadinessChecks(input: {
  readonly state: ProjectState;
  readonly strict: boolean;
}): readonly EvaluationInspection[] {
  const state = input.state;

  return [
    ran(
      "project initialization",
      state.initialized
        ? []
        : [
            {
              category: "workflow",
              severity: "error",
              title: "Project is not initialized",
              description: "The target path does not contain a .visp project.",
              recommendation: "Run visp-kit init.",
              file: ".visp"
            }
          ]
    ),
    ran(
      "scan cache",
      state.scanned
        ? []
        : [
            {
              category: "workflow",
              severity: input.strict ? "error" : "warning",
              title: "Scan cache is missing",
              description: "The project scan cache is incomplete or pending.",
              recommendation: "Run visp-kit scan.",
              file: ".visp/cache/scan-meta.json"
            }
          ]
    ),
    ran(
      "project constitution",
      state.constitution
        ? []
        : [
            {
              category: "policy",
              severity: input.strict ? "error" : "warning",
              title: "Compact constitution is missing",
              description: "The project constitution is not available to constrain agent behavior.",
              recommendation: "Run visp-kit constitution.",
              file: ".visp/memory/constitution.compact.md"
            }
          ]
    ),
    ran(
      "active feature",
      state.selectedFeature === undefined
        ? [
            {
              category: "workflow",
              severity: "warning",
              title: "No active feature",
              description: "Evaluation is limited because no active feature is selected.",
              recommendation: 'Run visp-kit feature "<idea>".',
              file: ".visp/status.json"
            }
          ]
        : []
    )
  ];
}

const featureArtifacts = [
  ["clarifications", "Clarifications"],
  ["spec", "Specification"],
  ["plan", "Plan"],
  ["taskGraph", "Task graph"],
  ["context", "Context pack"],
  ["verification", "Verification"],
  ["review", "Review"],
  ["reconcile", "Reconciliation"]
] as const;

function artifactCategory(
  key: (typeof featureArtifacts)[number][0]
): EvaluationCheckDraft["category"] {
  if (key === "context") return "context";
  if (key === "verification" || key === "review" || key === "reconcile") return "evidence";
  return "workflow";
}

export function featureArtifactChecks(input: {
  readonly state: ProjectState;
  readonly next: NextStep;
  readonly strict: boolean;
}): EvaluationInspection {
  const feature = input.state.selectedFeature;

  if (feature === undefined) {
    return skipped("feature workflow artifacts", "no active feature is selected");
  }

  return ran(
    "feature workflow artifacts",
    featureArtifacts.flatMap(([key, label]) =>
      input.state.artifactSummary[key]
        ? []
        : [
            {
              category: artifactCategory(key),
              severity: (input.strict && ["spec", "plan", "taskGraph"].includes(key)
                ? "error"
                : "warning") as EvaluationCheckDraft["severity"],
              title: `${label} missing`,
              description: `${label} evidence is not available for the selected feature/task.`,
              recommendation: input.next.nextCommand,
              file: feature.relativePath,
              ...(input.state.selectedTask === undefined
                ? {}
                : { taskId: input.state.selectedTask.id })
            }
          ]
    )
  );
}
