import { type FileIndexEntry, type FileSummary } from "./types.js";

export type ModuleMapEntry = {
  readonly name: string;
  readonly root: string;
  readonly files: readonly string[];
  readonly testFiles: readonly string[];
  readonly internalImports: readonly string[];
  readonly externalDependencies: readonly string[];
};

export type ModuleMap = {
  readonly generatedAt: string;
  readonly sourceRoots: readonly string[];
  readonly modules: readonly ModuleMapEntry[];
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function moduleName(filePath: string, sourceRoots: readonly string[]): string {
  const root = sourceRoots.find((candidate) => filePath.startsWith(`${candidate}/`));

  if (root !== undefined) {
    const rest = filePath.slice(root.length + 1);
    return rest.includes("/") ? `${root}/${rest.split("/")[0]}` : root;
  }

  return filePath.includes("/") ? filePath.split("/")[0] : ".";
}

function isExternalImport(importPath: string): boolean {
  return !importPath.startsWith(".") && !importPath.startsWith("/");
}

export function buildModuleMap(input: {
  readonly files: readonly FileIndexEntry[];
  readonly summaries: readonly FileSummary[];
  readonly sourceRoots: readonly string[];
  readonly generatedAt: string;
}): ModuleMap {
  const summariesByPath = new Map(input.summaries.map((summary) => [summary.path, summary]));
  const grouped = new Map<string, FileIndexEntry[]>();

  for (const file of input.files) {
    const name = moduleName(file.path, input.sourceRoots);
    grouped.set(name, [...(grouped.get(name) ?? []), file]);
  }

  const modules = [...grouped.entries()]
    .map(([name, files]) => {
      const imports = files.flatMap((file) => summariesByPath.get(file.path)?.imports ?? []);

      return {
        name,
        root: name === "." ? "." : name,
        files: files
          .filter((file) => !file.isTestFile)
          .map((file) => file.path)
          .sort(),
        testFiles: files
          .filter((file) => file.isTestFile)
          .map((file) => file.path)
          .sort(),
        internalImports: unique(imports.filter((item) => !isExternalImport(item))),
        externalDependencies: unique(imports.filter(isExternalImport))
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    generatedAt: input.generatedAt,
    sourceRoots: input.sourceRoots,
    modules
  };
}
