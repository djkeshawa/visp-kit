import path from "node:path";

export function normalizePath(inputPath: string): string {
  return path.normalize(inputPath);
}

export function toPosixPath(inputPath: string): string {
  return inputPath.replaceAll("\\", "/").split(path.sep).join("/");
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
