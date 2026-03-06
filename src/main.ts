import { defineCommand, runMain } from "citty";
import packageJson from "#/package.json";
import { login, logout, status, pushCommand, pullCommand, diffCommand } from "./commands";

const main = defineCommand({
    meta: {
        name: packageJson.name,
        version: packageJson.version,
        description: "Manage GitHub repositories as code",
    },
    subCommands: {
        push: pushCommand,
        pull: pullCommand,
        diff: diffCommand,

        auth: defineCommand({
            meta: { name: "auth", description: "Manage authentication" },
            subCommands: {
                login: defineCommand({
                    meta: { name: "login", description: "Save a GitHub PAT to .env.local" },
                    run() { return login(); },
                }),
                logout: defineCommand({
                    meta: { name: "logout", description: "Remove the GitHub PAT from .env.local" },
                    run() { return logout(); },
                }),
                status: defineCommand({
                    meta: { name: "status", description: "Check authentication status" },
                    run() { return status(); },
                }),
            },
        }),
    },
});

runMain(main);
