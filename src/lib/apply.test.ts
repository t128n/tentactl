import { describe, expect, it, vi } from "vitest";
import { applyConfig } from "./apply";

describe("applyConfig", () => {
	it("applies configured repository state across supported sections", async () => {
		const update = vi.fn().mockResolvedValue(undefined);
		const replaceAllTopics = vi.fn().mockResolvedValue(undefined);
		const updateBranchProtection = vi.fn().mockResolvedValue(undefined);
		const createLabel = vi.fn().mockResolvedValue(undefined);
		const addCollaborator = vi.fn().mockResolvedValue(undefined);
		const addOrUpdateRepoPermissionsInOrg = vi.fn().mockResolvedValue(undefined);
		const graphql = vi
			.fn()
			.mockResolvedValueOnce({ repository: { id: "repo-id", rulesets: { nodes: [] } } })
			.mockResolvedValue(undefined);
		const request = vi.fn().mockResolvedValue(undefined);

		const octokit = {
			rest: {
				repos: { update, replaceAllTopics, updateBranchProtection, addCollaborator },
				issues: { createLabel },
				teams: { addOrUpdateRepoPermissionsInOrg },
			},
			graphql,
			request,
		};

		await applyConfig(octokit as never, {
			org: "acme",
			repo: "platform",
			repository: { description: "Repo" },
			topics: ["cli"],
			branch_protection: {
				branch: "main",
				required_status_checks: null,
				enforce_admins: true,
				required_pull_request_reviews: null,
				restrictions: null,
			},
			labels: { items: [{ name: "bug", color: "ff0000" }] },
			collaborators: { items: [{ username: "octocat", permission: "push" }] },
			teams: { items: [{ team_slug: "platform", permission: "maintain" }] },
			rulesets: { items: [{ name: "Protect main", enforcement: "ACTIVE" }] },
			environments: [{ name: "production", wait_timer: 5 }],
			custom_properties: { tier: "gold" },
			interaction_limit: { limit: "CONTRIBUTORS_ONLY", expiry: "ONE_DAY" },
		});

		expect(update).toHaveBeenCalledWith({ owner: "acme", repo: "platform", description: "Repo" });
		expect(replaceAllTopics).toHaveBeenCalledWith({
			owner: "acme",
			repo: "platform",
			names: ["cli"],
		});
		expect(updateBranchProtection).toHaveBeenCalled();
		expect(createLabel).toHaveBeenCalledWith({
			owner: "acme",
			repo: "platform",
			name: "bug",
			color: "ff0000",
		});
		expect(addCollaborator).toHaveBeenCalledWith({
			owner: "acme",
			repo: "platform",
			username: "octocat",
			permission: "push",
		});
		expect(addOrUpdateRepoPermissionsInOrg).toHaveBeenCalledWith({
			org: "acme",
			owner: "acme",
			repo: "platform",
			team_slug: "platform",
			permission: "maintain",
		});
		expect(graphql).toHaveBeenCalled();
		expect(request).toHaveBeenCalledWith(
			"PUT /repos/{owner}/{repo}/environments/{environment_name}",
			expect.objectContaining({
				owner: "acme",
				repo: "platform",
				environment_name: "production",
			}),
		);
		expect(request).toHaveBeenCalledWith("PATCH /repos/{owner}/{repo}/properties/values", {
			owner: "acme",
			repo: "platform",
			properties: [{ property_name: "tier", value: "gold" }],
		});
		expect(request).toHaveBeenCalledWith("PUT /repos/{owner}/{repo}/interaction-limits", {
			owner: "acme",
			repo: "platform",
			limit: "contributors_only",
			expiry: "one_day",
		});
	});

	it("removes unmanaged collaborators, teams, and labels in strict mode", async () => {
		const deleteLabel = vi.fn().mockResolvedValue(undefined);
		const createLabel = vi.fn().mockResolvedValue(undefined);
		const removeCollaborator = vi.fn().mockResolvedValue(undefined);
		const addCollaborator = vi.fn().mockResolvedValue(undefined);
		const removeRepoInOrg = vi.fn().mockResolvedValue(undefined);
		const addOrUpdateRepoPermissionsInOrg = vi.fn().mockResolvedValue(undefined);
		const paginate = vi.fn(async (method: unknown) => {
			if (method === listLabelsForRepo) return [{ name: "bug" }, { name: "chore" }];
			if (method === listCollaborators) return [{ login: "octocat" }, { login: "hubot" }];
			if (method === listTeams) return [{ slug: "platform" }, { slug: "ops" }];
			return [];
		});
		const listLabelsForRepo = vi.fn();
		const listCollaborators = vi.fn();
		const listTeams = vi.fn();

		const octokit = {
			rest: {
				repos: {
					listCollaborators,
					listTeams,
					addCollaborator,
					removeCollaborator,
				},
				issues: { listLabelsForRepo, createLabel, deleteLabel },
				teams: { addOrUpdateRepoPermissionsInOrg, removeRepoInOrg },
			},
			paginate,
			request: vi.fn().mockResolvedValue(undefined),
		};

		await applyConfig(octokit as never, {
			org: "acme",
			repo: "platform",
			strict: true,
			labels: { items: [{ name: "bug", color: "ff0000" }] },
			collaborators: { items: [{ username: "octocat", permission: "push" }] },
			teams: { items: [{ team_slug: "platform", permission: "maintain" }] },
		});

		expect(deleteLabel).toHaveBeenCalledWith({ owner: "acme", repo: "platform", name: "chore" });
		expect(removeCollaborator).toHaveBeenCalledWith({
			owner: "acme",
			repo: "platform",
			username: "hubot",
		});
		expect(removeRepoInOrg).toHaveBeenCalledWith({
			org: "acme",
			owner: "acme",
			repo: "platform",
			team_slug: "ops",
		});
	});
});
