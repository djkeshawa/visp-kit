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

/**
 * Languages whose content a declared `documentation` or `regression_test` class
 * can honestly be ABOUT.
 *
 * This is the fail-closed half of the same question `isProgramFilePath` answers
 * fail-open, and the two are deliberately not complements. `isProgramFilePath`
 * is asked of every task, so absence of evidence must keep a file out of it —
 * ADR 0014's failure direction protects the task whose evidence is missing.
 * This predicate is asked only of a task that DECLARED a mechanical class,
 * which is a different case: the declaration is a claim, and a file nobody can
 * classify does not corroborate a claim, it simply fails to support one.
 *
 * The gap between the two sets is exactly the VSP026 defeat route. The language
 * map holds twenty extensions and `isProgramFilePath` recognises seven
 * languages, so declaring `documentation` and putting the change in Ruby, PHP,
 * C, C++, C#, Swift, Scala, shell, SQL, `.vue`, `.svelte`, Dart or Elixir made
 * `detectLanguage` return "Other", emptied `codeSurface`, and left the task
 * ungated — through the one rule whose whole purpose is stopping a task from
 * choosing its own gate. It survived verify for the same reason: the
 * realized-surface enforcement keys on B4's basis, and B4 was precisely the
 * rule that could not fire.
 *
 * CSS and HTML are outside the attesting set for a narrower reason: they are a
 * running interface, and a change to a stylesheet is not documentation and is
 * not a regression test. They remain outside `isProgramFilePath`, so this
 * changes nothing for an undeclared task.
 *
 * Markdown, JSON and YAML attest. Prose, fixtures and configuration are what a
 * documentation or test-only change is usually made of, and refusing them would
 * gate the ordinary honest case — which costs the mechanism itself.
 */
const mechanicalClassAttestingLanguages = new Set(["Markdown", "JSON", "YAML"]);

export function attestsMechanicalClass(filePath: string): boolean {
  return mechanicalClassAttestingLanguages.has(detectLanguage(filePath));
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
