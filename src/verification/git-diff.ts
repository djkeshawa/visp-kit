import { defaultCommandRunner, type CommandRunner } from "../core/command-runner.js";

export type GitDiffResult = {
  readonly changedFiles: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

function parseFiles(stdout: string): readonly string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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
    args: ["diff", "--name-only"],
    runner
  });
  const staged = await diffNames({
    targetPath: input.targetPath,
    args: ["diff", "--cached", "--name-only"],
    runner
  });

  return {
    changedFiles: [...new Set([...unstaged.changedFiles, ...staged.changedFiles])].sort(),
    warnings: [...unstaged.warnings, ...staged.warnings],
    errors: [...unstaged.errors, ...staged.errors]
  };
}
