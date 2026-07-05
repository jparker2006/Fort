import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
