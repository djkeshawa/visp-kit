import { type IntelFileGraph } from "./intel-graph.js";
import { type FileIndexEntry, type FileSummary } from "./types.js";
import { uniqueLocaleSorted as unique } from "../core/collections.js";

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
  /**
   * Intel's graph at file grain, when this project has one. The artifact shape
   * below is identical either way; only where the facts come from changes.
   */
  readonly intel?: IntelFileGraph;
}): ModuleMap {
  const summariesByPath = new Map(input.summaries.map((summary) => [summary.path, summary]));
  const grouped = new Map<string, FileIndexEntry[]>();

  for (const file of input.files) {
    const name = moduleName(file.path, input.sourceRoots);
    grouped.set(name, [...(grouped.get(name) ?? []), file]);
  }

  const intel = input.intel;
  const intelTests = new Set(intel?.testFilePaths ?? []);
  const modules = [...grouped.entries()]
    .map(([name, files]) => {
      const paths = files.map((file) => file.path);
      // Kit's own test detection is a UNION member, not a fallback. Intel marks
      // a file as a test when it found a test entity in it; Kit marks one from
      // its path and name. Neither is a superset of the other, and dropping
      // Kit's half would make the artifact worse on any repository whose test
      // framework intel does not extract — the opposite of the point.
      const isTest = (file: FileIndexEntry): boolean =>
        file.isTestFile || intelTests.has(file.path);
      const indexed =
        intel === undefined
          ? []
          : paths.filter((path) => intel.internalEdges.has(path) || intel.externalEdges.has(path));

      // Intel backs a module only when intel actually indexed something in it.
      // A module the graph never saw (generated output, an unsupported
      // language) keeps the summary-derived answer rather than being reported
      // as having no dependencies at all.
      const useIntel = intel !== undefined && indexed.length > 0;
      const imports = files.flatMap((file) => summariesByPath.get(file.path)?.imports ?? []);

      return {
        name,
        root: name === "." ? "." : name,
        files: files
          .filter((file) => !isTest(file))
          .map((file) => file.path)
          .sort(),
        testFiles: files
          .filter(isTest)
          .map((file) => file.path)
          .sort(),
        // Graph-backed internal imports are RESOLVED file paths, where the
        // summary-derived ones were raw specifiers like `../foo.js`. Same
        // field, same type, a target a reader can open.
        internalImports: useIntel
          ? unique(paths.flatMap((path) => [...(intel.internalEdges.get(path) ?? [])]))
          : unique(imports.filter((item) => !isExternalImport(item))),
        externalDependencies: useIntel
          ? unique(paths.flatMap((path) => [...(intel.externalEdges.get(path) ?? [])]))
          : unique(imports.filter(isExternalImport))
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    generatedAt: input.generatedAt,
    sourceRoots: input.sourceRoots,
    modules
  };
}
