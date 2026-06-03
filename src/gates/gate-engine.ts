import { gateReportArtifactPath } from "../artifacts/artifact-paths.js";
import {
  type GateResult,
  type GateStage
} from "../artifacts/schemas/gate.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { VispError, toVispError } from "../core/errors.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { buildGateResult } from "./gate-result.js";
import { loadGateContext } from "./gate-context.js";
import {
  evaluateClarifyGate,
  evaluateContextGate,
  evaluateFeatureGate,
  evaluateImplementGate,
  evaluateNextGate,
  evaluatePlanGate,
  evaluatePrGate,
  evaluateReconcileGate,
  evaluateReviewGate,
  evaluateSetupGate,
  evaluateSpecGate,
  evaluateTasksGate,
  evaluateVerifyGate
} from "./stage-checks.js";

export type GateEngineOptions = {
  readonly targetPath: string;
  readonly stage: GateStage;
  readonly feature?: string;
  readonly taskId?: string;
  readonly strictness?: StrictnessMode;
  readonly dryRun: boolean;
  readonly now: string;
};

function evaluateStage(context: Awaited<ReturnType<typeof loadGateContext>>, stage: GateStage) {
  switch (stage) {
    case "next":
      return evaluateNextGate(context);
    case "setup":
      return evaluateSetupGate(context);
    case "feature":
      return evaluateFeatureGate(context);
    case "clarify":
      return evaluateClarifyGate(context);
    case "spec":
      return evaluateSpecGate(context);
    case "plan":
      return evaluatePlanGate(context);
    case "tasks":
      return evaluateTasksGate(context);
    case "context":
      return evaluateContextGate(context);
    case "implement":
      return evaluateImplementGate(context);
    case "verify":
      return evaluateVerifyGate(context);
    case "review":
      return evaluateReviewGate(context);
    case "reconcile":
      return evaluateReconcileGate(context);
    case "pr":
      return evaluatePrGate(context);
  }
}

export async function evaluateGate(
  options: GateEngineOptions
): Promise<Result<GateResult, VispError>> {
  try {
    const context = await loadGateContext({
      targetPath: options.targetPath,
      feature: options.feature,
      taskId: options.taskId,
      strictness: options.strictness,
      now: options.now
    });

    if (!context.state.initialized && options.stage !== "setup" && options.stage !== "next") {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          "Visp Kit is not initialized. Run `visp init` first."
        )
      );
    }

    const evaluation = evaluateStage(context, options.stage);

    return ok(
      buildGateResult({
        targetPath: options.targetPath,
        stage: options.stage,
        strictnessMode: context.policy.policy.strictnessMode,
        dryRun: options.dryRun,
        state: context.state,
        evaluation,
        reportPath: relativePath(options.targetPath, gateReportArtifactPath(options.targetPath)),
        evaluatedAt: options.now
      })
    );
  } catch (error) {
    return err(toVispError(error, "VALIDATION_FAILED"));
  }
}
