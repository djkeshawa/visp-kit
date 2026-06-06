import path from "node:path";

import { gateReportArtifactPath } from "../artifacts/artifact-paths.js";
import {
  gateResultSchema,
  type GateResult,
  type GateStage
} from "../artifacts/schemas/gate.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { createArtifactValidationError } from "../artifacts/validation-error.js";
import { VispError } from "../core/errors.js";
import { pathExists, writeTextFile } from "../core/file-system.js";
import { vispDir } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { evaluateGate } from "../gates/gate-engine.js";
import {
  formatGateResult,
  renderGateReport
} from "../gates/gate-report.js";
import { markImplementationChecklistSteps } from "../context/implementation-checklist.js";

export type GateWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly stage: GateStage;
  readonly feature?: string;
  readonly taskId?: string;
  readonly strictness?: StrictnessMode;
  readonly explain?: boolean;
  readonly dryRun?: boolean;
  readonly now?: string;
};

export type GateWorkflowSummary = GateResult;

async function canWriteReport(input: {
  readonly targetPath: string;
  readonly dryRun: boolean;
}): Promise<Result<boolean, VispError>> {
  if (input.dryRun) return ok(false);

  const initialized = await pathExists(vispDir(input.targetPath));

  if (!initialized.ok) return initialized;
  return ok(initialized.value);
}

export async function runGateWorkflow(
  options: GateWorkflowOptions
): Promise<Result<GateWorkflowSummary, VispError>> {
  const targetPath = path.resolve(options.cwd ?? process.cwd(), options.targetPath ?? ".");
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date().toISOString();
  const gate = await evaluateGate({
    targetPath,
    stage: options.stage,
    feature: options.feature,
    taskId: options.taskId,
    strictness: options.strictness,
    dryRun,
    now
  });

  if (!gate.ok) return gate;

  const parsed = gateResultSchema.safeParse(gate.value);

  if (!parsed.success) {
    return err(createArtifactValidationError(parsed.error, "gate result"));
  }

  const writable = await canWriteReport({ targetPath, dryRun });

  if (!writable.ok) return writable;

  if (writable.value) {
    const write = await writeTextFile(
      gateReportArtifactPath(targetPath),
      renderGateReport(parsed.data)
    );

    if (!write.ok) return write;
  }

  if (parsed.data.stage === "implement" && parsed.data.allowed && parsed.data.feature !== null && parsed.data.taskId !== null) {
    const featureKey = `${parsed.data.feature.id}-${parsed.data.feature.slug}`;
    const checklist = await markImplementationChecklistSteps({
      targetPath,
      featureKey,
      taskId: parsed.data.taskId,
      steps: ["gate-implement"],
      evidence: `visp gate implement --task ${parsed.data.taskId}`,
      dryRun,
      now
    });

    if (!checklist.ok) return checklist;
  }

  return ok(parsed.data);
}

export { formatGateResult };
