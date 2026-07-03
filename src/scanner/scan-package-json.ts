import path from "node:path";

import { type PackageManager } from "../artifacts/schemas/common.schema.js";
import { type VispError } from "../core/errors.js";
import { readJsonFile } from "../core/file-system.js";
import { type Result, ok } from "../core/result.js";
import { type FrameworkDetection, type PackageJsonInfo } from "./types.js";

type PackageJsonShape = {
  readonly name?: string;
  readonly version?: string;
  readonly type?: string;
  readonly packageManager?: string;
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
};

const knownFrameworks = new Set([
  "react",
  "next",
  "vite",
  "vue",
  "svelte",
  "angular",
  "electron",
  "express",
  "fastify",
  "nestjs",
  "hapi",
  "koa",
  "commander",
  "zod",
  "vitest",
  "jest",
  "playwright",
  "cypress",
  "eslint",
  "prettier",
  "typescript",
  "tsup",
  "webpack",
  "rollup",
  "prisma",
  "mongoose",
  "sequelize"
]);

export async function readPackageJson(
  rootPath: string
): Promise<Result<PackageJsonInfo | undefined, VispError>> {
  const packagePath = path.join(rootPath, "package.json");
  const result = await readJsonFile<PackageJsonShape>(packagePath);

  if (!result.ok) {
    if (result.error.code === "FILE_NOT_FOUND") {
      return ok(undefined);
    }

    return result;
  }

  const value = result.value;

  return ok({
    path: "package.json",
    name: value.name,
    version: value.version,
    type: value.type,
    packageManager: value.packageManager,
    scripts: value.scripts ?? {},
    dependencies: value.dependencies ?? {},
    devDependencies: value.devDependencies ?? {},
    peerDependencies: value.peerDependencies ?? {},
    optionalDependencies: value.optionalDependencies ?? {}
  });
}

function managerFromPackageManager(value: string | undefined): PackageManager | undefined {
  const name = value?.split("@")[0];
  return name === "pnpm" || name === "npm" || name === "yarn" || name === "bun" ? name : undefined;
}

export function detectPackageManager(input: {
  readonly packageJson?: PackageJsonInfo;
  readonly lockFiles: readonly string[];
}): PackageManager {
  const explicit = managerFromPackageManager(input.packageJson?.packageManager);

  if (explicit !== undefined) {
    return explicit;
  }

  if (input.lockFiles.includes("pnpm-lock.yaml")) return "pnpm";
  if (input.lockFiles.includes("package-lock.json")) return "npm";
  if (input.lockFiles.includes("yarn.lock")) return "yarn";
  if (input.lockFiles.includes("bun.lock") || input.lockFiles.includes("bun.lockb")) {
    return "bun";
  }

  return "unknown";
}

function commandForScript(manager: PackageManager, scriptName: string): string {
  if (manager === "pnpm") return `pnpm ${scriptName}`;
  if (manager === "yarn") return `yarn ${scriptName}`;
  if (manager === "bun") return `bun run ${scriptName}`;
  return `npm run ${scriptName}`;
}

function commandsForScripts(
  scripts: Record<string, string>,
  manager: PackageManager,
  names: readonly string[]
): string[] {
  return names
    .filter((name) => scripts[name] !== undefined)
    .map((name) => commandForScript(manager, name));
}

export function detectScriptCommands(
  packageJson: PackageJsonInfo | undefined,
  manager: PackageManager
): {
  readonly buildCommands: readonly string[];
  readonly testCommands: readonly string[];
  readonly lintCommands: readonly string[];
  readonly typecheckCommands: readonly string[];
} {
  const scripts = packageJson?.scripts ?? {};

  return {
    buildCommands: commandsForScripts(scripts, manager, ["build", "compile", "package", "dist"]),
    testCommands: commandsForScripts(scripts, manager, [
      "test",
      "test:unit",
      "test:integration",
      "test:e2e",
      "vitest",
      "jest"
    ]),
    lintCommands: commandsForScripts(scripts, manager, ["lint", "lint:fix", "eslint"]),
    typecheckCommands: commandsForScripts(scripts, manager, [
      "typecheck",
      "type-check",
      "check-types",
      "tsc"
    ])
  };
}

export function detectFrameworks(packageJson: PackageJsonInfo | undefined): FrameworkDetection[] {
  if (packageJson === undefined) {
    return [];
  }

  const sections = [
    ["dependencies", packageJson.dependencies],
    ["devDependencies", packageJson.devDependencies],
    ["peerDependencies", packageJson.peerDependencies],
    ["optionalDependencies", packageJson.optionalDependencies]
  ] as const;
  const detections: FrameworkDetection[] = [];

  for (const [section, dependencies] of sections) {
    for (const dependencyName of Object.keys(dependencies)) {
      const normalized = dependencyName.replace(/^@nestjs\//, "nestjs");

      if (knownFrameworks.has(normalized)) {
        detections.push({ name: normalized, dependencyName, section });
      }
    }
  }

  return detections.sort((a, b) => a.name.localeCompare(b.name));
}
