import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    info: vi.fn(),
    authenticate: vi.fn(),
    getOctokit: vi.fn(),
    resolveConfigPath: vi.fn(),
    resolveProjectRoot: vi.fn(),
    loadConfig: vi.fn(),
    applyConfig: vi.fn(),
}));

vi.mock("consola", () => ({
    consola: { info: mocks.info },
}));

vi.mock("@/lib/auth", () => ({
    authenticate: mocks.authenticate,
    getOctokit: mocks.getOctokit,
}));

vi.mock("@/lib/config-io", () => ({
    resolveConfigPath: mocks.resolveConfigPath,
    resolveProjectRoot: mocks.resolveProjectRoot,
    loadConfig: mocks.loadConfig,
}));

vi.mock("@/lib/apply", () => ({ applyConfig: mocks.applyConfig }));

import { pushCommand } from "./push";

describe("pushCommand", () => {
    it("loads config and applies it to GitHub", async () => {
        const octokit = { marker: true };
        const config = { org: "acme", repo: "platform", host: "github.example.com" };

        mocks.resolveConfigPath.mockReturnValue("/repo/.github/tentactl.config.ts");
        mocks.resolveProjectRoot.mockReturnValue("/repo");
        mocks.loadConfig.mockResolvedValue(config);
        mocks.authenticate.mockResolvedValue({ endpoint: "github.example.com", token: "secret" });
        mocks.getOctokit.mockReturnValue(octokit);

        await pushCommand.run?.({ args: { config: undefined } } as never);

        expect(mocks.info).toHaveBeenCalledWith("Loading config from /repo/.github/tentactl.config.ts");
        expect(mocks.authenticate).toHaveBeenCalledWith("github.example.com", "/repo");
        expect(mocks.applyConfig).toHaveBeenCalledWith(octokit, config);
    });
});
