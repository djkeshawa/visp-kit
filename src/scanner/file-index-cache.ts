import { z } from "zod";

/**
 * Reading the file index's language-recognition flag under either of its names.
 *
 * The field used to be called `isSourceFile`, which said "code" and meant
 * something else: it is `true` for Markdown, JSON, CSS and HTML, because it
 * answers "is this a text file in a language scan can parse". Four consumers
 * read it and two of them want that loose meaning — the context pack carries
 * documentation and configuration on purpose, and `codeSurface` in the
 * understanding gate deliberately requires this flag AND `isProgramFilePath`,
 * two predicates answering two different questions. So the name was corrected
 * and the semantics were left exactly alone.
 *
 * A rename is a compile error everywhere it matters; a semantic change would
 * have been a silent behavioural change across a context pack, two gate rules
 * and a measurement harness at once.
 *
 * BOTH SPELLINGS ARE ACCEPTED HERE, and that is not politeness. The index is
 * written into the gitignored `.visp/` cache, so a project scanned before this
 * change has a cache holding the old key. Refusing it would make the whole
 * index unparseable — and an unparseable index does not fail loudly, it makes
 * the context pack silently lose every file summary. Kit's behaviour would then
 * depend on WHEN the project was last scanned, which is the ambient-state
 * defect this codebase already has one instance of too many.
 */
export const recognisedTextFileFields = {
  isRecognisedTextFile: z.boolean().optional(),
  /** @deprecated The pre-rename spelling. Read for old caches; never written. */
  isSourceFile: z.boolean().optional()
} as const;

export function recognisedTextFile(entry: {
  readonly isRecognisedTextFile?: boolean;
  readonly isSourceFile?: boolean;
}): boolean {
  return entry.isRecognisedTextFile ?? entry.isSourceFile ?? false;
}

/**
 * The full `.visp/cache/file-index.json` shape the context pack parses.
 *
 * `.strict()` because an unrecognised key means the producer and this reader
 * have diverged, and the pack would rather say so than quietly select files
 * from an index it half-understands.
 */
export const fileIndexCacheSchema = z.object({
  files: z.array(
    z
      .object({
        path: z.string(),
        extension: z.string(),
        sizeBytes: z.number(),
        hash: z.string(),
        language: z.string(),
        isTestFile: z.boolean(),
        isConfigFile: z.boolean(),
        ...recognisedTextFileFields,
        lastScannedAt: z.string()
      })
      .strict()
      .transform((entry) => ({ ...entry, isRecognisedTextFile: recognisedTextFile(entry) }))
  )
});
