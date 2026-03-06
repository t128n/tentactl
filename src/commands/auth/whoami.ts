import { consola } from "consola";
import { readTokenFromEnvLocal, validateToken } from "@/lib/auth";

export async function whoami() {
	const envToken = process.env.GH_TOKEN;
	const fileToken = await readTokenFromEnvLocal(process.cwd());

	const token = envToken ?? fileToken;
	const source = envToken ? "environment (GH_TOKEN)" : fileToken ? ".env.local" : null;

	if (!token || !source) {
		consola.info("Not logged in (no GH_TOKEN found in environment or .env.local)");
		return;
	}

	consola.info(`Token source: ${source}`);
	// Validate against github.com by default; for GHES the host would need a config
	await validateToken("github.com", token);
}
