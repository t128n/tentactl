import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    readTokenFromEnvLocal: vi.fn(),
    validateToken: vi.fn(),
    info: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
    readTokenFromEnvLocal: mocks.readTokenFromEnvLocal,
    validateToken: mocks.validateToken,
}));

vi.mock("consola", () => ({
    consola: { info: mocks.info },
}));

import { whoami } from "./whoami";

describe("whoami", () => {
    it("reports when no token is available", async () => {
        mocks.readTokenFromEnvLocal.mockResolvedValue(undefined);

        await whoami();

        expect(mocks.info).toHaveBeenCalledWith("Not logged in (no GH_TOKEN found in environment or .env.local)");
    });

    it("validates the discovered token", async () => {
        mocks.readTokenFromEnvLocal.mockResolvedValue("stored-token");

        await whoami();

        expect(mocks.info).toHaveBeenCalledWith("Token source: .env.local");
        expect(mocks.validateToken).toHaveBeenCalledWith("github.com", "stored-token");
    });
});
