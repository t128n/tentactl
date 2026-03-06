import { defineCommand } from "citty";
import { consola } from "consola";
import { confirm, text } from "@clack/prompts";
import { authenticate, getOctokit } from "@/lib/auth";
import {
    resolveConfigPath,
    resolveProjectRoot,
    loadConfig,
    fileExists,
    writeConfig,
} from "@/lib/config-io";
import { fetchRemoteConfig } from "@/lib/fetch";

export const pullCommand = defineCommand({
    meta: {
        name: "pull",
        description: "Pull remote GitHub state into config file",
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

        let org: string;
        let repo: string;
        let host = "github.com";

        if (await fileExists(configPath)) {
            const existing = await loadConfig(configPath);
            org = existing.org;
            repo = existing.repo;
            host = existing.host ?? "github.com";
        } else {
            consola.info("No existing config found. Please provide repository details.");
            const orgInput = await text({
                message: "GitHub organization (or user) name:",
                validate: (v) => { if (!v?.trim()) return "Required"; },
            });
            const repoInput = await text({
                message: "Repository name:",
                validate: (v) => { if (!v?.trim()) return "Required"; },
            });
            org = (orgInput as string).trim();
            repo = (repoInput as string).trim();
        }

        const auth = await authenticate(host, projectRoot);
        const octokit = getOctokit(auth);

        consola.info(`Fetching remote state for ${org}/${repo}`);
        const remote = await fetchRemoteConfig(octokit, org, repo);

        // Preserve host in pulled config if non-default
        if (host !== "github.com") {
            remote.host = host;
        }

        if (await fileExists(configPath)) {
            const overwrite = await confirm({
                message: `Overwrite existing config at ${configPath}?`,
                initialValue: false,
            });
            if (!overwrite) {
                consola.info("Aborted.");
                return;
            }
        }

        await writeConfig(configPath, remote);
        consola.success(`Config written to ${configPath}`);
    },
});
