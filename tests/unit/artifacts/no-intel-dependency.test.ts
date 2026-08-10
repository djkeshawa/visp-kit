import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith(".ts")) files.push(full);
  }

  return files;
}

/**
 * Kit reads intel's artifacts and nothing else. It never imports an intel
 * package, never spawns the intel CLI, and gains no dependency on it.
 *
 * This is the whole reason absence can degrade instead of failing: a project
 * with no intel store is missing a FILE, not a module Kit cannot start
 * without. A single stray import would turn every such project into a crash,
 * and it would do it silently, which is why this is a test and not a comment.
 */
describe("Kit's independence from intel", () => {
  it("no module under src/ imports anything matching visp-intel", async () => {
    const files = await sourceFiles(path.join(repoRoot, "src"));
    const offenders: string[] = [];

    for (const file of files) {
      const text = await readFile(file, "utf8");
      const importedSpecifiers = [
        ...text.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/gu)
      ].map((match) => match[1] ?? "");

      if (importedSpecifiers.some((specifier) => /visp-intel/iu.test(specifier))) {
        offenders.push(path.relative(repoRoot, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("package.json declares no intel dependency", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(repoRoot, "package.json"), "utf8")
    ) as Record<string, Record<string, string> | undefined>;
    const names = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {})
    ];

    expect(names.filter((name) => /visp-intel/iu.test(name))).toEqual([]);
  });
});
