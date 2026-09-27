import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deploy, validateConfig, waitForDeployment } from './deploy.mjs';

const config = {
  agentRuntimeId: 'coding_agent-1234567890', roleArn: 'arn:aws:iam::123456789012:role/Test',
  agentRuntimeArtifact: { codeConfiguration: {
    runtime: 'NODE_22', entryPoint: ['dist/server.js'],
    code: { s3: { bucket: 'test-bucket', prefix: 'old.zip', versionId: 'old-version' } },
  } },
  environmentVariables: { GITHUB_APP_CLIENT_ID: 'test-client' },
};

test('設定不足・秘密鍵本文を拒否する', () => {
  assert.throws(() => validateConfig({}));
  assert.throws(() => validateConfig({ ...config, environmentVariables: { GITHUB_TOKEN: 'test' } }));
  validateConfig(config);
});

test('DEFAULTが古いバージョンなら待ち、今回のliveVersionで完了する', async () => {
  let polls = 0;
  await waitForDeployment(
    async () => ({ status: 'READY', agentRuntimeVersion: '2' }),
    async () => ({ status: 'READY', liveVersion: ++polls === 1 ? '1' : '2' }), '2',
    { pause: async () => {}, log: () => {} },
  );
  assert.equal(polls, 2);
});

test('失敗・同時更新・タイムアウトを成功にしない', async () => {
  const endpoint = async () => ({ status: 'READY', liveVersion: '1' });
  await assert.rejects(waitForDeployment(async () => ({ status: 'UPDATE_FAILED' }), endpoint, '2', { log: () => {} }), /failureReason/);
  await assert.rejects(waitForDeployment(async () => ({ status: 'READY', agentRuntimeVersion: '3' }), endpoint, '2', { log: () => {} }), /別のRuntime更新/);
  let now = 0;
  await assert.rejects(waitForDeployment(async () => ({ status: 'READY', agentRuntimeVersion: '2' }), endpoint, '2', {
    now: () => now, pause: async () => { now += 10; }, timeoutMs: 15, log: () => {},
  }), /タイムアウト/);
});

async function fixture(callback) {
  const root = await mkdtemp(join(tmpdir(), 'deploy-test-'));
  try {
    await mkdir(join(root, 'infra'));
    await writeFile(join(root, 'infra/update-runtime.json'), JSON.stringify(config));
    await writeFile(join(root, 'package.json'), '{}');
    await writeFile(join(root, 'package-lock.json'), '{}');
    await callback(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('デプロイの順序・設定維持・新S3キー・後片付け（AWSは模擬）', () => fixture(async root => {
  const calls = [];
  let payload;
  let updated = false;
  const execute = async (cmd, args, options) => {
    calls.push([cmd, ...args]);
    if (cmd !== 'aws') return '';
    if (args[0] === 's3') return '';
    if (args[1] === 'get-caller-identity') return JSON.stringify({ Account: '123456789012' });
    if (args[1] === 'get-agent-runtime') return JSON.stringify({
      status: 'READY', agentRuntimeVersion: updated ? '2' : '1',
      environmentVariables: { EXISTING: 'preserved' },
      lifecycleConfiguration: { idleRuntimeSessionTimeout: 300, maxLifetime: 1800 },
    });
    if (args[1] === 'update-agent-runtime') {
      payload = JSON.parse(await readFile(args[args.indexOf('--cli-input-json') + 1].slice(7), 'utf8'));
      updated = true;
      return JSON.stringify({ agentRuntimeVersion: '2' });
    }
    if (args[1] === 'get-agent-runtime-endpoint') return JSON.stringify({ status: 'READY', liveVersion: '2' });
    throw new Error('Unexpected call');
  };
  await deploy({ root, execute, log: () => {}, platform: 'linux', arch: 'arm64' });
  assert.deepEqual(payload.environmentVariables, { EXISTING: 'preserved', GITHUB_APP_CLIENT_ID: 'test-client' });
  assert.equal(payload.lifecycleConfiguration.maxLifetime, 1800);
  const s3 = payload.agentRuntimeArtifact.codeConfiguration.code.s3;
  assert.match(s3.prefix, /^coding-agent\/deploy\/.+\/deployment.zip$/);
  assert.equal(s3.versionId, undefined);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'infra/update-runtime.json'), 'utf8')), config);
  assert.equal(calls.findIndex(c => c[1] === 's3') < calls.findIndex(c => c[1] === 'bedrock-agentcore-control' && c[2] === 'update-agent-runtime'), true);
  assert.deepEqual(await readdir(join(root, '.deploy')), ['last-deploy.json']);
  assert.equal(JSON.parse(await readFile(join(root, '.deploy/last-deploy.json'), 'utf8')).status, 'READY');
}));

test('型チェック失敗後はS3・Runtimeを書き換えずロックを解除する', () => fixture(async root => {
  const calls = [];
  const execute = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'npm') throw new Error('typecheck failed');
    if (cmd === 'zip') return '';
    if (args[1] === 'get-caller-identity') return JSON.stringify({ Account: '123456789012' });
    return JSON.stringify({ status: 'READY', agentRuntimeVersion: '1' });
  };
  await assert.rejects(deploy({ root, execute, log: () => {}, platform: 'linux', arch: 'arm64' }), /typecheck failed/);
  assert.equal(calls.some(c => c.includes('cp') || c.includes('update-agent-runtime')), false);
  assert.deepEqual(await readdir(join(root, '.deploy')), []);
}));
