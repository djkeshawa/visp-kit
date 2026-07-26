import { describe, expect, it } from "vitest";

import { type CommandRunner } from "../../../src/core/command-runner.js";
import { VispError } from "../../../src/core/errors.js";
import { err, ok } from "../../../src/core/result.js";
import { validateDependencies } from "../../../src/verification/dependency-validator.js";
import { getGitChangedFiles } from "../../../src/verification/git-diff.js";
import { validateScope } from "../../../src/verification/scope-validator.js";
import { validTaskGraph } from "../artifacts/fixtures.js";

function gitRunner(
  input: {
    readonly failUntracked?: boolean;
    readonly stagedFiles?: readonly string[];
    readonly unstagedFiles?: readonly string[];
    readonly untrackedFiles?: readonly string[];
    readonly committedFiles?: readonly string[];
    readonly calls?: Array<readonly string[]>;
  } = {}
): CommandRunner {
  return {
    async run(command, args = [], options) {
      input.calls?.push(args);
      if (args.join(" ") === "ls-files --others --exclude-standard -z --") {
        if (input.failUntracked) {
          return err(new VispError("COMMAND_FAILED", "untracked enumeration failed"));
        }

        return ok({
          command,
          args,
          cwd: options?.cwd,
          exitCode: 0,
          signal: null,
          stdout: `${(
            input.untrackedFiles ?? [
              "src/new.ts",
              "package.json",
              "forbidden.ts",
              "outside.ts",
              "src/shared.ts"
            ]
          ).join("\0")}\0`,
          stderr: "",
          timedOut: false
        });
      }

      const joined = args.join(" ");
      const stdout =
        joined === "diff --name-only -z --"
          ? `${(input.unstagedFiles ?? ["src/shared.ts", "src/unstaged.ts"]).join("\0")}\0`
          : joined === "diff --cached --name-only -z --"
            ? `${(input.stagedFiles ?? ["src/staged.ts"]).join("\0")}\0`
            : joined.startsWith("diff --name-only -z ") && joined.includes("...HEAD")
              ? `${(input.committedFiles ?? []).join("\0")}\0`
              : "";

      return ok({
        command,
        args,
        cwd: options?.cwd,
        exitCode: 0,
        signal: null,
        stdout,
        stderr: "",
        timedOut: false
      });
    }
  };
}

describe("verification Git diff base revision", () => {
  const committedOnly = {
    unstagedFiles: [],
    stagedFiles: [],
    untrackedFiles: [],
    committedFiles: ["src/billing.ts"]
  };

  it("cannot see a committed change without a base revision", async () => {
    const result = await getGitChangedFiles({
      targetPath: "/tmp/project",
      commandRunner: gitRunner(committedOnly)
    });

    // This is the hole: `git commit` moves the change out of the working tree,
    // so scope validation stops seeing it entirely.
    expect(result.changedFiles).toEqual([]);
  });

  it("sees a committed change when a base revision is supplied", async () => {
    const result = await getGitChangedFiles({
      targetPath: "/tmp/project",
      base: "origin/main",
      commandRunner: gitRunner(committedOnly)
    });

    expect(result.changedFiles).toEqual(["src/billing.ts"]);
  });

  it("flags a committed out-of-scope file once the base revision is compared", async () => {
    const calls: Array<readonly string[]> = [];
    const changed = await getGitChangedFiles({
      targetPath: "/tmp/project",
      base: "origin/main",
      commandRunner: gitRunner({ ...committedOnly, calls })
    });
    const scope = validateScope({
      changedFiles: changed.changedFiles,
      task: validTaskGraph.tasks[0],
      taskGraph: validTaskGraph,
      explicit: true,
      gitWarnings: changed.warnings
    });

    expect(scope.status).toBe("failed");
    expect(scope.outOfScopeFiles).toContain("src/billing.ts");
    expect(calls.some((args) => args.join(" ").includes("origin/main...HEAD"))).toBe(true);
  });
});

describe("verification Git diff", () => {
  it("unions untracked source, dependency, forbidden, and out-of-scope paths", async () => {
    const git = await getGitChangedFiles({
      targetPath: "/workspace/project",
      commandRunner: gitRunner()
    });

    expect(git.changedFiles).toEqual([
      "forbidden.ts",
      "outside.ts",
      "package.json",
      "src/new.ts",
      "src/shared.ts",
      "src/staged.ts",
      "src/unstaged.ts"
    ]);

    const task = {
      ...validTaskGraph.tasks[0]!,
      allowedFiles: ["src/new.ts", "src/shared.ts", "src/staged.ts", "src/unstaged.ts"],
      expectedFiles: [],
      forbiddenFiles: ["forbidden.ts"]
    };
    const scope = validateScope({
      changedFiles: git.changedFiles,
      task,
      explicit: true,
      gitWarnings: git.warnings
    });
    const dependencies = validateDependencies({ changedFiles: git.changedFiles, task });

    expect(scope.forbiddenChangedFiles).toEqual(["forbidden.ts"]);
    expect(scope.outOfScopeFiles).toEqual(["forbidden.ts", "outside.ts", "package.json"]);
    expect(dependencies.changedDependencyFiles).toEqual(["package.json"]);
    expect(dependencies.status).toBe("failed");
  });

  it("preserves an untracked enumeration warning for explicit scope promotion", async () => {
    const git = await getGitChangedFiles({
      targetPath: "/workspace/project",
      commandRunner: gitRunner({ failUntracked: true })
    });

    expect(git.changedFiles).toEqual(["src/shared.ts", "src/staged.ts", "src/unstaged.ts"]);
    expect(git.warnings).toEqual([
      "Git untracked file enumeration failed: untracked enumeration failed"
    ]);

    const scope = validateScope({
      changedFiles: git.changedFiles,
      task: validTaskGraph.tasks[0],
      explicit: true,
      gitWarnings: git.warnings
    });

    expect(scope.errors).toContain(
      "Git untracked file enumeration failed: untracked enumeration failed"
    );
  });

  it("preserves staged and unstaged raw tracked identities for explicit scope", async () => {
    const stagedFiles = [
      " src/notes/sort.ts",
      "src/notes/sort.ts ",
      "src\\notes\\sort.ts",
      " .visp/state/implement-allowed.json"
    ];
    const unstagedFiles = [
      "src/notes/tab\tname.ts",
      "src/notes/line\nname.ts",
      "src/notes/control\u0001name.ts",
      ".visp\\state\\implement-allowed\\T001.json"
    ];
    const calls: Array<readonly string[]> = [];
    const git = await getGitChangedFiles({
      targetPath: "/workspace/project",
      commandRunner: gitRunner({ stagedFiles, unstagedFiles, untrackedFiles: [], calls })
    });

    expect(git.changedFiles).toEqual([...stagedFiles, ...unstagedFiles].sort());
    expect(calls).toContainEqual(["diff", "--name-only", "-z", "--"]);
    expect(calls).toContainEqual(["diff", "--cached", "--name-only", "-z", "--"]);

    const scope = validateScope({
      changedFiles: git.changedFiles,
      task: validTaskGraph.tasks[0],
      explicit: true,
      gitWarnings: git.warnings
    });

    expect(scope.changedFiles).toEqual([...stagedFiles, ...unstagedFiles].sort());
    expect(scope.outOfScopeFiles).toEqual([...stagedFiles, ...unstagedFiles].sort());
    expect(scope.status).toBe("failed");
  });
});
