import { consola } from "consola";
import { confirm } from "@clack/prompts";
import { readTokenFromEnvLocal, removeTokenFromEnvLocal } from "@/lib/auth";

export async function logout() {
	const token = process.env.GH_TOKEN ?? (await readTokenFromEnvLocal(process.cwd()));
	if (!token) {
		consola.info("Not logged in (no GH_TOKEN found)");
		return;
	}

	if (process.env.GH_TOKEN) {
		consola.warn("GH_TOKEN is set in the environment — it cannot be removed by this command.");
		return;
	}

	const confirmed = await confirm({
		message: "Remove GH_TOKEN from .env.local?",
		initialValue: true,
	});

	if (confirmed) {
		await removeTokenFromEnvLocal(process.cwd());
		consola.success("Token removed from .env.local");
	}
}
