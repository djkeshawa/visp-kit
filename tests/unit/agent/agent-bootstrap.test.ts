import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runAgentBootstrap } from "../../../src/agent/agent-bootstrap.js";
import { agentTargetNameSchema } from "../../../src/artifacts/schemas/agent.schema.js";
import { type VispError } from "../../../src/core/errors.js";
import { pathExists } from "../../../src/core/file-system.js";
import { type Result } from "../../../src/core/result.js";

const NOW = "2026-01-01T00:00:00.000Z";
const targets = agentTargetNameSchema.options;

function expectOk<T>(result: Result<T, VispError>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected ok result: ${result.error.message}`);
  return result.value;
}

/**
 * KNOWN DEFECT, pinned rather than fixed because this change may not touch
 * `src/`. The real install plans four metadata files and the dry run's own copy
 * of that list names three, so `agent bootstrap <target> --dry-run` on an
 * uninitialized project under-reports this file for every target. Dropped from
 * the REAL side of the comparison only, so the dry run is still held to naming
 * everything else; the omission itself is asserted below, and when the defect
 * is fixed that assertion fails and both it and this constant go.
 */
const DRY_RUN_OMITS = ".visp/agent/capabilities.json";

function sorted(files: readonly string[]): readonly string[] {
  return [...files].sort();
}

describe("agent bootstrap", () => {
  let dryRunDir: string;
  let realDir: string;

  beforeEach(async () => {
    dryRunDir = await mkdtemp(path.join(os.tmpdir(), "visp-bootstrap-dry-"));
    realDir = await mkdtemp(path.join(os.tmpdir(), "visp-bootstrap-real-"));
  });

  afterEach(async () => {
    await rm(dryRunDir, { recursive: true, force: true });
    await rm(realDir, { recursive: true, force: true });
  });

  // A dry run into an uninitialized project cannot ask the installer what it
  // would write, because there is no `.visp/` for the installer to read, so it
  // answers from its own copy of the per-target file list. The two copies drift
  // — one of them once knew about gemini and the other did not — and only a
  // comparison against the real run catches that.
  describe.each(targets)("into an uninitialized project, target %s", (target) => {
    it("names the files the real bootstrap goes on to write", async () => {
      const dry = expectOk(
        await runAgentBootstrap({ targetPath: dryRunDir, target, dryRun: true, now: NOW })
      );
      const real = expectOk(await runAgentBootstrap({ targetPath: realDir, target, now: NOW }));

      expect(dry.dryRun).toBe(true);
      expect(sorted(dry.install.createdFiles)).toEqual(
        sorted(real.install.createdFiles).filter((file) => file !== DRY_RUN_OMITS)
      );
      expect(real.install.createdFiles).toContain(DRY_RUN_OMITS);
      expect(dry.install.createdFiles).not.toContain(DRY_RUN_OMITS);
    });

    it("promises no file the real bootstrap leaves unwritten", async () => {
      const dry = expectOk(
        await runAgentBootstrap({ targetPath: dryRunDir, target, dryRun: true, now: NOW })
      );
      expectOk(await runAgentBootstrap({ targetPath: realDir, target, now: NOW }));

      for (const file of dry.install.createdFiles) {
        expect(expectOk(await pathExists(path.join(realDir, file)))).toBe(true);
      }
    });

    it("writes nothing at all", async () => {
      expectOk(await runAgentBootstrap({ targetPath: dryRunDir, target, dryRun: true, now: NOW }));

      expect(expectOk(await pathExists(path.join(dryRunDir, ".visp")))).toBe(false);
    });

    it("tells the reader how to start the workflow in that tool", async () => {
      const dry = expectOk(
        await runAgentBootstrap({ targetPath: dryRunDir, target, dryRun: true, now: NOW })
      );
      const real = expectOk(await runAgentBootstrap({ targetPath: realDir, target, now: NOW }));

      expect(dry.nextInstructions.length).toBeGreaterThan(0);
      expect(dry.nextInstructions).toBe(real.nextInstructions);
    });
  });

  it("initializes the project and reports it, defaulting to strict", async () => {
    const summary = expectOk(await runAgentBootstrap({ targetPath: realDir, target: "codex" }));

    expect(summary.initialized).toBe(true);
    expect(summary.strictnessMode).toBe("strict");
    expect(summary.init).toBeDefined();
    expect(expectOk(await pathExists(path.join(realDir, ".visp")))).toBe(true);
  });

  // The second bootstrap has a `.visp/` to read, so init must not run again.
  // This says nothing about what the install then does to `.visp/policy.json`:
  // bootstrap defaults `--strictness` to strict and passes it on, so a second
  // bootstrap with no flag rewrites the policy. That is a separate defect and
  // this test does not assert it away — it passes the flag explicitly.
  it("does not re-initialize a project that is already initialized", async () => {
    expectOk(await runAgentBootstrap({ targetPath: realDir, target: "codex" }));
    const second = expectOk(
      await runAgentBootstrap({
        targetPath: realDir,
        target: "claude",
        strictness: "relaxed",
        force: true
      })
    );

    expect(second.initialized).toBe(false);
    expect(second.init).toBeUndefined();
    expect(second.strictnessMode).toBe("relaxed");
  });
});
