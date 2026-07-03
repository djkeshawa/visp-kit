import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isSubpath,
  joinPath,
  normalizePath,
  relativePath,
  resolvePath,
  toPosixPath,
  vispConfigPath,
  vispDir,
  vispStatusPath
} from "../../src/core/paths.js";

describe("path helpers", () => {
  it("normalizes and joins paths through node path semantics", () => {
    expect(normalizePath("src/../tests")).toBe("tests");
    expect(joinPath("src", "core", "paths.ts")).toBe(path.join("src", "core", "paths.ts"));
    expect(resolvePath(".", "src")).toBe(path.resolve(".", "src"));
  });

  it("converts separators to posix style", () => {
    expect(toPosixPath("src\\core/paths.ts")).toBe("src/core/paths.ts");
  });

  it("returns relative paths in posix style", () => {
    const root = path.join(path.sep, "workspace", "visp-kit");
    const file = path.join(root, "src", "index.ts");

    expect(relativePath(root, file)).toBe("src/index.ts");
  });

  it("detects whether a path is inside a parent path", () => {
    const root = path.join(path.sep, "workspace", "visp-kit");
    const child = path.join(root, "src", "index.ts");
    const outside = path.join(root, "..", "outside", "index.ts");

    expect(isSubpath(root, root)).toBe(true);
    expect(isSubpath(root, child)).toBe(true);
    expect(isSubpath(root, outside)).toBe(false);
  });

  it("builds generic .visp paths", () => {
    const root = path.join(path.sep, "workspace", "app");

    expect(vispDir(root)).toBe(path.join(root, ".visp"));
    expect(vispConfigPath(root)).toBe(path.join(root, ".visp", "config.json"));
    expect(vispStatusPath(root)).toBe(path.join(root, ".visp", "status.json"));
  });
});
