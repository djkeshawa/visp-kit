import { type ContextSnippet } from "../artifacts/schemas/context-pack.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function taskKeywords(task: Task): readonly string[] {
  return unique(`${task.title} ${task.description}`.toLowerCase().split(/[^a-z0-9]+/)).filter(
    (word) => word.length >= 4 && word !== "task" && word !== "test"
  );
}

export function snippetRelevanceScore(
  snippet: Pick<ContextSnippet, "filePath" | "content" | "tokenEstimate">,
  keywords: readonly string[]
): number {
  const path = snippet.filePath.toLowerCase();
  const content = snippet.content.toLowerCase();
  let hits = 0;

  for (const keyword of keywords) {
    // Path matches are the strongest signal that a snippet belongs to the task.
    if (path.includes(keyword)) hits += 5;
    if (content.includes(keyword)) hits += 2;
  }

  // Normalize by snippet size so large, weakly related snippets rank below
  // small, strongly related ones and get trimmed first.
  return hits / Math.max(1, snippet.tokenEstimate);
}
