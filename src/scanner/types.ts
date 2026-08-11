import { type PackageManager } from "../artifacts/schemas/common.schema.js";

export type PackageJsonInfo = {
  readonly path: string;
  readonly name?: string;
  readonly version?: string;
  readonly type?: string;
  readonly packageManager?: string;
  readonly scripts: Record<string, string>;
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
  readonly peerDependencies: Record<string, string>;
  readonly optionalDependencies: Record<string, string>;
};

export type FrameworkDetection = {
  readonly name: string;
  readonly dependencyName: string;
  readonly section: string;
};

export type LanguageStat = {
  readonly name: string;
  readonly fileCount: number;
  readonly percentage: number;
};

export type FileIndexEntry = {
  readonly path: string;
  readonly extension: string;
  readonly sizeBytes: number;
  readonly hash: string;
  readonly language: string;
  readonly isTestFile: boolean;
  readonly isConfigFile: boolean;
  /**
   * A text file in a language scan can parse — TypeScript, JavaScript, CSS,
   * HTML, JSON, Markdown, Java, Kotlin, Python, Go, Rust — and not a binary.
   *
   * NOT "is this code". Every `.md` file in this repository sets it. The
   * separate question is `isProgramFilePath` in `scanner/language.ts`, and the
   * two are kept apart deliberately: `codeSurface` requires both, which is what
   * B4 — the rule that stops a task choosing its own gate — is built on.
   */
  readonly isRecognisedTextFile: boolean;
  readonly lastScannedAt: string;
};

export type FileSummary = {
  readonly path: string;
  readonly hash: string;
  readonly language: string;
  readonly sizeBytes: number;
  readonly lineCount: number;
  readonly imports: readonly string[];
  readonly exports: readonly string[];
  readonly symbols: readonly string[];
  readonly comments: readonly string[];
  readonly summaryKind: "deterministic";
  readonly summarySkippedReason?: string;
};

export type FileSummariesCache = {
  readonly generatedAt: string;
  readonly items: readonly FileSummary[];
};

export type ProjectDetection = {
  readonly packageManager: PackageManager;
  readonly lockFiles: readonly string[];
  readonly packageJson?: PackageJsonInfo;
  readonly languages: readonly LanguageStat[];
  readonly frameworks: readonly FrameworkDetection[];
  readonly testFrameworks: readonly string[];
  readonly sourceRoots: readonly string[];
  readonly testRoots: readonly string[];
  readonly buildCommands: readonly string[];
  readonly testCommands: readonly string[];
  readonly lintCommands: readonly string[];
  readonly typecheckCommands: readonly string[];
};

export type ScanCounts = {
  readonly totalFiles: number;
  readonly summarizedFiles: number;
  readonly reusedSummaries: number;
  readonly skippedFiles: number;
  readonly changedFiles: number;
  readonly deletedFiles: number;
};
