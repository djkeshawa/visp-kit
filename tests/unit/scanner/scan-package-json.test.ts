import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  detectFrameworks,
  detectPackageManager,
  detectScriptCommands,
  readPackageJson
} from "../../../src/scanner/scan-package-json.js";

describe("package.json scanner", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-package-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reads package metadata and detects explicit package manager", async () => {
    await writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({
        name: "fixture",
        packageManager: "pnpm@10.0.0",
        scripts: { build: "tsc", test: "vitest", typecheck: "tsc --noEmit" },
        dependencies: { react: "^19.0.0" },
        devDependencies: { typescript: "^5.0.0", vitest: "^3.0.0" }
      }),
      "utf8"
    );

    const result = await readPackageJson(tempDir);

    expect(result.ok).toBe(true);

    if (result.ok) {
      const manager = detectPackageManager({
        packageJson: result.value,
        lockFiles: []
      });
      const commands = detectScriptCommands(result.value, manager);

      expect(manager).toBe("pnpm");
      expect(commands.buildCommands).toEqual(["pnpm build"]);
      expect(commands.testCommands).toEqual(["pnpm test"]);
      expect(commands.typecheckCommands).toEqual(["pnpm typecheck"]);
      expect(detectFrameworks(result.value).map((item) => item.name)).toEqual([
        "react",
        "typescript",
        "vitest"
      ]);
    }
  });

  it("detects package manager from lock files with priority", () => {
    expect(
      detectPackageManager({
        lockFiles: ["package-lock.json", "pnpm-lock.yaml"]
      })
    ).toBe("pnpm");
  });

  it("returns undefined when package.json is missing", async () => {
    await mkdir(path.join(tempDir, "src"));

    const result = await readPackageJson(tempDir);

    expect(result).toEqual({ ok: true, value: undefined });
  });
});
