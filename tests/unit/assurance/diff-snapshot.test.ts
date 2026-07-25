import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { assuranceChangeUnits, captureDiffSnapshot } from "../../../src/assurance/diff-snapshot.js";
import {
  createDiffSnapshotChangeUnitId,
  diffSnapshotSchema
} from "../../../src/artifacts/schemas/diff-snapshot.schema.js";
import { type CommandRunner } from "../../../src/core/command-runner.js";
import { ok } from "../../../src/core/result.js";
import { hashOracleValue } from "../../../src/oracle/oracle-authorization.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function git(root: string, args: string[]): Promise<string> {
  return (await execFileAsync("git", args, { cwd: root })).stdout;
}

async function repository(): Promise<{ root: string; base: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "visp-diff-snapshot-"));
  roots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "staged.ts"), "export const staged = 1;\n", "utf8");
  await writeFile(path.join(root, "src", "unstaged.ts"), "export const unstaged = 1;\n", "utf8");
  await writeFile(path.join(root, "src", "renamed.ts"), "export const renamed = 1;\n", "utf8");
  await writeFile(path.join(root, "src", "deleted.ts"), "export const deleted = 1;\n", "utf8");
  await writeFile(path.join(root, "src", "mode.sh"), "#!/bin/sh\nexit 0\n", "utf8");
  const binary = Buffer.alloc(1024, 7);
  binary[0] = 0;
  await writeFile(path.join(root, "src", "binary-old.bin"), binary);
  await git(root, ["init"]);
  await git(root, ["add", "."]);
  await git(root, [
    "-c",
    "user.name=Visp Test",
    "-c",
    "user.email=visp@example.test",
    "commit",
    "-m",
    "base"
  ]);
  return { root, base: (await git(root, ["rev-parse", "HEAD"])).trim() };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("captureDiffSnapshot", () => {
  it("captures staged, unstaged, untracked, CRLF, rename, delete, mode, binary, and empty changes", async () => {
    const { root, base } = await repository();
    await writeFile(path.join(root, "src", "staged.ts"), "export const staged = 2;\n", "utf8");
    await git(root, ["add", "src/staged.ts"]);
    await writeFile(path.join(root, "src", "unstaged.ts"), "export const unstaged = 2;\n", "utf8");
    await git(root, ["mv", "src/renamed.ts", "src/moved.ts"]);
    await rm(path.join(root, "src", "deleted.ts"));
    await chmod(path.join(root, "src", "mode.sh"), 0o755);
    await writeFile(path.join(root, "src", "crlf.ts"), "one\r\ntwo\r\n", "utf8");
    await writeFile(path.join(root, "src", "empty.ts"), "", "utf8");
    await writeFile(path.join(root, "src", "binary.bin"), Buffer.from([0, 1, 2, 3]));

    const result = await captureDiffSnapshot({
      targetPath: root,
      mode: "base_to_workspace",
      baseRevision: base
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(diffSnapshotSchema.parse(result.value)).toEqual(result.value);
    expect(result.value.changeUnits.some((unit) => unit.layer === "staged")).toBe(true);
    expect(result.value.changeUnits.some((unit) => unit.layer === "unstaged")).toBe(true);
    expect(result.value.changeUnits.some((unit) => unit.layer === "untracked")).toBe(true);
    expect(
      result.value.changeUnits.some((unit) => unit.kind === "file" && unit.category === "rename")
    ).toBe(true);
    expect(
      result.value.changeUnits.some((unit) => unit.kind === "file" && unit.category === "mode")
    ).toBe(true);
    expect(
      result.value.changeUnits.some((unit) => unit.kind === "file" && unit.category === "binary")
    ).toBe(true);
    expect(
      result.value.changeUnits.some((unit) => unit.kind === "file" && unit.category === "empty")
    ).toBe(true);
    expect(
      result.value.changeUnits
        .filter((unit) => unit.kind === "hunk")
        .every((unit) => !unit.patch.includes("\r"))
    ).toBe(true);
    expect(assuranceChangeUnits(result.value)).toHaveLength(result.value.changeUnits.length);
  });

  it("captures an explicit committed target without workspace freshness assumptions", async () => {
    const { root, base } = await repository();
    await writeFile(path.join(root, "src", "staged.ts"), "export const staged = 3;\n", "utf8");
    await git(root, ["add", "."]);
    await git(root, [
      "-c",
      "user.name=Visp Test",
      "-c",
      "user.email=visp@example.test",
      "commit",
      "-m",
      "target"
    ]);
    const target = (await git(root, ["rev-parse", "HEAD"])).trim();

    const result = await captureDiffSnapshot({
      targetPath: root,
      mode: "base_to_commit",
      baseRevision: base,
      targetRevision: target
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      mode: "base_to_commit",
      baseRevision: base,
      targetRevision: target
    });
    expect(result.value.changeUnits.every((unit) => unit.layer === "committed")).toBe(true);
  });

  it("assigns stable occurrences to exact duplicate staged and unstaged hunks", async () => {
    const patch = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 1111111..2222222 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
      ""
    ].join("\r\n");
    const runner: CommandRunner = {
      run: async (_command, args = []) => {
        const stdout = args.includes("rev-parse")
          ? `${"a".repeat(40)}\n`
          : args.includes("write-tree")
            ? `${"b".repeat(40)}\n`
            : args.includes("--name-status")
              ? "M\0src/a.ts\0"
              : args.includes("ls-files")
                ? ""
                : patch;
        return ok({
          command: "git",
          args,
          exitCode: 0,
          signal: null,
          stdout,
          stderr: "",
          timedOut: false
        });
      }
    };

    const result = await captureDiffSnapshot({
      targetPath: "/workspace",
      mode: "base_to_workspace",
      baseRevision: "HEAD",
      commandRunner: runner
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hunks = result.value.changeUnits.filter((unit) => unit.kind === "hunk");
    expect(hunks.map((unit) => unit.occurrence).sort()).toEqual([1, 2]);
    expect(new Set(hunks.map((unit) => unit.patchSha256)).size).toBe(1);
  });

  it("does not renumber existing units when an earlier path is added", async () => {
    const { root, base } = await repository();
    await writeFile(path.join(root, "src", "unstaged.ts"), "export const unstaged = 9;\n", "utf8");
    const first = await captureDiffSnapshot({
      targetPath: root,
      mode: "base_to_workspace",
      baseRevision: base
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const original = first.value.changeUnits.find(
      (unit) => unit.kind === "hunk" && unit.path === "src/unstaged.ts"
    );
    expect(original).toBeDefined();

    await writeFile(path.join(root, "a-earlier.ts"), "export const earlier = true;\n", "utf8");
    const second = await captureDiffSnapshot({
      targetPath: root,
      mode: "base_to_workspace",
      baseRevision: base
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const unchanged = second.value.changeUnits.find(
      (unit) => unit.kind === "hunk" && unit.path === "src/unstaged.ts"
    );
    expect(unchanged?.id).toBe(original?.id);
  });

  it("preserves executable add/delete and compound rename/mode/binary metadata", async () => {
    const { root, base } = await repository();
    await rm(path.join(root, "src", "mode.sh"));
    await git(root, ["mv", "src/renamed.ts", "src/moved.ts"]);
    await chmod(path.join(root, "src", "moved.ts"), 0o755);
    await git(root, ["mv", "src/binary-old.bin", "src/binary-new.bin"]);
    const changedBinary = Buffer.alloc(1024, 7);
    changedBinary[0] = 0;
    changedBinary[1] = 9;
    await writeFile(path.join(root, "src", "binary-new.bin"), changedBinary);
    await git(root, ["add", "."]);
    await writeFile(path.join(root, "src", "new-exec.sh"), "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(path.join(root, "src", "new-exec.sh"), 0o755);

    const result = await captureDiffSnapshot({
      targetPath: root,
      mode: "base_to_workspace",
      baseRevision: base
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const files = result.value.changeUnits.filter((unit) => unit.kind === "file");
    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "mode",
          beforePath: "src/mode.sh",
          beforeMode: "100644"
        }),
        expect.objectContaining({
          category: "rename",
          beforePath: "src/renamed.ts",
          afterPath: "src/moved.ts"
        }),
        expect.objectContaining({
          category: "mode",
          afterPath: "src/new-exec.sh",
          afterMode: "100755"
        }),
        expect.objectContaining({
          category: "rename",
          beforePath: "src/binary-old.bin",
          afterPath: "src/binary-new.bin"
        }),
        expect.objectContaining({
          category: "binary",
          afterPath: "src/binary-new.bin"
        })
      ])
    );
  });

  it.each([
    ["unmerged", "U\0src/a.ts\0", "diff --git a/src/a.ts b/src/a.ts\n"],
    ["combined", "M\0src/a.ts\0", "diff --cc src/a.ts\n@@@ -1,1 -1,1 +1,1 @@@\n"],
    [
      "mismatched outputs",
      "M\0src/a.ts\0M\0src/b.ts\0",
      "diff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@\n-a\n+b\n"
    ]
  ])("fails closed on %s diff input", async (_label, status, patch) => {
    const runner: CommandRunner = {
      run: async (_command, args = []) =>
        ok({
          command: "git",
          args,
          exitCode: 0,
          signal: null,
          stdout: args.includes("rev-parse")
            ? `${"a".repeat(40)}\n`
            : args.includes("--name-status")
              ? status
              : args.includes("ls-files")
                ? ""
                : patch,
          stderr: "",
          timedOut: false
        })
    };
    const result = await captureDiffSnapshot({
      targetPath: "/workspace",
      mode: "base_to_workspace",
      baseRevision: "HEAD",
      commandRunner: runner
    });
    expect(result.ok).toBe(false);
  });

  it("separately rejects unsafe paths, CU identity tampering, mode/layer drift, and top hash drift", async () => {
    const { root, base } = await repository();
    await writeFile(path.join(root, "src", "unstaged.ts"), "export const unstaged = 8;\n", "utf8");
    const captured = await captureDiffSnapshot({
      targetPath: root,
      mode: "base_to_workspace",
      baseRevision: base
    });
    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    const original = captured.value;
    const first = original.changeUnits[0]!;
    const unsafeUnit =
      first.kind === "hunk"
        ? { ...first, path: "../unsafe" }
        : { ...first, afterPath: "../unsafe" };
    const unsafeWithId = {
      ...unsafeUnit,
      id: createDiffSnapshotChangeUnitId(unsafeUnit)
    };
    const unsafeWithoutHash = {
      ...original,
      changeUnits: [unsafeWithId, ...original.changeUnits.slice(1)]
    };
    const { snapshotSha256: _oldHash, ...unsafeMaterial } = unsafeWithoutHash;
    expect(
      diffSnapshotSchema.safeParse({
        ...unsafeMaterial,
        snapshotSha256: hashOracleValue(unsafeMaterial)
      }).success
    ).toBe(false);

    const tamperedIdMaterial = {
      ...original,
      changeUnits: [{ ...first, id: `CU-${"f".repeat(64)}` }, ...original.changeUnits.slice(1)]
    };
    const { snapshotSha256: _tamperedHash, ...tamperedWithoutHash } = tamperedIdMaterial;
    expect(
      diffSnapshotSchema.safeParse({
        ...tamperedWithoutHash,
        snapshotSha256: hashOracleValue(tamperedWithoutHash)
      }).success
    ).toBe(false);

    const wrongLayer = {
      ...original,
      changeUnits: original.changeUnits.map((unit) => ({ ...unit, layer: "committed" as const }))
    };
    const { snapshotSha256: _wrongLayerHash, ...wrongLayerMaterial } = wrongLayer;
    expect(
      diffSnapshotSchema.safeParse({
        ...wrongLayerMaterial,
        snapshotSha256: hashOracleValue(wrongLayerMaterial)
      }).success
    ).toBe(false);
    expect(
      diffSnapshotSchema.safeParse({
        ...original,
        snapshotSha256: `sha256:${"0".repeat(64)}`
      }).success
    ).toBe(false);
  });
});
