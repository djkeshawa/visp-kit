import { joinPath, vispConfigPath, vispDir, vispStatusPath } from "../core/paths.js";

export function projectProfileArtifactPath(rootPath: string): string {
  return joinPath(vispDir(rootPath), "project.json");
}

export function projectConfigArtifactPath(rootPath: string): string {
  return vispConfigPath(rootPath);
}

export function projectStatusArtifactPath(rootPath: string): string {
  return vispStatusPath(rootPath);
}

export function memoryArtifactDir(rootPath: string): string {
  return joinPath(vispDir(rootPath), "memory");
}

export function constitutionArtifactPath(rootPath: string): string {
  return joinPath(memoryArtifactDir(rootPath), "constitution.json");
}

export function featuresArtifactDir(rootPath: string): string {
  return joinPath(vispDir(rootPath), "features");
}

export function featureArtifactDir(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featuresArtifactDir(rootPath), featureKey);
}

export function featureArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "feature.json");
}

export function requirementsArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "requirements.json");
}

export function planArtifactPath(rootPath: string, featureKey: string): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "plan.json");
}

export function taskGraphArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "task-graph.json");
}

export function contextPacksArtifactDir(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "context-packs");
}

export function contextPackArtifactPath(
  rootPath: string,
  featureKey: string,
  taskId: string
): string {
  return joinPath(contextPacksArtifactDir(rootPath, featureKey), `${taskId}.context.json`);
}

export function verificationArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "verification.json");
}

export function traceabilityArtifactPath(
  rootPath: string,
  featureKey: string
): string {
  return joinPath(featureArtifactDir(rootPath, featureKey), "traceability.json");
}

export function budgetArtifactPath(rootPath: string): string {
  return joinPath(vispDir(rootPath), "budget.json");
}
