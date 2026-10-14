const { homedir } = require('node:os');
const { dirname, join, normalize, parse, sep } = require('node:path');

function stripTrailingSep(p) {
  if (!p.endsWith(sep)) {
    return p;
  }

  return p === parse(p).root ? p : p.slice(0, -1);
}

function getClaudeConfigDir() {
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

function getOmcConfigDir() {
  return join(getClaudeConfigDir(), '.omc');
}

// Claude Code's own state file (.claude.json). It sits inside the config dir
// when CLAUDE_CONFIG_DIR is set, and beside it otherwise — the switch is on
// whether the env var exists, not on whether its value differs from the
// default. Keep in sync with src/utils/config-dir.ts.
function getClaudeStateFilePathFor(configDir) {
  const configured = process.env.CLAUDE_CONFIG_DIR?.trim();

  return configured
    ? join(configDir, '.claude.json')
    : join(dirname(configDir), '.claude.json');
}

function getClaudeStateFilePath() {
  return getClaudeStateFilePathFor(getClaudeConfigDir());
}

function getUpdateCheckCachePath() {
  return join(getOmcConfigDir(), 'update-check.json');
}

module.exports = {
  getClaudeConfigDir,
  getOmcConfigDir,
  getClaudeStateFilePath,
  getClaudeStateFilePathFor,
  getUpdateCheckCachePath,
};
