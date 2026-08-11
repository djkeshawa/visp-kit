import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { scanProject } from "../../src/scanner/scan-project.js";
import { buildFileSummaries } from "../../src/scanner/summarize-project.js";
import { type FileIndexEntry, type FileSummary } from "../../src/scanner/types.js";

const run = promisify(execFile);

export type RepositoryScanCache = {
  readonly fileIndex: readonly FileIndexEntry[];
  readonly fileSummaries: readonly FileSummary[];
};

/**
 * Frozen so nothing derived from the cache carries a wall clock into an
 * assertion or a printed measurement.
 */
const scannedAt = "2026-01-01T00:00:00.000Z";

/**
 * The scan cache a test measures against, GENERATED rather than read.
 *
 * `.visp/` is gitignored (`.gitignore:29`), so a test that read
 * `.visp/cache/file-index.json` passed in a developer checkout that happened to
 * have run `visp-kit scan` and failed in every clean clone. That is not a
 * passing test, it is an unrun one, and the measurement it printed was against
 * whatever snapshot the last local scan left behind — here, one six days older
 * than the tree it was quoted about.
 *
 * So the cache is built here, by Kit's own scanner, over the repository the
 * test is running in. It is as real as the on-disk artifact — the same
 * `scanProject` + `buildFileSummaries` that `visp-kit scan` calls, over ~650
 * real files — and it needs no ambient state and no committed 865 KB blob that
 * would start going stale the moment it landed.
 *
 * `force: true` is not an optimisation waiver: `buildFileSummaries` otherwise
 * reuses summaries from `.visp/cache/file-summaries.json` when the hash
 * matches, which would let ambient state back in through the side door. Every
 * summary here is recomputed from the file on disk.
 */
async function buildRepositoryScanCache(repoRoot: string): Promise<RepositoryScanCache> {
  const scan = await scanProject({ rootPath: repoRoot, scannedAt });
  const tracked = await trackedFiles(repoRoot);
  const files = scan.files.filter((file) => tracked.has(file.path));

  if (files.length === 0) {
    throw new Error(`No tracked files found under ${repoRoot}; cannot build a scan cache.`);
  }

  const summaries = await buildFileSummaries({
    rootPath: repoRoot,
    files,
    generatedAt: scannedAt,
    force: true
  });

  return { fileIndex: files, fileSummaries: summaries.cache.items };
}

/**
 * Restricted to what git tracks, which is what makes the measurement a fact
 * about the commit rather than about a checkout.
 *
 * `scanProject` walks the working tree, and a developer checkout carries files
 * a clean clone does not — `.claude/`, `.local-plans/`, `AGENTS.visp.md`, some
 * twenty of them here. They are indexed, summarised, and eligible for a pack
 * slot, so an unfiltered scan prints one token count in a clone and another one
 * three metres away. Anything that reaches the pack from here is committed.
 */
async function trackedFiles(repoRoot: string): Promise<ReadonlySet<string>> {
  try {
    const { stdout } = await run("git", ["ls-files", "-z"], {
      cwd: repoRoot,
      maxBuffer: 32 * 1024 * 1024
    });

    return new Set(stdout.split("\0").filter((line) => line !== ""));
  } catch (error) {
    // Loud, not silent. Falling back to the full tree would keep the suite
    // green while quietly restoring the nondeterminism this exists to remove.
    throw new Error(
      `Could not list tracked files in ${repoRoot}; this measurement needs a git checkout. ${String(error)}`
    );
  }
}

const caches = new Map<string, Promise<RepositoryScanCache>>();

/**
 * Memoised per root: a scan of this repository is a few seconds, and the
 * measurement tests ask for it dozens of times.
 */
export function repositoryScanCache(repoRoot: string): Promise<RepositoryScanCache> {
  const existing = caches.get(repoRoot);

  if (existing !== undefined) return existing;

  const created = buildRepositoryScanCache(repoRoot);

  caches.set(repoRoot, created);

  return created;
}
