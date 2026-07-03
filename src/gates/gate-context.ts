import { type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { type ImplementMarker } from "../artifacts/schemas/implement-marker.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { type VispError } from "../core/errors.js";
import { pathExists } from "../core/file-system.js";
import { resolvePath } from "../core/paths.js";
import { ok, type Result } from "../core/result.js";
import { loadProjectState, type ProjectState } from "../orchestrator/project-state.js";
import { hashFile } from "../scanner/hash.js";
import { loadEffectiveGatePolicy, type EffectiveGatePolicy } from "./effective-policy.js";
import { listActiveImplementMarkers } from "./implement-marker.js";

export type StaleContextArtifact = {
  readonly label: string;
  readonly path: string;
};

export type GateContext = {
  readonly state: ProjectState;
  readonly policy: EffectiveGatePolicy;
  readonly staleContextArtifacts: readonly StaleContextArtifact[];
  readonly activeMarkers: readonly ImplementMarker[];
};

async function staleProvenanceArtifacts(input: {
  readonly targetPath: string;
  readonly contextPack?: ContextPack;
}): Promise<readonly StaleContextArtifact[]> {
  if (input.contextPack === undefined) return [];

  const stale: StaleContextArtifact[] = [];

  for (const provenance of input.contextPack.artifactProvenance) {
    const absolute = resolvePath(input.targetPath, provenance.path);
    const exists = await pathExists(absolute);

    if (!exists.ok || !exists.value) {
      stale.push({ label: provenance.label, path: provenance.path });
      continue;
    }

    try {
      if ((await hashFile(absolute)) !== provenance.hash) {
        stale.push({ label: provenance.label, path: provenance.path });
      }
    } catch {
      stale.push({ label: provenance.label, path: provenance.path });
    }
  }

  return stale;
}

export async function loadGateContext(input: {
  readonly targetPath: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly strictness?: StrictnessMode;
  readonly now: string;
}): Promise<Result<GateContext, VispError>> {
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
    return state;
  }

  const staleContextArtifacts = await staleProvenanceArtifacts({
    targetPath: input.targetPath,
    contextPack: state.value.contextPack
  });
  const activeMarkers = await listActiveImplementMarkers(input.targetPath);

  return ok({
    state: state.value,
    policy,
    staleContextArtifacts,
    activeMarkers
  });
}
