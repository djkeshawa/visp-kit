import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const SCANNED_ROOTS = ["src", "tests", "scripts"];
const SCANNED_EXTENSIONS = [".ts", ".mts", ".js", ".mjs", ".cjs", ".json", ".md", ".py", ".sh"];

/**
 * Extensions whose files are binary by design, and which are therefore never
 * expected to be greppable. `.scip` is SCIP protobuf — an indexer's own output,
 * committed verbatim as a fixture; re-encoding one to strip a NUL would destroy
 * the very thing such a fixture exists to prove can be read.
 *
 * Kit has no file of this kind today — the sibling check in visp-intel is the
 * one that needs the exemption. It is stated here so that a genuine binary
 * added later is exempted deliberately, rather than by someone widening the
 * check until it stops complaining. See LC-80.
 */
const BINARY_BY_DESIGN_EXTENSIONS = [".scip"];

async function scannedFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "coverage")
        continue;
      files.push(...(await scannedFiles(full)));
      continue;
    }

    const extension = path.extname(entry.name);
    if (BINARY_BY_DESIGN_EXTENSIONS.includes(extension)) continue;
    if (SCANNED_EXTENSIONS.includes(extension)) files.push(full);
  }

  return files;
}

/**
 * A single NUL byte in an authored file makes that file invisible to review.
 * `grep` (ugrep on the reference box) suppresses matches in a file it decides
 * is binary, and git renders its diff as "Binary files differ" — so a change
 * to such a file cannot be searched for and cannot be read in a pull request.
 *
 * The byte is not the problem and this check does not ask anyone to stop
 * emitting one: `pathHashPairs` still separates its fields with NUL, written as
 * `\u0000`. What the check forbids is spelling it as a raw byte in
 * the source text, which costs nothing and hides everything. See LC-80.
 */
describe("authored source stays greppable", () => {
  it("contains no literal NUL byte outside files that are binary by design", async () => {
    const files = (
      await Promise.all(SCANNED_ROOTS.map((root) => scannedFiles(path.join(repoRoot, root))))
    ).flat();

    const offenders: string[] = [];

    for (const file of files) {
      const text = await readFile(file, "utf8");
      if (text.includes("\u0000")) offenders.push(path.relative(repoRoot, file));
    }

    expect(offenders).toEqual([]);
  });

  it("actually scans a meaningful number of files", async () => {
    // Guards the guard: a broken walk would silently pass the check above by
    // finding nothing to look at.
    const files = (
      await Promise.all(SCANNED_ROOTS.map((root) => scannedFiles(path.join(repoRoot, root))))
    ).flat();

    expect(files.length).toBeGreaterThan(200);
  });
});
