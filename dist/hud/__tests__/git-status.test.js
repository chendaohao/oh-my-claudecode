/**
 * Tests for git status HUD element
 *
 * Covers:
 * - getGitStatusCounts parsing of `git status --porcelain -b`
 * - renderGitStatus output formatting
 * - Cache behavior
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
vi.mock('node:child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        execFileSync: vi.fn(),
    };
});
import { getGitStatusCounts, renderGitStatus, resetGitCache } from '../elements/git.js';
const mockedExecFileSync = vi.mocked(execFileSync);
beforeEach(() => {
    vi.resetAllMocks();
    resetGitCache();
});
// ---------------------------------------------------------------------------
// getGitStatusCounts
// ---------------------------------------------------------------------------
describe('getGitStatusCounts', () => {
    it('returns zeros for clean repo', () => {
        mockedExecFileSync.mockReturnValue('## main...origin/main\n');
        const counts = getGitStatusCounts('/tmp');
        expect(counts).toEqual({ staged: 0, modified: 0, untracked: 0, ahead: 0, behind: 0 });
    });
    it('counts staged files', () => {
        mockedExecFileSync.mockReturnValue('## main\nM  file1.ts\nA  file2.ts\n');
        const counts = getGitStatusCounts('/tmp');
        expect(counts?.staged).toBe(2);
        expect(counts?.modified).toBe(0);
    });
    it('counts modified (unstaged) files', () => {
        mockedExecFileSync.mockReturnValue('## main\n M file1.ts\n D file2.ts\n');
        const counts = getGitStatusCounts('/tmp');
        expect(counts?.staged).toBe(0);
        expect(counts?.modified).toBe(2);
    });
    it('counts untracked files', () => {
        mockedExecFileSync.mockReturnValue('## main\n?? newfile.ts\n?? another.ts\n?? third.ts\n');
        const counts = getGitStatusCounts('/tmp');
        expect(counts?.untracked).toBe(3);
        expect(counts?.staged).toBe(0);
        expect(counts?.modified).toBe(0);
    });
    it('counts both staged and modified for same file', () => {
        // MM means staged + modified
        mockedExecFileSync.mockReturnValue('## main\nMM file.ts\n');
        const counts = getGitStatusCounts('/tmp');
        expect(counts?.staged).toBe(1);
        expect(counts?.modified).toBe(1);
    });
    it('parses ahead count', () => {
        mockedExecFileSync.mockReturnValue('## main...origin/main [ahead 3]\n');
        const counts = getGitStatusCounts('/tmp');
        expect(counts?.ahead).toBe(3);
        expect(counts?.behind).toBe(0);
    });
    it('parses behind count', () => {
        mockedExecFileSync.mockReturnValue('## main...origin/main [behind 2]\n');
        const counts = getGitStatusCounts('/tmp');
        expect(counts?.ahead).toBe(0);
        expect(counts?.behind).toBe(2);
    });
    it('parses ahead and behind', () => {
        mockedExecFileSync.mockReturnValue('## main...origin/main [ahead 5, behind 2]\n');
        const counts = getGitStatusCounts('/tmp');
        expect(counts?.ahead).toBe(5);
        expect(counts?.behind).toBe(2);
    });
    it('handles mixed status', () => {
        mockedExecFileSync.mockReturnValue(('## feat...origin/feat [ahead 1, behind 3]\n' +
            'M  staged.ts\n' +
            ' M modified.ts\n' +
            '?? new.ts\n' +
            'A  added.ts\n' +
            'D  deleted.ts\n' +
            ' D removed.ts\n'));
        const counts = getGitStatusCounts('/tmp');
        expect(counts).toEqual({ staged: 3, modified: 2, untracked: 1, ahead: 1, behind: 3 });
    });
    it('returns null on git error', () => {
        mockedExecFileSync.mockImplementation(() => { throw new Error('not a git repo'); });
        expect(getGitStatusCounts('/tmp')).toBeNull();
    });
    it('returns cached result on second call', () => {
        mockedExecFileSync.mockReturnValue('## main\n?? file.ts\n');
        getGitStatusCounts('/tmp');
        const callsAfterFirst = mockedExecFileSync.mock.calls.length;
        getGitStatusCounts('/tmp');
        expect(mockedExecFileSync.mock.calls.length).toBe(callsAfterFirst);
    });
    it('disables optional git locks for background HUD polling', () => {
        mockedExecFileSync.mockReturnValue('## main\n');
        getGitStatusCounts('/tmp');
        expect(mockedExecFileSync).toHaveBeenCalledWith('git', ['--no-optional-locks', 'status', '--porcelain', '-b'], expect.objectContaining({ cwd: '/tmp', windowsHide: true }));
    });
});
// ---------------------------------------------------------------------------
// renderGitStatus
// ---------------------------------------------------------------------------
describe('renderGitStatus', () => {
    it('returns null for clean repo', () => {
        mockedExecFileSync.mockReturnValue('## main...origin/main\n');
        expect(renderGitStatus('/tmp')).toBeNull();
    });
    it('returns null on git error', () => {
        mockedExecFileSync.mockImplementation(() => { throw new Error('fail'); });
        expect(renderGitStatus('/tmp')).toBeNull();
    });
    it('shows staged count with + prefix', () => {
        mockedExecFileSync.mockReturnValue('## main\nA  file.ts\n');
        const result = renderGitStatus('/tmp');
        expect(result).toContain('+');
        expect(result).toContain('1');
    });
    it('shows modified count with ! prefix', () => {
        mockedExecFileSync.mockReturnValue('## main\n M file.ts\n');
        const result = renderGitStatus('/tmp');
        expect(result).toContain('!');
        expect(result).toContain('1');
    });
    it('shows untracked count with ? prefix', () => {
        mockedExecFileSync.mockReturnValue('## main\n?? file.ts\n');
        const result = renderGitStatus('/tmp');
        expect(result).toContain('?');
        expect(result).toContain('1');
    });
    it('shows ahead with ⇡', () => {
        mockedExecFileSync.mockReturnValue('## main...origin/main [ahead 2]\n');
        const result = renderGitStatus('/tmp');
        expect(result).toContain('⇡');
        expect(result).toContain('2');
    });
    it('shows behind with ⇣', () => {
        mockedExecFileSync.mockReturnValue('## main...origin/main [behind 4]\n');
        const result = renderGitStatus('/tmp');
        expect(result).toContain('⇣');
        expect(result).toContain('4');
    });
    it('uses configured status labels without changing counts', () => {
        mockedExecFileSync.mockReturnValue(('## main...origin/main [ahead 2, behind 4]\n' +
            'A  staged.ts\n' +
            ' M modified.ts\n' +
            '?? new.ts\n'));
        const result = renderGitStatus('/tmp', {
            staged: '已暂存',
            modified: '已修改',
            untracked: '未跟踪',
            ahead: '领先',
            behind: '落后',
        });
        expect(result).toContain('已暂存');
        expect(result).toContain('已修改');
        expect(result).toContain('未跟踪');
        expect(result).toContain('领先');
        expect(result).toContain('落后');
    });
});
// ---------------------------------------------------------------------------
// ahead is measured against the push remote
// ---------------------------------------------------------------------------
describe('getGitStatusCounts push-remote handling', () => {
    /**
     * Dispatch mocked git calls by argument so a test can describe the working
     * tree, the configured push remote and the resulting commit count
     * independently. `git config --get` throws for an unset key, as the real one
     * does, and resolvePushRef relies on that to walk its fallbacks.
     */
    function mockRepo(options) {
        const config = options.config ?? {};
        mockedExecFileSync.mockImplementation(((_cmd, args) => {
            if (args[0] === '--no-optional-locks')
                return options.status;
            if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
                return `${options.head ?? 'main'}\n`;
            }
            if (args[0] === 'config') {
                const value = config[args[2]];
                if (value === undefined)
                    throw new Error(`unset: ${args[2]}`);
                return `${value}\n`;
            }
            if (args[0] === 'rev-parse' && args[1] === '--verify') {
                if (options.pushRefExists === false)
                    throw new Error('no such ref');
                return 'abc1234\n';
            }
            if (args[0] === 'rev-list')
                return `${options.aheadOfPushRef ?? 0}\n`;
            throw new Error(`unexpected git invocation: ${args.join(' ')}`);
        }));
    }
    it('takes ahead from the push remote rather than the upstream branch', () => {
        // The status line still reports 7, but the fork already has everything.
        mockRepo({
            status: '## main...upstream/main [ahead 7]\n',
            config: { 'branch.main.remote': 'upstream', 'remote.pushDefault': 'origin' },
            aheadOfPushRef: 0,
        });
        expect(getGitStatusCounts('/tmp')?.ahead).toBe(0);
    });
    it('keeps behind measured against the upstream branch', () => {
        mockRepo({
            status: '## main...upstream/main [behind 3]\n',
            config: { 'branch.main.remote': 'upstream', 'remote.pushDefault': 'origin' },
            aheadOfPushRef: 0,
        });
        expect(getGitStatusCounts('/tmp')?.behind).toBe(3);
    });
    it('reports both directions at once', () => {
        mockRepo({
            status: '## main...upstream/main [behind 3]\n',
            config: { 'branch.main.remote': 'upstream', 'remote.pushDefault': 'origin' },
            aheadOfPushRef: 2,
        });
        const counts = getGitStatusCounts('/tmp');
        expect(counts?.ahead).toBe(2);
        expect(counts?.behind).toBe(3);
    });
    it('prefers branch.<name>.pushRemote over remote.pushDefault', () => {
        mockRepo({
            status: '## main...upstream/main [ahead 7]\n',
            config: {
                'branch.main.pushRemote': 'fork',
                'remote.pushDefault': 'origin',
                'branch.main.remote': 'upstream',
            },
            aheadOfPushRef: 1,
        });
        expect(getGitStatusCounts('/tmp')?.ahead).toBe(1);
        expect(mockedExecFileSync).toHaveBeenCalledWith('git', ['rev-list', '--count', 'refs/remotes/fork/main..HEAD'], expect.anything());
        // The first match short-circuits the later fallbacks.
        expect(mockedExecFileSync).not.toHaveBeenCalledWith('git', ['config', '--get', 'remote.pushDefault'], expect.anything());
    });
    it('falls back to the status line when the push ref was never fetched', () => {
        mockRepo({
            status: '## main...upstream/main [ahead 4]\n',
            config: { 'remote.pushDefault': 'origin' },
            pushRefExists: false,
        });
        expect(getGitStatusCounts('/tmp')?.ahead).toBe(4);
    });
    it('falls back to the status line when no push remote is configured', () => {
        mockRepo({ status: '## main...upstream/main [ahead 4]\n', config: {} });
        expect(getGitStatusCounts('/tmp')?.ahead).toBe(4);
    });
    it('falls back to the status line on a detached HEAD', () => {
        mockRepo({
            status: '## HEAD (no branch)\n',
            head: 'HEAD',
            config: { 'remote.pushDefault': 'origin' },
        });
        expect(getGitStatusCounts('/tmp')?.ahead).toBe(0);
    });
});
//# sourceMappingURL=git-status.test.js.map