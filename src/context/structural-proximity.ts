import { compareByCodepoint } from "../core/paths.js";
import { type IntelFileGraph } from "../scanner/intel-graph.js";

/**
 * Seed-anchored structural proximity over intel's consumer projection.
 *
 * WHAT THIS IS. Given the files a task is already anchored to, a bounded
 * breadth-first expansion over the projection's file-grain edges returns
 * `file -> (0, 1]`, decaying by hop. That is a FACT about the tree — this file
 * imports that file, this file is tested by that one — reduced to a number Kit
 * computed itself from facts intel stated. Intel supplies no score, no
 * threshold and no verdict; every constant that turns this map into a selection
 * is a literal in Kit's own source, below or in `context-selector.ts`.
 *
 * WHAT THIS IS NOT. It is not a relevance score, and nothing here may remove a
 * file from a pack. The map is consumed in exactly one place
 * (`admitStructuralCandidates`) as a bounded ADDITION to the list the lexical
 * ranking already chose. Read `context-selector.ts` alone and the question
 * "what would this pack have contained with no graph?" still has an answer:
 * everything it contains now, minus at most two summary-only files.
 *
 * DETERMINISM. Every ordering in here is by UTF-16 code unit, never by
 * `localeCompare`, so the output does not depend on the ambient `LANG`. The
 * result depends only on the seed set and the projection's edge multiset — not
 * on the iteration order of the maps it is handed, because each expansion step
 * sorts before it truncates.
 */

/**
 * How far the expansion runs. Two, because hop 1 is "the file I am editing
 * talks to this one" and hop 2 is already "something that talks to something I
 * am editing" — a claim weak enough that it only ever influences ordering here,
 * never admission.
 */
export const STRUCTURAL_PROXIMITY_MAX_HOPS = 2;
/** Per-hop decay: seed 1.0, hop 1 → 0.5, hop 2 → 0.25. */
export const STRUCTURAL_PROXIMITY_DECAY = 0.5;
/**
 * Hard ceiling on files reached, so a hub file in a large repository cannot
 * turn one BFS into a walk of the whole tree inside `visp-kit context`.
 */
export const STRUCTURAL_PROXIMITY_MAX_REACHED = 256;

export type StructuralProximityInput = {
  /** Normalized, repository-relative POSIX paths the task is anchored to. */
  readonly seeds: ReadonlySet<string>;
  readonly fileGraph: IntelFileGraph;
  readonly maxHops?: number;
  readonly decay?: number;
  readonly maxReached?: number;
};

/**
 * The undirected union of dependency and test edges.
 *
 * Undirected on purpose. "The file I am editing imports this one" and "this one
 * imports the file I am editing" are both reasons a change here is visible
 * there, and the second is the direction a caller lives in — the one a lexical
 * ranker is worst at finding, because a caller need not share any vocabulary
 * with the callee.
 */
function undirectedAdjacency(fileGraph: IntelFileGraph): ReadonlyMap<string, ReadonlySet<string>> {
  const adjacency = new Map<string, Set<string>>();
  const link = (from: string, to: string): void => {
    if (from === to) return;

    const bucket = adjacency.get(from);

    if (bucket === undefined) {
      adjacency.set(from, new Set([to]));
      return;
    }

    bucket.add(to);
  };

  for (const edges of [fileGraph.internalEdges, fileGraph.testEdges]) {
    for (const [source, targets] of edges) {
      for (const target of targets) {
        link(source, target);
        link(target, source);
      }
    }
  }

  return adjacency;
}

/**
 * `file -> proximity`, excluding the seeds themselves.
 *
 * Seeds are left out because they are already in the pack by definition — a
 * caller that wanted them back would be asking this function to re-state its
 * own input as a discovery.
 *
 * An empty seed set, a seed no edge touches, an empty graph, or a repository
 * intel indexed nothing in all return an empty map, and an empty map is the
 * value that makes every consumer below behave exactly as it did before intel
 * existed.
 */
export function structuralProximity(input: StructuralProximityInput): ReadonlyMap<string, number> {
  const reached = new Map<string, number>();

  if (input.seeds.size === 0) return reached;

  const maxHops = input.maxHops ?? STRUCTURAL_PROXIMITY_MAX_HOPS;
  const decay = input.decay ?? STRUCTURAL_PROXIMITY_DECAY;
  const maxReached = input.maxReached ?? STRUCTURAL_PROXIMITY_MAX_REACHED;
  const adjacency = undirectedAdjacency(input.fileGraph);
  let frontier = [...input.seeds].sort(compareByCodepoint);
  let score = 1;

  for (let hop = 1; hop <= maxHops; hop += 1) {
    score *= decay;

    if (score <= 0) break;

    const discovered = new Set<string>();

    for (const node of frontier) {
      for (const neighbour of adjacency.get(node) ?? []) {
        if (input.seeds.has(neighbour) || reached.has(neighbour)) continue;
        discovered.add(neighbour);
      }
    }

    // Sort BEFORE truncating, so which files survive the cap is a property of
    // the paths and not of map insertion order.
    const admitted = [...discovered].sort(compareByCodepoint);
    const nextFrontier: string[] = [];

    for (const node of admitted) {
      if (reached.size >= maxReached) break;
      reached.set(node, score);
      nextFrontier.push(node);
    }

    if (nextFrontier.length === 0) break;

    frontier = nextFrontier;
  }

  return reached;
}
