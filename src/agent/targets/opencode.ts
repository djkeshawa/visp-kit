import { type AgentTextFile } from "../agent-file-plan.js";
import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import { genericTargetFiles } from "./generic.js";

// OpenCode has no special file format: it consumes AGENTS.md-compatible guidance
// and portable prompt files, exactly like the generic target. Reuse the generic
// renderer output so the two targets never drift.
export function opencodeTargetFiles(input: {
  readonly targetPath: string;
  readonly strictness: StrictnessMode;
  readonly useFallbackAgentsFile: boolean;
}): readonly AgentTextFile[] {
  return genericTargetFiles(input);
}
