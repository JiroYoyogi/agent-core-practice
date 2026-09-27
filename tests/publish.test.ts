import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm, chmod, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { publishReadme, PublishError } from '../src/publish-readme.js';
import { pushReadme, validateReadmeChange } from '../src/git.js';
import { withWorkspace, type Workspace } from '../src/workspace.js';
import { repositoryConfig } from '../src/repository-config.js';
const exec = promisify(execFile);
const remoteUrl = `https://github.com/${repositoryConfig.owner}/${repositoryConfig.repo}.git`;
const git = async (directory: string, ...args: string[]) => (await exec('git', args, { cwd: directory })).stdout.trim();
async function fixture(task: (w: Workspace, remote: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'publish-test-'));
  const directory = join(root, 'repo');
  const remote = join(root, 'remote.git');
  try {
    await git(root, 'init', '--bare', remote);
    await git(root, 'init', '-b', 'main', directory);
    await writeFile(join(directory, 'README.md'), '# Original\n');
    await writeFile(join(directory, 'other.txt'), 'unchanged');
    await git(directory, 'add', '.');
    await git(directory, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Initial');
    await git(directory, 'push', remote, 'main');
    await git(directory, 'remote', 'add', 'origin', remoteUrl);
    const commit = await git(directory, 'rev-parse', 'HEAD');
    await task({ directory, readmePath: join(directory, 'README.md'), source: { ok: true, repository: 'test/target', branch: 'main', commit, path: 'README.md', bytes: 11, origin: remoteUrl, clean: true } }, remote);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('READMEだけを専用ブランチへcommit・pushし、PR情報を返す。mainは不変', () => fixture(async (w, remote) => {
  await writeFile(w.readmePath, '# Original\nEdited\n');
  const result = await publishReadme(w, 'Edited', {
    writeToken: async () => 'fake-token',
    push: (dir, branch, commit, token) => pushReadme(dir, branch, commit, token, async (args, credential, cwd) => {
      assert.equal(credential, 'fake-token');
      assert.deepEqual(args, ['push', '--', remoteUrl, `HEAD:refs/heads/${branch}`]);
      await git(cwd!, 'push', '--', remote, `HEAD:refs/heads/${branch}`);
    }),
    createPr: async (branch, summary, base, token) => {
      assert.match(branch, /^codex\/readme-/); assert.equal(summary, 'Edited');
      assert.equal(base, w.source.commit); assert.equal(token, 'fake-token');
      return { pullRequestNumber: 1, pullRequestUrl: 'https://github.com/test/target/pull/1' };
    },
  });
  assert.equal(result.status, 'pr_created');
  if (result.status !== 'pr_created') assert.fail();
  assert.equal(await git(remote, 'rev-parse', 'main'), w.source.commit);
  assert.equal(await git(remote, 'rev-parse', result.branch), result.commit);
  assert.equal(await git(remote, 'diff', '--name-only', 'main', result.branch), 'README.md');
  assert.equal(await git(w.directory, 'config', '--get', 'remote.origin.url'), remoteUrl);
}));

test('変更なしならトークン発行もPR作成もしない', () => fixture(async w => {
  const forbidden = async (): Promise<never> => { throw new Error('must not call'); };
  assert.deepEqual(await publishReadme(w, '', { writeToken: forbidden, push: forbidden, createPr: forbidden }), { status: 'no_changes' });
}));

for (const kind of ['other', 'untracked', 'delete', 'symlink', 'mode', 'large', 'staged-other', 'head']) {
  test(`不正な変更を公開前に拒否: ${kind}`, () => fixture(async w => {
    if (kind === 'other' || kind === 'staged-other') {
      await writeFile(join(w.directory, 'other.txt'), 'changed');
      if (kind === 'staged-other') await git(w.directory, 'add', 'other.txt');
    }
    if (kind === 'untracked') await writeFile(join(w.directory, 'new.txt'), 'new');
    if (kind === 'delete' || kind === 'symlink') await rm(w.readmePath);
    if (kind === 'symlink') await symlink('other.txt', w.readmePath);
    if (kind === 'mode') await chmod(w.readmePath, 0o755);
    if (kind === 'large') await writeFile(w.readmePath, 'x'.repeat(32769));
    if (kind === 'head') await git(w.directory, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'unexpected');
    await assert.rejects(publishReadme(w, '', { writeToken: async () => assert.fail('must not issue token') }), (e: unknown) => e instanceof PublishError && e.stage === 'validate');
  }));
}

test('push失敗とPR作成失敗は確認可能な状態を返し、作業領域も削除される', () => fixture(async (w) => {
  for (const stage of ['push', 'create_pr']) {
    let directory = '';
    await assert.rejects(withWorkspace(async workspace => {
      directory = workspace.directory;
      await writeFile(workspace.readmePath, 'changed\n');
      return publishReadme(workspace, '', {
        writeToken: async () => 'secret-value',
        push: async () => { if (stage === 'push') throw new Error('secret-value'); },
        createPr: async () => { throw new Error('secret-value'); },
      });
    }, async dest => {
      await exec('git', ['clone', w.directory, dest]);
      return w.source;
    }), (e: unknown) => {
      assert.ok(e instanceof PublishError);
      assert.equal(e.stage, stage); assert.ok(e.branch); assert.ok(e.commit);
      assert.equal(e.pushState, stage === 'push' ? 'unknown' : 'confirmed');
      assert.doesNotMatch(JSON.stringify(e), /secret-value/);
      return true;
    });
    await assert.rejects(access(dirname(directory)), { code: 'ENOENT' });
  }
}));

test('mainや想定外remoteへのpushを拒否する', () => fixture(async w => {
  const never = async () => assert.fail('must not push');
  await assert.rejects(pushReadme(w.directory, 'main', w.source.commit, 'fake', never));
  const branch = 'codex/readme-00000000-0000-4000-8000-000000000001';
  await git(w.directory, 'switch', '-c', branch);
  await git(w.directory, 'remote', 'set-url', 'origin', 'https://example.com/other.git');
  await assert.rejects(pushReadme(w.directory, branch, w.source.commit, 'fake', never));
}));

test('PR APIへ固定baseと指定headを送り、想定外URLは拒否する', async () => {
  const { createReadmePullRequest } = await import('../src/github.js');
  const original = globalThis.fetch;
  const branch = 'codex/readme-00000000-0000-4000-8000-000000000001';
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, `https://api.github.com/repos/${repositoryConfig.owner}/${repositoryConfig.repo}/pulls`);
      assert.equal(options?.method, 'POST');
      const body = JSON.parse(String(options?.body));
      assert.equal(body.base, 'main'); assert.equal(body.head, branch);
      assert.match(body.body, /base-sha/);
      return new Response(JSON.stringify({ number: 12, html_url: `https://github.com/${repositoryConfig.owner}/${repositoryConfig.repo}/pull/12` }));
    };
    assert.equal((await createReadmePullRequest(branch, 'summary', 'base-sha', 'fake')).pullRequestNumber, 12);
    globalThis.fetch = async () => new Response(JSON.stringify({ number: 12, html_url: 'https://example.com/12' }));
    await assert.rejects(createReadmePullRequest(branch, '', '', 'fake'), /想定と異なります/);
  } finally { globalThis.fetch = original; }
});
