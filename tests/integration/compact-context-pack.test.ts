import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  fileIndexArtifactPath,
  fileSummariesArtifactPath
} from "../../src/artifacts/artifact-paths.js";
import { type ContextPack } from "../../src/artifacts/schemas/context-pack.schema.js";
import {
  understandingCaseExportSchema,
  type UnderstandingCaseExport
} from "../../src/artifacts/schemas/understanding.schema.js";
import { type Task, type TaskGraphArtifact } from "../../src/artifacts/schemas/task.schema.js";
import { contextBudgetPolicy } from "../../src/context/context-budget.js";
import { renderContextMarkdown } from "../../src/context/context-renderer.js";
import { selectContextPack, understandingFilePaths } from "../../src/context/context-selector.js";
import { estimateTokens } from "../../src/context/token-estimator.js";
import { understandingExportObjections } from "../../src/understanding/understanding-export.js";
import { understandingView } from "../../src/understanding/understanding-view.js";
import { type FileIndexEntry, type FileSummary } from "../../src/scanner/types.js";
import { type ActiveFeature } from "../../src/workflows/shared/active-feature.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Measured on THIS repository, against a REAL intel export.
 *
 * Two things about provenance, because the previous version of this file got
 * one of them wrong and a governance record had to correct it.
 *
 * 1. The scan cache is real: `visp-kit`'s own
 *    `.visp/cache/file-summaries.json` is ~600 KB across ~400 modules, which
 *    is the shape the 90-135k-token measurement came from. A two-file fixture
 *    cannot show what dominates a pack.
 * 2. The understanding case used to be a HAND-WRITTEN literal in this file.
 *    Every number this test printed was therefore a number about a case intel
 *    never produced, and the widely quoted "9,805 -> 2,100 (79%)" was quoted
 *    without that disclosure. The fixture below is a real
 *    `understanding-case-export` artifact, produced by `visp-intel repo index`
 *    + `task scope-proposal` + `understanding export` over this repository at
 *    `ab4cc4e`, and it is validated against Kit's schema and objection rules
 *    before it is used, so a doctored fixture fails the suite rather than
 *    flattering it.
 */
const exportFixturePath = path.join(
  repoRoot,
  "tests",
  "fixtures",
  "understanding",
  "visp-kit-T001.export.json"
);

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

async function loadRealExport(): Promise<UnderstandingCaseExport> {
  const raw: unknown = JSON.parse(await readFile(exportFixturePath, "utf8"));
  const parsed = understandingCaseExportSchema.parse(raw);

  // A fixture that Kit itself would refuse as evidence must not be able to
  // stand in for one it would accept.
  expect(understandingExportObjections(parsed)).toEqual([]);

  return parsed;
}

/**
 * The same real case with its path removed.
 *
 * Not an invention: this is the state intel actually returned on 17 of the 29
 * capability-eligible holdout tasks — a current, well-formed case whose scout
 * honestly established nothing. It is the input the old selector handled worst,
 * so it is the one the guarantee is written against.
 */
function withEmptyPath(value: UnderstandingCaseExport): UnderstandingCaseExport {
  return {
    ...value,
    case: { ...value.case, relationIds: [], candidateChangeEntityIds: [] },
    path: [],
    counts: { ...value.counts, pathRelations: 0, candidateChanges: 0 }
  };
}

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

async function packTokens(input: { readonly understanding?: UnderstandingCaseExport }): Promise<{
  readonly tokens: number;
  readonly markdown: string;
  readonly pack: ContextPack;
  readonly onPath: ReadonlySet<string>;
}> {
  const cache = await loadScanCache();
  const understanding =
    input.understanding === undefined
      ? undefined
      : understandingView({
          export: input.understanding,
          current: true,
          currentnessReasons: []
        });
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
    ...(understanding === undefined ? {} : { understanding }),
    warnings: []
  });
  const markdown = renderContextMarkdown({ feature, pack });

  return {
    tokens: estimateTokens(markdown),
    markdown,
    pack,
    onPath: understanding === undefined ? new Set() : understandingFilePaths(understanding)
  };
}

/** Files the pack actually gave the agent something to read. */
function bodiedFiles(pack: ContextPack): ReadonlySet<string> {
  const bodied = new Set<string>();

  for (const file of pack.includedFiles) {
    if ((file.summary ?? "").trim() !== "") bodied.add(file.path);
  }

  for (const snippet of pack.includedSnippets) bodied.add(snippet.filePath);

  return bodied;
}

describe("the compact context pack", () => {
  it("is measured against a real intel export, not a literal written here", async () => {
    const value = await loadRealExport();

    expect(value.kind).toBe("understanding-case-export");
    expect(value.case.authority).toBe("descriptive");
    expect(value.case.authorizationEffect).toBe("none");
    // Produced over a real commit of this repository with a clean worktree.
    expect(value.identity.gitCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(value.identity.dirty).toBe(false);
    expect(value.counts.pathRelations).toBeGreaterThan(0);
  });

  it("shrinks the pack on the same task in the same repository", async () => {
    const before = await packTokens({});
    const after = await packTokens({ understanding: await loadRealExport() });

    // Reported, not just asserted: the direction of this number is the phase's
    // central hypothesis, and it has to be readable whichever way it goes.
    // eslint-disable-next-line no-console
    console.log(
      `[P21-KIT-03] context pack input tokens on visp-kit, task T001, REAL intel export: before=${before.tokens} after=${after.tokens} (${Math.round(((before.tokens - after.tokens) / before.tokens) * 100)}% reduction)`
    );

    expect(after.tokens).toBeLessThan(before.tokens);
  });

  /**
   * The Phase 21 defect, as a property.
   *
   * Path membership used to be a FILTER, so a file the cited path did not name
   * lost its body. Over 29 holdout tasks that cost -78.3% bodied file recall
   * for -66.1% tokens, which is worse value, not better. Path membership is now
   * a RANKING signal, and the guarantee is monotonicity: knowing more about the
   * path never removes something the pack would otherwise have carried.
   */
  it("never bodies fewer files than the same pack with no case at all", async () => {
    const before = await packTokens({});
    const after = await packTokens({ understanding: await loadRealExport() });

    const afterBodied = [...bodiedFiles(after.pack)];

    for (const filePath of bodiedFiles(before.pack)) {
      expect(afterBodied, `${filePath} lost its body to the cited path`).toContain(filePath);
    }
  });

  it("a thin path is never worse than no path", async () => {
    const none = await packTokens({});
    const empty = await packTokens({ understanding: withEmptyPath(await loadRealExport()) });

    // The specific defect: a present-but-empty case used to withhold every
    // body while citing a path that did not exist — today's retrieval removed
    // and nothing put in its place.
    expect([...bodiedFiles(empty.pack)].sort()).toEqual([...bodiedFiles(none.pack)].sort());
    expect(empty.tokens).toBeLessThan(none.tokens);
  });

  it("spends the snippet budget on the cited path first, but never all of it", async () => {
    const after = await packTokens({ understanding: await loadRealExport() });
    const snippetPaths = after.pack.includedSnippets.map((snippet) => snippet.filePath);
    const onPath = snippetPaths.filter((filePath) => after.onPath.has(filePath));
    const offPath = snippetPaths.filter((filePath) => !after.onPath.has(filePath));

    // The real case's path runs gate-engine -> understanding-gate; gate-engine
    // is the end of it the scan cache knows.
    expect(onPath).toContain("src/gates/gate-engine.ts");
    // The floor. Intel's path covered 0.112 of the human patch across the
    // holdout, so the relevance ranking keeps slots the path cannot take.
    expect(offPath.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps every load-bearing field the ADR names", async () => {
    const after = await packTokens({ understanding: await loadRealExport() });

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
    const after = await packTokens({ understanding: await loadRealExport() });

    expect(before.pack.includedProjectContext.summary).not.toBe("");
    expect(after.pack.includedProjectContext.summary).toBe("");
    expect(after.pack.includedProjectContext.patterns).toBe("");
  });

  it("never puts the graph in the prompt", async () => {
    const after = await packTokens({ understanding: await loadRealExport() });

    // The pack carries the cited path and the counts. There is no entity dump,
    // no relation table and no adjacency, and the agent is told where to ask.
    expect(after.markdown).toContain("Cited path (");
    expect(after.markdown).toContain("repo.callers");
    expect(after.markdown).not.toContain("adjacency");
  });

  it("caps snippets at four files and forty lines", async () => {
    const after = await packTokens({ understanding: await loadRealExport() });

    expect(after.pack.includedSnippets.length).toBeLessThanOrEqual(4);

    for (const snippet of after.pack.includedSnippets) {
      expect(snippet.endLine - snippet.startLine + 1).toBeLessThanOrEqual(40);
    }
  });
});
