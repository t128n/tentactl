import { describe, expect, it } from "vitest";
import { defineConfig } from "./defineConfig";

describe("defineConfig", () => {
	it("returns the provided config unchanged", () => {
		const config = {
			org: "acme",
			repo: "platform",
			host: "github.example.com",
			collaborators: {
				items: [{ username: "octocat", permission: "push" as const }],
			},
		};

		expect(defineConfig(config)).toBe(config);
	});
});
