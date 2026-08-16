import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renameMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  rename: renameMock
}));

import { writeTextFile } from "../../src/core/file-system.js";

function renameError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`rename failed with ${code}`), { code });
}

describe("Windows atomic rename retry", () => {
  let tempDir: string;
  let actualRename: typeof import("node:fs/promises").rename;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-fs-windows-retry-"));
    actualRename = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises"))
      .rename;
    renameMock.mockReset();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it.each(["EPERM", "EACCES", "EBUSY"])("retries transient %s failures", async (code) => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const filePath = path.join(tempDir, "status.json");
    await writeFile(filePath, "before", "utf8");
    let failuresRemaining = 2;
    renameMock.mockImplementation(async (sourcePath, destinationPath) => {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        throw renameError(code);
      }
      await actualRename(sourcePath, destinationPath);
    });

    expect(await writeTextFile(filePath, "after")).toEqual({ ok: true, value: filePath });
    expect(renameMock).toHaveBeenCalledTimes(3);
    expect(await readFile(filePath, "utf8")).toBe("after");
    expect(await readdir(tempDir)).toEqual(["status.json"]);
  });

  it("does not retry a Windows rename failure outside the transient allowlist", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const filePath = path.join(tempDir, "status.json");
    await writeFile(filePath, "before", "utf8");
    renameMock.mockRejectedValue(renameError("EIO"));

    expect((await writeTextFile(filePath, "after")).ok).toBe(false);
    expect(renameMock).toHaveBeenCalledTimes(1);
    expect(await readFile(filePath, "utf8")).toBe("before");
    expect(await readdir(tempDir)).toEqual(["status.json"]);
  });

  it("bounds transient retries without removing the existing destination", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const filePath = path.join(tempDir, "status.json");
    await writeFile(filePath, "before", "utf8");
    renameMock.mockRejectedValue(renameError("EPERM"));

    expect((await writeTextFile(filePath, "after")).ok).toBe(false);
    expect(renameMock).toHaveBeenCalledTimes(31);
    expect(await readFile(filePath, "utf8")).toBe("before");
    expect(await readdir(tempDir)).toEqual(["status.json"]);
  });

  it("does not apply the Windows retry policy on other platforms", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    const filePath = path.join(tempDir, "status.json");
    await writeFile(filePath, "before", "utf8");
    renameMock.mockRejectedValue(renameError("EPERM"));

    expect((await writeTextFile(filePath, "after")).ok).toBe(false);
    expect(renameMock).toHaveBeenCalledTimes(1);
    expect(await readFile(filePath, "utf8")).toBe("before");
    expect(await readdir(tempDir)).toEqual(["status.json"]);
  });
});
