import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  logLevel: "warn",
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: "/src/" },
    ],
  },
  ssr: { noExternal: true },
  build: {
    ssr: process.env.SSR_ENTRY || ".smoke-tmp/entry.jsx",
    outDir: process.env.SSR_OUT || ".smoke-tmp/out",
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { entryFileNames: "entry.mjs" } },
  },
});
