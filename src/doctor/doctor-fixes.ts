import {
  cacheArtifactDir,
  featuresArtifactDir,
  memoryArtifactDir,
  policyArtifactPath,
  presetsArtifactDir,
  promptsArtifactDir,
  reportsArtifactDir,
  runsArtifactDir,
  workflowManifestArtifactPath
} from "../artifacts/artifact-paths.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import { policyArtifactSchema } from "../artifacts/schemas/policy.schema.js";
import { workflowManifestSchema } from "../artifacts/schemas/workflow.schema.js";
import { ensureDir, pathExists } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { createDefaultPolicy } from "../policy/policy-defaults.js";
import { defaultPolicyStrictness } from "../policy/policy-loader.js";
import { defaultWorkflowManifest } from "../workflow-manifest/default-workflow.js";

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
    promptsArtifactDir(input.targetPath),
    runsArtifactDir(input.targetPath),
    presetsArtifactDir(input.targetPath)
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

  const policyPath = policyArtifactPath(input.targetPath);
  const policyDisplay = relativePath(input.targetPath, policyPath);
  const policyExists = await pathExists(policyPath);

  if (policyExists.ok && !policyExists.value) {
    if (input.dryRun) {
      results.push({
        path: policyDisplay,
        applied: false,
        reason: "dry-run"
      });
    } else {
      const strictness = await defaultPolicyStrictness(input.targetPath);
      const write = strictness.ok
        ? await writeArtifact(
            policyPath,
            policyArtifactSchema,
            createDefaultPolicy({
              strictnessMode: strictness.value,
              now: new Date().toISOString()
            }),
            { artifactName: "policy" }
          )
        : strictness;

      results.push({
        path: policyDisplay,
        applied: write.ok,
        reason: write.ok ? "policy created" : write.error.message
      });
    }
  }

  const workflowPath = workflowManifestArtifactPath(input.targetPath);
  const workflowDisplay = relativePath(input.targetPath, workflowPath);
  const workflowExists = await pathExists(workflowPath);

  if (workflowExists.ok && !workflowExists.value) {
    if (input.dryRun) {
      results.push({
        path: workflowDisplay,
        applied: false,
        reason: "dry-run"
      });
    } else {
      const write = await writeArtifact(
        workflowPath,
        workflowManifestSchema,
        defaultWorkflowManifest(new Date().toISOString()),
        { artifactName: "workflow manifest" }
      );

      results.push({
        path: workflowDisplay,
        applied: write.ok,
        reason: write.ok ? "workflow manifest created" : write.error.message
      });
    }
  }

  return results;
}
