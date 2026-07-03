import { isDependencyFile } from "../dependencies/dependency-files.js";
import { type ProjectState } from "../orchestrator/project-state.js";

export function sourceChangedFiles(state: ProjectState): readonly string[] {
  return state.git.changedFiles.filter((file) => !file.startsWith(".visp/"));
}

export function changedDependencyFiles(state: ProjectState): readonly string[] {
  return sourceChangedFiles(state).filter((file) => isDependencyFile(file));
}

export function hasValidationFallback(state: ProjectState): boolean {
  const profile = state.profile;

  if (profile === undefined) return false;

  return (
    [
      ...profile.testCommands,
      ...profile.typecheckCommands,
      ...profile.lintCommands,
      ...profile.buildCommands
    ].length > 0
  );
}
