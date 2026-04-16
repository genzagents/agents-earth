import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port in dev
const TAURI_DEV_PORT = 1420;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: TAURI_DEV_PORT,
    strictPort: true,
    watch: {
      // Don't watch the Rust src-tauri tree — Tauri CLI handles that
      ignored: ["**/src-tauri/**"],
    },
  },
  // Produce relative paths so Tauri can load them from the bundle
  base: "./",
  build: {
    outDir: "dist",
    target: "esnext",
    minify: "esbuild",
  },
});
