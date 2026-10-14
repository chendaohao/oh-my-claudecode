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
/**
 * Resolve the Claude Code configuration directory.
 *
 * Honours CLAUDE_CONFIG_DIR (absolute path, or ~-prefixed) with fallback
 * to ~/.claude.  Trailing separators are stripped; filesystem roots are
 * preserved.
 */
export declare function getClaudeConfigDir(): string;
/**
 * Resolve the OMC global configuration/cache directory under the active Claude
 * config dir. This keeps hook/updater/HUD caches aligned with CLAUDE_CONFIG_DIR
 * instead of mixing in ~/.omc.
 */
export declare function getOmcConfigDir(): string;
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
export declare function getClaudeStateFilePathFor(configDir: string): string;
/** Resolve the active config dir's Claude Code state file path. */
export declare function getClaudeStateFilePath(): string;
/** Resolve the canonical update-check cache file path. */
export declare function getUpdateCheckCachePath(): string;
//# sourceMappingURL=config-dir.d.ts.map