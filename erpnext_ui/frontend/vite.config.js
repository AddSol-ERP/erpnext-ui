import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	base: "/assets/erpnext_ui/erp_ui/",
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},

	define: {
		global: "{}",
		"process.env": "{}",
		"process.env.NODE_ENV": JSON.stringify("production"),
	},

	build: {
		outDir: "../public/erp_ui",
		emptyOutDir: true,
		assetsDir: "",
		manifest: true,
		rollupOptions: {
			input: "src/main.jsx",
			output: {
				entryFileNames: "main.[hash].js",
				chunkFileNames: "[name].[hash].js",
				assetFileNames: "[name].[hash][extname]",
			},
		},
	},
});
