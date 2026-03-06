import { Octokit } from "@octokit/rest";
import { readFile, writeFile, access, constants } from "node:fs/promises";
import { join } from "pathe";
import { text, confirm, select, password, box } from "@clack/prompts";
import { consola } from "consola";
import open from "open";

const REQUIRED_SCOPES = ["repo", "read:org", "workflow"];
const ENV_FILE = ".env.local";
const TOKEN_KEY = "GH_TOKEN";

export interface AuthConfig {
	endpoint: string;
	token: string;
}

// ---------------------------------------------------------------------------
// .env.local helpers
// ---------------------------------------------------------------------------

async function fileExists(filePath: string): Promise<boolean> {
	return access(filePath, constants.F_OK)
		.then(() => true)
		.catch(() => false);
}

function parseEnvFile(content: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		let value = trimmed.slice(eqIdx + 1).trim();
		// Strip surrounding quotes
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		result[key] = value;
	}
	return result;
}

function serializeEnvFile(entries: Record<string, string>): string {
	return (
		Object.entries(entries)
			.map(([k, v]) => `${k}=${v}`)
			.join("\n") + "\n"
	);
}

export async function readTokenFromEnvLocal(projectRoot: string): Promise<string | undefined> {
	const envPath = join(projectRoot, ENV_FILE);
	if (!(await fileExists(envPath))) return undefined;
	try {
		const content = await readFile(envPath, "utf-8");
		return parseEnvFile(content)[TOKEN_KEY];
	} catch {
		return undefined;
	}
}

export async function writeTokenToEnvLocal(projectRoot: string, token: string): Promise<void> {
	const envPath = join(projectRoot, ENV_FILE);
	let entries: Record<string, string> = {};
	if (await fileExists(envPath)) {
		const content = await readFile(envPath, "utf-8");
		entries = parseEnvFile(content);
	}
	entries[TOKEN_KEY] = token;
	await writeFile(envPath, serializeEnvFile(entries), "utf-8");
}

export async function removeTokenFromEnvLocal(projectRoot: string): Promise<void> {
	const envPath = join(projectRoot, ENV_FILE);
	if (!(await fileExists(envPath))) return;
	const content = await readFile(envPath, "utf-8");
	const entries = parseEnvFile(content);
	delete entries[TOKEN_KEY];
	if (Object.keys(entries).length === 0) {
		const { unlink } = await import("node:fs/promises");
		await unlink(envPath);
	} else {
		await writeFile(envPath, serializeEnvFile(entries), "utf-8");
	}
}

// ---------------------------------------------------------------------------
// Token resolution: env → .env.local → prompt → write to .env.local
// ---------------------------------------------------------------------------

export async function resolveToken(projectRoot: string): Promise<string> {
	// 1. Already in environment (e.g. CI)
	if (process.env[TOKEN_KEY]) {
		return process.env[TOKEN_KEY]!;
	}

	// 2. .env.local
	const stored = await readTokenFromEnvLocal(projectRoot);
	if (stored) {
		return stored;
	}

	// 3. Prompt
	consola.info("No GH_TOKEN found. Please provide a Personal Access Token.");
	const token = await promptForToken();
	await writeTokenToEnvLocal(projectRoot, token);
	consola.success(`Token saved to ${ENV_FILE}`);
	return token;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export async function authenticate(host: string, projectRoot: string): Promise<AuthConfig> {
	const token = await resolveToken(projectRoot);
	const result = await validateToken(host, token);
	if (!result.valid) {
		process.exit(1);
	}
	return { endpoint: host, token };
}

export function getOctokit(auth: AuthConfig): Octokit {
	return new Octokit({
		auth: auth.token,
		baseUrl:
			auth.endpoint === "github.com" ? "https://api.github.com" : `https://${auth.endpoint}/api/v3`,
	});
}

// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------

export async function validateToken(
	endpoint: string,
	token: string,
): Promise<{ valid: boolean; expiresAt?: string; login?: string; orgs?: string[] }> {
	try {
		const octokit = new Octokit({
			auth: token,
			baseUrl: endpoint === "github.com" ? "https://api.github.com" : `https://${endpoint}/api/v3`,
		});

		const response = await octokit.rest.users.getAuthenticated();
		const expiresAt = response.headers["github-authentication-token-expiration"] as
			| string
			| undefined;

		let expiryMsg = "";
		if (expiresAt) {
			const daysLeft = Math.floor(
				(new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
			);
			expiryMsg =
				daysLeft > 0 ? `expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "expired";
		}

		let orgs: string[] = [];
		try {
			const orgsList = await octokit.rest.orgs.listForAuthenticatedUser({ per_page: 100 });
			orgs = orgsList.data.map((org) => org.login);
		} catch {
			// token may lack read:org scope
		}

		let authMsg = `Authenticated as ${response.data.login}`;
		if (expiryMsg) authMsg += ` (${expiryMsg})`;
		if (orgs.length > 0) authMsg += `; orgs: ${orgs.join(", ")}`;
		if (endpoint !== "github.com") authMsg += ` on ${endpoint}`;
		consola.success(authMsg);

		return { valid: true, expiresAt, login: response.data.login, orgs };
	} catch (err: any) {
		if (err.status === 401) {
			consola.error("Invalid token. Please check and try again.");
		} else if (err.status === 403) {
			consola.error("Token lacks required permissions.");
		} else {
			consola.error(`Authentication failed: ${err.message}`);
		}
		return { valid: false };
	}
}

// ---------------------------------------------------------------------------
// Interactive prompts
// ---------------------------------------------------------------------------

/** Still used by `login` where no config file is available yet. */
export async function promptForEndpoint(): Promise<string> {
	const choice = await select({
		message: "Which GitHub instance?",
		options: [
			{ value: "github.com", label: "GitHub.com (default)" },
			{ value: "custom", label: "GitHub Enterprise Server (custom)" },
		],
	});

	if (choice === "custom") {
		const custom = await text({
			message: "Enter your GitHub Enterprise hostname:",
			placeholder: "github.mycompany.com",
			validate: (v) => {
				if (!v?.trim()) return "Hostname is required";
				if (v.includes("://")) return "Enter hostname only, not a URL";
			},
		});
		return (custom as string).trim();
	}

	return "github.com";
}

export async function promptForToken(endpoint = "github.com"): Promise<string> {
	const action = await select({
		message: "How would you like to authenticate?",
		options: [
			{ value: "create", label: "Create a new PAT" },
			{ value: "enter", label: "Enter existing token" },
		],
	});

	if (action === "create") {
		const scopes = REQUIRED_SCOPES.join(",");
		const url =
			endpoint === "github.com"
				? `https://github.com/settings/tokens/new?scopes=${scopes}&description=tentactl&expiration=365`
				: `https://${endpoint}/settings/tokens/new?scopes=${scopes}&description=tentactl&expiration=365`;

		box(`Create a new PAT

1. Open: ${url}
2. Select scopes: ${REQUIRED_SCOPES.join(", ")}
3. Set expiration (recommended: 365 days)
4. Generate token and paste it below

Note: The token will be saved to .env.local in your project root.`);

		const shouldOpen = await confirm({
			message: "Open token page in browser?",
			initialValue: true,
		});
		if (shouldOpen) open(url);
	}

	const token = await password({
		message: "Enter your Personal Access Token:",
		validate: (v) => {
			if (!v) return "Token is required";
		},
	});
	return (token as string).trim();
}
