import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fileSwap = vi.hoisted(() => ({
  path: null as string | null,
  target: null as string | null,
  reads: 0
}));

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();

  return {
    ...original,
    constants: {
      ...original.constants,
      O_NOFOLLOW: undefined
    }
  };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();

  return {
    ...original,
    async open(
      filePath: Parameters<typeof original.open>[0],
      flags: Parameters<typeof original.open>[1],
      mode?: Parameters<typeof original.open>[2]
    ) {
      if (String(filePath) === fileSwap.path && fileSwap.target !== null) {
        await original.rm(filePath);
        await original.symlink(fileSwap.target, filePath);
      }

      const handle = await original.open(filePath, flags, mode);
      return new Proxy(handle, {
        get(target, property) {
          const value = Reflect.get(target, property, target);
          if (property === "read" && typeof value === "function") {
            return (...args: unknown[]) => {
              fileSwap.reads += 1;
              return Reflect.apply(value, target, args);
            };
          }

          return typeof value === "function" ? value.bind(target) : value;
        }
      });
    }
  };
});

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
        stdout = `M\0${filePath}\0`;
      } else if (joined.includes("--numstat")) {
        stdout = `10\t2\t${filePath}\0`;
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

function trackedRunner(input: {
  readonly paths?: readonly string[];
  readonly nameStatus?: string;
  readonly numstat?: string;
  readonly calls?: Array<readonly string[]>;
}): CommandRunner {
  const paths = input.paths ?? [];

  return {
    async run(command, args = [], options) {
      input.calls?.push(args);
      const joined = args.join(" ");
      const stdout =
        joined === "rev-parse --is-inside-work-tree"
          ? "true\n"
          : joined === "ls-files --others --exclude-standard -z --"
            ? ""
            : joined.includes("--name-status")
              ? (input.nameStatus ?? paths.map((filePath) => `M\0${filePath}\0`).join(""))
              : joined.includes("--numstat")
                ? (input.numstat ?? paths.map((filePath) => `1\t0\t${filePath}\0`).join(""))
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

function emptyTrackedRunner(input: {
  readonly untracked: readonly string[];
  readonly calls?: Array<readonly string[]>;
}): CommandRunner {
  return {
    async run(command, args = [], options) {
      input.calls?.push(args);
      const stdout =
        args.join(" ") === "rev-parse --is-inside-work-tree"
          ? "true\n"
          : args.join(" ") === "ls-files --others --exclude-standard -z --"
            ? `${input.untracked.join("\0")}\0`
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

describe("diff loader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-diff-loader-"));
  });

  afterEach(async () => {
    fileSwap.path = null;
    fileSwap.target = null;
    fileSwap.reads = 0;
    await rm(tempDir, { recursive: true, force: true });
  });

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

  it.each([
    {
      label: "default",
      options: {},
      expectedNameArgs: ["diff", "--name-status", "-z", "--"]
    },
    {
      label: "staged",
      options: { staged: true },
      expectedNameArgs: ["diff", "--cached", "--name-status", "-z", "--"]
    },
    {
      label: "unstaged",
      options: { unstaged: true },
      expectedNameArgs: ["diff", "--name-status", "-z", "--"]
    },
    {
      label: "both",
      options: { staged: true, unstaged: true },
      expectedNameArgs: ["diff", "--cached", "--name-status", "-z", "--"]
    },
    {
      label: "base",
      options: { base: "main" },
      expectedNameArgs: ["diff", "main...HEAD", "--name-status", "-z", "--"]
    }
  ])("preserves NUL-delimited raw tracked identities in $label mode", async (input) => {
    const paths = [
      " src/notes.ts",
      "src/notes.ts ",
      "src\\notes.ts",
      "src/tab\tname.ts",
      "src/line\nname.ts",
      "src/control\u0001name.ts",
      " .visp/state/implement-allowed.json",
      ".visp\\state\\implement-allowed\\T001.json"
    ];
    const calls: Array<readonly string[]> = [];
    const result = await loadGitDiff({
      targetPath: "/workspace/project",
      ...input.options,
      commandRunner: trackedRunner({ paths, calls })
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.files.map((file) => file.path)).toEqual([...paths].sort());
    expect(result.value.files.every((file) => !file.isGeneratedVispFile)).toBe(true);
    expect(calls).toContainEqual(input.expectedNameArgs);
    expect(calls).toContainEqual([...input.expectedNameArgs.slice(0, -3), "--numstat", "-z", "--"]);
  });

  it("parses NUL-delimited rename and copy records using destination identities", async () => {
    const result = await loadGitDiff({
      targetPath: "/workspace/project",
      staged: true,
      commandRunner: trackedRunner({
        nameStatus: "R100\0old name.ts\0new\nname.ts\0C100\0source.ts\0copy\tname.ts\0",
        numstat: [
          "1\t2\t",
          "old name.ts",
          "new\nname.ts",
          "3\t4\t",
          "source.ts",
          "copy\tname.ts",
          ""
        ].join("\0")
      })
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.files).toMatchObject([
      { path: "copy\tname.ts", changeType: "copied", additions: 3, deletions: 4 },
      { path: "new\nname.ts", changeType: "renamed", additions: 1, deletions: 2 }
    ]);
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

  it.each([
    { label: "default", options: {}, expectedSource: "unstaged+staged+untracked" },
    { label: "unstaged", options: { unstaged: true }, expectedSource: "unstaged+untracked" },
    {
      label: "both flags",
      options: { staged: true, unstaged: true },
      expectedSource: "unstaged+staged+untracked"
    }
  ])("includes untracked files once in $label mode", async ({ options, expectedSource }) => {
    await writeFile(path.join(tempDir, "new.ts"), "export const value = 1;\n", "utf8");
    const calls: Array<readonly string[]> = [];
    const result = await loadGitDiff({
      targetPath: tempDir,
      ...options,
      commandRunner: emptyTrackedRunner({ untracked: ["new.ts"], calls })
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.diffSource).toBe(expectedSource);
    expect(result.value.files.map((file) => file.path)).toEqual(["new.ts"]);
    expect(
      calls.filter((args) => args.join(" ") === "ls-files --others --exclude-standard -z --")
    ).toHaveLength(1);
  });

  it.each([
    { label: "staged", options: { staged: true }, expectedSource: "staged" },
    { label: "base", options: { base: "main" }, expectedSource: "base:main" }
  ])("excludes untracked files in $label mode", async ({ options, expectedSource }) => {
    await writeFile(path.join(tempDir, "new.ts"), "export const value = 1;\n", "utf8");
    const calls: Array<readonly string[]> = [];
    const result = await loadGitDiff({
      targetPath: tempDir,
      ...options,
      commandRunner: emptyTrackedRunner({ untracked: ["new.ts"], calls })
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.diffSource).toBe(expectedSource);
    expect(result.value.files).toEqual([]);
    expect(
      calls.some((args) => args.join(" ") === "ls-files --others --exclude-standard -z --")
    ).toBe(false);
  });

  it("represents untracked text, binary, empty, and dangling symlink files", async () => {
    await writeFile(path.join(tempDir, "text.ts"), "first\nsecond\n", "utf8");
    await writeFile(path.join(tempDir, "binary.bin"), Buffer.from([0, 1, 2, 3]));
    await writeFile(path.join(tempDir, "empty.txt"), "", "utf8");
    await symlink("missing-target.txt", path.join(tempDir, "link.txt"));

    const result = await loadGitDiff({
      targetPath: tempDir,
      unstaged: true,
      commandRunner: emptyTrackedRunner({
        untracked: ["text.ts", "binary.bin", "empty.txt", "link.txt"]
      })
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const byPath = new Map(result.value.files.map((file) => [file.path, file]));
    expect(byPath.get("text.ts")).toMatchObject({
      changeType: "added",
      additions: 2,
      deletions: 0,
      isBinary: false
    });
    expect(byPath.get("text.ts")?.diff).toContain("+first\n+second");
    expect(byPath.get("binary.bin")).toMatchObject({
      changeType: "added",
      additions: 0,
      deletions: 0,
      isBinary: true
    });
    expect(byPath.get("empty.txt")).toMatchObject({
      changeType: "added",
      additions: 0,
      deletions: 0,
      isBinary: false,
      diffTruncated: false
    });
    expect(byPath.get("link.txt")).toMatchObject({
      changeType: "added",
      additions: 1,
      deletions: 0,
      isBinary: false
    });
    expect(byPath.get("link.txt")?.diff).toContain("new file mode 120000");
    expect(byPath.get("link.txt")?.diff).toContain("+missing-target.txt");
  });

  it("treats invalid UTF-8 without NUL bytes as binary", async () => {
    await writeFile(path.join(tempDir, "invalid.bin"), Buffer.from([0xff, 0xfe, 0x41]));

    const result = await loadGitDiff({
      targetPath: tempDir,
      unstaged: true,
      commandRunner: emptyTrackedRunner({ untracked: ["invalid.bin"] })
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.files[0]).toMatchObject({
      path: "invalid.bin",
      isBinary: true,
      additions: 0,
      deletions: 0
    });
  });

  it("keeps valid UTF-8 text when a bounded sample ends inside a multibyte character", async () => {
    await writeFile(path.join(tempDir, "unicode.txt"), `prefix\n${"€".repeat(100)}`, "utf8");

    const result = await loadGitDiff({
      targetPath: tempDir,
      unstaged: true,
      commandRunner: emptyTrackedRunner({ untracked: ["unicode.txt"] }),
      maxDiffCharsPerFile: 79,
      maxTotalDiffChars: 79
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.files[0]).toMatchObject({
      path: "unicode.txt",
      isBinary: false,
      diffTruncated: true
    });
  });

  it("bounds untracked reads and participates in deterministic diff budgets", async () => {
    await writeFile(path.join(tempDir, "large.txt"), `${"first-line\n".repeat(100)}unread-tail`);

    const result = await loadGitDiff({
      targetPath: tempDir,
      unstaged: true,
      commandRunner: emptyTrackedRunner({ untracked: ["large.txt"] }),
      maxDiffCharsPerFile: 80,
      maxTotalDiffChars: 80
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.files[0]?.diff).toHaveLength(80);
    expect(result.value.files[0]?.diffTruncated).toBe(true);
    expect(result.value.files[0]?.diff).not.toContain("unread-tail");
  });

  it("returns a typed fatal error when an enumerated path races or cannot be read", async () => {
    const result = await loadGitDiff({
      targetPath: tempDir,
      unstaged: true,
      commandRunner: emptyTrackedRunner({ untracked: ["disappeared.ts"] })
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.error.message).toContain("disappeared.ts");
  });

  it("rejects a regular-file to symlink swap before reading when O_NOFOLLOW is unavailable", async () => {
    const racedPath = path.join(tempDir, "raced.txt");
    const targetPath = path.join(tempDir, "target.txt");
    await writeFile(racedPath, "safe\n", "utf8");
    await writeFile(targetPath, "secret\n", "utf8");
    fileSwap.path = racedPath;
    fileSwap.target = targetPath;

    const result = await loadGitDiff({
      targetPath: tempDir,
      unstaged: true,
      commandRunner: emptyTrackedRunner({ untracked: ["raced.txt"] })
    });

    expect(result.ok).toBe(false);
    expect(fileSwap.reads).toBe(0);
    if (result.ok) return;

    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.error.message).toContain("raced.txt");
  });
});
