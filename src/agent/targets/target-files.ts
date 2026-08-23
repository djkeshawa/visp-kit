import { type AgentTargetName } from "../../artifacts/schemas/agent.schema.js";
import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import { type AgentTextFile } from "../agent-file-plan.js";
import { claudeTargetFiles } from "./claude.js";
import { codexTargetFiles } from "./codex.js";
import { copilotTargetFiles } from "./copilot.js";
import { cursorTargetFiles } from "./cursor.js";
import { geminiTargetFiles } from "./gemini.js";
import { genericTargetFiles } from "./generic.js";
import { opencodeTargetFiles } from "./opencode.js";

export type TargetFilesInput = {
  readonly target: AgentTargetName;
  readonly targetPath: string;
  readonly strictness: StrictnessMode;
  readonly useFallbackAgentsFile: boolean;
  readonly memoryDetected: boolean;
};

/**
 * The files one target installs — asked once, in one place.
 *
 * `agent install`, `agent bootstrap --dry-run` and `init` each carried their own
 * copy of this switch. That is the same shape of duplication that let the divert
 * decision be answered two different ways (see `sharedGuidanceFile`): a per-target
 * input added to one copy and missed in another makes a dry run promise something
 * the real run does not do.
 */
export function targetFiles(input: TargetFilesInput): readonly AgentTextFile[] {
  const shared = {
    targetPath: input.targetPath,
    strictness: input.strictness,
    memoryDetected: input.memoryDetected
  };
  const withFallback = { ...shared, useFallbackAgentsFile: input.useFallbackAgentsFile };

  switch (input.target) {
    case "codex":
      return codexTargetFiles(withFallback);
    case "generic":
      return genericTargetFiles(withFallback);
    case "claude":
      return claudeTargetFiles({ targetPath: input.targetPath, strictness: input.strictness });
    case "copilot":
      return copilotTargetFiles(withFallback);
    case "opencode":
      return opencodeTargetFiles(withFallback);
    case "cursor":
      return cursorTargetFiles(shared);
    case "gemini":
      return geminiTargetFiles(withFallback);
  }
}
