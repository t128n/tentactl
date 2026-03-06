import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    DEFAULT_CONFIG_PATH,
    fileExists,
    loadConfig,
    resolveConfigPath,
    resolveProjectRoot,
    serializeConfig,
    writeConfig,
} from "./config-io";

describe("config-io", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("resolves the default config path from cwd", () => {
        vi.spyOn(process, "cwd").mockReturnValue("/workspace");

        expect(resolveConfigPath()).toBe("/workspace/.github/tentactl.config.ts");
        expect(resolveConfigPath("config/custom.ts")).toBe("/workspace/config/custom.ts");
    });

    it("derives the project root from config location", () => {
        expect(resolveProjectRoot("/workspace/.github/tentactl.config.ts")).toBe("/workspace");
        expect(resolveProjectRoot("/workspace/config/tentactl.config.ts")).toBe("/workspace/config");
    });

    it("checks whether a file exists", async () => {
        const dir = await mkdtemp(join(tmpdir(), "tentactl-config-"));
        const filePath = join(dir, "config.ts");

        await writeFile(filePath, "export default {}\n", "utf8");

        await expect(fileExists(filePath)).resolves.toBe(true);
        await expect(fileExists(join(dir, "missing.ts"))).resolves.toBe(false);

        await rm(dir, { recursive: true, force: true });
    });

    it("loads a config module from disk", async () => {
        const dir = await mkdtemp(join(tmpdir(), "tentactl-load-"));
        const filePath = join(dir, "tentactl.config.mjs");

        await writeFile(filePath, "export default { org: 'acme', repo: 'platform' };\n", "utf8");

        await expect(loadConfig(filePath)).resolves.toEqual({ org: "acme", repo: "platform" });

        await rm(dir, { recursive: true, force: true });
    });

    it("serializes collaborators, teams, and other config sections", () => {
        const output = serializeConfig({
            org: "acme",
            repo: "platform",
            host: "github.example.com",
            strict: true,
            labels: {
                strict: true,
                items: [{ name: "bug", color: "ff0000", description: "Broken" }],
            },
            collaborators: {
                strict: true,
                items: [{ username: "octocat", permission: "maintain" }],
            },
            teams: {
                items: [{ team_slug: "platform", permission: "admin" }],
            },
            interaction_limit: null,
        });

        expect(output).toContain(`host: "github.example.com"`);
        expect(output).toContain(`strict: true`);
        expect(output).toContain(`collaborators: {`);
        expect(output).toContain(`username: "octocat"`);
        expect(output).toContain(`team_slug: "platform"`);
        expect(output).toContain(`interaction_limit: null`);
    });

    it("writes the serialized config to disk", async () => {
        const dir = await mkdtemp(join(tmpdir(), "tentactl-write-"));
        const filePath = join(dir, DEFAULT_CONFIG_PATH);

        await mkdir(join(dir, ".github"), { recursive: true });

        await writeConfig(filePath, { org: "acme", repo: "platform" });

        const content = await readFile(filePath, "utf8");
        expect(content).toContain(`export default defineConfig({`);
        expect(content).toContain(`org: "acme"`);
        expect(content).toContain(`repo: "platform"`);

        await rm(dir, { recursive: true, force: true });
    });
});
