import path from "node:path";

export function normalizePath(inputPath: string): string {
  return path.normalize(inputPath);
}

export function toPosixPath(inputPath: string): string {
  return inputPath.replaceAll("\\", "/").split(path.sep).join("/");
}

/**
 * Order two strings by UTF-16 code unit, with no locale involved.
 *
 * `String.prototype.localeCompare` with no locale argument reads the
 * environment's ICU collation, so the same commit and the same inputs can order
 * two paths differently under a different `LANG`. That is output that varies
 * with WHERE it ran rather than WHAT it read, and it is the reason a
 * determinism claim about anything downstream of an ordering has to name the
 * collation as one of its inputs.
 *
 * Every ordering introduced on the structural-proximity path uses this instead,
 * so that path is collation-independent by construction. The 33 pre-existing
 * `localeCompare` call sites in `src/` are deliberately NOT changed here:
 * several of them order artifacts whose bytes are the baseline a measurement
 * round is currently comparing against, and silently re-ordering them mid-round
 * would move the baseline as a side effect of an unrelated change.
 */
export function compareByCodepoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * One spelling for a repository-relative path, applied at every boundary where
 * a human-authored path meets a path scan produced.
 *
 * Scan's index holds `src/a.ts`. A task may declare `./src/a.ts`,
 * `src\a.ts`, or `src//a.ts`, and every join in the gate layer is an exact
 * string comparison against the index. Under any of those spellings the joins
 * silently found nothing, which is not a wrong answer that a reader can see —
 * it is an empty one that reads as "no linkage".
 */
export function normalizeRepositoryPath(value: string): string {
  const posix = value
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/{2,}/gu, "/");
  const withoutDotSegments = posix.replace(/^(?:\.\/)+/u, "");
  const withoutLeadingSlash = withoutDotSegments.replace(/^\/+/u, "");

  return withoutLeadingSlash.length > 1
    ? withoutLeadingSlash.replace(/\/+$/u, "")
    : withoutLeadingSlash;
}

export function joinPath(...parts: string[]): string {
  return path.join(...parts);
}

export function resolvePath(...parts: string[]): string {
  return path.resolve(...parts);
}

export function relativePath(fromPath: string, toPath: string): string {
  return toPosixPath(path.relative(fromPath, toPath));
}

export function isSubpath(parentPath: string, childPath: string): boolean {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const relative = path.relative(parent, child);

  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function vispDir(rootPath: string): string {
  return path.join(rootPath, ".visp");
}

export function vispConfigPath(rootPath: string): string {
  return path.join(vispDir(rootPath), "config.json");
}

export function vispStatusPath(rootPath: string): string {
  return path.join(vispDir(rootPath), "status.json");
}
