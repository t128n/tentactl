import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    confirm: vi.fn(),
    text: vi.fn(),
    authenticate: vi.fn(),
    getOctokit: vi.fn(),
    resolveConfigPath: vi.fn(),
    resolveProjectRoot: vi.fn(),
    loadConfig: vi.fn(),
    fileExists: vi.fn(),
    writeConfig: vi.fn(),
    fetchRemoteConfig: vi.fn(),
}));

vi.mock("consola", () => ({
    consola: { info: mocks.info, success: mocks.success, error: mocks.error },
}));

vi.mock("@clack/prompts", () => ({
    confirm: mocks.confirm,
    text: mocks.text,
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
    writeConfig: mocks.writeConfig,
}));

vi.mock("@/lib/fetch", () => ({
    fetchRemoteConfig: mocks.fetchRemoteConfig,
}));

import { pullCommand } from "./pull";

describe("pullCommand", () => {
    it("loads existing config, fetches remote state, and writes it back", async () => {
        const octokit = { marker: true };
        mocks.resolveConfigPath.mockReturnValue("/repo/.github/tentactl.config.ts");
        mocks.resolveProjectRoot.mockReturnValue("/repo");
        mocks.fileExists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
        mocks.loadConfig.mockResolvedValue({ org: "acme", repo: "platform", host: "github.example.com" });
        mocks.authenticate.mockResolvedValue({ endpoint: "github.example.com", token: "secret" });
        mocks.getOctokit.mockReturnValue(octokit);
        mocks.fetchRemoteConfig.mockResolvedValue({ org: "acme", repo: "platform" });
        mocks.confirm.mockResolvedValue(true);

        await pullCommand.run?.({ args: { config: undefined } } as never);

        expect(mocks.authenticate).toHaveBeenCalledWith("github.example.com", "/repo");
        expect(mocks.fetchRemoteConfig).toHaveBeenCalledWith(octokit, "acme", "platform");
        expect(mocks.writeConfig).toHaveBeenCalledWith(
            "/repo/.github/tentactl.config.ts",
            { org: "acme", repo: "platform", host: "github.example.com" },
        );
        expect(mocks.success).toHaveBeenCalledWith("Config written to /repo/.github/tentactl.config.ts");
    });

    it("prompts for repo details when no config exists", async () => {
        const octokit = { marker: true };
        mocks.resolveConfigPath.mockReturnValue("/repo/.github/tentactl.config.ts");
        mocks.resolveProjectRoot.mockReturnValue("/repo");
        mocks.fileExists.mockResolvedValue(false);
        mocks.text.mockResolvedValueOnce("acme").mockResolvedValueOnce("platform");
        mocks.authenticate.mockResolvedValue({ endpoint: "github.com", token: "secret" });
        mocks.getOctokit.mockReturnValue(octokit);
        mocks.fetchRemoteConfig.mockResolvedValue({ org: "acme", repo: "platform" });

        await pullCommand.run?.({ args: { config: undefined } } as never);

        expect(mocks.text).toHaveBeenCalledTimes(2);
        expect(mocks.fetchRemoteConfig).toHaveBeenCalledWith(octokit, "acme", "platform");
        expect(mocks.writeConfig).toHaveBeenCalled();
    });
});
