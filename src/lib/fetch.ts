import type { Octokit } from "@octokit/rest";
import { consola } from "consola";
import type {
	TentactlConfig,
	LabelConfig,
	CollaboratorConfig,
	TeamConfig,
	RulesetConfig,
	RulesetBypassActor,
	EnvironmentConfig,
	CustomPropertyValue,
	InteractionLimitConfig,
	InteractionLimit,
	InteractionLimitExpiry,
	RepositoryPermission,
} from "./types";

/**
 * Fetch the current state of a GitHub repository and map it to a TentactlConfig.
 * `strict` is intentionally omitted — it is a local-only directive.
 */
export async function fetchRemoteConfig(
	octokit: Octokit,
	org: string,
	repo: string,
): Promise<TentactlConfig> {
	const config: TentactlConfig = { org, repo };

	await Promise.all([
		fetchRepository(octokit, org, repo, config),
		fetchTopics(octokit, org, repo, config),
		fetchLabels(octokit, org, repo, config),
		fetchCollaborators(octokit, org, repo, config),
		fetchTeams(octokit, org, repo, config),
		fetchRulesets(octokit, org, repo, config),
		fetchEnvironments(octokit, org, repo, config),
		fetchCustomProperties(octokit, org, repo, config),
		fetchInteractionLimit(octokit, org, repo, config),
	]);

	// Branch protection depends on knowing the default branch (set by fetchRepository)
	await fetchBranchProtection(octokit, org, repo, config);

	return config;
}

/**
 * Fields from the GitHub repo API response that are safe to round-trip
 * through TentactlConfig. Ordered roughly by category.
 *
 * Not included (no REST API equivalent):
 *   - sponsorship button  → configure via FUNDING.yml
 *   - Git LFS in archives → no API
 *   - auto-close linked issues → always-on GitHub behaviour, no API toggle
 */
const REPO_FIELDS = [
	// Basic info
	"description",
	"homepage",
	"private",
	"visibility",
	// Features
	"has_issues",
	"has_projects",
	"has_wiki",
	"has_discussions",
	"is_template",
	// Merge strategies
	"allow_merge_commit",
	"merge_commit_title",
	"merge_commit_message",
	"allow_squash_merge",
	"squash_merge_commit_title",
	"squash_merge_commit_message",
	"allow_rebase_merge",
	// Pull-request automation
	"allow_auto_merge",
	"delete_branch_on_merge",
	"allow_update_branch",
	// Governance
	"web_commit_signoff_required",
	"archived",
] as const;

async function fetchRepository(
	octokit: Octokit,
	org: string,
	repo: string,
	config: TentactlConfig,
): Promise<void> {
	try {
		const { data } = await octokit.rest.repos.get({ owner: org, repo });

		const repository: Record<string, unknown> = {};
		for (const field of REPO_FIELDS) {
			const value = (data as Record<string, unknown>)[field];
			// Normalise null → undefined so the field is omitted during serialisation
			if (value !== null && value !== undefined) {
				repository[field] = value;
			}
		}

		config.repository = repository as TentactlConfig["repository"];

		// Stash default branch for branch protection fetch (not part of TentactlConfig)
		(config as any)._defaultBranch = data.default_branch;
	} catch (err: unknown) {
		consola.warn(`Could not fetch repository settings: ${formatError(err)}`);
	}
}

async function fetchTopics(
	octokit: Octokit,
	org: string,
	repo: string,
	config: TentactlConfig,
): Promise<void> {
	try {
		const { data } = await octokit.rest.repos.getAllTopics({ owner: org, repo });
		config.topics = data.names;
	} catch (err: unknown) {
		consola.warn(`Could not fetch topics: ${formatError(err)}`);
	}
}

async function fetchBranchProtection(
	octokit: Octokit,
	org: string,
	repo: string,
	config: TentactlConfig,
): Promise<void> {
	const branch: string = (config as any)._defaultBranch ?? "main";
	delete (config as any)._defaultBranch;

	try {
		const { data } = await octokit.rest.repos.getBranchProtection({
			owner: org,
			repo,
			branch,
		});

		config.branch_protection = {
			branch,
			required_status_checks: data.required_status_checks
				? {
						strict: data.required_status_checks.strict,
						contexts: data.required_status_checks.contexts,
					}
				: null,
			enforce_admins: data.enforce_admins?.enabled ?? null,
			required_pull_request_reviews: data.required_pull_request_reviews
				? {
						required_approving_review_count:
							data.required_pull_request_reviews.required_approving_review_count,
						dismiss_stale_reviews: data.required_pull_request_reviews.dismiss_stale_reviews,
						required_review_thread_resolution:
							data.required_pull_request_reviews.require_last_push_approval ?? false,
					}
				: null,
			restrictions: data.restrictions
				? {
						users: data.restrictions.users.map((u) => u.login),
						teams: data.restrictions.teams.map((t) => t.slug),
						apps: data.restrictions.apps?.map((a) => a.slug) ?? [],
					}
				: null,
		} as TentactlConfig["branch_protection"];
	} catch (err: unknown) {
		// 404 means no branch protection set — that is valid
		if (!isHttpError(err, 404)) {
			consola.warn(`Could not fetch branch protection for ${branch}: ${formatError(err)}`);
		}
	}
}

async function fetchLabels(
	octokit: Octokit,
	org: string,
	repo: string,
	config: TentactlConfig,
): Promise<void> {
	try {
		const labels = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
			owner: org,
			repo,
			per_page: 100,
		});

		const items: LabelConfig[] = labels.map((l) => ({
			name: l.name,
			color: l.color,
			...(l.description ? { description: l.description } : {}),
		}));

		config.labels = { items };
	} catch (err: unknown) {
		consola.warn(`Could not fetch labels: ${formatError(err)}`);
	}
}

async function fetchTeams(
	octokit: Octokit,
	org: string,
	repo: string,
	config: TentactlConfig,
): Promise<void> {
	try {
		const teams = await octokit.paginate(octokit.rest.repos.listTeams, {
			owner: org,
			repo,
			per_page: 100,
		});

		const items: TeamConfig[] = teams
			.map((t) => {
				const permission = resolveHighestPermission(t.permissions);
				if (!permission) return null;
				return { team_slug: t.slug, permission };
			})
			.filter((t): t is TeamConfig => t !== null);

		config.teams = { items };
	} catch (err: unknown) {
		consola.warn(`Could not fetch teams: ${formatError(err)}`);
	}
}

async function fetchCollaborators(
	octokit: Octokit,
	org: string,
	repo: string,
	config: TentactlConfig,
): Promise<void> {
	try {
		const collaborators = await octokit.paginate(octokit.rest.repos.listCollaborators, {
			owner: org,
			repo,
			affiliation: "direct",
			per_page: 100,
		});

		const items: CollaboratorConfig[] = collaborators
			.map((collaborator) => {
				const permission = resolveHighestPermission(collaborator.permissions);
				if (!permission) return null;
				return { username: collaborator.login, permission };
			})
			.filter((collaborator): collaborator is CollaboratorConfig => collaborator !== null);

		config.collaborators = { items };
	} catch (err: unknown) {
		consola.warn(`Could not fetch collaborators: ${formatError(err)}`);
	}
}

// ---------------------------------------------------------------------------
// Rulesets (GraphQL)
// ---------------------------------------------------------------------------

const FETCH_RULESETS_QUERY = `
  query FetchRepositoryRulesets($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      rulesets(first: 100, includeParents: false) {
        nodes {
          name
          enforcement
          target
          conditions {
            refName {
              include
              exclude
            }
          }
          rules(first: 100) {
            nodes {
              type
              parameters {
                ... on PullRequestParameters {
                  dismissStaleReviewsOnPush
                  requireCodeOwnerReview
                  requireLastPushApproval
                  requiredApprovingReviewCount
                  requiredReviewThreadResolution
                }
                ... on RequiredStatusChecksParameters {
                  strictRequiredStatusChecksPolicy
                  doNotEnforceOnCreate
                  requiredStatusChecks {
                    context
                    integrationId
                  }
                }
                ... on BranchNamePatternParameters {
                  name
                  negate
                  operator
                  pattern
                }
                ... on TagNamePatternParameters {
                  name
                  negate
                  operator
                  pattern
                }
                ... on CommitMessagePatternParameters {
                  name
                  negate
                  operator
                  pattern
                }
                ... on CommitAuthorEmailPatternParameters {
                  name
                  negate
                  operator
                  pattern
                }
                ... on CommitterEmailPatternParameters {
                  name
                  negate
                  operator
                  pattern
                }
                ... on RequiredDeploymentsParameters {
                  requiredDeploymentEnvironments
                }
                ... on FilePathRestrictionParameters {
                  restrictedFilePaths
                }
                ... on FileExtensionRestrictionParameters {
                  restrictedFileExtensions
                }
                ... on MaxFilePathLengthParameters {
                  maxFilePathLength
                }
                ... on MaxFileSizeParameters {
                  maxFileSize
                }
              }
            }
          }
          bypassActors(first: 100) {
            nodes {
              bypassMode
              deployKey
              enterpriseOwner
              organizationAdmin
              repositoryRoleDatabaseId
              actor {
                ... on Node {
                  id
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface FetchedBypassActor {
	bypassMode: string;
	deployKey: boolean;
	enterpriseOwner: boolean;
	organizationAdmin: boolean;
	repositoryRoleDatabaseId: number | null;
	actor: { id: string } | null;
}

interface FetchedRule {
	type: string;
	parameters: Record<string, unknown> | null;
}

interface FetchedRuleset {
	name: string;
	enforcement: string;
	target: string | null;
	conditions: {
		refName: { include: string[]; exclude: string[] } | null;
	} | null;
	rules: { nodes: FetchedRule[] };
	bypassActors: { nodes: FetchedBypassActor[] };
}

interface FetchRulesetsResult {
	repository: {
		rulesets: { nodes: FetchedRuleset[] };
	};
}

async function fetchRulesets(
	octokit: Octokit,
	org: string,
	repo: string,
	config: TentactlConfig,
): Promise<void> {
	const gql = (
		octokit as unknown as { graphql: <T>(q: string, v?: Record<string, unknown>) => Promise<T> }
	).graphql;

	try {
		const data = await gql<FetchRulesetsResult>(FETCH_RULESETS_QUERY, { owner: org, name: repo });
		const nodes = data.repository.rulesets.nodes;

		if (nodes.length === 0) return;

		const items: RulesetConfig[] = nodes.map((node) => {
			const ruleset: RulesetConfig = {
				name: node.name,
				enforcement: node.enforcement as RulesetConfig["enforcement"],
			};

			if (node.target) {
				ruleset.target = node.target as RulesetConfig["target"];
			}

			if (node.conditions?.refName) {
				ruleset.conditions = { refName: node.conditions.refName };
			}

			const rules = node.rules.nodes
				.filter((r) => r.type)
				.map((r) => ({
					type: r.type,
					...(r.parameters && Object.keys(r.parameters).length > 0
						? {
								parameters: r.parameters as RulesetConfig["rules"] extends Array<infer R>
									? R extends { parameters?: infer P }
										? P
										: never
									: never,
							}
						: {}),
				}));

			if (rules.length > 0) {
				ruleset.rules = rules as RulesetConfig["rules"];
			}

			const bypassActors: RulesetBypassActor[] = node.bypassActors.nodes.map((b) => {
				const actor: RulesetBypassActor = {
					bypassMode: b.bypassMode as RulesetBypassActor["bypassMode"],
				};
				if (b.organizationAdmin) actor.organizationAdmin = true;
				else if (b.deployKey) actor.deployKey = true;
				else if (b.enterpriseOwner) actor.enterpriseOwner = true;
				else if (b.repositoryRoleDatabaseId !== null)
					actor.repositoryRoleDatabaseId = b.repositoryRoleDatabaseId;
				else if (b.actor?.id) actor.actorId = b.actor.id;
				return actor;
			});

			if (bypassActors.length > 0) {
				ruleset.bypassActors = bypassActors;
			}

			return ruleset;
		});

		config.rulesets = { items };
	} catch (err: unknown) {
		consola.warn(`Could not fetch rulesets: ${formatError(err)}`);
	}
}

// ---------------------------------------------------------------------------
// Environments (REST)
// ---------------------------------------------------------------------------

async function fetchEnvironments(
	octokit: Octokit,
	org: string,
	repo: string,
	config: TentactlConfig,
): Promise<void> {
	try {
		const { data } = await octokit.request("GET /repos/{owner}/{repo}/environments", {
			owner: org,
			repo,
			per_page: 100,
		});

		const environments = (data as { environments?: unknown[] }).environments ?? [];

		if (environments.length === 0) return;

		config.environments = environments.map((env) => {
			const e = env as Record<string, unknown>;
			const item: EnvironmentConfig = { name: e.name as string };

			if (typeof e.wait_timer === "number") item.wait_timer = e.wait_timer;
			if (typeof e.prevent_self_review === "boolean")
				item.prevent_self_review = e.prevent_self_review;

			const dbp = e.deployment_branch_policy as Record<string, unknown> | null | undefined;
			if (dbp !== null && dbp !== undefined) {
				item.deployment_branch_policy = {
					protected_branches: dbp.protected_branches as boolean,
					custom_branch_policies: dbp.custom_branch_policies as boolean,
				};
			} else if (dbp === null) {
				item.deployment_branch_policy = null;
			}

			return item;
		});
	} catch (err: unknown) {
		consola.warn(`Could not fetch environments: ${formatError(err)}`);
	}
}

// ---------------------------------------------------------------------------
// Custom Properties (REST)
// ---------------------------------------------------------------------------

async function fetchCustomProperties(
	octokit: Octokit,
	org: string,
	repo: string,
	config: TentactlConfig,
): Promise<void> {
	try {
		const { data } = await octokit.request("GET /repos/{owner}/{repo}/properties/values", {
			owner: org,
			repo,
		});

		const properties = data as Array<{ property_name: string; value: unknown }>;

		if (properties.length === 0) return;

		const custom_properties: Record<string, CustomPropertyValue> = {};
		for (const prop of properties) {
			custom_properties[prop.property_name] = prop.value as CustomPropertyValue;
		}
		config.custom_properties = custom_properties;
	} catch (err: unknown) {
		consola.warn(`Could not fetch custom properties: ${formatError(err)}`);
	}
}

// ---------------------------------------------------------------------------
// Interaction Limit (REST)
// ---------------------------------------------------------------------------

const REST_TO_CONFIG_LIMIT: Record<string, InteractionLimit> = {
	existing_users: "EXISTING_USERS",
	contributors_only: "CONTRIBUTORS_ONLY",
	collaborators_only: "COLLABORATORS_ONLY",
	no_limit: "NO_LIMIT",
};

const REST_TO_CONFIG_EXPIRY: Record<string, InteractionLimitExpiry> = {
	one_day: "ONE_DAY",
	three_days: "THREE_DAYS",
	one_week: "ONE_WEEK",
	one_month: "ONE_MONTH",
	six_months: "SIX_MONTHS",
};

async function fetchInteractionLimit(
	octokit: Octokit,
	org: string,
	repo: string,
	config: TentactlConfig,
): Promise<void> {
	try {
		const { data } = await octokit.request("GET /repos/{owner}/{repo}/interaction-limits", {
			owner: org,
			repo,
		});

		const d = data as { limit?: string; expiry?: string } | undefined;
		if (!d?.limit || d.limit === "no_limit") return;

		const limit = REST_TO_CONFIG_LIMIT[d.limit];
		if (!limit) return;

		const interactionLimit: InteractionLimitConfig = { limit };
		if (d.expiry) {
			const expiry = REST_TO_CONFIG_EXPIRY[d.expiry];
			if (expiry) interactionLimit.expiry = expiry;
		}
		config.interaction_limit = interactionLimit;
	} catch (err: unknown) {
		consola.warn(`Could not fetch interaction limit: ${formatError(err)}`);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PERMISSION_RANK: RepositoryPermission[] = ["pull", "triage", "push", "maintain", "admin"];

function resolveHighestPermission(
	permissions: Record<string, boolean> | undefined,
): RepositoryPermission | null {
	if (!permissions) return "pull";
	for (const level of [...PERMISSION_RANK].reverse()) {
		if (permissions[level]) return level;
	}
	return null;
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
	if (err instanceof Error) return err.message;
	return String(err);
}
