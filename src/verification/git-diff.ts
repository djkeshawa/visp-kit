import { defaultCommandRunner, type CommandRunner } from "../core/command-runner.js";
import { listGitUntrackedFiles } from "../core/git-untracked.js";

export type GitDiffResult = {
  readonly changedFiles: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

function parseFiles(stdout: string): readonly string[] {
  return stdout.split("\0").filter((filePath) => filePath.length > 0);
}

async function diffNames(input: {
  readonly targetPath: string;
  readonly args: readonly string[];
  readonly runner: CommandRunner;
}): Promise<GitDiffResult> {
  const result = await input.runner.run("git", input.args, {
    cwd: input.targetPath
  });

  if (!result.ok) {
    return {
      changedFiles: [],
      warnings: [`Git diff failed: ${result.error.message}`],
      errors: []
    };
  }

  return {
    changedFiles: parseFiles(result.value.stdout),
    warnings: [],
    errors: []
  };
}

export async function getGitChangedFiles(input: {
  readonly targetPath: string;
  readonly commandRunner?: CommandRunner;
}): Promise<GitDiffResult> {
  const runner = input.commandRunner ?? defaultCommandRunner;
  const unstaged = await diffNames({
    targetPath: input.targetPath,
    args: ["diff", "--name-only", "-z", "--"],
    runner
  });
  const staged = await diffNames({
    targetPath: input.targetPath,
    args: ["diff", "--cached", "--name-only", "-z", "--"],
    runner
  });
  const untracked = await listGitUntrackedFiles({
    targetPath: input.targetPath,
    commandRunner: runner
  });

  return {
    changedFiles: [
      ...new Set([
        ...unstaged.changedFiles,
        ...staged.changedFiles,
        ...(untracked.ok ? untracked.value : [])
      ])
    ].sort(),
    warnings: [
      ...unstaged.warnings,
      ...staged.warnings,
      ...(untracked.ok ? [] : [`Git untracked file enumeration failed: ${untracked.error.message}`])
    ],
    errors: [...unstaged.errors, ...staged.errors]
  };
}
