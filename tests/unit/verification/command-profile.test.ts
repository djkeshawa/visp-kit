import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { profileVerificationCommand } from "../../../src/verification/command-profile.js";

describe("verification command profile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-command-profile-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("uses terminal-compatible stdio for direct Electron commands", async () => {
    const profile = await profileVerificationCommand({
      command: "electron --no-sandbox scripts/regression.js",
      cwd: tempDir
    });

    expect(profile).toMatchObject({
      executionMode: "shell",
      stdioMode: "inherit",
      profile: "terminal-compatible"
    });
  });

  it("detects Electron commands behind nested npm scripts", async () => {
    await writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify(
        {
          scripts: {
            "test:all": "npm run check && npm run regression:renderer",
            check: "node --check main.js",
            "regression:renderer": "electron --no-sandbox scripts/regression-electron.js"
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const profile = await profileVerificationCommand({
      command: "npm run test:all",
      cwd: tempDir
    });

    expect(profile).toMatchObject({
      executionMode: "shell",
      stdioMode: "inherit",
      profile: "terminal-compatible",
      reason: "npm script test:all references Electron/Chromium-style browser execution."
    });
  });

  it("keeps JSON mode captured even for Electron-sensitive commands", async () => {
    const profile = await profileVerificationCommand({
      command: "electron --no-sandbox scripts/regression.js",
      cwd: tempDir,
      jsonOutput: true
    });

    expect(profile).toMatchObject({
      executionMode: "shell",
      stdioMode: "capture",
      profile: "default"
    });
  });
});
