import type { Octokit } from "@octokit/rest";
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import { consola } from "consola";
import type {
    TentactlConfig,
    LabelConfig,
    TeamConfig,
    RulesetConfig,
    RulesetsConfig,
    EnvironmentConfig,
    InteractionLimitConfig,
    CustomPropertyValue,
} from "./types";

type BranchProtectionParams = RestEndpointMethodTypes["repos"]["updateBranchProtection"]["parameters"];
type CreateLabelParams = RestEndpointMethodTypes["issues"]["createLabel"]["parameters"];

export async function applyConfig(octokit: Octokit, config: TentactlConfig): Promise<void> {
    await applyRepository(octokit, config);
    await applyBranchProtection(octokit, config);
    await applyLabels(octokit, config);
    await applyTeams(octokit, config);
    await applyRulesets(octokit, config);
    await applyEnvironments(octokit, config);
    await applyCustomProperties(octokit, config);
    await applyInteractionLimit(octokit, config);
}

async function applyRepository(octokit: Octokit, config: TentactlConfig): Promise<void> {
    const { org, repo, repository, topics } = config;

    if (repository && Object.keys(repository).length > 0) {
        try {
            await octokit.rest.repos.update({
                owner: org,
                repo,
                ...repository,
            });
            consola.success(`Repository settings applied for ${org}/${repo}`);
        } catch (err: unknown) {
            consola.error(`Failed to update repository settings: ${formatError(err)}`);
        }
    } else {
        consola.debug("No repository settings to apply");
    }

    if (topics !== undefined) {
        try {
            await octokit.rest.repos.replaceAllTopics({
                owner: org,
                repo,
                names: topics,
            });
            consola.success(`Topics applied for ${org}/${repo}: [${topics.join(", ")}]`);
        } catch (err: unknown) {
            consola.error(`Failed to replace topics: ${formatError(err)}`);
        }
    }
}

async function applyBranchProtection(octokit: Octokit, config: TentactlConfig): Promise<void> {
    const { org, repo, branch_protection } = config;

    if (!branch_protection) {
        consola.debug("No branch protection settings to apply");
        return;
    }

    const { branch, ...rest } = branch_protection;

    try {
        await octokit.rest.repos.updateBranchProtection({
            owner: org,
            repo,
            branch,
            ...rest,
        } as BranchProtectionParams);
        consola.success(`Branch protection applied for ${org}/${repo}@${branch}`);
    } catch (err: unknown) {
        consola.error(`Failed to update branch protection for ${branch}: ${formatError(err)}`);
    }
}

async function applyLabels(octokit: Octokit, config: TentactlConfig): Promise<void> {
    const { org, repo, labels, strict: globalStrict } = config;

    if (!labels) {
        consola.debug("No labels to apply");
        return;
    }

    const { items, strict: sectionStrict } = labels;
    const isStrict = resolveStrict(globalStrict, sectionStrict);

    // Upsert all configured labels
    for (const label of items) {
        await upsertLabel(octokit, org, repo, label);
    }

    // Strict: delete labels not in config
    if (isStrict) {
        await deleteUnlistedLabels(octokit, org, repo, items);
    }
}

async function upsertLabel(octokit: Octokit, org: string, repo: string, label: LabelConfig): Promise<void> {
    try {
        await octokit.rest.issues.createLabel({
            owner: org,
            repo,
            ...label,
        } as CreateLabelParams);
        consola.success(`Label "${label.name}" created`);
    } catch (err: unknown) {
        if (isHttpError(err, 422)) {
            try {
                await octokit.rest.issues.updateLabel({
                    owner: org,
                    repo,
                    name: label.name,
                    current_name: label.name,
                    color: label.color,
                    description: label.description,
                });
                consola.success(`Label "${label.name}" updated`);
            } catch (updateErr: unknown) {
                consola.error(`Failed to update label "${label.name}": ${formatError(updateErr)}`);
            }
        } else {
            consola.error(`Failed to create label "${label.name}": ${formatError(err)}`);
        }
    }
}

async function deleteUnlistedLabels(octokit: Octokit, org: string, repo: string, configuredLabels: LabelConfig[]): Promise<void> {
    const configuredNames = new Set(configuredLabels.map((l) => l.name));

    try {
        const existing = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
            owner: org,
            repo,
            per_page: 100,
        });

        for (const label of existing) {
            if (!configuredNames.has(label.name)) {
                try {
                    await octokit.rest.issues.deleteLabel({
                        owner: org,
                        repo,
                        name: label.name,
                    });
                    consola.success(`Label "${label.name}" deleted (strict mode)`);
                } catch (err: unknown) {
                    consola.error(`Failed to delete label "${label.name}": ${formatError(err)}`);
                }
            }
        }
    } catch (err: unknown) {
        consola.error(`Failed to list existing labels: ${formatError(err)}`);
    }
}

async function applyTeams(octokit: Octokit, config: TentactlConfig): Promise<void> {
    const { org, repo, teams, strict: globalStrict } = config;

    if (!teams) {
        consola.debug("No teams to apply");
        return;
    }

    const { items, strict: sectionStrict } = teams;
    const isStrict = resolveStrict(globalStrict, sectionStrict);

    // Grant / update permissions for all configured teams
    for (const team of items) {
        try {
            await octokit.rest.teams.addOrUpdateRepoPermissionsInOrg({
                org,
                owner: org,
                repo,
                team_slug: team.team_slug,
                permission: team.permission,
            });
            consola.success(`Team "${team.team_slug}" granted ${team.permission} on ${org}/${repo}`);
        } catch (err: unknown) {
            consola.error(`Failed to set permissions for team "${team.team_slug}": ${formatError(err)}`);
        }
    }

    // Strict: remove teams that have access but are not in config
    if (isStrict) {
        await removeUnlistedTeams(octokit, org, repo, items);
    }
}

async function removeUnlistedTeams(octokit: Octokit, org: string, repo: string, configuredTeams: TeamConfig[]): Promise<void> {
    const configuredSlugs = new Set(configuredTeams.map((t) => t.team_slug));

    try {
        const existing = await octokit.paginate(octokit.rest.repos.listTeams, {
            owner: org,
            repo,
            per_page: 100,
        });

        for (const team of existing) {
            if (!configuredSlugs.has(team.slug)) {
                try {
                    await octokit.rest.teams.removeRepoInOrg({
                        org,
                        team_slug: team.slug,
                        owner: org,
                        repo,
                    });
                    consola.success(`Team "${team.slug}" removed (strict mode)`);
                } catch (err: unknown) {
                    consola.error(`Failed to remove team "${team.slug}": ${formatError(err)}`);
                }
            }
        }
    } catch (err: unknown) {
        consola.error(`Failed to list existing teams: ${formatError(err)}`);
    }
}

// ---------------------------------------------------------------------------
// Rulesets (GraphQL)
// ---------------------------------------------------------------------------

const LIST_RULESETS_QUERY = `
  query ListRepositoryRulesets($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
      rulesets(first: 100, includeParents: false) {
        nodes {
          databaseId
          name
        }
      }
    }
  }
`;

const CREATE_RULESET_MUTATION = `
  mutation CreateRepositoryRuleset($input: CreateRepositoryRulesetInput!) {
    createRepositoryRuleset(input: $input) {
      ruleset { databaseId name }
    }
  }
`;

const UPDATE_RULESET_MUTATION = `
  mutation UpdateRepositoryRuleset($input: UpdateRepositoryRulesetInput!) {
    updateRepositoryRuleset(input: $input) {
      ruleset { databaseId name }
    }
  }
`;

const DELETE_RULESET_MUTATION = `
  mutation DeleteRepositoryRuleset($input: DeleteRepositoryRulesetInput!) {
    deleteRepositoryRuleset(input: $input) {
      clientMutationId
    }
  }
`;

interface RulesetNode {
    databaseId: number;
    name: string;
}

interface ListRulesetsResult {
    repository: {
        id: string;
        rulesets: { nodes: RulesetNode[] };
    };
}

function buildRulesetInput(ruleset: RulesetConfig): Record<string, unknown> {
    const input: Record<string, unknown> = {
        name: ruleset.name,
        enforcement: ruleset.enforcement,
    };

    if (ruleset.target !== undefined) {
        input.target = ruleset.target;
    }

    // conditions is non-nullable in the GraphQL schema — always send it, even as {}
    const conditions: Record<string, unknown> = {};
    if (ruleset.conditions?.refName) {
        conditions.refName = ruleset.conditions.refName;
    }
    input.conditions = conditions;

    if (ruleset.rules && ruleset.rules.length > 0) {
        input.rules = ruleset.rules.map((r) => ({
            type: r.type,
            ...(r.parameters ? { parameters: r.parameters } : {}),
        }));
    }

    if (ruleset.bypassActors && ruleset.bypassActors.length > 0) {
        input.bypassActors = ruleset.bypassActors;
    }

    return input;
}

async function applyRulesets(octokit: Octokit, config: TentactlConfig): Promise<void> {
    const { org, repo, rulesets, strict: globalStrict } = config;

    if (!rulesets) {
        consola.debug("No rulesets to apply");
        return;
    }

    const { items, strict: sectionStrict } = rulesets as RulesetsConfig;
    const isStrict = resolveStrict(globalStrict, sectionStrict);
    const gql = (octokit as unknown as { graphql: <T>(q: string, v?: Record<string, unknown>) => Promise<T> }).graphql;

    let repoNodeId: string;
    let existingRulesets: RulesetNode[];

    try {
        const data = await gql<ListRulesetsResult>(LIST_RULESETS_QUERY, { owner: org, name: repo });
        repoNodeId = data.repository.id;
        existingRulesets = data.repository.rulesets.nodes;
    } catch (err: unknown) {
        consola.error(`Failed to fetch existing rulesets: ${formatError(err)}`);
        return;
    }

    const existingByName = new Map(existingRulesets.map((r) => [r.name, r]));
    const configuredNames = new Set(items.map((r) => r.name));

    for (const ruleset of items) {
        const existing = existingByName.get(ruleset.name);

        if (existing) {
            try {
                await gql(UPDATE_RULESET_MUTATION, {
                    input: {
                        rulesetId: existing.databaseId,
                        ...buildRulesetInput(ruleset),
                    },
                });
                consola.success(`Ruleset "${ruleset.name}" updated`);
            } catch (err: unknown) {
                consola.error(`Failed to update ruleset "${ruleset.name}": ${formatError(err)}`);
            }
        } else {
            try {
                await gql(CREATE_RULESET_MUTATION, {
                    input: {
                        sourceId: repoNodeId,
                        ...buildRulesetInput(ruleset),
                    },
                });
                consola.success(`Ruleset "${ruleset.name}" created`);
            } catch (err: unknown) {
                consola.error(`Failed to create ruleset "${ruleset.name}": ${formatError(err)}`);
            }
        }
    }

    if (isStrict) {
        for (const existing of existingRulesets) {
            if (!configuredNames.has(existing.name)) {
                try {
                    await gql(DELETE_RULESET_MUTATION, {
                        input: { rulesetId: existing.databaseId },
                    });
                    consola.success(`Ruleset "${existing.name}" deleted (strict mode)`);
                } catch (err: unknown) {
                    consola.error(`Failed to delete ruleset "${existing.name}": ${formatError(err)}`);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Environments (REST)
// ---------------------------------------------------------------------------

async function applyEnvironments(octokit: Octokit, config: TentactlConfig): Promise<void> {
    const { org, repo, environments } = config;

    if (!environments) {
        consola.debug("No environments to apply");
        return;
    }

    for (const env of environments) {
        try {
            await octokit.request("PUT /repos/{owner}/{repo}/environments/{environment_name}", {
                owner: org,
                repo,
                environment_name: env.name,
                ...(env.wait_timer !== undefined ? { wait_timer: env.wait_timer } : {}),
                ...(env.prevent_self_review !== undefined ? { prevent_self_review: env.prevent_self_review } : {}),
                ...(env.deployment_branch_policy !== undefined ? { deployment_branch_policy: env.deployment_branch_policy } : {}),
            });
            consola.success(`Environment "${env.name}" applied`);
        } catch (err: unknown) {
            consola.error(`Failed to apply environment "${env.name}": ${formatError(err)}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Custom Properties (REST)
// ---------------------------------------------------------------------------

async function applyCustomProperties(octokit: Octokit, config: TentactlConfig): Promise<void> {
    const { org, repo, custom_properties } = config;

    if (!custom_properties) {
        consola.debug("No custom properties to apply");
        return;
    }

    const properties = Object.entries(custom_properties).map(
        ([property_name, value]: [string, CustomPropertyValue]) => ({ property_name, value }),
    );

    if (properties.length === 0) return;

    try {
        await octokit.request("PATCH /repos/{owner}/{repo}/properties/values", {
            owner: org,
            repo,
            properties,
        });
        consola.success(`Custom properties applied for ${org}/${repo}`);
    } catch (err: unknown) {
        consola.error(`Failed to apply custom properties: ${formatError(err)}`);
    }
}

// ---------------------------------------------------------------------------
// Interaction Limits (REST)
// ---------------------------------------------------------------------------

const INTERACTION_LIMIT_MAP: Record<string, string> = {
    EXISTING_USERS: "existing_users",
    CONTRIBUTORS_ONLY: "contributors_only",
    COLLABORATORS_ONLY: "collaborators_only",
    NO_LIMIT: "no_limit",
};

const INTERACTION_LIMIT_EXPIRY_MAP: Record<string, string> = {
    ONE_DAY: "one_day",
    THREE_DAYS: "three_days",
    ONE_WEEK: "one_week",
    ONE_MONTH: "one_month",
    SIX_MONTHS: "six_months",
};

async function applyInteractionLimit(octokit: Octokit, config: TentactlConfig): Promise<void> {
    const { org, repo } = config;

    if (!("interaction_limit" in config)) {
        consola.debug("No interaction limit to apply");
        return;
    }

    const interaction_limit = config.interaction_limit as InteractionLimitConfig | null;

    if (interaction_limit === null) {
        try {
            await octokit.request("DELETE /repos/{owner}/{repo}/interaction-limits", {
                owner: org,
                repo,
            });
            consola.success(`Interaction limit removed for ${org}/${repo}`);
        } catch (err: unknown) {
            consola.error(`Failed to remove interaction limit: ${formatError(err)}`);
        }
        return;
    }

    const restLimit = INTERACTION_LIMIT_MAP[interaction_limit.limit];
    if (!restLimit) {
        consola.error(`Unknown interaction limit value: ${interaction_limit.limit}`);
        return;
    }

    try {
        type RestLimit = "existing_users" | "contributors_only" | "collaborators_only";
        type RestExpiry = "one_day" | "three_days" | "one_week" | "one_month" | "six_months";
        await octokit.request("PUT /repos/{owner}/{repo}/interaction-limits", {
            owner: org,
            repo,
            limit: restLimit as RestLimit,
            ...(interaction_limit.expiry
                ? { expiry: INTERACTION_LIMIT_EXPIRY_MAP[interaction_limit.expiry] as RestExpiry }
                : {}),
        });
        consola.success(`Interaction limit "${interaction_limit.limit}" applied for ${org}/${repo}`);
    } catch (err: unknown) {
        consola.error(`Failed to apply interaction limit: ${formatError(err)}`);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveStrict(globalStrict: boolean | undefined, sectionStrict: boolean | undefined): boolean {
    return sectionStrict ?? globalStrict ?? false;
}

function isHttpError(err: unknown, status: number): boolean {
    return (
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        (err as { status: number }).status === status
    );
}

function formatError(err: unknown): string {
    if (typeof err === "object" && err !== null && "message" in err) {
        return (err as { message: string }).message;
    }
    return String(err);
}
