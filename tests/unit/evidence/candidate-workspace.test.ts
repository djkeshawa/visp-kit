import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createCandidateWorkspaceFingerprint,
  createCommittedCandidateFingerprint
} from "../../../src/evidence/candidate-workspace.js";
import { defaultCommandRunner } from "../../../src/core/command-runner.js";

async function git(targetPath: string, ...args: string[]): Promise<string> {
  const result = await defaultCommandRunner.run("git", args, { cwd: targetPath });
  if (!result.ok || result.value.exitCode !== 0) {
    throw new Error(result.ok ? result.value.stderr : result.error.message);
  }
  return result.value.stdout.trim();
}

describe("candidate workspace fingerprint", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("changes when a task-scoped implementation file changes outside Git", async () => {
    const targetPath = await mkdtemp(path.join(os.tmpdir(), "visp-candidate-workspace-"));
    roots.push(targetPath);
    await mkdir(path.join(targetPath, "src"), { recursive: true });
    await writeFile(path.join(targetPath, "src", "example.ts"), "export const value = 1;\n");
    const task = { allowedFiles: ["src/example.ts"], expectedFiles: ["src/example.test.ts"] };

    const first = await createCandidateWorkspaceFingerprint({ targetPath, task });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.mode).toBe("task_scope_fallback");
    expect(first.value.files).toEqual([
      expect.objectContaining({ path: "src/example.test.ts", state: "missing" }),
      expect.objectContaining({ path: "src/example.ts", state: "present" })
    ]);

    await writeFile(path.join(targetPath, "src", "example.ts"), "export const value = 2;\n");
    const second = await createCandidateWorkspaceFingerprint({ targetPath, task });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.hash).not.toBe(first.value.hash);
  });

  it("rejects unsafe task paths when Git is unavailable", async () => {
    const targetPath = await mkdtemp(path.join(os.tmpdir(), "visp-candidate-workspace-"));
    roots.push(targetPath);

    const result = await createCandidateWorkspaceFingerprint({
      targetPath,
      task: { allowedFiles: ["../outside.ts"], expectedFiles: [] }
    });

    expect(result.ok).toBe(false);
  });

  it("reproduces a pre-commit rename fingerprint from the committed target", async () => {
    const targetPath = await mkdtemp(path.join(os.tmpdir(), "visp-candidate-commit-"));
    roots.push(targetPath);
    await git(targetPath, "init");
    await git(targetPath, "config", "user.email", "test@example.com");
    await git(targetPath, "config", "user.name", "Test");
    await writeFile(path.join(targetPath, "before.ts"), "export const value = 1;\n");
    await git(targetPath, "add", "before.ts");
    await git(targetPath, "commit", "-m", "base");
    const base = await git(targetPath, "rev-parse", "HEAD");
    await git(targetPath, "mv", "before.ts", "after.ts");
    const workspace = await createCandidateWorkspaceFingerprint({
      targetPath,
      task: { allowedFiles: ["after.ts"], expectedFiles: [] }
    });
    expect(workspace.ok).toBe(true);
    await git(targetPath, "commit", "-m", "rename");
    const target = await git(targetPath, "rev-parse", "HEAD");
    const committed = await createCommittedCandidateFingerprint({
      targetPath,
      baseRevision: base,
      targetRevision: target
    });
    expect(committed.ok).toBe(true);
    if (!workspace.ok || !committed.ok) return;
    expect(committed.value).toEqual(workspace.value);
  });

  it("changes when the exact committed target changes", async () => {
    const targetPath = await mkdtemp(path.join(os.tmpdir(), "visp-candidate-commit-"));
    roots.push(targetPath);
    await git(targetPath, "init");
    await git(targetPath, "config", "user.email", "test@example.com");
    await git(targetPath, "config", "user.name", "Test");
    await writeFile(path.join(targetPath, "value.ts"), "export const value = 1;\n");
    await git(targetPath, "add", "value.ts");
    await git(targetPath, "commit", "-m", "base");
    const base = await git(targetPath, "rev-parse", "HEAD");
    await writeFile(path.join(targetPath, "value.ts"), "export const value = 2;\n");
    await git(targetPath, "commit", "-am", "target one");
    const targetOne = await git(targetPath, "rev-parse", "HEAD");
    const first = await createCommittedCandidateFingerprint({
      targetPath,
      baseRevision: base,
      targetRevision: targetOne
    });
    await writeFile(path.join(targetPath, "value.ts"), "export const value = 3;\n");
    await git(targetPath, "commit", "-am", "target two");
    const second = await createCommittedCandidateFingerprint({
      targetPath,
      baseRevision: base,
      targetRevision: "HEAD"
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.hash).not.toBe(first.value.hash);
  });
});
