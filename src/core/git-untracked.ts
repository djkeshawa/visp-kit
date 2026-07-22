import { defaultCommandRunner, type CommandRunner } from "./command-runner.js";
import { type VispError } from "./errors.js";
import { ok, type Result } from "./result.js";

export async function listGitUntrackedFiles(input: {
  readonly targetPath: string;
  readonly commandRunner?: CommandRunner;
}): Promise<Result<readonly string[], VispError>> {
  const runner = input.commandRunner ?? defaultCommandRunner;
  const result = await runner.run(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z", "--"],
    { cwd: input.targetPath }
  );

  if (!result.ok) return result;

  return ok(
    [...new Set(result.value.stdout.split("\0").filter((filePath) => filePath.length > 0))].sort()
  );
}
