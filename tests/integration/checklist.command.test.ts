import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { createPhase8Fixture, removeTempDirWithRetry } from "./phase8-fixture.js";

describe("visp checklist command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-checklist-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await removeTempDirWithRetry(tempDir);
  });

  it("shows and updates machine-readable implementation checklist status", async () => {
    await createPhase8Fixture(tempDir);
    const setup = createCli({ writeOut: () => undefined });

    await setup.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);

    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "checklist",
      "status",
      tempDir,
      "--task",
      "T001",
      "--json"
    ]);

    const status = JSON.parse(output.join("")) as {
      summary: { pendingRequired: Array<{ id: string }> };
    };

    expect(status.summary.pendingRequired.map((item) => item.id)).toContain("read-context");

    output.length = 0;
    await program.parseAsync([
      "node",
      "visp",
      "checklist",
      "update",
      tempDir,
      "--task",
      "T001",
      "--item",
      "read-context",
      "--status",
      "done",
      "--evidence",
      "Read current task prompt.",
      "--json"
    ]);

    const updated = JSON.parse(output.join("")) as {
      updatedItemId: string;
      checklist: { items: Array<{ id: string; status: string; evidence: string | null }> };
    };
    const checklistJson = JSON.parse(
      await readFile(
        path.join(
          tempDir,
          ".visp",
          "features",
          "001-add-note-pinning",
          "context",
          "T001.implementation-checklist.json"
        ),
        "utf8"
      )
    ) as {
      items: Array<{ id: string; status: string; evidence: string | null }>;
    };

    expect(updated.updatedItemId).toBe("read-context");
    expect(updated.checklist.items.find((item) => item.id === "read-context")).toMatchObject({
      status: "done",
      evidence: "Read current task prompt."
    });
    expect(checklistJson.items.find((item) => item.id === "read-context")?.status).toBe("done");
  });
});
