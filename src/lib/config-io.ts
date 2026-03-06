import { resolve, dirname, basename } from "pathe";
import { access, constants, writeFile } from "node:fs/promises";
import { consola } from "consola";
import type { TentactlConfig, LabelsConfig, TeamsConfig, RulesetsConfig } from "./types";

export const DEFAULT_CONFIG_PATH = ".github/tentactl.config.ts";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function resolveConfigPath(input?: string): string {
    return input
        ? resolve(process.cwd(), input)
        : resolve(process.cwd(), DEFAULT_CONFIG_PATH);
}

/**
 * Derive the project root from the config path.
 * If the config lives inside a `.github/` directory the root is its parent.
 * Otherwise the root is the directory containing the config file.
 */
export function resolveProjectRoot(configPath: string): string {
    const dir = dirname(configPath);
    return basename(dir) === ".github" ? dirname(dir) : dir;
}

export async function fileExists(filePath: string): Promise<boolean> {
    return access(filePath, constants.F_OK).then(() => true).catch(() => false);
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

export async function loadConfig(configPath: string): Promise<TentactlConfig> {
    const exists = await fileExists(configPath);
    if (!exists) {
        consola.error(`Config file not found: ${configPath}`);
        process.exit(1);
    }

    const mod = await import(configPath).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        consola.error(`Failed to load config from ${configPath}: ${msg}`);
        process.exit(1);
    });

    return (mod.default ?? mod) as TentactlConfig;
}

// ---------------------------------------------------------------------------
// Config serialization  →  .ts file content
// ---------------------------------------------------------------------------

/** Serialize a TentactlConfig back into a valid tentactl.config.ts file string. */
export function serializeConfig(config: TentactlConfig): string {
    const lines: string[] = [
        `import { defineConfig } from 'tentactl';`,
        ``,
        `export default defineConfig({`,
    ];

    if (config.host && config.host !== "github.com") {
        lines.push(`    host: ${JSON.stringify(config.host)},`);
    }

    lines.push(`    org: ${JSON.stringify(config.org)},`);
    lines.push(`    repo: ${JSON.stringify(config.repo)},`);

    if (config.strict !== undefined) {
        lines.push(`    strict: ${config.strict},`);
    }

    // repository
    if (config.repository && Object.keys(config.repository).length > 0) {
        lines.push(`    repository: {`);
        for (const [key, value] of Object.entries(config.repository)) {
            if (value !== undefined) {
                lines.push(`        ${key}: ${JSON.stringify(value)},`);
            }
        }
        lines.push(`    },`);
    }

    // topics
    if (config.topics !== undefined) {
        lines.push(`    topics: ${JSON.stringify(config.topics)},`);
    }

    // branch_protection
    if (config.branch_protection) {
        lines.push(`    branch_protection: ${serializeObject(config.branch_protection, 1)},`);
    }

    // labels
    if (config.labels) {
        lines.push(`    labels: {`);
        if (config.labels.strict !== undefined) {
            lines.push(`        strict: ${config.labels.strict},`);
        }
        lines.push(`        items: [`);
        for (const label of config.labels.items) {
            const parts: string[] = [`name: ${JSON.stringify(label.name)}`, `color: ${JSON.stringify(label.color)}`];
            if (label.description !== undefined) {
                parts.push(`description: ${JSON.stringify(label.description)}`);
            }
            lines.push(`            { ${parts.join(", ")} },`);
        }
        lines.push(`        ],`);
        lines.push(`    },`);
    }

    // teams
    if (config.teams) {
        lines.push(`    teams: {`);
        if (config.teams.strict !== undefined) {
            lines.push(`        strict: ${config.teams.strict},`);
        }
        lines.push(`        items: [`);
        for (const team of config.teams.items) {
            lines.push(`            { team_slug: ${JSON.stringify(team.team_slug)}, permission: ${JSON.stringify(team.permission)} },`);
        }
        lines.push(`        ],`);
        lines.push(`    },`);
    }

    // rulesets
    if (config.rulesets) {
        lines.push(`    rulesets: {`);
        if (config.rulesets.strict !== undefined) {
            lines.push(`        strict: ${config.rulesets.strict},`);
        }
        lines.push(`        items: [`);
        for (const ruleset of config.rulesets.items) {
            lines.push(`            ${serializeObject(ruleset, 3)},`);
        }
        lines.push(`        ],`);
        lines.push(`    },`);
    }

    // environments
    if (config.environments && config.environments.length > 0) {
        lines.push(`    environments: [`);
        for (const env of config.environments) {
            lines.push(`        ${serializeObject(env, 2)},`);
        }
        lines.push(`    ],`);
    }

    // custom_properties
    if (config.custom_properties && Object.keys(config.custom_properties).length > 0) {
        lines.push(`    custom_properties: {`);
        for (const [key, value] of Object.entries(config.custom_properties)) {
            lines.push(`        ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
        }
        lines.push(`    },`);
    }

    // interaction_limit
    if ("interaction_limit" in config) {
        if (config.interaction_limit === null) {
            lines.push(`    interaction_limit: null,`);
        } else if (config.interaction_limit !== undefined) {
            lines.push(`    interaction_limit: ${serializeObject(config.interaction_limit, 1)},`);
        }
    }

    lines.push(`});`);
    lines.push(``);

    return lines.join("\n");
}

/** Recursively serialize a plain object with indentation. */
function serializeObject(obj: unknown, depth: number): string {
    if (obj === null) return "null";
    if (Array.isArray(obj)) {
        if (obj.length === 0) return "[]";
        const indent = "    ".repeat(depth + 1);
        const closing = "    ".repeat(depth);
        const items = obj.map((item) => `${indent}${serializeObject(item, depth + 1)}`);
        return `[\n${items.join(",\n")},\n${closing}]`;
    }
    if (typeof obj === "object") {
        const entries = Object.entries(obj as Record<string, unknown>).filter(([, v]) => v !== undefined);
        if (entries.length === 0) return "{}";
        const indent = "    ".repeat(depth + 1);
        const closing = "    ".repeat(depth);
        const parts = entries.map(([k, v]) => `${indent}${k}: ${serializeObject(v, depth + 1)}`);
        return `{\n${parts.join(",\n")},\n${closing}}`;
    }
    return JSON.stringify(obj);
}

// ---------------------------------------------------------------------------
// Write config file
// ---------------------------------------------------------------------------

export async function writeConfig(configPath: string, config: TentactlConfig): Promise<void> {
    const content = serializeConfig(config);
    await writeFile(configPath, content, "utf-8");
}
