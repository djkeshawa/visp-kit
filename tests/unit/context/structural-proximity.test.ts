import { describe, expect, it } from "vitest";

import {
  STRUCTURAL_PROXIMITY_MAX_REACHED,
  structuralProximity
} from "../../../src/context/structural-proximity.js";
import { type IntelFileGraph } from "../../../src/scanner/intel-graph.js";

function graph(input: {
  readonly internalEdges?: Record<string, readonly string[]>;
  readonly testEdges?: Record<string, readonly string[]>;
}): IntelFileGraph {
  const files = new Set<string>();

  for (const [source, targets] of Object.entries({
    ...(input.internalEdges ?? {}),
    ...(input.testEdges ?? {})
  })) {
    files.add(source);
    for (const target of targets) files.add(target);
  }

  return {
    repositoryInstanceId: "urn:visp-intel:repository-instance:1.0:sha256:repo",
    headSnapshotId: "urn:visp-intel:snapshot:1.0:sha256:head",
    filePaths: [...files].sort(),
    testFilePaths: [],
    internalEdges: new Map(Object.entries(input.internalEdges ?? {})),
    externalEdges: new Map(),
    testEdges: new Map(Object.entries(input.testEdges ?? {}))
  };
}

describe("seed-anchored structural proximity", () => {
  it("scores one hop at 0.5 and two at 0.25, and leaves the seeds out", () => {
    const proximity = structuralProximity({
      seeds: new Set(["src/a.ts"]),
      fileGraph: graph({ internalEdges: { "src/a.ts": ["src/b.ts"], "src/b.ts": ["src/c.ts"] } })
    });

    expect(proximity.get("src/a.ts")).toBeUndefined();
    expect(proximity.get("src/b.ts")).toBe(0.5);
    expect(proximity.get("src/c.ts")).toBe(0.25);
  });

  /**
   * The direction the lexical ranker is worst at. A caller need share no
   * vocabulary at all with the thing it calls, so "who reaches this file" is
   * exactly the question text relevance cannot answer.
   */
  it("walks the graph undirected, so a caller of a seed is one hop away", () => {
    const proximity = structuralProximity({
      seeds: new Set(["src/callee.ts"]),
      fileGraph: graph({ internalEdges: { "src/caller.ts": ["src/callee.ts"] } })
    });

    expect(proximity.get("src/caller.ts")).toBe(0.5);
  });

  it("treats a test edge as a hop", () => {
    const proximity = structuralProximity({
      seeds: new Set(["src/a.ts"]),
      fileGraph: graph({ testEdges: { "src/a.ts": ["tests/a.spec.ts"] } })
    });

    expect(proximity.get("tests/a.spec.ts")).toBe(0.5);
  });

  it("stops at two hops", () => {
    const proximity = structuralProximity({
      seeds: new Set(["a"]),
      fileGraph: graph({ internalEdges: { a: ["b"], b: ["c"], c: ["d"] } })
    });

    expect(proximity.has("d")).toBe(false);
  });

  it("returns nothing for no seeds, an unknown seed, or an empty graph", () => {
    const populated = graph({ internalEdges: { "src/a.ts": ["src/b.ts"] } });

    expect(structuralProximity({ seeds: new Set(), fileGraph: populated }).size).toBe(0);
    expect(
      structuralProximity({ seeds: new Set(["src/nowhere.ts"]), fileGraph: populated }).size
    ).toBe(0);
    expect(structuralProximity({ seeds: new Set(["src/a.ts"]), fileGraph: graph({}) }).size).toBe(
      0
    );
  });

  it("caps how far it walks, so one hub file cannot become a walk of the tree", () => {
    const neighbours = Array.from({ length: 400 }, (_, index) => `src/n${index}.ts`);
    const proximity = structuralProximity({
      seeds: new Set(["src/hub.ts"]),
      fileGraph: graph({ internalEdges: { "src/hub.ts": neighbours } })
    });

    expect(proximity.size).toBe(STRUCTURAL_PROXIMITY_MAX_REACHED);
  });

  /**
   * The map is handed to a ranking decision, so which files survive the cap
   * must be a property of the paths and not of the order the edges happened to
   * be inserted in — and not of the ambient collation either, which is why
   * every ordering inside uses code points rather than `localeCompare`.
   */
  it("gives the same answer whatever order the edges arrive in", () => {
    const neighbours = Array.from({ length: 400 }, (_, index) => `src/n${index}.ts`);
    const forwards = structuralProximity({
      seeds: new Set(["src/hub.ts"]),
      fileGraph: graph({ internalEdges: { "src/hub.ts": neighbours } })
    });
    const backwards = structuralProximity({
      seeds: new Set(["src/hub.ts"]),
      fileGraph: graph({ internalEdges: { "src/hub.ts": [...neighbours].reverse() } })
    });

    expect([...backwards.entries()]).toEqual([...forwards.entries()]);
  });

  it("never scores a seed, even when another seed reaches it", () => {
    const proximity = structuralProximity({
      seeds: new Set(["src/a.ts", "src/b.ts"]),
      fileGraph: graph({ internalEdges: { "src/a.ts": ["src/b.ts"] } })
    });

    expect(proximity.size).toBe(0);
  });
});
