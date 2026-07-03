import path from "node:path";

import { type CommandExecutionMode, type CommandStdioMode } from "../core/command-runner.js";
import { readJsonFile } from "../core/file-system.js";

export type VerificationCommandProfileName = "default" | "terminal-compatible";

export type VerificationCommandProfile = {
  readonly executionMode: CommandExecutionMode;
  readonly stdioMode: CommandStdioMode;
  readonly profile: VerificationCommandProfileName;
  readonly reason: string | null;
  readonly executable: string | null;
  readonly args: readonly string[];
};

type PackageJsonShape = {
  readonly scripts?: Record<string, unknown>;
};

const sensitiveCommandPattern =
  /(^|[\s;&|])(?:electron|chromium|playwright)(?:\s|$)|--no-sandbox|--disable-setuid-sandbox/i;
const shellControlPattern = /[;&|<>]/;

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

  for (const pattern of [runPattern, npmShortcutPattern, yarnPattern]) {
    for (const match of command.matchAll(pattern)) {
      names.add(match[1] ?? "");
    }
  }

  return [...names].filter((name) => name.length > 0);
}

function referencedScriptNames(script: string): readonly string[] {
  return directScriptNames(script);
}

function packageManagerExecutable(command: string): string {
  if (process.platform !== "win32") {
    return command;
  }

  return ["npm", "pnpm", "yarn", "bun"].includes(command) ? `${command}.cmd` : command;
}

function parsePackageRunCommand(command: string):
  | {
      readonly executable: string;
      readonly args: readonly string[];
    }
  | undefined {
  const trimmed = command.trim();

  if (trimmed.length === 0 || shellControlPattern.test(trimmed)) {
    return undefined;
  }

  const tokens = trimmed.split(/\s+/);
  const packageManager = tokens[0];

  if (packageManager === undefined) {
    return undefined;
  }

  if (["npm", "pnpm", "bun"].includes(packageManager)) {
    const subcommand = tokens[1];

    if ((subcommand === "run" || subcommand === "run-script") && tokens[2] !== undefined) {
      return {
        executable: packageManagerExecutable(packageManager),
        args: tokens.slice(1)
      };
    }

    if (["test", "start", "build"].includes(subcommand ?? "")) {
      return {
        executable: packageManagerExecutable(packageManager),
        args: tokens.slice(1)
      };
    }
  }

  if (packageManager === "yarn") {
    const subcommand = tokens[1];

    if (subcommand === "run" && tokens[2] !== undefined) {
      return {
        executable: packageManagerExecutable(packageManager),
        args: tokens.slice(1)
      };
    }

    if (subcommand !== undefined && !subcommand.startsWith("-")) {
      return {
        executable: packageManagerExecutable(packageManager),
        args: tokens.slice(1)
      };
    }
  }

  return undefined;
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
  const stdioMode: CommandStdioMode = input.jsonOutput ? "file" : "inherit";

  if (sensitiveCommandPattern.test(input.command)) {
    const packageRun = parsePackageRunCommand(input.command);

    return {
      executionMode: packageRun === undefined ? "shell" : "argv",
      stdioMode,
      profile: "terminal-compatible",
      reason: input.jsonOutput
        ? "Validation command references Electron/Chromium-style browser execution. Output is captured through files for JSON mode."
        : "Validation command references Electron/Chromium-style browser execution.",
      executable: packageRun?.executable ?? null,
      args: packageRun?.args ?? []
    };
  }

  const scriptNames = directScriptNames(input.command);

  if (scriptNames.length > 0) {
    const packageJson = await readJsonFile<PackageJsonShape>(path.join(input.cwd, "package.json"));

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
        const packageRun = parsePackageRunCommand(input.command);

        return {
          executionMode: packageRun === undefined ? "shell" : "argv",
          stdioMode,
          profile: "terminal-compatible",
          reason: input.jsonOutput
            ? `npm script ${sensitiveScript} references Electron/Chromium-style browser execution. Output is captured through files for JSON mode.`
            : `npm script ${sensitiveScript} references Electron/Chromium-style browser execution.`,
          executable: packageRun?.executable ?? null,
          args: packageRun?.args ?? []
        };
      }
    }
  }

  return {
    executionMode: "shell",
    stdioMode: "capture",
    profile: "default",
    reason: null,
    executable: null,
    args: []
  };
}
