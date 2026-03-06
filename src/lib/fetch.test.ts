import { describe, expect, it, vi } from "vitest";
import { fetchRemoteConfig } from "./fetch";

describe("fetchRemoteConfig", () => {
    it("maps repository state into a tentactl config", async () => {
        const get = vi.fn().mockResolvedValue({
            data: {
                description: "Repo description",
                homepage: "https://example.com",
                visibility: "public",
                has_issues: true,
                allow_merge_commit: false,
                default_branch: "main",
            },
        });
        const getAllTopics = vi.fn().mockResolvedValue({ data: { names: ["cli", "github"] } });
        const getBranchProtection = vi.fn().mockResolvedValue({
            data: {
                required_status_checks: { strict: true, contexts: ["ci"] },
                enforce_admins: { enabled: true },
                required_pull_request_reviews: {
                    required_approving_review_count: 1,
                    dismiss_stale_reviews: true,
                    require_last_push_approval: false,
                },
                restrictions: {
                    users: [{ login: "octocat" }],
                    teams: [{ slug: "platform" }],
                    apps: [{ slug: "vercel" }],
                },
            },
        });
        const listLabelsForRepo = vi.fn();
        const listTeams = vi.fn();
        const listCollaborators = vi.fn();
        const paginate = vi.fn(async (method: unknown) => {
            if (method === listLabelsForRepo) {
                return [{ name: "bug", color: "ff0000", description: "Broken" }];
            }
            if (method === listTeams) {
                return [{ slug: "platform", permissions: { maintain: true } }];
            }
            if (method === listCollaborators) {
                return [{ login: "octocat", permissions: { push: true } }];
            }
            return [];
        });
        const graphql = vi.fn().mockResolvedValue({
            repository: {
                rulesets: {
                    nodes: [{
                        name: "Protect main",
                        enforcement: "ACTIVE",
                        target: "BRANCH",
                        conditions: { refName: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
                        rules: { nodes: [{ type: "REQUIRED_LINEAR_HISTORY", parameters: null }] },
                        bypassActors: { nodes: [] },
                    }],
                },
            },
        });
        const request = vi.fn(async (route: string) => {
            if (route === "GET /repos/{owner}/{repo}/environments") {
                return { data: { environments: [{ name: "production", wait_timer: 5, prevent_self_review: true }] } };
            }
            if (route === "GET /repos/{owner}/{repo}/properties/values") {
                return { data: [{ property_name: "tier", value: "gold" }] };
            }
            if (route === "GET /repos/{owner}/{repo}/interaction-limits") {
                return { data: { limit: "contributors_only", expiry: "one_week" } };
            }
            throw new Error(`Unexpected route: ${route}`);
        });

        const octokit = {
            rest: {
                repos: { get, getAllTopics, getBranchProtection, listTeams, listCollaborators },
                issues: { listLabelsForRepo },
            },
            paginate,
            graphql,
            request,
        };

        await expect(fetchRemoteConfig(octokit as never, "acme", "platform")).resolves.toEqual({
            org: "acme",
            repo: "platform",
            repository: {
                description: "Repo description",
                homepage: "https://example.com",
                visibility: "public",
                has_issues: true,
                allow_merge_commit: false,
            },
            topics: ["cli", "github"],
            labels: { items: [{ name: "bug", color: "ff0000", description: "Broken" }] },
            collaborators: { items: [{ username: "octocat", permission: "push" }] },
            teams: { items: [{ team_slug: "platform", permission: "maintain" }] },
            rulesets: {
                items: [{
                    name: "Protect main",
                    enforcement: "ACTIVE",
                    target: "BRANCH",
                    conditions: { refName: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
                    rules: [{ type: "REQUIRED_LINEAR_HISTORY" }],
                }],
            },
            environments: [{ name: "production", wait_timer: 5, prevent_self_review: true }],
            custom_properties: { tier: "gold" },
            interaction_limit: { limit: "CONTRIBUTORS_ONLY", expiry: "ONE_WEEK" },
            branch_protection: {
                branch: "main",
                required_status_checks: { strict: true, contexts: ["ci"] },
                enforce_admins: true,
                required_pull_request_reviews: {
                    required_approving_review_count: 1,
                    dismiss_stale_reviews: true,
                    required_review_thread_resolution: false,
                },
                restrictions: {
                    users: ["octocat"],
                    teams: ["platform"],
                    apps: ["vercel"],
                },
            },
        });
    });
});
