import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectPreset } from "../../../src/presets/preset-detection.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected result to be ok.");
  }

  return result.value;
}

describe("preset detection", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-preset-detect-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("detects core language project manifests", async () => {
    await writeFile(path.join(tempDir, "go.mod"), "module example.com/app\n", "utf8");
    expect(expectOk(await detectPreset(tempDir)).preset).toBe("go");

    await rm(path.join(tempDir, "go.mod"));
    await writeFile(path.join(tempDir, "pom.xml"), "<project />", "utf8");
    expect(expectOk(await detectPreset(tempDir)).preset).toBe("java");

    await rm(path.join(tempDir, "pom.xml"));
    await writeFile(path.join(tempDir, "pyproject.toml"), "[project]\nname='app'\n", "utf8");
    expect(expectOk(await detectPreset(tempDir)).preset).toBe("python");

    await rm(path.join(tempDir, "pyproject.toml"));
    await writeFile(path.join(tempDir, "Cargo.toml"), "[package]\nname='app'\n", "utf8");
    expect(expectOk(await detectPreset(tempDir)).preset).toBe("rust");
  });

  it("detects package.json project types", async () => {
    await writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { react: "^19.0.0" } }),
      "utf8"
    );
    expect(expectOk(await detectPreset(tempDir)).preset).toBe("react");

    await writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
      "utf8"
    );
    expect(expectOk(await detectPreset(tempDir)).preset).toBe("typescript");
  });

  it("uses core language manifests before plain package.json", async () => {
    await writeFile(path.join(tempDir, "package.json"), JSON.stringify({}), "utf8");
    await writeFile(path.join(tempDir, "Cargo.toml"), "[package]\nname='app'\n", "utf8");

    expect(expectOk(await detectPreset(tempDir)).preset).toBe("rust");
  });

  it("falls back to generic when no known manifest exists", async () => {
    await mkdir(path.join(tempDir, "src"));

    expect(expectOk(await detectPreset(tempDir)).preset).toBe("generic");
  });
});
