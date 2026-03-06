import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";

type RepoParams = RestEndpointMethodTypes["repos"]["update"]["parameters"];
type ProtectionParams = RestEndpointMethodTypes["repos"]["updateBranchProtection"]["parameters"];

export interface LabelConfig {
    name: string;
    color: string;
    description?: string;
}

export interface TeamConfig {
    team_slug: string;
    permission: "pull" | "triage" | "push" | "maintain" | "admin";
}

export interface LabelsConfig {
    /** Delete labels from the repo that are not listed here. Default: false. */
    strict?: boolean;
    items: LabelConfig[];
}

export interface TeamsConfig {
    /** Remove team access from the repo for teams not listed here. Default: false. */
    strict?: boolean;
    items: TeamConfig[];
}

// ---------------------------------------------------------------------------
// Rulesets
// ---------------------------------------------------------------------------

export type RuleEnforcement = "ACTIVE" | "DISABLED" | "EVALUATE";
export type RulesetTarget = "BRANCH" | "TAG" | "PUSH" | "REPOSITORY";
export type BypassMode = "ALWAYS" | "PULL_REQUEST" | "EXEMPT";

export interface RulesetBypassActor {
    /** Node ID of the Team or Integration to grant bypass to. */
    actorId?: string;
    bypassMode: BypassMode;
    /** Grant bypass to all organization admins. */
    organizationAdmin?: boolean;
    /**
     * Grant bypass to a built-in repository role by its database ID.
     * Role IDs: 1 = write, 2 = maintain, 3 = admin.
     */
    repositoryRoleDatabaseId?: number;
    /** Grant bypass to deploy keys. Only ALWAYS bypass mode is supported. */
    deployKey?: boolean;
    /** Grant bypass to enterprise owners. */
    enterpriseOwner?: boolean;
}

export interface RulesetConditions {
    refName?: {
        /** Patterns to include (e.g. "refs/heads/main", "~DEFAULT_BRANCH", "~ALL"). */
        include: string[];
        /** Patterns to exclude. */
        exclude: string[];
    };
}

export interface PullRequestRuleParameters {
    dismissStaleReviewsOnPush: boolean;
    requireCodeOwnerReview: boolean;
    requireLastPushApproval: boolean;
    requiredApprovingReviewCount: number;
    requiredReviewThreadResolution: boolean;
    allowedMergeMethods?: Array<"merge" | "squash" | "rebase">;
}

export interface RequiredStatusChecksRuleParameters {
    requiredStatusChecks: Array<{ context: string; integrationId?: number }>;
    strictRequiredStatusChecksPolicy: boolean;
    doNotEnforceOnCreate?: boolean;
}

export interface PatternRuleParameters {
    pattern: string;
    /** "starts_with" | "ends_with" | "contains" | "regex" */
    operator: string;
    negate?: boolean;
    name?: string;
}

export interface RuleParameters {
    pullRequest?: PullRequestRuleParameters;
    requiredStatusChecks?: RequiredStatusChecksRuleParameters;
    branchNamePattern?: PatternRuleParameters;
    tagNamePattern?: PatternRuleParameters;
    commitMessagePattern?: PatternRuleParameters;
    commitAuthorEmailPattern?: PatternRuleParameters;
    committerEmailPattern?: PatternRuleParameters;
    requiredDeployments?: { requiredDeploymentEnvironments: string[] };
    filePathRestriction?: { restrictedFilePaths: string[] };
    fileExtensionRestriction?: { restrictedFileExtensions: string[] };
    maxFilePathLength?: { maxFilePathLength: number };
    maxFileSize?: { maxFileSize: number };
}

export interface RuleConfig {
    /**
     * The rule type. One of the RepositoryRuleType enum values, e.g.
     * "PULL_REQUEST", "REQUIRED_STATUS_CHECKS", "REQUIRED_SIGNATURES",
     * "REQUIRED_LINEAR_HISTORY", "DELETION", "CREATION", "NON_FAST_FORWARD",
     * "LOCK_BRANCH", "MERGE_QUEUE", "CODE_SCANNING", "BRANCH_NAME_PATTERN",
     * "TAG_NAME_PATTERN", "COMMIT_MESSAGE_PATTERN", "COMMIT_AUTHOR_EMAIL_PATTERN",
     * "COMMITTER_EMAIL_PATTERN", "REQUIRED_DEPLOYMENTS", "FILE_PATH_RESTRICTION",
     * "FILE_EXTENSION_RESTRICTION", "MAX_FILE_PATH_LENGTH", "MAX_FILE_SIZE".
     */
    type: string;
    parameters?: RuleParameters;
}

export interface RulesetConfig {
    name: string;
    enforcement: RuleEnforcement;
    target?: RulesetTarget;
    conditions?: RulesetConditions;
    rules?: RuleConfig[];
    bypassActors?: RulesetBypassActor[];
}

export interface RulesetsConfig {
    /** Delete rulesets on the repo that are not listed here. Default: false. */
    strict?: boolean;
    items: RulesetConfig[];
}

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

export interface EnvironmentConfig {
    name: string;
    /** Minutes to wait before allowing deployments (0–43200). */
    wait_timer?: number;
    /** Prevent the deployment creator from approving their own deployment. */
    prevent_self_review?: boolean;
    deployment_branch_policy?: {
        /** Only allow deployments from protected branches. */
        protected_branches: boolean;
        /** Allow deployments from custom branch name patterns. */
        custom_branch_policies: boolean;
    } | null;
}

// ---------------------------------------------------------------------------
// Custom Properties
// ---------------------------------------------------------------------------

export type CustomPropertyValue = string | string[] | null;

// ---------------------------------------------------------------------------
// Interaction Limits
// ---------------------------------------------------------------------------

export type InteractionLimit =
    | "EXISTING_USERS"
    | "CONTRIBUTORS_ONLY"
    | "COLLABORATORS_ONLY"
    | "NO_LIMIT";

export type InteractionLimitExpiry =
    | "ONE_DAY"
    | "THREE_DAYS"
    | "ONE_WEEK"
    | "ONE_MONTH"
    | "SIX_MONTHS";

export interface InteractionLimitConfig {
    limit: InteractionLimit;
    expiry?: InteractionLimitExpiry;
}

// ---------------------------------------------------------------------------
// Root config
// ---------------------------------------------------------------------------

export interface TentactlConfig {
    /**
     * Global strict mode fallback. When true, anything not defined in this
     * config (labels, teams, rulesets) will be deleted from the repository.
     * Can be overridden per-section via `labels.strict` / `teams.strict` / `rulesets.strict`.
     * Default: false.
     */
    strict?: boolean;

    /** Override the GitHub host (e.g. for GitHub Enterprise). Default: github.com */
    host?: string;

    /** GitHub organization name. */
    org: string;

    /** Repository name. */
    repo: string;

    /** Repository metadata settings (description, homepage, visibility, etc.) */
    repository?: Omit<RepoParams, "owner" | "repo">;

    /** Repository topics. Replaces all existing topics. */
    topics?: string[];

    /** Branch protection rules. */
    branch_protection?: Omit<ProtectionParams, "owner" | "repo"> & {
        branch: string;
    };

    /** Issue labels. */
    labels?: LabelsConfig;

    /** Team access. */
    teams?: TeamsConfig;

    /** Repository rulesets (modern replacement for branch protection). */
    rulesets?: RulesetsConfig;

    /** Deployment environments. */
    environments?: EnvironmentConfig[];

    /**
     * Repository-level custom property values.
     * Keys must match custom properties defined at the organization level.
     */
    custom_properties?: Record<string, CustomPropertyValue>;

    /**
     * Interaction limit restricting who can comment, open issues, or create pull requests.
     * Set to null to remove an existing limit.
     */
    interaction_limit?: InteractionLimitConfig | null;
}
