import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import {
  loadProjectState,
  type ProjectState
} from "../orchestrator/project-state.js";
import {
  loadEffectiveGatePolicy,
  type EffectiveGatePolicy
} from "./effective-policy.js";

export type GateContext = {
  readonly state: ProjectState;
  readonly policy: EffectiveGatePolicy;
};

export async function loadGateContext(input: {
  readonly targetPath: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly strictness?: StrictnessMode;
  readonly now: string;
}): Promise<GateContext> {
  const policy = await loadEffectiveGatePolicy({
    targetPath: input.targetPath,
    strictness: input.strictness,
    now: input.now
  });
  const state = await loadProjectState({
    targetPath: input.targetPath,
    feature: input.feature,
    taskId: input.taskId
  });

  if (!state.ok) {
    throw state.error;
  }

  return {
    state: state.value,
    policy
  };
}
