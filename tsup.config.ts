import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "mcp/server": "src/mcp/server.ts",
    "cli/index": "src/cli/index.ts",
    "core/index": "src/core/index.ts",
  },
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  shims: false,
  // Mark heavy native deps as external so we don't try to bundle them
  external: ["better-sqlite3", "sqlite-vec"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
