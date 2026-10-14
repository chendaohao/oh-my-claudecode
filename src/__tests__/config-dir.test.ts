import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { basename, dirname, join, normalize } from 'path';
import { getClaudeConfigDir, getClaudeStateFilePath, getClaudeStateFilePathFor } from '../utils/config-dir.js'
import { isValidTranscriptPath } from '../lib/worktree-paths.js';
import { findRuleFiles } from '../hooks/rules-injector/finder.js';

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;

describe('getClaudeConfigDir', () => {
  afterEach(() => {
    if (originalConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    }
  });

  it('falls back to ~/.claude when CLAUDE_CONFIG_DIR is unset', () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    expect(getClaudeConfigDir()).toBe(normalize(join(homedir(), '.claude')));
  });

  it('falls back to ~/.claude when CLAUDE_CONFIG_DIR is empty', () => {
    process.env.CLAUDE_CONFIG_DIR = '   ';
    expect(getClaudeConfigDir()).toBe(normalize(join(homedir(), '.claude')));
  });

  it('returns an absolute custom path unchanged aside from normalization', () => {
    process.env.CLAUDE_CONFIG_DIR = join(tmpdir(), 'custom-claude-config', '..', 'custom-claude-config');
    expect(getClaudeConfigDir()).toBe(normalize(join(tmpdir(), 'custom-claude-config', '..', 'custom-claude-config')));
  });

  it('expands a bare tilde to the home directory', () => {
    process.env.CLAUDE_CONFIG_DIR = '~';
    expect(getClaudeConfigDir()).toBe(normalize(homedir()));
  });

  it('expands a ~-prefixed config path', () => {
    process.env.CLAUDE_CONFIG_DIR = '~/.claude-alt';
    expect(getClaudeConfigDir()).toBe(normalize(join(homedir(), '.claude-alt')));
  });

  it('strips a trailing separator from custom paths', () => {
    process.env.CLAUDE_CONFIG_DIR = join(tmpdir(), 'custom-claude-config') + '/';
    expect(getClaudeConfigDir()).toBe(normalize(join(tmpdir(), 'custom-claude-config')));
    expect(getClaudeConfigDir().endsWith('/')).toBe(false);
  });

  it('preserves a Windows drive root when trimming separators', async () => {
    process.env.CLAUDE_CONFIG_DIR = 'C:\\';

    vi.resetModules();
    vi.doMock('node:os', () => ({
      homedir: () => 'C:\\Users\\tester',
    }));
    vi.doMock('node:path', async () => import('node:path/win32'));

    try {
      const { getClaudeConfigDir: getWindowsConfigDir } = await import('../utils/config-dir.js');
      expect(getWindowsConfigDir()).toBe('C:\\');
    } finally {
      vi.doUnmock('node:os');
      vi.doUnmock('node:path');
      vi.resetModules();
    }
  });

  it('keeps the script helper aligned with the TypeScript helper', async () => {
    process.env.CLAUDE_CONFIG_DIR = '~/.claude-alt';
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import { getClaudeConfigDir } from './scripts/lib/config-dir.mjs'; process.stdout.write(getClaudeConfigDir());",
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: 'utf-8',
      },
    );
    expect(output).toBe(normalize(join(homedir(), '.claude-alt')));
  });

  it('find-node.sh resolves a ~-prefixed CLAUDE_CONFIG_DIR before reading .omc-config.json', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omc-find-node-home-'));
    const configDir = join(homeDir, '.claude-alt');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, '.omc-config.json'), JSON.stringify({ nodeBinary: process.execPath }));

    const output = execFileSync(
      '/bin/sh',
      [join(process.cwd(), 'scripts', 'find-node.sh'), '-e', "process.stdout.write('ok')"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HOME: homeDir,
          PATH: '/bin:/usr/bin',
          CLAUDE_CONFIG_DIR: '~/.claude-alt',
        },
        encoding: 'utf-8',
      },
    );

    expect(output).toBe('ok');
  });

  it('shared shell helper expands a ~-prefixed CLAUDE_CONFIG_DIR', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omc-uninstall-home-'));
    const output = execFileSync('bash', ['-lc', `. "${join(process.cwd(), 'scripts', 'lib', 'config-dir.sh')}"; resolve_claude_config_dir`], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: homeDir,
        CLAUDE_CONFIG_DIR: '~/.claude-alt',
      },
      encoding: 'utf-8',
    });

    expect(output.trim()).toBe(join(homeDir, '.claude-alt'));
  });

  it('shared shell helper expands a backslash-tilde-prefixed CLAUDE_CONFIG_DIR', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omc-uninstall-home-'));
    const output = execFileSync('bash', ['-lc', `. "${join(process.cwd(), 'scripts', 'lib', 'config-dir.sh')}"; resolve_claude_config_dir`], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: homeDir,
        CLAUDE_CONFIG_DIR: '~\\.claude-alt',
      },
      encoding: 'utf-8',
    });

    expect(output.trim()).toBe(join(homeDir, '.claude-alt'));
  });

  it('keeps the CJS helper aligned with the TypeScript helper', () => {
    process.env.CLAUDE_CONFIG_DIR = '~/.claude-alt';
    const cjsPath = join(process.cwd(), 'scripts', 'lib', 'config-dir.cjs');
    const output = execFileSync(
      process.execPath,
      ['-e', `const { getClaudeConfigDir } = require(${JSON.stringify(cjsPath)}); process.stdout.write(getClaudeConfigDir());`],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: 'utf-8',
      },
    );
    expect(output).toBe(normalize(join(homedir(), '.claude-alt')));
  });
});

describe('getClaudeStateFilePath', () => {
  afterEach(() => {
    if (originalConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    }
  });

  // Claude Code switches the state-file location on whether CLAUDE_CONFIG_DIR
  // is set at all, not on whether its value differs from the default. Verified
  // against the CLI: with the env var unset the state file lands beside the
  // config dir; with it set to any value (including the default path) the state
  // file lands inside.

  it('places the state file beside the config dir when CLAUDE_CONFIG_DIR is unset', () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    const configDir = normalize(join(homedir(), '.claude'));
    expect(getClaudeStateFilePath()).toBe(join(homedir(), '.claude.json'));
    expect(getClaudeStateFilePathFor(configDir)).toBe(join(homedir(), '.claude.json'));
  });

  it('places the state file inside a custom config dir', () => {
    const configDir = join(tmpdir(), 'custom-claude-config');
    process.env.CLAUDE_CONFIG_DIR = configDir;
    expect(getClaudeStateFilePath()).toBe(join(configDir, '.claude.json'));
    expect(getClaudeStateFilePathFor(configDir)).toBe(join(configDir, '.claude.json'));
  });

  // The regression this guards: deriving the path from dirname(configDir)
  // alone looks right whenever the env var is unset, and silently reads the
  // wrong file as soon as it is set — including when set to the default path,
  // where dirname() yields ~/.claude.json but the CLI reads ~/.claude/.claude.json.
  it('places the state file inside the config dir when it is explicitly set to the default path', () => {
    const configDir = normalize(join(homedir(), '.claude'));
    process.env.CLAUDE_CONFIG_DIR = configDir;
    expect(getClaudeStateFilePath()).toBe(join(configDir, '.claude.json'));
    expect(getClaudeStateFilePath()).not.toBe(join(homedir(), '.claude.json'));
  });

  it('treats a whitespace-only CLAUDE_CONFIG_DIR as unset', () => {
    const configDir = normalize(join(homedir(), '.claude'));
    process.env.CLAUDE_CONFIG_DIR = '   ';
    expect(getClaudeStateFilePath()).toBe(join(homedir(), '.claude.json'));
    expect(getClaudeStateFilePathFor(configDir)).toBe(join(homedir(), '.claude.json'));
  });

  it('keeps the script helper aligned for both branches', () => {
    const configDir = join(tmpdir(), 'omc-state-file-parity');
    const scriptHelper = (env: NodeJS.ProcessEnv): string => execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { getClaudeStateFilePath } from './scripts/lib/config-dir.mjs'; process.stdout.write(getClaudeStateFilePath());`,
      ],
      { cwd: process.cwd(), env, encoding: 'utf-8' },
    );

    const configured = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
    expect(scriptHelper(configured)).toBe(join(configDir, '.claude.json'));

    const unset = { ...process.env };
    delete unset.CLAUDE_CONFIG_DIR;
    expect(scriptHelper(unset)).toBe(join(dirname(normalize(join(homedir(), '.claude'))), '.claude.json'));
  });
});

describe('CLAUDE_CONFIG_DIR downstream integration', () => {
  let origConfigDir: string | undefined;
  let tempDir: string;
  let tildeConfigDir: string;

  beforeEach(() => {
    origConfigDir = process.env.CLAUDE_CONFIG_DIR;
    tempDir = join(tmpdir(), `omc-test-configdir-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    tildeConfigDir = join(homedir(), `.omc-test-configdir-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (origConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = origConfigDir;
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    try {
      rmSync(tildeConfigDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('accepts transcript paths under custom CLAUDE_CONFIG_DIR', () => {
    process.env.CLAUDE_CONFIG_DIR = '/opt/custom-claude-config';
    const transcriptPath = '/opt/custom-claude-config/projects/-foo/bar/session.jsonl';
    expect(isValidTranscriptPath(transcriptPath)).toBe(true);
  });

  it('accepts transcript paths when CLAUDE_CONFIG_DIR uses a ~-prefixed path', () => {
    process.env.CLAUDE_CONFIG_DIR = `~/${basename(tildeConfigDir)}`;
    const transcriptPath = join(tildeConfigDir, 'projects', '-foo', 'bar', 'session.jsonl');
    expect(isValidTranscriptPath(transcriptPath)).toBe(true);
  });

  it('discovers user rules from custom CLAUDE_CONFIG_DIR/rules', () => {
    const customRulesDir = join(tempDir, 'rules');
    mkdirSync(customRulesDir, { recursive: true });
    writeFileSync(join(customRulesDir, 'my-rule.md'), '# My Rule\nRule content');

    process.env.CLAUDE_CONFIG_DIR = tempDir;

    const candidates = findRuleFiles(null, '/some/file.ts');
    const globalRules = candidates.filter(c => c.isGlobal);

    expect(globalRules.length).toBeGreaterThanOrEqual(1);
    expect(globalRules.some(c => c.path.includes('my-rule.md'))).toBe(true);
  });

  it('uses the active config dir rather than default ~/.claude/rules for user rules', () => {
    const customRulesDir = join(tempDir, 'rules');
    mkdirSync(customRulesDir, { recursive: true });
    writeFileSync(join(customRulesDir, 'custom-rule.md'), '# Custom Rule');

    process.env.CLAUDE_CONFIG_DIR = tempDir;

    const candidates = findRuleFiles(null, '/some/file.ts');
    const globalRules = candidates.filter(c => c.isGlobal);

    expect(globalRules.some(c => c.path.includes('custom-rule.md'))).toBe(true);
  });

  it('discovers user rules when CLAUDE_CONFIG_DIR uses a ~-prefixed path', () => {
    const customRulesDir = join(tildeConfigDir, 'rules');
    mkdirSync(customRulesDir, { recursive: true });
    writeFileSync(join(customRulesDir, 'tilde-rule.md'), '# Tilde Rule');

    process.env.CLAUDE_CONFIG_DIR = `~/${basename(tildeConfigDir)}`;

    const candidates = findRuleFiles(null, '/some/file.ts');
    const globalRules = candidates.filter(c => c.isGlobal);

    expect(globalRules.some(c => c.path.includes('tilde-rule.md'))).toBe(true);
  });
});
