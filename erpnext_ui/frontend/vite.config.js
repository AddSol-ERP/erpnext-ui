import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	base: "/assets/shopfloor/erp_ui/",

	define: {
		global: "{}",
		"process.env": "{}",
	},

	build: {
		outDir: "dist",
		assetsDir: "",
		lib: {
			entry: "src/main.jsx",
			name: "ErpUI",
			formats: ["iife"],
			fileName: () => "main.js",
		},
	},
});
