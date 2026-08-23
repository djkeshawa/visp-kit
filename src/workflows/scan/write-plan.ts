import path from "node:path";

import {
  dependencyMapArtifactPath,
  fileIndexArtifactPath,
  fileSummariesArtifactPath,
  intelScanArtifactPath,
  moduleMapArtifactPath,
  patternsArtifactPath,
  projectProfileArtifactPath,
  projectSummaryArtifactPath,
  scanMetaArtifactPath,
  scanReportArtifactPath,
  testMapArtifactPath
} from "../../artifacts/artifact-paths.js";
import { writeArtifact } from "../../artifacts/artifact-writer.js";
import { intelScanProvenanceWriteSchema } from "../../artifacts/schemas/intel-scan.schema.js";
import { projectProfileSchema } from "../../artifacts/schemas/project.schema.js";
import { type VispError } from "../../core/errors.js";
import { ensureDir, writeJsonFile, writeTextFile } from "../../core/file-system.js";
import { toPosixPath } from "../../core/paths.js";
import { ok, type Result } from "../../core/result.js";

export type ScanWritePlan = {
  readonly path: string;
  readonly displayPath: string;
  readonly kind: "json" | "text" | "project" | "intelScan";
  readonly value: unknown;
};

function displayPath(targetPath: string, filePath: string): string {
  return toPosixPath(path.relative(targetPath, filePath));
}

export function plannedScanWrites(
  targetPath: string,
  values: Record<string, unknown>
): ScanWritePlan[] {
  return [
    ["project", projectProfileArtifactPath(targetPath), values.project],
    ["json", fileIndexArtifactPath(targetPath), values.fileIndex],
    ["json", fileSummariesArtifactPath(targetPath), values.fileSummaries],
    ["json", testMapArtifactPath(targetPath), values.testMap],
    ["json", moduleMapArtifactPath(targetPath), values.moduleMap],
    ["json", dependencyMapArtifactPath(targetPath), values.dependencyMap],
    ["json", scanMetaArtifactPath(targetPath), values.scanMeta],
    ["intelScan", intelScanArtifactPath(targetPath), values.intelScan],
    ["text", projectSummaryArtifactPath(targetPath), values.projectSummary],
    ["text", patternsArtifactPath(targetPath), values.patterns],
    ["text", scanReportArtifactPath(targetPath), values.scanReport]
  ].map(([kind, filePath, value]) => ({
    kind: kind as ScanWritePlan["kind"],
    path: filePath as string,
    displayPath: displayPath(targetPath, filePath as string),
    value
  }));
}

export async function ensureScanDirectories(targetPath: string): Promise<Result<void, VispError>> {
  for (const directory of [
    path.join(targetPath, ".visp", "cache"),
    path.join(targetPath, ".visp", "memory"),
    path.join(targetPath, ".visp", "reports")
  ]) {
    const result = await ensureDir(directory);

    if (!result.ok) {
      return result;
    }
  }

  return ok(undefined);
}

export async function writeScanPlan(
  files: readonly ScanWritePlan[]
): Promise<Result<void, VispError>> {
  for (const file of files) {
    const result =
      file.kind === "project"
        ? await writeArtifact(file.path, projectProfileSchema, file.value, {
            artifactName: "project profile"
          })
        : file.kind === "intelScan"
          ? await writeArtifact(file.path, intelScanProvenanceWriteSchema, file.value, {
              artifactName: "intel scan provenance"
            })
          : file.kind === "json"
            ? await writeJsonFile(file.path, file.value)
            : await writeTextFile(file.path, String(file.value));

    if (!result.ok) {
      return result;
    }
  }

  return ok(undefined);
}
