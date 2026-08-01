import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ensureDir,
  pathExists,
  readJsonFile,
  readTextFile,
  withExclusiveDirectoryLock,
  writeJsonFile,
  writeTextFile,
  writeTextFileExclusive
} from "../../src/core/file-system.js";
import { isErr, isOk, ok } from "../../src/core/result.js";

describe("filesystem helpers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-fs-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates directories", async () => {
    const dirPath = path.join(tempDir, "nested", "dir");
    const result = await ensureDir(dirPath);

    expect(result).toEqual({ ok: true, value: dirPath });
    expect(await pathExists(dirPath)).toEqual({ ok: true, value: true });
  });

  it("writes and reads text files", async () => {
    const filePath = path.join(tempDir, "notes", "phase-1.txt");

    const writeResult = await writeTextFile(filePath, "calm output");
    const readResult = await readTextFile(filePath);

    expect(writeResult).toEqual({ ok: true, value: filePath });
    expect(readResult).toEqual({ ok: true, value: "calm output" });
  });

  it("never exposes partial JSON to a concurrent reader", async () => {
    const filePath = path.join(tempDir, ".visp", "status.json");
    const payloads = Array.from({ length: 12 }, (_, revision) => ({
      revision,
      padding: String(revision).repeat(512 * 1024)
    }));
    await writeJsonFile(filePath, payloads[0]);

    let reading = true;
    const observedRevisions = new Set<number>();
    const reader = (async () => {
      while (reading) {
        const contents = await readFile(filePath, "utf8");
        const parsed = JSON.parse(contents) as { revision: number };
        observedRevisions.add(parsed.revision);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    })();

    for (const payload of payloads.slice(1)) {
      expect(await writeJsonFile(filePath, payload)).toEqual({ ok: true, value: filePath });
    }
    reading = false;
    await reader;

    expect(observedRevisions.size).toBeGreaterThan(0);
  });

  it("publishes an exclusive file only after all bytes are complete", async () => {
    const filePath = path.join(tempDir, ".visp", "review-decisions", "decision.json");
    const payload = { decision: "accept", padding: "x".repeat(4 * 1024 * 1024) };
    const serialized = `${JSON.stringify(payload)}\n`;

    const reader = (async () => {
      while (true) {
        try {
          return JSON.parse(await readFile(filePath, "utf8")) as typeof payload;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }
    })();

    expect(await writeTextFileExclusive(filePath, serialized)).toEqual({
      ok: true,
      value: filePath
    });
    expect(await reader).toEqual(payload);
    expect(await readdir(path.dirname(filePath))).toEqual(["decision.json"]);
  });

  it("keeps exclusive creation atomic and refuses to replace an existing entry", async () => {
    const filePath = path.join(tempDir, "immutable.json");
    const [first, second] = await Promise.all([
      writeTextFileExclusive(filePath, '{"writer":1}\n'),
      writeTextFileExclusive(filePath, '{"writer":2}\n')
    ]);

    expect([first, second].filter(isOk)).toHaveLength(1);
    const failures = [first, second].filter(isErr);
    expect(failures).toHaveLength(1);
    expect((failures[0]?.error.cause as NodeJS.ErrnoException | undefined)?.code).toBe("EEXIST");
    expect(['{"writer":1}\n', '{"writer":2}\n']).toContain(await readFile(filePath, "utf8"));
    expect(await readdir(tempDir)).toEqual(["immutable.json"]);
  });

  it("fails visibly on a stale lock and succeeds after explicit exact-entry recovery", async () => {
    const lockPath = path.join(tempDir, "review-decision.json.lock");
    await mkdir(lockPath);
    await writeFile(path.join(lockPath, "owner-crashed.json"), '{"pid":999999}\n', "utf8");
    let calls = 0;

    const blocked = await withExclusiveDirectoryLock(
      lockPath,
      "review decision pointer update",
      async () => {
        calls += 1;
        return ok("published");
      }
    );
    expect(isErr(blocked)).toBe(true);
    if (isErr(blocked)) {
      expect(blocked.error.message).toContain(lockPath);
      expect(blocked.error.message).toContain("remove only this exact stale lock entry");
    }
    expect(calls).toBe(0);

    await rm(lockPath, { recursive: true });
    expect(
      await withExclusiveDirectoryLock(lockPath, "review decision pointer update", async () => {
        calls += 1;
        return ok("published");
      })
    ).toEqual({ ok: true, value: "published" });
    expect(calls).toBe(1);
    expect(await pathExists(lockPath)).toEqual({ ok: true, value: false });
  });

  it("never removes a successor lock that replaces its acquired directory", async () => {
    const lockPath = path.join(tempDir, "review-decision.json.lock");
    let signalEntered: () => void = () => undefined;
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    let releaseOperation: () => void = () => undefined;
    const operationBarrier = new Promise<void>((resolve) => {
      releaseOperation = resolve;
    });
    const active = withExclusiveDirectoryLock(
      lockPath,
      "review decision pointer update",
      async () => {
        signalEntered();
        await operationBarrier;
        return ok("first-complete");
      }
    );
    await entered;

    const successorCandidate = path.join(tempDir, "successor-candidate");
    const successorOwner = "owner-successor.json";
    await mkdir(successorCandidate);
    await writeFile(path.join(successorCandidate, successorOwner), '{"pid":2}\n', "utf8");
    await rm(lockPath, { recursive: true });
    await rename(successorCandidate, lockPath);
    releaseOperation();

    expect(await active).toEqual({ ok: true, value: "first-complete" });
    expect(await readFile(path.join(lockPath, successorOwner), "utf8")).toBe('{"pid":2}\n');
    expect((await lstat(lockPath)).isDirectory()).toBe(true);
  });

  it("cleans up its temporary file when replacement fails", async () => {
    const targetPath = path.join(tempDir, "target-directory");
    await ensureDir(targetPath);

    const result = await writeTextFile(targetPath, "cannot replace a directory");

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toBe(`Unable to write ${targetPath}.`);
    }
    expect(await readdir(tempDir)).toEqual(["target-directory"]);
  });

  it("preserves a symlink while atomically replacing its target", async () => {
    const targetPath = path.join(tempDir, "actual.json");
    const linkPath = path.join(tempDir, "linked.json");
    await writeFile(targetPath, '{"revision":0}\n', "utf8");
    await symlink("actual.json", linkPath);

    const result = await writeTextFile(linkPath, '{"revision":1}\n');

    expect(result).toEqual({ ok: true, value: linkPath });
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(await readFile(targetPath, "utf8")).toBe('{"revision":1}\n');
  });

  it("preserves a dangling symlink chain while atomically creating its final target", async () => {
    const firstLinkPath = path.join(tempDir, "first.json");
    const secondLinkPath = path.join(tempDir, "second.json");
    const targetPath = path.join(tempDir, "created.json");
    await symlink("second.json", firstLinkPath);
    await symlink("created.json", secondLinkPath);

    const result = await writeTextFile(firstLinkPath, '{"revision":1}\n');

    expect(result).toEqual({ ok: true, value: firstLinkPath });
    expect((await lstat(firstLinkPath)).isSymbolicLink()).toBe(true);
    expect((await lstat(secondLinkPath)).isSymbolicLink()).toBe(true);
    expect(await readFile(targetPath, "utf8")).toBe('{"revision":1}\n');
  });

  it("resolves a relative dangling target from the physical parent of an intermediate link", async () => {
    const physicalDirectory = path.join(tempDir, "physical", "nested");
    const linkedDirectory = path.join(tempDir, "linked-directory");
    const finalLinkPath = path.join(physicalDirectory, "final.json");
    const requestedPath = path.join(linkedDirectory, "final.json");
    const targetPath = path.join(tempDir, "physical", "target.json");
    await ensureDir(physicalDirectory);
    await symlink(path.join("physical", "nested"), linkedDirectory, "dir");
    await symlink("../target.json", finalLinkPath);

    const result = await writeTextFile(requestedPath, '{"revision":2}\n');

    expect(result).toEqual({ ok: true, value: requestedPath });
    expect((await lstat(linkedDirectory)).isSymbolicLink()).toBe(true);
    expect((await lstat(finalLinkPath)).isSymbolicLink()).toBe(true);
    expect(await readFile(targetPath, "utf8")).toBe('{"revision":2}\n');
  });

  it.skipIf(process.platform === "win32")(
    "retains existing destination permission bits",
    async () => {
      const filePath = path.join(tempDir, "executable.sh");
      await writeFile(filePath, "before\n", "utf8");
      await chmod(filePath, 0o777);

      const result = await writeTextFile(filePath, "after\n");

      expect(result).toEqual({ ok: true, value: filePath });
      expect((await stat(filePath)).mode & 0o777).toBe(0o777);
    }
  );

  it("writes and reads pretty JSON files", async () => {
    const filePath = path.join(tempDir, ".visp", "config.json");
    const value = { name: "visp-kit", enabled: true };

    const writeResult = await writeJsonFile(filePath, value);
    const readResult = await readJsonFile<typeof value>(filePath);
    const raw = await readFile(filePath, "utf8");

    expect(writeResult).toEqual({ ok: true, value: filePath });
    expect(readResult).toEqual({ ok: true, value });
    expect(raw).toBe('{\n  "name": "visp-kit",\n  "enabled": true\n}\n');
  });

  it("returns false when a path does not exist", async () => {
    const missingPath = path.join(tempDir, "missing.txt");

    expect(await pathExists(missingPath)).toEqual({ ok: true, value: false });
  });

  it("returns a clear error for missing text files", async () => {
    const result = await readTextFile(path.join(tempDir, "missing.txt"));

    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.code).toBe("FILE_NOT_FOUND");
    }
  });

  it("returns a validation error for invalid JSON", async () => {
    const filePath = path.join(tempDir, "invalid.json");
    await writeFile(filePath, "{", "utf8");

    const result = await readJsonFile(filePath);

    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("rejects values that cannot be serialized as JSON", async () => {
    const result = await writeJsonFile(path.join(tempDir, "bad.json"), undefined);

    expect(isOk(result)).toBe(false);

    if (isErr(result)) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
    }
  });
});
