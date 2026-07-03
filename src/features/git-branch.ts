import { VispError } from "../core/errors.js";
import { defaultCommandRunner, type CommandRunner } from "../core/command-runner.js";
import { err, ok, type Result } from "../core/result.js";

export type FeatureBranchSummary = {
  readonly requested: boolean;
  readonly created: boolean;
  readonly name: string | null;
};

export type CreateFeatureBranchInput = {
  readonly targetPath: string;
  readonly branchName: string;
  readonly force: boolean;
  readonly commandRunner?: CommandRunner;
};

export type CreateFeatureBranchResult = {
  readonly branch: FeatureBranchSummary;
  readonly warnings: readonly string[];
};

export function defaultFeatureBranchName(id: string, slug: string): string {
  return `visp/${id}-${slug}`;
}

export async function createFeatureBranch(
  input: CreateFeatureBranchInput
): Promise<Result<CreateFeatureBranchResult, VispError>> {
  const commandRunner = input.commandRunner ?? defaultCommandRunner;
  const warnings: string[] = [];
  const branch = {
    requested: true,
    created: false,
    name: input.branchName
  };

  const insideRepo = await commandRunner.run("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: input.targetPath
  });

  if (!insideRepo.ok || insideRepo.value.stdout.trim() !== "true") {
    return ok({
      branch,
      warnings: ["Target is not inside a Git repository; skipped branch creation."]
    });
  }

  const validName = await commandRunner.run(
    "git",
    ["check-ref-format", "--branch", input.branchName],
    { cwd: input.targetPath }
  );

  if (!validName.ok) {
    return err(new VispError("VALIDATION_FAILED", `Invalid Git branch name: ${input.branchName}.`));
  }

  const status = await commandRunner.run("git", ["status", "--porcelain"], {
    cwd: input.targetPath
  });

  if (status.ok && status.value.stdout.trim().length > 0) {
    warnings.push("Working tree has uncommitted changes; creating the feature branch anyway.");
  }

  const existing = await commandRunner.run(
    "git",
    ["rev-parse", "--verify", "--quiet", `refs/heads/${input.branchName}`],
    { cwd: input.targetPath }
  );

  if (existing.ok) {
    if (!input.force) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Git branch already exists: ${input.branchName}. Use --force to switch to it.`
        )
      );
    }

    const switched = await commandRunner.run("git", ["switch", input.branchName], {
      cwd: input.targetPath
    });

    if (!switched.ok) return switched;

    return ok({
      branch,
      warnings: [
        ...warnings,
        "Git branch already exists; switched to it because --force was provided."
      ]
    });
  }

  const created = await commandRunner.run("git", ["switch", "-c", input.branchName], {
    cwd: input.targetPath
  });

  if (!created.ok) return created;

  return ok({
    branch: { ...branch, created: true },
    warnings
  });
}
