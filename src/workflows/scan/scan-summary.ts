import { formatHeader, formatKeyValue } from "../../theme/terminal.js";
import {
  type FrameworkDetection,
  type LanguageStat,
  type ScanCounts
} from "../../scanner/types.js";

export type ScanSummary = ScanCounts & {
  readonly success: true;
  readonly targetPath: string;
  readonly dryRun: boolean;
  readonly changedMode: boolean;
  readonly force: boolean;
  readonly packageManager: string;
  readonly languages: readonly LanguageStat[];
  readonly frameworks: readonly FrameworkDetection[];
  readonly sourceRoots: readonly string[];
  readonly testRoots: readonly string[];
  readonly writtenFiles: readonly string[];
  readonly warnings: readonly string[];
  readonly nextCommand: "visp constitution";
};

function names(values: readonly { readonly name: string }[]): string {
  return values.length === 0 ? "None detected" : values.map((value) => value.name).join(", ");
}

export function formatScanSummary(summary: ScanSummary): string {
  const lines = [
    formatHeader(summary.dryRun ? "Visp scan dry run." : "Visp scan complete."),
    "",
    formatKeyValue("Target", summary.targetPath),
    formatKeyValue("Package manager", summary.packageManager),
    formatKeyValue("Languages", names(summary.languages)),
    formatKeyValue("Frameworks", names(summary.frameworks)),
    "",
    formatKeyValue("Files indexed", String(summary.totalFiles)),
    formatKeyValue("Files summarized", String(summary.summarizedFiles)),
    formatKeyValue("Reused summaries", String(summary.reusedSummaries)),
    formatKeyValue("Skipped", String(summary.skippedFiles)),
    ""
  ];

  if (summary.writtenFiles.length > 0) {
    lines.push("Updated:", ...summary.writtenFiles.map((file) => `  ${file}`), "");
  }

  if (summary.warnings.length > 0) {
    lines.push("Warnings:", ...summary.warnings.map((warning) => `  ${warning}`), "");
  }

  lines.push("Next:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
