import { describe, expect, it } from "vitest";
import { computeDiff } from "./diff";

describe("computeDiff", () => {
	it("ignores local-only strict flags", () => {
		const local = {
			org: "acme",
			repo: "platform",
			strict: true,
			labels: {
				strict: true,
				items: [{ name: "bug", color: "ff0000" }],
			},
		};

		const remote = {
			org: "acme",
			repo: "platform",
			labels: {
				items: [{ name: "bug", color: "ff0000" }],
			},
		};

		expect(computeDiff(local, remote)).toBeNull();
	});

	it("renders a diff when collaborators or teams differ", () => {
		const local = {
			org: "acme",
			repo: "platform",
			collaborators: {
				items: [{ username: "octocat", permission: "push" as const }],
			},
			teams: {
				items: [{ team_slug: "platform", permission: "maintain" as const }],
			},
		};

		const remote = {
			org: "acme",
			repo: "platform",
			collaborators: {
				items: [{ username: "hubot", permission: "pull" as const }],
			},
			teams: {
				items: [{ team_slug: "platform", permission: "push" as const }],
			},
		};

		const output = computeDiff(local, remote);

		expect(output).toContain("--- local");
		expect(output).toContain("+++ remote");
		expect(output).toContain("octocat");
		expect(output).toContain("hubot");
	});
});
