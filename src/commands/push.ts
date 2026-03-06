import { defineCommand } from "citty";
import { consola } from "consola";
import { authenticate, getOctokit } from "@/lib/auth";
import { resolveConfigPath, resolveProjectRoot, loadConfig } from "@/lib/config-io";
import { applyConfig } from "@/lib/apply";

export const pushCommand = defineCommand({
	meta: {
		name: "push",
		description: "Apply local config to GitHub",
	},
	args: {
		config: {
			type: "string",
			short: "c",
			description: "Path to config file (default: .github/tentactl.config.ts)",
			valueHint: "PATH",
		},
	},
	async run({ args }) {
		const configPath = resolveConfigPath(args.config);
		const projectRoot = resolveProjectRoot(configPath);

		consola.info(`Loading config from ${configPath}`);
		const config = await loadConfig(configPath);

		const auth = await authenticate(config.host ?? "github.com", projectRoot);
		const octokit = getOctokit(auth);

		consola.info(`Pushing config to ${config.org}/${config.repo}`);
		await applyConfig(octokit, config);
	},
});
