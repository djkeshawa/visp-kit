import path from "node:path";

import { type Preset } from "../artifacts/schemas/common.schema.js";
import { type VispError } from "../core/errors.js";
import { pathExists } from "../core/file-system.js";
import { type Result, ok } from "../core/result.js";
import { detectFrameworks, readPackageJson } from "../scanner/scan-package-json.js";

export type PresetDetection = {
  readonly preset: Preset;
  readonly reason: string;
};

async function exists(rootPath: string, filePath: string): Promise<boolean> {
  const result = await pathExists(path.join(rootPath, filePath));

  return result.ok && result.value;
}

async function hasAny(rootPath: string, filePaths: readonly string[]): Promise<boolean> {
  for (const filePath of filePaths) {
    if (await exists(rootPath, filePath)) return true;
  }

  return false;
}

function hasDependency(input: {
  readonly sections: readonly Record<string, string>[];
  readonly names: readonly string[];
}): boolean {
  const names = new Set(input.names);

  return input.sections.some((section) => Object.keys(section).some((name) => names.has(name)));
}

export async function detectPreset(rootPath: string): Promise<Result<PresetDetection, VispError>> {
  const packageJson = await readPackageJson(rootPath);

  if (!packageJson.ok) return packageJson;

  if (packageJson.value !== undefined) {
    const frameworks = detectFrameworks(packageJson.value).map((item) => item.name);
    const frameworkSet = new Set(frameworks);

    if (frameworkSet.has("electron")) {
      return ok({ preset: "electron", reason: "Detected Electron dependency in package.json." });
    }

    if (frameworkSet.has("react") || frameworkSet.has("next") || frameworkSet.has("vite")) {
      return ok({
        preset: "react",
        reason: "Detected frontend framework dependency in package.json."
      });
    }

    if (
      frameworkSet.has("express") ||
      frameworkSet.has("fastify") ||
      frameworkSet.has("nestjs") ||
      frameworkSet.has("koa") ||
      frameworkSet.has("hapi")
    ) {
      return ok({
        preset: "node-api",
        reason: "Detected Node API framework dependency in package.json."
      });
    }
  }

  if (await exists(rootPath, "go.mod")) {
    return ok({ preset: "go", reason: "Detected go.mod." });
  }

  if (
    await hasAny(rootPath, [
      "pom.xml",
      "build.gradle",
      "build.gradle.kts",
      "settings.gradle",
      "settings.gradle.kts"
    ])
  ) {
    return ok({ preset: "java", reason: "Detected Java build manifest." });
  }

  if (
    await hasAny(rootPath, [
      "pyproject.toml",
      "requirements.txt",
      "setup.py",
      "poetry.lock",
      "uv.lock"
    ])
  ) {
    return ok({ preset: "python", reason: "Detected Python project manifest." });
  }

  if (await exists(rootPath, "Cargo.toml")) {
    return ok({ preset: "rust", reason: "Detected Cargo.toml." });
  }

  if (packageJson.value !== undefined) {
    const sections = [
      packageJson.value.dependencies,
      packageJson.value.devDependencies,
      packageJson.value.peerDependencies,
      packageJson.value.optionalDependencies
    ];

    if (
      hasDependency({
        sections,
        names: ["typescript", "ts-node", "tsx", "tsup"]
      }) ||
      (await hasAny(rootPath, ["tsconfig.json"]))
    ) {
      return ok({
        preset: "typescript",
        reason: "Detected TypeScript configuration or dependency."
      });
    }

    return ok({ preset: "javascript", reason: "Detected package.json." });
  }

  return ok({ preset: "generic", reason: "No known preset manifest detected." });
}
