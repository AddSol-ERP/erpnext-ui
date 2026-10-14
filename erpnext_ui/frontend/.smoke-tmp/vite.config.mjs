import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  logLevel: "warn",
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: "/src/" },
      // Opt-in, via SSR_MODAL_STUB=1. Radix Dialog portals its content, so a
      // real AppModal renders as "" under renderToString and nothing inside it
      // can be asserted. Off by default so the ordinary suites are unaffected.
      ...(process.env.SSR_MODAL_STUB
        ? [
            {
              find: /^(?:.*\/)?components\/AppModal$/,
              replacement: path.resolve(
                path.dirname(new URL(import.meta.url).pathname),
                "AppModalStub.jsx",
              ),
            },
          ]
        : []),
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
