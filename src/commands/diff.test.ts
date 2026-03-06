import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    authenticate: vi.fn(),
    getOctokit: vi.fn(),
    resolveConfigPath: vi.fn(),
    resolveProjectRoot: vi.fn(),
    loadConfig: vi.fn(),
    fileExists: vi.fn(),
    fetchRemoteConfig: vi.fn(),
    computeDiff: vi.fn(),
}));

vi.mock("consola", () => ({
    consola: { info: mocks.info, success: mocks.success, error: mocks.error },
}));

vi.mock("@/lib/auth", () => ({
    authenticate: mocks.authenticate,
    getOctokit: mocks.getOctokit,
}));

vi.mock("@/lib/config-io", () => ({
    resolveConfigPath: mocks.resolveConfigPath,
    resolveProjectRoot: mocks.resolveProjectRoot,
    loadConfig: mocks.loadConfig,
    fileExists: mocks.fileExists,
}));

vi.mock("@/lib/fetch", () => ({ fetchRemoteConfig: mocks.fetchRemoteConfig }));
vi.mock("@/lib/diff", () => ({ computeDiff: mocks.computeDiff }));

import { diffCommand } from "./diff";

describe("diffCommand", () => {
    it("reports when local and remote config are in sync", async () => {
        const octokit = { marker: true };
        const config = { org: "acme", repo: "platform", host: "github.com" };

        mocks.resolveConfigPath.mockReturnValue("/repo/.github/tentactl.config.ts");
        mocks.resolveProjectRoot.mockReturnValue("/repo");
        mocks.fileExists.mockResolvedValue(true);
        mocks.loadConfig.mockResolvedValue(config);
        mocks.authenticate.mockResolvedValue({ endpoint: "github.com", token: "secret" });
        mocks.getOctokit.mockReturnValue(octokit);
        mocks.fetchRemoteConfig.mockResolvedValue(config);
        mocks.computeDiff.mockReturnValue(null);

        await diffCommand.run?.({ args: { config: undefined } } as never);

        expect(mocks.fetchRemoteConfig).toHaveBeenCalledWith(octokit, "acme", "platform");
        expect(mocks.success).toHaveBeenCalledWith("Local config is in sync with remote.");
    });

    it("prints a diff when changes exist", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
        const octokit = { marker: true };
        const config = { org: "acme", repo: "platform" };

        mocks.resolveConfigPath.mockReturnValue("/repo/.github/tentactl.config.ts");
        mocks.resolveProjectRoot.mockReturnValue("/repo");
        mocks.fileExists.mockResolvedValue(true);
        mocks.loadConfig.mockResolvedValue(config);
        mocks.authenticate.mockResolvedValue({ endpoint: "github.com", token: "secret" });
        mocks.getOctokit.mockReturnValue(octokit);
        mocks.fetchRemoteConfig.mockResolvedValue(config);
        mocks.computeDiff.mockReturnValue("diff-output");

        await diffCommand.run?.({ args: { config: undefined } } as never);

        expect(log).toHaveBeenCalledWith("diff-output");
        log.mockRestore();
    });
});
