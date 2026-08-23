import path from "node:path";

import { type VispError } from "../core/errors.js";
import { pathExists } from "../core/file-system.js";
import { ok, type Result } from "../core/result.js";

/**
 * The config forms `visp-memory` itself accepts, in its own order.
 *
 * Mirrors `MemoryConfig.find_and_load` in the `visp-memory` package: the same
 * three names, searched from the project directory upwards. A monorepo whose
 * store is configured at the repository root is one memory uses and therefore one
 * Kit has to see.
 */
export const memoryConfigNames = [
  "visp-memory.yaml",
  "visp-memory.json",
  path.join(".visp-memory", "config.yaml")
] as const;

/**
 * Does this project have a `visp-memory` store?
 *
 * Read-only, and deliberately a question about the *project*, not the machine.
 * `AGENTS.md` is a committed file that every contributor and CI shares, so the
 * answer has to be the same for all of them: keying it on whether the CLI happens
 * to be on one developer's `PATH` would let an ordinary `agent refresh` on a
 * second machine silently delete the section the first machine wrote.
 *
 * It is also the honest question. Every memory command refuses in a project with
 * no store — `recall` exits with "No repository scope is configured … run
 * visp-memory init" — so an installed CLI alone is not something to write
 * instructions about.
 */
export async function memoryStoreDetected(targetPath: string): Promise<Result<boolean, VispError>> {
  let directory = path.resolve(targetPath);

  for (;;) {
    for (const name of memoryConfigNames) {
      const found = await pathExists(path.join(directory, name));

      if (!found.ok) return found;
      if (found.value) return ok(true);
    }

    const parent = path.dirname(directory);

    if (parent === directory) return ok(false);

    directory = parent;
  }
}
