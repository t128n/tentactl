import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	confirm: vi.fn(),
	readTokenFromEnvLocal: vi.fn(),
	removeTokenFromEnvLocal: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	success: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({ confirm: mocks.confirm }));

vi.mock("@/lib/auth", () => ({
	readTokenFromEnvLocal: mocks.readTokenFromEnvLocal,
	removeTokenFromEnvLocal: mocks.removeTokenFromEnvLocal,
}));

vi.mock("consola", () => ({
	consola: {
		info: mocks.info,
		warn: mocks.warn,
		success: mocks.success,
	},
}));

import { logout } from "./logout";

describe("logout", () => {
	it("reports when there is no token", async () => {
		mocks.readTokenFromEnvLocal.mockResolvedValue(undefined);

		await logout();

		expect(mocks.info).toHaveBeenCalledWith("Not logged in (no GH_TOKEN found)");
	});

	it("warns when GH_TOKEN is set in the environment", async () => {
		process.env.GH_TOKEN = "secret";

		await logout();

		expect(mocks.warn).toHaveBeenCalledWith(
			"GH_TOKEN is set in the environment — it cannot be removed by this command.",
		);

		delete process.env.GH_TOKEN;
	});

	it("removes the stored token after confirmation", async () => {
		mocks.readTokenFromEnvLocal.mockResolvedValue("secret");
		mocks.confirm.mockResolvedValue(true);

		await logout();

		expect(mocks.removeTokenFromEnvLocal).toHaveBeenCalledWith(process.cwd());
		expect(mocks.success).toHaveBeenCalledWith("Token removed from .env.local");
	});
});
