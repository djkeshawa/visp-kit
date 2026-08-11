import path from "node:path";

import { type FileIndexEntry, type LanguageStat } from "./types.js";

const languageByExtension = new Map<string, string>([
  [".ts", "TypeScript"],
  [".tsx", "TypeScript"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript"],
  [".mjs", "JavaScript"],
  [".cjs", "JavaScript"],
  [".json", "JSON"],
  [".md", "Markdown"],
  [".css", "CSS"],
  [".scss", "CSS"],
  [".sass", "CSS"],
  [".html", "HTML"],
  [".yml", "YAML"],
  [".yaml", "YAML"],
  [".java", "Java"],
  [".kt", "Kotlin"],
  [".py", "Python"],
  [".go", "Go"],
  [".rs", "Rust"]
]);

export function detectLanguage(filePath: string): string {
  return languageByExtension.get(path.extname(filePath).toLowerCase()) ?? "Other";
}

/**
 * Languages whose files are executable code.
 *
 * NOT the same set as `FileIndexEntry.isSourceFile`, and the difference is
 * load-bearing. `isSourceFile` means "a text file in a language scan
 * understands", so it is `true` for Markdown, JSON, CSS and HTML — every `.md`
 * file in this repository is `isSourceFile: true`. VSP026's mechanical rules
 * were written against `isSourceFile` and so could not distinguish a task
 * editing `docs/x.md` from one editing `src/x.ts`; "no source file in the
 * surface" was never true of a documentation task, and the rule that was
 * supposed to check the surface never fired.
 *
 * CSS and HTML are deliberately outside this set: they are markup, and the
 * question this predicate answers is whether a declared *documentation* or
 * *regression-test* class is contradicted by what the surface holds. Excluding
 * them errs toward not gating, which is ADR 0014's chosen failure direction.
 */
const programLanguages = new Set([
  "TypeScript",
  "JavaScript",
  "Java",
  "Kotlin",
  "Python",
  "Go",
  "Rust"
]);

export function isProgramFilePath(filePath: string): boolean {
  return programLanguages.has(detectLanguage(filePath));
}

export function summarizeLanguages(files: readonly FileIndexEntry[]): LanguageStat[] {
  const counts = new Map<string, number>();

  for (const file of files) {
    counts.set(file.language, (counts.get(file.language) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, fileCount]) => ({
      name,
      fileCount,
      percentage: files.length === 0 ? 0 : Math.round((fileCount / files.length) * 1000) / 10
    }))
    .sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name));
}
