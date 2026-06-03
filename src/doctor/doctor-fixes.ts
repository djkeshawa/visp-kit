import {
  cacheArtifactDir,
  featuresArtifactDir,
  memoryArtifactDir,
  promptsArtifactDir,
  reportsArtifactDir
} from "../artifacts/artifact-paths.js";
import { ensureDir } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";

export type DoctorFixResult = {
  readonly path: string;
  readonly applied: boolean;
  readonly reason: string;
};

export async function applySafeDoctorFixes(input: {
  readonly targetPath: string;
  readonly dryRun?: boolean;
}): Promise<readonly DoctorFixResult[]> {
  const dirs = [
    featuresArtifactDir(input.targetPath),
    memoryArtifactDir(input.targetPath),
    cacheArtifactDir(input.targetPath),
    reportsArtifactDir(input.targetPath),
    promptsArtifactDir(input.targetPath)
  ];
  const results: DoctorFixResult[] = [];

  for (const dir of dirs) {
    const display = relativePath(input.targetPath, dir);

    if (input.dryRun) {
      results.push({
        path: display,
        applied: false,
        reason: "dry-run"
      });
      continue;
    }

    const created = await ensureDir(dir);

    results.push({
      path: display,
      applied: created.ok,
      reason: created.ok ? "directory ensured" : created.error.message
    });
  }

  return results;
}
