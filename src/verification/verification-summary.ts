import {
  type CodeEvidenceState,
  type VerificationCommandRunner,
  type VerificationMode
} from "../artifacts/schemas/verification.schema.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";

export type VerifySummary = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly feature: {
    readonly id: string;
    readonly slug: string;
  };
  readonly taskId: string | null;
  readonly mode: VerificationMode;
  readonly summary: {
    readonly artifacts: string;
    readonly traceability: string;
    readonly commands: string;
    readonly scope: string;
    readonly dependencies: string;
  };
  /** Did anything execute over the produced code? See `code-evidence.ts`. */
  readonly codeEvidence: {
    readonly evidence: CodeEvidenceState;
    readonly executedCommands: number;
    readonly passedCommands: number;
    readonly changedCodeFiles: number;
    readonly assertedCriteria: readonly string[];
  };
  readonly commands: readonly {
    readonly command: string;
    readonly exitCode: number | null;
    readonly success: boolean;
    readonly durationMs: number;
    readonly skipped: boolean;
    readonly skipReason: string | null;
    readonly runner?: VerificationCommandRunner;
  }[];
  readonly reportPath: string | null;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly nextCommand: string;
  readonly dryRun: boolean;
};

/**
 * One line, in plain words, for the question the old summary never answered.
 *
 * "Commands: skipped" is a status token; a reader skims past it. "no — nothing
 * ran over the 7 changed file(s)" is a sentence they cannot misread.
 */
function codeEvidenceLine(summary: VerifySummary): string {
  const evidence = summary.codeEvidence;

  if (evidence.evidence === "executed") {
    return (
      `yes — ${evidence.passedCommands}/${evidence.executedCommands} check(s) passed over ` +
      `${evidence.changedCodeFiles} changed code file(s)`
    );
  }

  if (evidence.evidence === "refused") {
    return `no — nothing ran over the ${evidence.changedCodeFiles} changed code file(s)`;
  }

  return "no — command execution was skipped, so this run says nothing about behaviour";
}

export function formatVerifySummary(summary: VerifySummary): string {
  const lines = [
    formatHeader(summary.success ? "Visp verification complete." : "Visp verification failed."),
    "",
    formatKeyValue("Feature", `${summary.feature.id}-${summary.feature.slug}`),
    formatKeyValue("Task", summary.taskId ?? "feature-level"),
    formatKeyValue("Mode", summary.mode),
    formatKeyValue("Result", summary.success ? "passed" : "failed"),
    "",
    "Checks:",
    `  Artifacts: ${summary.summary.artifacts}`,
    `  Traceability: ${summary.summary.traceability}`,
    `  Commands: ${summary.summary.commands}`,
    `  Scope: ${summary.summary.scope}`,
    `  Dependencies: ${summary.summary.dependencies}`,
    "",
    formatKeyValue("Code examined", codeEvidenceLine(summary))
  ];

  if (summary.reportPath !== null) {
    lines.push("", "Report:", `  ${summary.reportPath}`);
  }

  if (summary.dryRun && summary.commands.length > 0) {
    lines.push("", "Would run:", ...summary.commands.map((command) => `  ${command.command}`));
  }

  if (summary.errors.length > 0) {
    lines.push("", "Failed:", ...summary.errors.map((error) => `  ${error}`));
  }

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  lines.push("", "Next:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
