import {
  type FrameworkDetection,
  type LanguageStat,
  type ProjectDetection,
  type ScanCounts
} from "../../scanner/types.js";
import { type ModuleMap } from "../../scanner/module-map.js";

function names(values: readonly string[]): string {
  return values.length === 0 ? "None detected" : values.join(", ");
}

function languageText(languages: readonly LanguageStat[]): string {
  return languages.length === 0
    ? "None detected"
    : languages
        .map((language) => `${language.name} (${language.fileCount})`)
        .join(", ");
}

function frameworkText(frameworks: readonly FrameworkDetection[]): string {
  return frameworks.length === 0
    ? "None detected"
    : frameworks
        .map((framework) => `${framework.name} via ${framework.dependencyName}`)
        .join(", ");
}

export function projectSummaryMarkdown(input: {
  readonly detection: ProjectDetection;
  readonly moduleMap: ModuleMap;
}): string {
  const modules = input.moduleMap.modules
    .slice(0, 12)
    .map((module) => `- ${module.name}: ${module.files.length} files`)
    .join("\n");

  return `# Project Summary

Generated deterministically by \`visp scan\`.

- Package manager: ${input.detection.packageManager}
- Project name: ${input.detection.packageJson?.name ?? "Unknown"}
- Languages: ${languageText(input.detection.languages)}
- Frameworks: ${frameworkText(input.detection.frameworks)}
- Source roots: ${names(input.detection.sourceRoots)}
- Test roots: ${names(input.detection.testRoots)}
- Build commands: ${names(input.detection.buildCommands)}
- Test commands: ${names(input.detection.testCommands)}

## Modules

${modules.length > 0 ? modules : "- No modules detected yet."}
`;
}

export function patternsMarkdown(detection: ProjectDetection): string {
  return `# Project Patterns

Generated deterministically by \`visp scan\`.

- Project type: ${frameworkText(detection.frameworks)}
- Likely test framework: ${names(detection.testFrameworks)}
- Source roots: ${names(detection.sourceRoots)}
- Test roots: ${names(detection.testRoots)}
- Build tooling: ${frameworkText(
    detection.frameworks.filter((framework) =>
      ["vite", "tsup", "webpack", "rollup", "typescript"].includes(framework.name)
    )
  )}
`;
}

export function scanReportMarkdown(input: {
  readonly scannedAt: string;
  readonly targetPath: string;
  readonly detection: ProjectDetection;
  readonly counts: ScanCounts;
  readonly warnings: readonly string[];
}): string {
  return `# Scan Report

- Scan time: ${input.scannedAt}
- Target path: ${input.targetPath}
- Package manager: ${input.detection.packageManager}
- Languages: ${languageText(input.detection.languages)}
- Frameworks: ${frameworkText(input.detection.frameworks)}
- Source roots: ${names(input.detection.sourceRoots)}
- Test roots: ${names(input.detection.testRoots)}
- Build commands: ${names(input.detection.buildCommands)}
- Test commands: ${names(input.detection.testCommands)}
- Files indexed: ${input.counts.totalFiles}
- Files summarized: ${input.counts.summarizedFiles}
- Files skipped: ${input.counts.skippedFiles}
- Reused summaries: ${input.counts.reusedSummaries}
- Changed files: ${input.counts.changedFiles}
- Deleted files: ${input.counts.deletedFiles}
- Warnings: ${input.warnings.length === 0 ? "None" : input.warnings.join("; ")}

Next suggested command: \`visp constitution\`
`;
}
