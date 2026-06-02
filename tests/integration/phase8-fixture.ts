import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createCli } from "../../src/cli/main.js";
import { runFeatureWorkflow } from "../../src/workflows/feature.workflow.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";
import { runScanWorkflow } from "../../src/workflows/scan.workflow.js";

export function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) {
    throw new Error("Expected result to be ok.");
  }

  return result.value;
}

export async function createPhase8Fixture(tempDir: string): Promise<void> {
  expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
  await writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "context-fixture",
        packageManager: "pnpm@10.0.0",
        scripts: {
          build: "tsc",
          test: "vitest",
          typecheck: "tsc --noEmit"
        },
        devDependencies: {
          typescript: "^5.0.0",
          vitest: "^3.0.0"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await mkdir(path.join(tempDir, "src"), { recursive: true });
  await mkdir(path.join(tempDir, "tests"), { recursive: true });
  await writeFile(
    path.join(tempDir, "src", "notes.ts"),
    `export interface Note {
  id: string;
  title: string;
  pinned?: boolean;
}

export function pinNote(note: Note): Note {
  return { ...note, pinned: true };
}
`,
    "utf8"
  );
  await writeFile(
    path.join(tempDir, "tests", "notes.test.ts"),
    `import { pinNote } from "../src/notes";

test("pinNote", () => {
  expect(pinNote({ id: "1", title: "A" }).pinned).toBe(true);
});
`,
    "utf8"
  );
  expectOk(await runScanWorkflow({ targetPath: tempDir }));
  expectOk(
    await runFeatureWorkflow({
      targetPath: tempDir,
      featureIdea: "Add note pinning",
      now: "2026-01-01T00:00:00.000Z"
    })
  );

  const program = createCli({ writeOut: () => undefined });

  await program.parseAsync(["node", "visp", "clarify", tempDir]);
  await program.parseAsync(["node", "visp", "spec", tempDir]);
  await program.parseAsync(["node", "visp", "plan", tempDir]);
  await program.parseAsync(["node", "visp", "tasks", tempDir]);

  const taskGraphPath = path.join(
    tempDir,
    ".visp",
    "features",
    "001-add-note-pinning",
    "task-graph.json"
  );
  const taskGraph = JSON.parse(await readFile(taskGraphPath, "utf8")) as {
    tasks: Array<Record<string, unknown>>;
  };

  taskGraph.tasks[0] = {
    ...taskGraph.tasks[0],
    title: "Implement note pinning helper",
    description: "Update the note helper and test coverage for pinning.",
    allowedFiles: ["src/notes.ts"],
    expectedFiles: ["tests/notes.test.ts"],
    validationCommands: ["pnpm test"],
    status: "ready"
  };

  await writeFile(taskGraphPath, `${JSON.stringify(taskGraph, null, 2)}\n`, "utf8");
}
