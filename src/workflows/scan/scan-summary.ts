import { type IntelStoreAbsenceReason } from "../../artifacts/schemas/intel-scan.schema.js";
import { formatHeader, formatKeyValue } from "../../theme/terminal.js";
import {
  type FrameworkDetection,
  type LanguageStat,
  type ScanCounts
} from "../../scanner/types.js";

/** What scan found where an intel store would be, as the summary reports it. */
export type ScanIntelStore =
  | { readonly read: true; readonly indexedFileCount: number }
  | { readonly read: false; readonly absenceReason: IntelStoreAbsenceReason };

/**
 * One sentence per absence code, for the human reading a terminal.
 *
 * Keyed by the enumeration type, so adding a code without a sentence is a
 * compile error rather than a blank line in the output. The CODE is the datum —
 * these sentences are presentation and nothing parses them.
 */
const intelStoreAbsenceDescriptions: Record<IntelStoreAbsenceReason, string> = {
  projection_path_unreadable: ".visp-intel/projection/graph.json could not be accessed",
  intel_absent:
    "this project has no .visp-intel/ store; run `visp-intel repo projection` to add one",
  projection_missing_export_present:
    "only the archival .visp-intel/graph.json is present; run `visp-intel repo projection`",
  projection_above_read_limit: "the consumer projection is above Kit's read limit",
  projection_size_unreadable: "the consumer projection could not be sized",
  projection_unreadable: "the consumer projection could not be read as JSON",
  projection_shape_mismatch: "the consumer projection does not match intel's projection shape",
  projection_snapshot_not_head:
    "the consumer projection describes a snapshot that was not the repository head",
  projection_indexed_no_files: "the consumer projection indexed no files"
};

/**
 * Always printed, present or absent.
 *
 * Deliberately NOT folded into the warnings line: the common absence raises no
 * warning, so a scan that read no intel printed `Warnings: None` and said
 * nothing about intel at all. A line that appears only sometimes cannot be read
 * as an answer to "did intel inform this scan?".
 */
function intelStoreLine(store: ScanIntelStore): string {
  return store.read
    ? `read (${store.indexedFileCount} files indexed)`
    : `not read (${store.absenceReason}): ${intelStoreAbsenceDescriptions[store.absenceReason]}`;
}

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
  readonly intelStore: ScanIntelStore;
  readonly nextCommand: "visp-kit constitution";
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
    formatKeyValue("Intel store", intelStoreLine(summary.intelStore)),
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
