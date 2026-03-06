import { defineConfig } from "../src";

export default defineConfig({
	org: "t128n",
	repo: "tentactl",
	repository: {
		description: "A CLI tool to manage GitHub repositories with ease 🐙",
		homepage: "https://npmx.dev/package/tentactl",
		private: false,
		visibility: "public",
		has_issues: true,
		has_projects: false,
		has_wiki: false,
		has_discussions: false,
		is_template: false,
		allow_merge_commit: false,
		merge_commit_title: "MERGE_MESSAGE",
		merge_commit_message: "PR_TITLE",
		allow_squash_merge: true,
		squash_merge_commit_title: "COMMIT_OR_PR_TITLE",
		squash_merge_commit_message: "COMMIT_MESSAGES",
		allow_rebase_merge: false,
		allow_auto_merge: false,
		delete_branch_on_merge: false,
		allow_update_branch: true,
		web_commit_signoff_required: true,
		archived: false,
	},
	topics: ["cli", "devops", "github", "typescript", "gitops"],
	branch_protection: {
		branch: "main",
		required_status_checks: {
			strict: true,
			contexts: ["CI / verify"],
		},
		enforce_admins: true,
		required_pull_request_reviews: {
			required_approving_review_count: 1,
			dismiss_stale_reviews: true,
			require_last_push_approval: true,
		},
		required_conversation_resolution: true,
		restrictions: null,
	},
	labels: {
		items: [
			{ name: "bug", color: "d73a4a", description: "Something isn't working" },
			{
				name: "documentation",
				color: "0075ca",
				description: "Improvements or additions to documentation",
			},
			{ name: "enhancement", color: "a2eeef", description: "New feature or request" },
		],
	},
	collaborators: {
		items: [],
	},
	teams: {
		items: [],
	},
});
