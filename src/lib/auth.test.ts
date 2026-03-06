import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	select: vi.fn(),
	text: vi.fn(),
	confirm: vi.fn(),
	password: vi.fn(),
	box: vi.fn(),
	open: vi.fn(),
	success: vi.fn(),
	info: vi.fn(),
	error: vi.fn(),
	usersGetAuthenticated: vi.fn(),
	orgsListForAuthenticatedUser: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
	select: mocks.select,
	text: mocks.text,
	confirm: mocks.confirm,
	password: mocks.password,
	box: mocks.box,
}));

vi.mock("open", () => ({ default: mocks.open }));

vi.mock("consola", () => ({
	consola: {
		success: mocks.success,
		info: mocks.info,
		error: mocks.error,
	},
}));

vi.mock("@octokit/rest", () => ({
	Octokit: class {
		options: { auth?: string; baseUrl?: string };
		rest: {
			users: { getAuthenticated: typeof mocks.usersGetAuthenticated };
			orgs: { listForAuthenticatedUser: typeof mocks.orgsListForAuthenticatedUser };
		};

		constructor(options: { auth?: string; baseUrl?: string }) {
			this.options = options;
			this.rest = {
				users: { getAuthenticated: mocks.usersGetAuthenticated },
				orgs: { listForAuthenticatedUser: mocks.orgsListForAuthenticatedUser },
			};
		}
	},
}));

import {
	authenticate,
	getOctokit,
	readTokenFromEnvLocal,
	removeTokenFromEnvLocal,
	resolveToken,
	validateToken,
	writeTokenToEnvLocal,
} from "./auth";

describe("auth", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.GH_TOKEN;
		mocks.usersGetAuthenticated.mockResolvedValue({
			data: { login: "octocat" },
			headers: {},
		});
		mocks.orgsListForAuthenticatedUser.mockResolvedValue({ data: [{ login: "acme" }] });
	});

	afterEach(() => {
		delete process.env.GH_TOKEN;
	});

	it("reads, writes, and removes tokens from .env.local", async () => {
		const dir = await mkdtemp(join(tmpdir(), "tentactl-auth-"));

		await writeTokenToEnvLocal(dir, "secret");
		await expect(readTokenFromEnvLocal(dir)).resolves.toBe("secret");

		await removeTokenFromEnvLocal(dir);
		await expect(readTokenFromEnvLocal(dir)).resolves.toBeUndefined();

		await rm(dir, { recursive: true, force: true });
	});

	it("preserves unrelated env entries when removing a token", async () => {
		const dir = await mkdtemp(join(tmpdir(), "tentactl-auth-"));
		const envPath = join(dir, ".env.local");

		await writeFile(envPath, "OTHER=value\nGH_TOKEN=secret\n", "utf8");
		await removeTokenFromEnvLocal(dir);

		await expect(readFile(envPath, "utf8")).resolves.toBe("OTHER=value\n");
		await rm(dir, { recursive: true, force: true });
	});

	it("prefers GH_TOKEN from the environment", async () => {
		process.env.GH_TOKEN = "env-token";

		await expect(resolveToken("/unused")).resolves.toBe("env-token");
		expect(mocks.info).not.toHaveBeenCalled();
	});

	it("reads an existing token from .env.local before prompting", async () => {
		const dir = await mkdtemp(join(tmpdir(), "tentactl-auth-"));
		await writeTokenToEnvLocal(dir, "stored-token");

		await expect(resolveToken(dir)).resolves.toBe("stored-token");
		expect(mocks.info).not.toHaveBeenCalled();

		await rm(dir, { recursive: true, force: true });
	});

	it("prompts and stores a token when none exists", async () => {
		const dir = await mkdtemp(join(tmpdir(), "tentactl-auth-"));
		mocks.select.mockResolvedValue("enter");
		mocks.password.mockResolvedValue("prompt-token");

		await expect(resolveToken(dir)).resolves.toBe("prompt-token");
		await expect(readTokenFromEnvLocal(dir)).resolves.toBe("prompt-token");
		expect(mocks.info).toHaveBeenCalledWith(
			"No GH_TOKEN found. Please provide a Personal Access Token.",
		);

		await rm(dir, { recursive: true, force: true });
	});

	it("creates an Octokit client with the correct base URL", () => {
		const client = getOctokit({ endpoint: "github.example.com", token: "secret" }) as unknown as {
			options: { auth: string; baseUrl: string };
		};

		expect(client.options).toEqual({
			auth: "secret",
			baseUrl: "https://github.example.com/api/v3",
		});
	});

	it("validates tokens and reports login details", async () => {
		const result = await validateToken("github.com", "secret");

		expect(result).toEqual({ valid: true, expiresAt: undefined, login: "octocat", orgs: ["acme"] });
		expect(mocks.success).toHaveBeenCalledWith("Authenticated as octocat; orgs: acme");
	});

	it("returns invalid when authentication fails", async () => {
		mocks.usersGetAuthenticated.mockRejectedValue({ status: 401 });

		await expect(validateToken("github.com", "secret")).resolves.toEqual({ valid: false });
		expect(mocks.error).toHaveBeenCalledWith("Invalid token. Please check and try again.");
	});

	it("authenticates using the resolved token", async () => {
		const dir = await mkdtemp(join(tmpdir(), "tentactl-auth-"));
		await writeTokenToEnvLocal(dir, "stored-token");

		await expect(authenticate("github.com", dir)).resolves.toEqual({
			endpoint: "github.com",
			token: "stored-token",
		});

		await rm(dir, { recursive: true, force: true });
	});
});
