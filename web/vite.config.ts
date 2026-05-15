/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// During dev, Vite serves the React app and proxies /chat + /api/* to the
// Express BFF (which runs separately on WEB_PORT, default 3000). In prod
// the Express server in dist/server/ serves the static build itself.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/chat": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: false,
      },
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/healthz": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/static",
    sourcemap: true,
    target: "es2022",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
