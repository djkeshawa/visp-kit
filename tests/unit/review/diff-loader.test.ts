import { describe, expect, it } from "vitest";

import { type CommandRunner } from "../../../src/core/command-runner.js";
import { ok } from "../../../src/core/result.js";
import { loadGitDiff } from "../../../src/review/diff-loader.js";

function runnerForDiff(filePath = "src/notes.ts"): CommandRunner {
  return {
    async run(command, args, options) {
      const joined = (args ?? []).join(" ");
      let stdout = "";

      if (joined === "rev-parse --is-inside-work-tree") {
        stdout = "true\n";
      } else if (joined.includes("--name-status")) {
        stdout = `M\t${filePath}\n`;
      } else if (joined.includes("--numstat")) {
        stdout = `10\t2\t${filePath}\n`;
      } else {
        stdout = `diff --git a/${filePath} b/${filePath}\n+${"x".repeat(100)}`;
      }

      return ok({
        command,
        args: args ?? [],
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

describe("diff loader", () => {
  it("parses changed files from git output", async () => {
    const result = await loadGitDiff({
      targetPath: "/workspace/project",
      staged: true,
      commandRunner: runnerForDiff()
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.files[0]).toMatchObject({
        path: "src/notes.ts",
        changeType: "modified",
        additions: 10,
        deletions: 2
      });
    }
  });

  it("marks truncated diffs", async () => {
    const result = await loadGitDiff({
      targetPath: "/workspace/project",
      staged: true,
      commandRunner: runnerForDiff(),
      maxDiffCharsPerFile: 20,
      maxTotalDiffChars: 20
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.files[0]?.diffTruncated).toBe(true);
      expect(result.value.files[0]?.diff.length).toBe(20);
    }
  });

  it("marks generated reconcile files", async () => {
    const result = await loadGitDiff({
      targetPath: "/workspace/project",
      staged: true,
      commandRunner: runnerForDiff(
        ".visp/features/001-add-note-pinning/reconcile/T001.reconcile.md"
      )
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.files[0]?.isGeneratedVispFile).toBe(true);
    }
  });

  it("marks generated scan cache files", async () => {
    const result = await loadGitDiff({
      targetPath: "/workspace/project",
      staged: true,
      commandRunner: runnerForDiff(".visp/cache/file-index.json")
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.files[0]?.isGeneratedVispFile).toBe(true);
    }
  });
});
