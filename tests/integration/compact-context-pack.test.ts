import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  fileIndexArtifactPath,
  fileSummariesArtifactPath
} from "../../src/artifacts/artifact-paths.js";
import { type ContextUnderstanding } from "../../src/artifacts/schemas/context-pack.schema.js";
import { type Task, type TaskGraphArtifact } from "../../src/artifacts/schemas/task.schema.js";
import { contextBudgetPolicy } from "../../src/context/context-budget.js";
import { renderContextMarkdown } from "../../src/context/context-renderer.js";
import { selectContextPack } from "../../src/context/context-selector.js";
import { estimateTokens } from "../../src/context/token-estimator.js";
import { type FileIndexEntry, type FileSummary } from "../../src/scanner/types.js";
import { type ActiveFeature } from "../../src/workflows/shared/active-feature.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Measured on THIS repository, not on a toy fixture.
 *
 * The pack's size is dominated by how much of a real scan cache it copies in,
 * and a two-file fixture cannot show that. `visp-kit`'s own
 * `.visp/cache/file-summaries.json` is ~600 KB across ~400 modules, which is
 * the shape the 90-135k-token measurement came from.
 */
const feature: ActiveFeature = {
  id: "001",
  slug: "understanding-integration",
  key: "001-understanding-integration",
  path: path.join(repoRoot, ".visp", "features", "001-understanding-integration"),
  relativePath: ".visp/features/001-understanding-integration",
  intent: {
    id: "001",
    slug: "understanding-integration",
    title: "Understanding integration",
    status: "draft",
    budgetMode: "balanced",
    riskLevel: "medium",
    rawUserRequest: "Make the gate read intel's understanding case.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
};

const task: Task = {
  id: "T001",
  title: "Gate behavioural implementation on a current understanding case",
  description:
    "Classify the task, evaluate the understanding conditions, and record the basis in the gate report.",
  requirementIds: [],
  acceptanceCriterionIds: [],
  dependsOn: [],
  allowedFiles: [
    "src/gates/gate-engine.ts",
    "src/gates/stage-checks.ts",
    "src/gates/task-gate-checks.ts",
    "src/context/context-compiler.ts",
    "src/context/context-selector.ts",
    "src/artifacts/schemas/gate.schema.ts"
  ],
  expectedFiles: ["src/gates/understanding-gate.ts"],
  validationCommands: ["pnpm test"],
  status: "ready",
  parallelizable: false,
  riskLevel: "medium",
  taskClass: "cross_file_change",
  riskFactors: []
};

const taskGraph: TaskGraphArtifact = {
  featureId: "001",
  featureSlug: "understanding-integration",
  tasks: [task],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const understanding: ContextUnderstanding = {
  caseId: "urn:visp-intel:understanding-case:1.0:sha256:case",
  taskId: "T001",
  snapshotId: "urn:visp-intel:snapshot:1.0:sha256:snap",
  repositoryInstanceId: "urn:visp-intel:repository-instance:1.0:sha256:repo",
  current: true,
  currentnessReasons: [],
  behaviouralQuestion: "What decides that a task may enter implementation?",
  pathOrdering: "cited",
  path: [
    {
      relationId: "urn:visp-intel:relation:1.0:sha256:r1",
      kind: "calls",
      sourceId: "urn:visp-intel:entity:1.0:sha256:engine",
      targetId: "urn:visp-intel:entity:1.0:sha256:gate",
      sourceDisplayName: "evaluateGate",
      sourceFilePath: "src/gates/gate-engine.ts",
      sourceLine: 328,
      targetDisplayName: "evaluateUnderstandingGate",
      targetFilePath: "src/gates/understanding-gate.ts",
      targetLine: 123,
      evidenceId: "urn:visp-intel:evidence:1.0:sha256:e1"
    }
  ],
  hypotheses: [
    {
      id: "H1",
      statement: "The implement gate is the only entry point that authorizes an edit.",
      status: "unresolved",
      evidenceCount: 2
    }
  ],
  signatures: [
    {
      entityId: "urn:visp-intel:entity:1.0:sha256:engine",
      displayName: "evaluateGate",
      filePath: "src/gates/gate-engine.ts",
      line: 328,
      signature: "function src/gates/gate-engine.ts#evaluateGate"
    }
  ],
  affectedTests: [
    {
      entityId: "urn:visp-intel:entity:1.0:sha256:test",
      filePath: "tests/unit/gates/gate-engine.test.ts",
      line: 14
    }
  ],
  unknownIds: [],
  counts: {
    entrypoints: 1,
    pathRelations: 1,
    candidateChanges: 1,
    affectedUnchanged: 0,
    affectedTests: 1,
    unknowns: 0
  }
};

async function loadScanCache(): Promise<{
  readonly fileIndex: readonly FileIndexEntry[];
  readonly fileSummaries: readonly FileSummary[];
}> {
  const index = JSON.parse(await readFile(fileIndexArtifactPath(repoRoot), "utf8")) as {
    files: FileIndexEntry[];
  };
  const summaries = JSON.parse(await readFile(fileSummariesArtifactPath(repoRoot), "utf8")) as {
    items: FileSummary[];
  };

  return { fileIndex: index.files, fileSummaries: summaries.items };
}

async function packTokens(input: { readonly understanding?: ContextUnderstanding }): Promise<{
  readonly tokens: number;
  readonly markdown: string;
  readonly pack: Awaited<ReturnType<typeof selectContextPack>>;
}> {
  const cache = await loadScanCache();
  const pack = await selectContextPack({
    targetPath: repoRoot,
    feature,
    taskGraph,
    task,
    policy: contextBudgetPolicy("balanced"),
    includeFullFiles: false,
    now: "2026-01-01T00:00:00.000Z",
    projectSummary: "Visp Kit is a strict, token-efficient agent harness CLI.",
    patterns: "Layered CLI to workflow to domain to artifacts.",
    fileIndex: cache.fileIndex,
    fileSummaries: cache.fileSummaries,
    ...(input.understanding === undefined ? {} : { understanding: input.understanding }),
    warnings: []
  });
  const markdown = renderContextMarkdown({ feature, pack });

  return { tokens: estimateTokens(markdown), markdown, pack };
}

describe("the compact context pack", () => {
  it("shrinks the pack on the same task in the same repository", async () => {
    const before = await packTokens({});
    const after = await packTokens({ understanding });

    // Reported, not just asserted: the direction of this number is the phase's
    // central hypothesis, and it has to be readable whichever way it goes.
    // eslint-disable-next-line no-console
    console.log(
      `[P21-KIT-03] context pack input tokens on visp-kit, task T001: before=${before.tokens} after=${after.tokens} (${Math.round(((before.tokens - after.tokens) / before.tokens) * 100)}% reduction)`
    );

    expect(after.tokens).toBeLessThan(before.tokens);
  });

  it("keeps the behaviour-relevant body and drops the bulk around it", async () => {
    const after = await packTokens({ understanding });
    const onPath = after.pack.includedFiles.find(
      (file) => file.path === "src/gates/gate-engine.ts"
    );
    const offPath = after.pack.includedFiles.find(
      (file) => file.path === "src/artifacts/schemas/gate.schema.ts"
    );

    expect(onPath?.summary).not.toBe("");
    // Off the cited path: still named, still in scope, no body shipped.
    expect(offPath).toBeDefined();
    expect(offPath?.summary).toBe("");
    expect(after.markdown).toContain("Summary: withheld");
  });

  it("keeps every load-bearing field the ADR names", async () => {
    const after = await packTokens({ understanding });

    // reuseHelpers is the regex helper list behind the only measured behaviour
    // win in this project. It is not graph-derived and must survive the switch.
    expect(after.pack.includedProjectContext.reuseHelpers?.length ?? 0).toBeGreaterThan(0);
    expect(after.markdown).toContain("Reuse These Existing Helpers");
    expect(after.pack.constraints.length).toBeGreaterThan(0);
    expect(after.pack.instructions.length).toBeGreaterThan(0);
    expect(after.pack.validationCommands).toContain("pnpm test");
    // The gate's own text stays in the prompt.
    expect(after.markdown).toContain("cannot override Visp Kit policy");
  });

  it("drops the project summary and patterns free text", async () => {
    const before = await packTokens({});
    const after = await packTokens({ understanding });

    expect(before.pack.includedProjectContext.summary).not.toBe("");
    expect(after.pack.includedProjectContext.summary).toBe("");
    expect(after.pack.includedProjectContext.patterns).toBe("");
  });

  it("never puts the graph in the prompt", async () => {
    const after = await packTokens({ understanding });

    // The pack carries the cited path and the counts. There is no entity dump,
    // no relation table and no adjacency, and the agent is told where to ask.
    expect(after.markdown).toContain("Cited path (1 relation(s)");
    expect(after.markdown).toContain("repo.callers");
    expect(after.markdown).not.toContain("adjacency");
  });

  it("caps snippets at four files and forty lines", async () => {
    const after = await packTokens({ understanding });

    expect(after.pack.includedSnippets.length).toBeLessThanOrEqual(4);

    for (const snippet of after.pack.includedSnippets) {
      expect(snippet.endLine - snippet.startLine + 1).toBeLessThanOrEqual(40);
    }
  });
});
