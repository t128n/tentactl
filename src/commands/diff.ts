import { defineCommand } from "citty";
import { consola } from "consola";
import { authenticate, getOctokit } from "@/lib/auth";
import { resolveConfigPath, resolveProjectRoot, loadConfig, fileExists } from "@/lib/config-io";
import { fetchRemoteConfig } from "@/lib/fetch";
import { computeDiff } from "@/lib/diff";

export const diffCommand = defineCommand({
    meta: {
        name: "diff",
        description: "Show diff between local config and remote GitHub state",
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

        if (!await fileExists(configPath)) {
            consola.error(`No config found at ${configPath}. Run \`tentactl pull\` first.`);
            process.exit(1);
        }

        const projectRoot = resolveProjectRoot(configPath);
        const local = await loadConfig(configPath);

        const auth = await authenticate(local.host ?? "github.com", projectRoot);
        const octokit = getOctokit(auth);

        consola.info(`Fetching remote state for ${local.org}/${local.repo}`);
        const remote = await fetchRemoteConfig(octokit, local.org, local.repo);

        const output = computeDiff(local, remote);
        if (!output) {
            consola.success("Local config is in sync with remote.");
            return;
        }

        console.log(output);
    },
});
