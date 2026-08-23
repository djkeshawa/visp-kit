import { access, constants } from "node:fs/promises";
import { delimiter, join } from "node:path";

import { pathExists } from "../core/file-system.js";
import { joinPath } from "../core/paths.js";

/** Written by `visp-memory init`. Its presence means this project already uses memory. */
export const memoryStoreManifest = "visp-memory.yaml";

const memoryExecutableName = "visp-memory";

/** Windows resolves a bare name through these; POSIX runs the file as named. */
const executableSuffixes = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];

async function isExecutableFile(candidate: string): Promise<boolean> {
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function executableOnPath(name: string): Promise<boolean> {
  const search = process.env["PATH"];

  if (search === undefined || search === "") return false;

  for (const directory of search.split(delimiter)) {
    if (directory === "") continue;

    for (const suffix of executableSuffixes) {
      if (await isExecutableFile(join(directory, `${name}${suffix}`))) return true;
    }
  }

  return false;
}

/**
 * Is `visp-memory` part of this project's world?
 *
 * Read-only: a PATH scan and a file probe, never a spawn. Kit is deciding what to
 * write into a guidance file, and that decision must not depend on running another
 * product's binary.
 *
 * Either signal is enough, deliberately. Hyper's `memoryStoreIsReachable` requires
 * both because it is choosing a memory mode it must then actually use. This
 * question is different: an installed CLI with no store yet is the ordinary case
 * when Kit is bootstrapped before `visp-memory init`, and an initialised store
 * whose CLI is not on this machine's PATH still means the project uses memory.
 * Requiring both would blank the section in exactly the situation the guidance is
 * for.
 */
export async function memoryToolingDetected(targetPath: string): Promise<boolean> {
  const manifest = await pathExists(joinPath(targetPath, memoryStoreManifest));

  if (manifest.ok && manifest.value) return true;

  return executableOnPath(memoryExecutableName);
}
