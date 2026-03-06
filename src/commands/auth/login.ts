import { consola } from "consola";
import { promptForEndpoint, promptForToken, validateToken, writeTokenToEnvLocal } from "@/lib/auth";

export async function login() {
    const endpoint = await promptForEndpoint();
    const token = await promptForToken(endpoint);
    const result = await validateToken(endpoint, token);
    if (!result.valid) {
        process.exit(1);
    }
    await writeTokenToEnvLocal(process.cwd(), token);
    consola.success(`Token saved to .env.local`);
}
