import type { TentactlConfig } from "./types";
import { serializeConfig } from "./config-io";

// ANSI colour codes
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";

const CONTEXT_LINES = 3;

/**
 * Compare local config (from file) against remote config (from GitHub).
 * Returns a coloured unified-diff string, or null if the two are identical.
 *
 * The diff is rendered as:  local (−)  vs  remote (+)
 * i.e. lines in local but not remote are red, lines in remote but not local are green.
 */
export function computeDiff(local: TentactlConfig, remote: TentactlConfig): string | null {
	// Strip local-only fields (strict) from both before comparison so they don't
	// produce noise (strict doesn't exist on the remote side).
	const localLines = serializeConfig(withoutLocalOnly(local)).split("\n");
	const remoteLines = serializeConfig(withoutLocalOnly(remote)).split("\n");

	const hunks = diffLines(localLines, remoteLines);
	if (hunks.length === 0) return null;

	const header = [`${BOLD}--- local${RESET}`, `${BOLD}+++ remote${RESET}`].join("\n");

	return header + "\n" + hunks.join("\n");
}

/** Remove fields that are meaningful only locally and have no remote equivalent. */
function withoutLocalOnly(config: TentactlConfig): TentactlConfig {
	const { strict: _gs, labels, collaborators, teams, rulesets, ...rest } = config;
	return {
		...rest,
		...(labels ? { labels: { items: labels.items } } : {}),
		...(collaborators ? { collaborators: { items: collaborators.items } } : {}),
		...(teams ? { teams: { items: teams.items } } : {}),
		...(rulesets ? { rulesets: { items: rulesets.items } } : {}),
	};
}

// ---------------------------------------------------------------------------
// Minimal Myers / patience diff for arrays of strings
// ---------------------------------------------------------------------------

interface Change {
	type: "equal" | "remove" | "add";
	line: string;
	localIdx: number;
	remoteIdx: number;
}

function diffLines(a: string[], b: string[]): string[] {
	const changes = myersDiff(a, b);
	return buildHunks(changes);
}

/** Greedy LCS-based diff (good enough for config files). */
function myersDiff(a: string[], b: string[]): Change[] {
	// Build LCS table
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () =>
		Array.from({ length: n + 1 }, () => 0),
	);

	for (let i = m - 1; i >= 0; i--) {
		for (let j = n - 1; j >= 0; j--) {
			if (a[i] === b[j]) {
				dp[i][j] = 1 + dp[i + 1][j + 1];
			} else {
				dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
			}
		}
	}

	// Trace back
	const changes: Change[] = [];
	let i = 0;
	let j = 0;

	while (i < m || j < n) {
		if (i < m && j < n && a[i] === b[j]) {
			changes.push({ type: "equal", line: a[i], localIdx: i, remoteIdx: j });
			i++;
			j++;
		} else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
			changes.push({ type: "add", line: b[j], localIdx: i, remoteIdx: j });
			j++;
		} else {
			changes.push({ type: "remove", line: a[i], localIdx: i, remoteIdx: j });
			i++;
		}
	}

	return changes;
}

function buildHunks(changes: Change[]): string[] {
	// Find indices of changed lines
	const changedAt = new Set<number>();
	changes.forEach((c, idx) => {
		if (c.type !== "equal") changedAt.add(idx);
	});

	if (changedAt.size === 0) return [];

	// Expand with context
	const included = new Set<number>();
	for (const idx of changedAt) {
		for (
			let k = Math.max(0, idx - CONTEXT_LINES);
			k <= Math.min(changes.length - 1, idx + CONTEXT_LINES);
			k++
		) {
			included.add(k);
		}
	}

	const lines: string[] = [];
	let lastIncluded = -2;

	const sortedIndices = [...included].sort((a, b) => a - b);

	for (const idx of sortedIndices) {
		if (idx > lastIncluded + 1) {
			// Hunk separator
			const c = changes[idx];
			lines.push(`${CYAN}@@ -${c.localIdx + 1} +${c.remoteIdx + 1} @@${RESET}`);
		}
		lastIncluded = idx;

		const { type, line } = changes[idx];
		if (type === "remove") {
			lines.push(`${RED}-${line}${RESET}`);
		} else if (type === "add") {
			lines.push(`${GREEN}+${line}${RESET}`);
		} else {
			lines.push(`${DIM} ${line}${RESET}`);
		}
	}

	return lines;
}
