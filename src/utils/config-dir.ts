/**
 * Claude Code Configuration Directory Resolution
 *
 * Resolves the active Claude Code configuration directory, honouring
 * CLAUDE_CONFIG_DIR (absolute path, or ~-prefixed) with fallback to
 * ~/.claude.  Trailing separators are stripped; filesystem roots are
 * preserved.
 *
 * Multi-surface mirrors (keep in sync):
 *   scripts/lib/config-dir.mjs   — ESM hook/HUD runtime
 *   scripts/lib/config-dir.cjs   — CJS bridge runtime
 *   scripts/lib/config-dir.sh    — POSIX shell runtime
 */

import { dirname, join, normalize, parse, sep } from 'path';
import { homedir } from 'os';

/**
 * Strip a single trailing path separator (preserve filesystem root).
 * @internal Shared with scripts/lib/config-dir.{mjs,cjs,sh} — keep in sync.
 */
function stripTrailingSep(p: string): string {
  if (!p.endsWith(sep)) {
    return p;
  }
  return p === parse(p).root ? p : p.slice(0, -1);
}

/**
 * Resolve the Claude Code configuration directory.
 *
 * Honours CLAUDE_CONFIG_DIR (absolute path, or ~-prefixed) with fallback
 * to ~/.claude.  Trailing separators are stripped; filesystem roots are
 * preserved.
 */
export function getClaudeConfigDir(): string {
  const home = homedir();
  const configured = process.env.CLAUDE_CONFIG_DIR?.trim();

  if (!configured) {
    return stripTrailingSep(normalize(join(home, '.claude')));
  }

  if (configured === '~') {
    return stripTrailingSep(normalize(home));
  }

  if (configured.startsWith('~/') || configured.startsWith('~\\')) {
    return stripTrailingSep(normalize(join(home, configured.slice(2))));
  }

  return stripTrailingSep(normalize(configured));
}

/**
 * Resolve the OMC global configuration/cache directory under the active Claude
 * config dir. This keeps hook/updater/HUD caches aligned with CLAUDE_CONFIG_DIR
 * instead of mixing in ~/.omc.
 */
export function getOmcConfigDir(): string {
  return join(getClaudeConfigDir(), '.omc');
}

/**
 * Resolve the path of Claude Code's own global state file (`.claude.json`,
 * holding `mcpServers`, onboarding and account metadata) for a given config dir.
 *
 * Claude Code places it in one of two locations, switching on whether
 * CLAUDE_CONFIG_DIR is set at all — not on whether its value differs from the
 * default. Verified against the CLI:
 *
 *   unset            -> dirname(configDir)/.claude.json   (~/.claude.json)
 *   set, any value   -> configDir/.claude.json            (X/.claude.json)
 *
 * The "set" branch holds even when the value equals the default config dir, so
 * `CLAUDE_CONFIG_DIR=~/.claude` reads ~/.claude/.claude.json, not ~/.claude.json.
 * Deriving the location from dirname(configDir) alone is correct only while
 * CLAUDE_CONFIG_DIR stays unset.
 */
export function getClaudeStateFilePathFor(configDir: string): string {
  const configured = process.env.CLAUDE_CONFIG_DIR?.trim();

  return configured
    ? join(configDir, '.claude.json')
    : join(dirname(configDir), '.claude.json');
}

/** Resolve the active config dir's Claude Code state file path. */
export function getClaudeStateFilePath(): string {
  return getClaudeStateFilePathFor(getClaudeConfigDir());
}

/** Resolve the canonical update-check cache file path. */
export function getUpdateCheckCachePath(): string {
  return join(getOmcConfigDir(), 'update-check.json');
}
