# 🐙 tentactl

<!-- automd:badges color="purple" license name="tentactl" codecov bundlephobia packagephobia -->

[![npm version](https://img.shields.io/npm/v/tentactl?color=purple)](https://npmjs.com/package/tentactl)
[![npm downloads](https://img.shields.io/npm/dm/tentactl?color=purple)](https://npm.chart.dev/tentactl)
[![bundle size](https://img.shields.io/bundlephobia/minzip/tentactl?color=purple)](https://bundlephobia.com/package/tentactl)
[![install size](https://badgen.net/packagephobia/install/tentactl?color=purple)](https://packagephobia.com/result?p=tentactl)
[![codecov](https://img.shields.io/codecov/c/gh/t128n/tentactl?color=purple)](https://codecov.io/gh/t128n/tentactl)
[![license](https://img.shields.io/github/license/t128n/tentactl?color=purple)](https://github.com/t128n/tentactl/blob/main/LICENSE)

<!-- /automd -->

Deterministic repository management for GitHub.

`tentactl` helps you manage GitHub repositories as code. You define repository settings in `/.github/tentactl.config.ts`, review changes locally, and then apply them with the CLI.

## What it does

- Pulls the current state of a repository into a local config file
- Shows the diff between your local config and GitHub
- Applies repository settings from your config back to GitHub
- Supports GitHub.com and GitHub Enterprise Server

You can manage settings such as:

- Repository metadata and merge settings
- Topics
- Branch protection for the default branch
- Labels
- Team access
- Rulesets
- Deployment environments
- Custom property values
- Interaction limits

## Install or run

<!-- automd:pm-x version="latest" name="tentactl" args="" -->

```sh
# npm
npx tentactl@latest

# pnpm
pnpm dlx tentactl@latest

# bun
bunx tentactl@latest

# deno
deno run -A npm:tentactl@latest
```

<!-- /automd -->

To install it globally:

```sh
pnpm add -g tentactl
```

## Before you start

You need:

- A GitHub Personal Access Token (PAT)
- Repository access for the target repository
- These token scopes: `repo`, `read:org`, and `workflow`

`tentactl` reads `GH_TOKEN` from your environment first. If it does not find one, it can save a token to `/.env.local` in your project root.

## Quick start

1. Sign in.
2. Pull your repository settings into a config file.
3. Review the diff.
4. Apply changes back to GitHub.

```sh
tentactl login
tentactl pull
tentactl diff
tentactl push
```

By default, `tentactl` uses `/.github/tentactl.config.ts`.

## Commands

### `tentactl pull`

Fetches the current GitHub repository state and writes it to your config file.

```sh
tentactl pull
tentactl pull --config .github/tentactl.config.ts
```

If the config file does not exist, `tentactl` prompts for the organization and repository name.

### `tentactl diff`

Shows the difference between your local config and the current remote state.

```sh
tentactl diff
tentactl diff --config .github/tentactl.config.ts
```

Use this command before `push` to confirm the exact changes you want to make.

### `tentactl push`

Applies your local config to GitHub.

```sh
tentactl push
tentactl push --config .github/tentactl.config.ts
```

### Authentication commands

Use these commands to manage your token:

```sh
tentactl login
tentactl whoami
tentactl logout
```

## Configuration

Create `/.github/tentactl.config.ts` and export a config with `defineConfig`.

```ts
import { defineConfig } from "tentactl";

export default defineConfig({
	org: "t128n",
	repo: "tentactl",
	repository: {
		description: "Manage GitHub repositories as code",
		homepage: "https://github.com/t128n/tentactl",
		visibility: "public",
		has_issues: true,
		has_projects: false,
		has_wiki: false,
		allow_squash_merge: true,
		allow_merge_commit: false,
		allow_rebase_merge: false,
		delete_branch_on_merge: true,
	},
	topics: ["cli", "github", "typescript"],
	branch_protection: {
		branch: "main",
		required_status_checks: {
			strict: true,
			contexts: [],
		},
		enforce_admins: true,
		required_pull_request_reviews: null,
		restrictions: null,
	},
	labels: {
		items: [
			{ name: "bug", color: "d73a4a", description: "Something is not working" },
			{ name: "documentation", color: "0075ca", description: "Documentation changes" },
			{ name: "enhancement", color: "a2eeef", description: "New feature or request" },
		],
	},
	collaborators: {
		items: [
			{ username: "octocat", permission: "push" },
		],
	},
	teams: {
		items: [
			{ team_slug: "platform", permission: "maintain" },
		],
	},
});
```

## Configuration reference

The root config supports these fields:

- `host`: GitHub host override for GitHub Enterprise Server
- `org`: GitHub organization or user name
- `repo`: Repository name
- `strict`: Global strict mode fallback
- `repository`: Repository settings from the GitHub repository API
- `topics`: Repository topics
- `branch_protection`: Branch protection for a specific branch
- `labels`: Repository labels
- `collaborators`: Direct user collaborators and their permissions
- `teams`: Team permissions for the repository
- `rulesets`: Repository rulesets
- `environments`: Deployment environments
- `custom_properties`: Repository custom property values
- `interaction_limit`: Repository interaction limit

## Strict mode

Strict mode lets you remove managed items that are not present in your config.

- `strict: true` applies strict mode globally
- `labels.strict`, `collaborators.strict`, `teams.strict`, and `rulesets.strict` override the global setting per section

When strict mode is enabled for a section, `tentactl` deletes items in GitHub that are not listed in that section of your config.

## Access management

Use `collaborators` for direct user access and `teams` for organization team access.

- Supported permissions for both are `pull`, `triage`, `push`, `maintain`, and `admin`
- `collaborators.items` uses `{ username, permission }`
- `teams.items` uses `{ team_slug, permission }`
- Set `collaborators.strict` or `teams.strict` to remove access entries not declared in config

## GitHub Enterprise Server

Set `host` when you want to target GitHub Enterprise Server.

```ts
import { defineConfig } from "tentactl";

export default defineConfig({
	host: "github.example.com",
	org: "octo-org",
	repo: "platform",
});
```

## Typical workflow

```sh
# 1. Pull the current repository state
tentactl pull

# 2. Edit .github/tentactl.config.ts

# 3. Review the change
tentactl diff

# 4. Apply the change
tentactl push
```

## Notes

- `pull` and `diff` read live data from GitHub
- `push` applies only the sections you define in your config
- Some GitHub rules or settings depend on your repository visibility, plan, or GitHub edition

## Contributors

<!-- automd:contributors author="t128n" license="MIT" -->

Published under the [MIT](https://github.com/t128n/tentactl/blob/main/LICENSE) license.
Made by [@t128n](https://github.com/t128n) and [community](https://github.com/t128n/tentactl/graphs/contributors) 💛
<br><br>
<a href="https://github.com/t128n/tentactl/graphs/contributors">
<img src="https://contrib.rocks/image?repo=t128n/tentactl" />
</a>

<!-- /automd -->

<!-- automd:with-automd -->

---

_🤖 auto updated with [automd](https://automd.unjs.io)_

<!-- /automd -->
