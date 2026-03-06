import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    promptForEndpoint: vi.fn(),
    promptForToken: vi.fn(),
    validateToken: vi.fn(),
    writeTokenToEnvLocal: vi.fn(),
    success: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
    promptForEndpoint: mocks.promptForEndpoint,
    promptForToken: mocks.promptForToken,
    validateToken: mocks.validateToken,
    writeTokenToEnvLocal: mocks.writeTokenToEnvLocal,
}));

vi.mock("consola", () => ({
    consola: { success: mocks.success },
}));

import { login } from "./login";

describe("login", () => {
    it("prompts, validates, and stores a token", async () => {
        mocks.promptForEndpoint.mockResolvedValue("github.example.com");
        mocks.promptForToken.mockResolvedValue("secret");
        mocks.validateToken.mockResolvedValue({ valid: true });

        await login();

        expect(mocks.promptForEndpoint).toHaveBeenCalled();
        expect(mocks.promptForToken).toHaveBeenCalledWith("github.example.com");
        expect(mocks.validateToken).toHaveBeenCalledWith("github.example.com", "secret");
        expect(mocks.writeTokenToEnvLocal).toHaveBeenCalledWith(process.cwd(), "secret");
        expect(mocks.success).toHaveBeenCalledWith("Token saved to .env.local");
    });
});
