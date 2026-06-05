import path from "node:path";

import {
  type CommandExecutionMode,
  type CommandStdioMode
} from "../core/command-runner.js";
import { readJsonFile } from "../core/file-system.js";

export type VerificationCommandProfileName = "default" | "terminal-compatible";

export type VerificationCommandProfile = {
  readonly executionMode: CommandExecutionMode;
  readonly stdioMode: CommandStdioMode;
  readonly profile: VerificationCommandProfileName;
  readonly reason: string | null;
};

type PackageJsonShape = {
  readonly scripts?: Record<string, unknown>;
};

const sensitiveCommandPattern =
  /(^|[\s;&|])(?:electron|chromium|playwright)(?:\s|$)|--no-sandbox|--disable-setuid-sandbox/i;

function scriptsFromPackageJson(value: PackageJsonShape): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value.scripts ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function directScriptNames(command: string): readonly string[] {
  const names = new Set<string>();
  const runPattern = /\b(?:npm|pnpm|bun)\s+run\s+([^\s;&|]+)/g;
  const npmShortcutPattern = /\b(?:npm|pnpm|bun)\s+(test|start|build)\b/g;
  const yarnPattern = /\byarn\s+(?!run\b)([^\s;&|]+)/g;
  let match: RegExpExecArray | null;

  while ((match = runPattern.exec(command)) !== null) {
    names.add(match[1] ?? "");
  }

  while ((match = npmShortcutPattern.exec(command)) !== null) {
    names.add(match[1] ?? "");
  }

  while ((match = yarnPattern.exec(command)) !== null) {
    names.add(match[1] ?? "");
  }

  return [...names].filter((name) => name.length > 0);
}

function referencedScriptNames(script: string): readonly string[] {
  return directScriptNames(script);
}

function scriptReferencesSensitiveCommand(input: {
  readonly scripts: Record<string, string>;
  readonly scriptName: string;
  readonly visited: Set<string>;
}): boolean {
  if (input.visited.has(input.scriptName)) {
    return false;
  }

  input.visited.add(input.scriptName);
  const script = input.scripts[input.scriptName];

  if (script === undefined) {
    return false;
  }

  if (sensitiveCommandPattern.test(script)) {
    return true;
  }

  return referencedScriptNames(script).some((name) =>
    scriptReferencesSensitiveCommand({
      scripts: input.scripts,
      scriptName: name,
      visited: input.visited
    })
  );
}

export async function profileVerificationCommand(input: {
  readonly command: string;
  readonly cwd: string;
  readonly jsonOutput?: boolean;
}): Promise<VerificationCommandProfile> {
  if (input.jsonOutput) {
    return {
      executionMode: "shell",
      stdioMode: "capture",
      profile: "default",
      reason: "JSON output requires captured validation command output."
    };
  }

  if (sensitiveCommandPattern.test(input.command)) {
    return {
      executionMode: "shell",
      stdioMode: "inherit",
      profile: "terminal-compatible",
      reason: "Validation command references Electron/Chromium-style browser execution."
    };
  }

  const scriptNames = directScriptNames(input.command);

  if (scriptNames.length > 0) {
    const packageJson = await readJsonFile<PackageJsonShape>(
      path.join(input.cwd, "package.json")
    );

    if (packageJson.ok) {
      const scripts = scriptsFromPackageJson(packageJson.value);
      const sensitiveScript = scriptNames.find((scriptName) =>
        scriptReferencesSensitiveCommand({
          scripts,
          scriptName,
          visited: new Set()
        })
      );

      if (sensitiveScript !== undefined) {
        return {
          executionMode: "shell",
          stdioMode: "inherit",
          profile: "terminal-compatible",
          reason: `npm script ${sensitiveScript} references Electron/Chromium-style browser execution.`
        };
      }
    }
  }

  return {
    executionMode: "shell",
    stdioMode: "capture",
    profile: "default",
    reason: null
  };
}
