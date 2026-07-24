import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createCandidateWorkspaceFingerprint } from "../../../src/evidence/candidate-workspace.js";

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
});
