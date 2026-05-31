import {
  defaultCommandRunner,
  type CommandRunner
} from "../core/command-runner.js";

export type GitScanInfo = {
  readonly isGitRepository: boolean;
  readonly branch: string | null;
  readonly hasChanges: boolean;
  readonly changedFiles: readonly string[];
  readonly lastCommitHash: string | null;
  readonly warning: string | null;
};

async function gitOutput(
  runner: CommandRunner,
  cwd: string,
  args: readonly string[]
): Promise<string | undefined> {
  const result = await runner.run("git", args, { cwd, timeoutMs: 3000 });

  return result.ok ? result.value.stdout.trim() : undefined;
}

export async function scanGit(
  rootPath: string,
  runner: CommandRunner = defaultCommandRunner
): Promise<GitScanInfo> {
  const inside = await gitOutput(runner, rootPath, ["rev-parse", "--is-inside-work-tree"]);

  if (inside !== "true") {
    return {
      isGitRepository: false,
      branch: null,
      hasChanges: false,
      changedFiles: [],
      lastCommitHash: null,
      warning: "Git metadata unavailable or target is not a git repository."
    };
  }

  const status = await gitOutput(runner, rootPath, ["status", "--porcelain"]);
  const changedFiles =
    status === undefined || status.length === 0
      ? []
      : status.split(/\r?\n/).map((line) => line.slice(3).trim());

  return {
    isGitRepository: true,
    branch: (await gitOutput(runner, rootPath, ["branch", "--show-current"])) ?? null,
    hasChanges: changedFiles.length > 0,
    changedFiles,
    lastCommitHash: (await gitOutput(runner, rootPath, ["rev-parse", "HEAD"])) ?? null,
    warning: null
  };
}
