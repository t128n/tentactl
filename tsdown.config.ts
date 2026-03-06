import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/main.ts"],
	format: ["esm"],
	clean: true,
	outDir: "dist",
	banner: {
		js: "#!/usr/bin/env node",
	},
});
