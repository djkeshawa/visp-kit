import path from "node:path";

import {
  fileSummariesArtifactPath,
  projectProfileArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { projectProfileSchema, type ProjectProfile } from "../artifacts/schemas/project.schema.js";
import { VispError, toVispError } from "../core/errors.js";
import { pathExists } from "../core/file-system.js";
import { vispDir } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { buildDependencyMap } from "../scanner/dependency-map.js";
import { defaultIgnoredPaths } from "../scanner/ignore-rules.js";
import { loadIntelGraph } from "../scanner/intel-graph.js";
import { buildModuleMap } from "../scanner/module-map.js";
import { scanGit } from "../scanner/scan-git.js";
import { scanProject } from "../scanner/scan-project.js";
import { buildTestMap } from "../scanner/scan-tests.js";
import { buildFileSummaries } from "../scanner/summarize-project.js";
import { type ProjectDetection, type ScanCounts } from "../scanner/types.js";
import { patternsMarkdown, projectSummaryMarkdown, scanReportMarkdown } from "./scan/reports.js";
import { type ScanSummary } from "./scan/scan-summary.js";
import { ensureScanDirectories, plannedScanWrites, writeScanPlan } from "./scan/write-plan.js";

export type ScanWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly changed?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly now?: string;
};

const outputFiles = [
  ".visp/project.json",
  ".visp/cache/file-index.json",
  ".visp/cache/file-summaries.json",
  ".visp/cache/test-map.json",
  ".visp/cache/module-map.json",
  ".visp/cache/dependency-map.json",
  ".visp/cache/scan-meta.json",
  ".visp/cache/intel-scan.json",
  ".visp/memory/project-summary.md",
  ".visp/memory/patterns.md",
  ".visp/reports/scan-report.md"
] as const;

function projectName(targetPath: string, detection: ProjectDetection): string {
  return detection.packageJson?.name ?? path.basename(targetPath) ?? "project";
}

function updateProjectProfile(input: {
  readonly existing: ProjectProfile;
  readonly targetPath: string;
  readonly detection: ProjectDetection;
  readonly now: string;
}): ProjectProfile {
  return {
    ...input.existing,
    name: projectName(input.targetPath, input.detection),
    rootPath: input.targetPath,
    packageManager: input.detection.packageManager,
    languages: input.detection.languages.map((language) => language.name),
    frameworks: input.detection.frameworks.map((framework) => framework.name),
    testFrameworks: [...input.detection.testFrameworks],
    buildCommands: [...input.detection.buildCommands],
    testCommands: [...input.detection.testCommands],
    lintCommands: [...input.detection.lintCommands],
    typecheckCommands: [...input.detection.typecheckCommands],
    sourceRoots: [...input.detection.sourceRoots],
    testRoots: [...input.detection.testRoots],
    ignoredPaths: [...defaultIgnoredPaths],
    updatedAt: input.now
  };
}

function createSummary(input: {
  readonly targetPath: string;
  readonly options: Required<Pick<ScanWorkflowOptions, "changed" | "force" | "dryRun">>;
  readonly detection: ProjectDetection;
  readonly counts: ScanCounts;
  readonly warnings: readonly string[];
  readonly writtenFiles: readonly string[];
}): ScanSummary {
  return {
    success: true,
    targetPath: input.targetPath,
    dryRun: input.options.dryRun,
    changedMode: input.options.changed,
    force: input.options.force,
    packageManager: input.detection.packageManager,
    languages: input.detection.languages,
    frameworks: input.detection.frameworks,
    sourceRoots: input.detection.sourceRoots,
    testRoots: input.detection.testRoots,
    ...input.counts,
    writtenFiles: input.writtenFiles,
    warnings: input.warnings,
    nextCommand: "visp-kit constitution"
  };
}

export async function runScanWorkflow(
  options: ScanWorkflowOptions = {}
): Promise<Result<ScanSummary, VispError>> {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = path.resolve(cwd, options.targetPath ?? ".");
  const now = options.now ?? new Date().toISOString();
  const flags = {
    changed: options.changed ?? false,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false
  };
  const hasVisp = await pathExists(vispDir(targetPath));

  if (!hasVisp.ok) return hasVisp;
  if (!hasVisp.value) {
    return err(
      new VispError("VALIDATION_FAILED", "Visp Kit is not initialized. Run `visp-kit init` first.")
    );
  }

  const existingProject = await readArtifact(
    projectProfileArtifactPath(targetPath),
    projectProfileSchema,
    { artifactName: "project profile" }
  );

  if (!existingProject.ok) return existingProject;

  const previousCache = await pathExists(fileSummariesArtifactPath(targetPath));
  const warnings: string[] = [];

  if (flags.changed && previousCache.ok && !previousCache.value) {
    warnings.push("No previous scan cache found; performed a full scan.");
  }

  try {
    const scan = await scanProject({ rootPath: targetPath, scannedAt: now });
    const summaries = await buildFileSummaries({
      rootPath: targetPath,
      files: scan.files,
      generatedAt: now,
      force: flags.force
    });
    // Intel INFORMS. It supplies the repository model; scan still decides the
    // artifact and still produces one when intel has nothing to say.
    const intel = await loadIntelGraph(targetPath);

    warnings.push(...intel.warnings);

    const moduleMap = buildModuleMap({
      files: scan.files,
      summaries: summaries.cache.items,
      sourceRoots: scan.detection.sourceRoots,
      generatedAt: now,
      ...(intel.projection === undefined ? {} : { intel: intel.projection })
    });
    const testMap = buildTestMap({
      files: scan.files,
      testFrameworks: scan.detection.testFrameworks,
      testRoots: scan.detection.testRoots,
      testCommands: scan.detection.testCommands,
      generatedAt: now
    });
    const git = await scanGit(targetPath);

    if (git.warning !== null) warnings.push(git.warning);

    const updatedProject = updateProjectProfile({
      existing: existingProject.value,
      targetPath,
      detection: scan.detection,
      now
    });
    const values = {
      project: updatedProject,
      fileIndex: { generatedAt: now, targetPath, files: scan.files },
      fileSummaries: summaries.cache,
      testMap,
      moduleMap,
      dependencyMap: buildDependencyMap(scan.detection, now),
      scanMeta: {
        generatedAt: now,
        targetPath,
        changedMode: flags.changed,
        force: flags.force,
        counts: summaries.counts,
        deletedFiles: summaries.deletedFiles,
        changedFiles: summaries.changedFilePaths,
        lockFiles: scan.detection.lockFiles,
        git
      },
      // Recorded so the understanding gate can match a case on repository
      // INSTANCE rather than on the directory it happens to be mounted at. A
      // re-clone or a sibling worktree at the same path is a different instance
      // and must not inherit another instance's case.
      //
      // In its OWN file, not on `scanMeta`. The reason is unchanged and still
      // good; the home was wrong. `.visp/cache/scan-meta.json` is a pre-existing
      // artifact whose shape P21-KIT-01 promised not to change, and it is the
      // one scan artifact with no schema, so nothing in Kit could check that the
      // added key stayed compatible. Written on every scan, `store: null`
      // included, so a scan that finds no store overwrites the instance id a
      // previous scan recorded.
      intelScan: {
        generatedAt: now,
        store:
          intel.projection === undefined
            ? null
            : {
                repositoryInstanceId: intel.projection.repositoryInstanceId,
                headSnapshotId: intel.projection.headSnapshotId,
                indexedFileCount: intel.projection.filePaths.length
              }
      },
      projectSummary: projectSummaryMarkdown({
        detection: scan.detection,
        moduleMap
      }),
      patterns: patternsMarkdown(scan.detection),
      scanReport: scanReportMarkdown({
        scannedAt: now,
        targetPath,
        detection: scan.detection,
        counts: summaries.counts,
        warnings
      })
    };
    const writes = plannedScanWrites(targetPath, values);
    const directoryResult = flags.dryRun ? ok(undefined) : await ensureScanDirectories(targetPath);

    if (!directoryResult.ok) return directoryResult;

    if (!flags.dryRun) {
      const writeResult = await writeScanPlan(writes);
      if (!writeResult.ok) return writeResult;
    }

    return ok(
      createSummary({
        targetPath,
        options: flags,
        detection: scan.detection,
        counts: summaries.counts,
        warnings,
        writtenFiles: writes.map((write) => write.displayPath)
      })
    );
  } catch (error) {
    return err(toVispError(error));
  }
}

export const scanOutputFiles = outputFiles;
