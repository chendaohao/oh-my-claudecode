/**
 * OMC HUD - Git Elements
 *
 * Renders git repository name and branch information.
 */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { dim, cyan, green, red } from '../colors.js';
import { DEFAULT_HUD_LABELS } from '../types.js';
const CACHE_TTL_MS = 30_000;
const repoCache = new Map();
const branchCache = new Map();
const worktreeCache = new Map();
const statusCache = new Map();
function git(args, cwd) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf-8',
        timeout: 1000,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
    }).trim();
}
/**
 * Clear all git caches. Call in tests beforeEach to ensure a clean slate.
 */
export function resetGitCache() {
    repoCache.clear();
    branchCache.clear();
    worktreeCache.clear();
    statusCache.clear();
}
/**
 * Get git repository name from remote URL.
 * Extracts the repo name from URLs like:
 * - https://github.com/user/repo.git
 * - git@github.com:user/repo.git
 *
 * @param cwd - Working directory to run git command in
 * @returns Repository name or null if not available
 */
export function getGitRepoName(cwd) {
    const key = cwd ? resolve(cwd) : process.cwd();
    const cached = repoCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.value;
    }
    let result = null;
    try {
        const url = git(['remote', 'get-url', 'origin'], cwd);
        if (!url) {
            result = null;
        }
        else {
            // Extract repo name from URL
            // Handles: https://github.com/user/repo.git, git@github.com:user/repo.git
            const match = url.match(/\/([^/]+?)(?:\.git)?$/) || url.match(/:([^/]+?)(?:\.git)?$/);
            result = match ? match[1].replace(/\.git$/, '') : null;
        }
    }
    catch {
        result = null;
    }
    repoCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
}
/**
 * Get current git branch name.
 *
 * @param cwd - Working directory to run git command in
 * @returns Branch name or null if not available
 */
export function getGitBranch(cwd) {
    const key = cwd ? resolve(cwd) : process.cwd();
    const cached = branchCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.value;
    }
    let result = null;
    try {
        const branch = git(['branch', '--show-current'], cwd);
        result = branch || null;
    }
    catch {
        result = null;
    }
    branchCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
}
/**
 * Detect if the current directory is inside a git linked worktree.
 * Compares --git-dir with --git-common-dir; they differ in linked worktrees.
 * When in a worktree, extracts the worktree name from the git-dir path.
 *
 * @param cwd - Working directory
 * @returns Worktree detection result (cached for CACHE_TTL_MS)
 */
export function getWorktreeInfo(cwd) {
    const key = cwd ? resolve(cwd) : process.cwd();
    const cached = worktreeCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.value;
    }
    let result = { isWorktree: false, worktreeName: null };
    try {
        const gitDir = git(['rev-parse', '--git-dir'], cwd);
        const gitCommonDir = git(['rev-parse', '--git-common-dir'], cwd);
        // Canonicalize via realpathSync to handle symlinked repo paths
        let resolvedGitDir = resolve(key, gitDir);
        let resolvedCommonDir = resolve(key, gitCommonDir);
        try {
            resolvedGitDir = realpathSync(resolvedGitDir);
        }
        catch { /* use resolved */ }
        try {
            resolvedCommonDir = realpathSync(resolvedCommonDir);
        }
        catch { /* use resolved */ }
        if (resolvedGitDir !== resolvedCommonDir) {
            // Extract worktree name from gitDir path (e.g. /repo/.git/worktrees/my-wt → my-wt)
            result = { isWorktree: true, worktreeName: basename(resolvedGitDir) };
        }
    }
    catch {
        // Not in a git repo or command failed
    }
    worktreeCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
}
/**
 * Render git repository name element.
 *
 * @param cwd - Working directory
 * @returns Formatted repo name or null
 */
export function renderGitRepo(cwd) {
    const repo = getGitRepoName(cwd);
    if (!repo)
        return null;
    return `${dim('repo:')}${cyan(repo)}`;
}
/**
 * Render git branch element.
 * When inside a linked worktree, appends the worktree name as suffix:
 *   branch:feature-x (wt:my-wt)
 *
 * @param cwd - Working directory
 * @returns Formatted branch name or null
 */
export function renderGitBranch(cwd) {
    const branch = getGitBranch(cwd);
    if (!branch)
        return null;
    const wtInfo = getWorktreeInfo(cwd);
    if (wtInfo.isWorktree && wtInfo.worktreeName) {
        return `${dim('branch:')}${cyan(branch)} ${dim('(wt:')}${cyan(wtInfo.worktreeName)}${dim(')')}`;
    }
    return `${dim('branch:')}${cyan(branch)}`;
}
/**
 * Resolve the remote-tracking ref that `git push` would update for the current
 * branch, or null when it cannot be determined.
 *
 * `git status -b` reports ahead/behind against the *upstream* branch. In a fork
 * setup that pulls from one remote and pushes to another, that is not what
 * "unpushed" means: every local-only commit reads as permanently ahead, and the
 * count grows without ever going back to zero.
 *
 * `@{push}` would name the right ref, but git refuses to resolve it under
 * `push.default=simple` whenever the push remote differs from the upstream
 * remote ("cannot resolve 'simple' push to a single destination"), so the
 * remote is resolved by hand in the same precedence `git push` uses.
 */
function resolvePushRef(cwd) {
    try {
        const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
        if (!branch || branch === 'HEAD')
            return null; // detached HEAD
        const configOrNull = (key) => {
            try {
                // An unset key is not an error condition for callers, but `git config
                // --get` exits non-zero for it.
                return git(['config', '--get', key], cwd) || null;
            }
            catch {
                return null;
            }
        };
        const remote = configOrNull(`branch.${branch}.pushRemote`) ??
            configOrNull('remote.pushDefault') ??
            configOrNull(`branch.${branch}.remote`);
        if (!remote)
            return null;
        const ref = `refs/remotes/${remote}/${branch}`;
        try {
            git(['rev-parse', '--verify', '--quiet', ref], cwd);
        }
        catch {
            return null; // Configured, but never fetched — fall back to the status line.
        }
        return ref;
    }
    catch {
        return null;
    }
}
/**
 * Get git working tree status counts.
 * Parses `git --no-optional-locks status --porcelain -b` for staged, modified,
 * untracked and `behind` counts. `ahead` is measured against the ref `git push`
 * would update when one can be resolved, and against the status line otherwise.
 *
 * @param cwd - Working directory
 * @returns Status counts or null if not in a git repo
 */
export function getGitStatusCounts(cwd) {
    const key = cwd ? resolve(cwd) : process.cwd();
    const cached = statusCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.value;
    }
    let result = null;
    try {
        const output = git(['--no-optional-locks', 'status', '--porcelain', '-b'], cwd);
        let staged = 0, modified = 0, untracked = 0, ahead = 0, behind = 0;
        if (output) {
            const lines = output.split('\n');
            // Parse branch line for counts: ## main...origin/main [ahead 3, behind 1]
            const branchLine = lines[0];
            // `ahead` is measured against the ref `git push` would update, so it means
            // "not pushed to the fork" rather than "not pushed to the upstream branch"
            // (see resolvePushRef). `behind` deliberately keeps the status line's
            // upstream count: falling behind the canonical remote is the actionable
            // pull signal, while a fork that is merely stale is not.
            let aheadResolved = false;
            const pushRef = resolvePushRef(cwd);
            if (pushRef) {
                try {
                    const parsedAhead = Number.parseInt(git(['rev-list', '--count', `${pushRef}..HEAD`], cwd), 10);
                    if (Number.isFinite(parsedAhead)) {
                        ahead = parsedAhead;
                        aheadResolved = true;
                    }
                }
                catch {
                    // Fall through to the status line.
                }
            }
            if (!aheadResolved) {
                const aheadMatch = branchLine.match(/\bahead (\d+)/);
                if (aheadMatch)
                    ahead = parseInt(aheadMatch[1], 10);
            }
            const behindMatch = branchLine.match(/\bbehind (\d+)/);
            if (behindMatch)
                behind = parseInt(behindMatch[1], 10);
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                if (!line || line.length < 2)
                    continue;
                const idx = line[0];
                const wt = line[1];
                if (idx === '?') {
                    untracked++;
                }
                else {
                    if (idx !== ' ' && idx !== '?')
                        staged++;
                    if (wt === 'M' || wt === 'D')
                        modified++;
                }
            }
        }
        result = { staged, modified, untracked, ahead, behind };
    }
    catch {
        result = null;
    }
    statusCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
}
/**
 * Render git working tree status element.
 * Format: +2 !3 ?1 ⇡1 ⇣2
 *
 * @param cwd - Working directory
 * @returns Formatted status or null if clean or not in a git repo
 */
export function renderGitStatus(cwd, labels = DEFAULT_HUD_LABELS) {
    const counts = getGitStatusCounts(cwd);
    if (!counts)
        return null;
    const { staged, modified, untracked, ahead, behind } = counts;
    if (staged === 0 && modified === 0 && untracked === 0 && ahead === 0 && behind === 0) {
        return null;
    }
    const parts = [];
    if (staged > 0)
        parts.push(`${green(labels.staged)}${staged}`);
    if (modified > 0)
        parts.push(`${red(labels.modified)}${modified}`);
    if (untracked > 0)
        parts.push(`${cyan(labels.untracked)}${untracked}`);
    if (ahead > 0)
        parts.push(`${green(labels.ahead)}${ahead}`);
    if (behind > 0)
        parts.push(`${red(labels.behind)}${behind}`);
    return parts.join(' ');
}
//# sourceMappingURL=git.js.map