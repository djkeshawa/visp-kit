import { isDependencyFile } from "../dependencies/dependency-files.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { isExemptFromTaskScope } from "../review/diff-summary.js";

/**
 * The user's changes, as distinct from the toolchain's.
 *
 * The old rule stripped `.visp/` and nothing else, which was wrong twice over.
 * On a fresh project it counted `.mcp.json` and `AGENTS.md` — files `visp
 * setup` had written seconds earlier — as implementation work, so `next`
 * skipped the implement phase and `visp work` refused to start. And inside
 * `.visp/` it hid the two security zones from every gate that calls this: a
 * file planted in `.visp/state/` never surfaced as a change at all.
 * `isExemptFromTaskScope` already draws both lines correctly.
 */
export function sourceChangedFiles(state: ProjectState): readonly string[] {
  return [...new Set([...state.git.changedFiles, ...state.git.changedSinceBase])].filter(
    (file) => !isExemptFromTaskScope(file)
  );
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
