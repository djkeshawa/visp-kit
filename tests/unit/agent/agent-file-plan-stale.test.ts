import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  isStale,
  wroteFile,
  writeAgentPlannedFile,
  type AgentPlannedFile
} from "../../../src/agent/agent-file-plan.js";

const schema = z.object({ id: z.string(), value: z.number() }).strict();

async function workspace(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "visp-stale-"));
}

function artifactFile(root: string, value: unknown): AgentPlannedFile {
  return {
    kind: "artifact",
    path: path.join(root, "artifact.json"),
    artifactName: "artifact",
    schema,
    value
  } as AgentPlannedFile;
}

describe("stale artifact detection", () => {
  it("reports created when nothing exists", async () => {
    const root = await workspace();
    const result = await writeAgentPlannedFile(root, artifactFile(root, { id: "a", value: 1 }), {
      force: false,
      dryRun: false
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe("created");
    expect(wroteFile(result.value.action)).toBe(true);
  });

  it("reports skipped when the file already holds exactly the planned content", async () => {
    const root = await workspace();
    const file = artifactFile(root, { id: "a", value: 1 });

    await writeAgentPlannedFile(root, file, { force: false, dryRun: false });
    const second = await writeAgentPlannedFile(root, file, { force: false, dryRun: false });

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.action).toBe("skipped");
    expect(isStale(second.value.action)).toBe(false);
    expect(wroteFile(second.value.action)).toBe(false);
  });

  it("reports stale, and does not overwrite, when inputs changed", async () => {
    const root = await workspace();

    await writeAgentPlannedFile(root, artifactFile(root, { id: "a", value: 1 }), {
      force: false,
      dryRun: false
    });

    // Same path, different inputs: this is the case that previously reported
    // "skipped" and left a superseded artifact bound to earlier inputs.
    const result = await writeAgentPlannedFile(root, artifactFile(root, { id: "a", value: 2 }), {
      force: false,
      dryRun: false
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe("stale");
    expect(isStale(result.value.action)).toBe(true);
    expect(wroteFile(result.value.action)).toBe(false);

    // The file on disk must be untouched without --force.
    const onDisk = JSON.parse(await readFile(path.join(root, "artifact.json"), "utf8"));
    expect(onDisk.value).toBe(1);
  });

  it("overwrites a stale artifact when force is set", async () => {
    const root = await workspace();

    await writeAgentPlannedFile(root, artifactFile(root, { id: "a", value: 1 }), {
      force: false,
      dryRun: false
    });
    const forced = await writeAgentPlannedFile(root, artifactFile(root, { id: "a", value: 2 }), {
      force: true,
      dryRun: false
    });

    expect(forced.ok).toBe(true);
    if (!forced.ok) return;
    expect(forced.value.action).toBe("overwritten");

    const onDisk = JSON.parse(await readFile(path.join(root, "artifact.json"), "utf8"));
    expect(onDisk.value).toBe(2);
  });

  it("treats differing text files as stale", async () => {
    const root = await workspace();
    await mkdir(path.join(root, "docs"), { recursive: true });
    const target = path.join(root, "docs", "note.md");
    await writeFile(target, "old\n");

    const result = await writeAgentPlannedFile(
      root,
      { kind: "text", path: target, contents: "new\n" },
      { force: false, dryRun: false }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe("stale");
    expect(await readFile(target, "utf8")).toBe("old\n");
  });

  it("treats an identical text file as skipped", async () => {
    const root = await workspace();
    const target = path.join(root, "note.md");
    await writeFile(target, "same\n");

    const result = await writeAgentPlannedFile(
      root,
      { kind: "text", path: target, contents: "same\n" },
      { force: false, dryRun: false }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe("skipped");
  });
});
