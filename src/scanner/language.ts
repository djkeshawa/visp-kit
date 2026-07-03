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
