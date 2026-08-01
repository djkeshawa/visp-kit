import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    artifacts: "src/artifacts/public.ts"
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false
});
