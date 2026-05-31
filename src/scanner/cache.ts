import { z } from "zod";

import { readJsonFile } from "../core/file-system.js";
import { type FileSummary } from "./types.js";

const fileSummaryCacheSchema = z.object({
  items: z.array(z.object({ path: z.string(), hash: z.string() }).passthrough())
});

export async function readPreviousSummaries(
  cachePath: string
): Promise<Map<string, FileSummary>> {
  const result = await readJsonFile<unknown>(cachePath);

  if (!result.ok) {
    return new Map();
  }

  const parsed = fileSummaryCacheSchema.safeParse(result.value);

  if (!parsed.success) {
    return new Map();
  }

  return new Map(
    parsed.data.items.map((item) => [item.path, item as unknown as FileSummary])
  );
}
