import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const region = 'ap-northeast-1';

// shellを介さず引数を渡す。AWS応答全体（環境変数など）は表示しない。
export function run(command, args, { cwd, capture = false } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd, env: { ...process.env, AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off' },
      stdio: ['ignore', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'],
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8').on('data', data => { stdout += data; });
      child.stderr.setEncoding('utf8').on('data', data => { stderr += data; });
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), 10 * 60_000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolveRun(stdout);
      else {
        // AWSの本文や入力値を出さず、エラーコードだけを表示する。
        const awsCode = stderr.match(/An error occurred \(([^)]+)\)/)?.[1];
        reject(new Error(`${command} ${args[0] ?? ''} が失敗しました (${awsCode ?? `exit=${code}`})`));
      }
    });
  });
}

export function validateConfig(config) {
  const code = config.agentRuntimeArtifact?.codeConfiguration;
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,99}-[a-zA-Z0-9]{10}$/.test(config.agentRuntimeId ?? '') ||
      !/^arn:aws:iam::\d{12}:role\/.+/.test(config.roleArn ?? '') ||
      !code?.code?.s3?.bucket || /[<>]/.test(code.code.s3.bucket) ||
      code.runtime !== 'NODE_22' || JSON.stringify(code.entryPoint) !== '["dist/server.js"]') {
    throw new Error('infra/update-runtime.jsonのRuntime ID・roleArn・S3 bucket・NODE_22・entryPointを確認してください。');
  }
  // Runtimeへ渡す秘密情報はSecrets Managerの参照に限定する。
  for (const [key, value] of Object.entries(config.environmentVariables ?? {})) {
    if (typeof value !== 'string' || /-----BEGIN .*PRIVATE KEY-----|\bgh[supor]_/.test(value) ||
        /^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|GITHUB_TOKEN|GH_TOKEN|GITHUB_APP_PRIVATE_KEY)$/.test(key)) {
      throw new Error('Runtime環境変数に認証情報の本文を保存しないでください。');
    }
  }
}

export async function waitForDeployment(readRuntime, readEndpoint, version, {
  pause = sleep, now = Date.now, timeoutMs = 600_000, intervalMs = 5_000,
  log = console.log,
} = {}) {
  const deadline = now() + timeoutMs;
  let previous = '';
  while (now() < deadline) {
    const runtime = await readRuntime();
    const endpoint = await readEndpoint();
    const state = `Runtime=${runtime.status}, DEFAULT=${endpoint.status}, live=${endpoint.liveVersion}, expected=${version}`;
    if (state !== previous) log(state);
    previous = state;
    for (const item of [runtime, endpoint]) {
      if (item.status?.includes('FAILED') || item.status === 'DELETING') {
        throw new Error(`${state}。AWSコンソールのfailureReasonを確認してください。`);
      }
    }
    if (Number(runtime.agentRuntimeVersion) > Number(version)) {
      throw new Error('別のRuntime更新を検出しました。同時デプロイを止めて確認してください。');
    }
    if (runtime.status === 'READY' && String(runtime.agentRuntimeVersion) === String(version) &&
        endpoint.status === 'READY' &&
        String(endpoint.liveVersion) === String(version)) return;
    await pause(intervalMs);
  }
  throw new Error(`デプロイ確認がタイムアウトしました。${previous}。更新はAWS上で継続している可能性があります。`);
}

export async function deploy({ root = projectRoot, execute = run, log = console.log,
  waitOptions = {}, platform = process.platform, arch = process.arch } = {}) {
  // NODE_22 RuntimeはLinux arm64。Macのnode_modulesを誤って梱包しない。
  if (platform !== 'linux' || arch !== 'arm64') {
    throw new Error('Linux arm64のDev Containerでnpm run deployを実行してください。');
  }
  const config = JSON.parse(await readFile(join(root, 'infra/update-runtime.json'), 'utf8'));
  validateConfig(config);
  const deployRoot = join(root, '.deploy');
  await mkdir(deployRoot, { recursive: true });
  const lockPath = join(deployRoot, 'deploy.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('別のdeployが実行中です。異常終了後なら実行中でないことを確認し、.deploy/deploy.lockを削除してください。');
    throw error;
  }
  let work;
  let stage = '事前確認';
  const aws = async (args) => JSON.parse(await execute('aws', [
    ...args, '--region', region, '--output', 'json', '--no-cli-pager',
    '--cli-connect-timeout', '10', '--cli-read-timeout', '60',
  ], { cwd: root, capture: true }));
  try {
    await execute('zip', ['-v'], { cwd: root, capture: true });
    const identity = await aws(['sts', 'get-caller-identity']);
    if (identity.Account !== config.roleArn.split(':')[4]) throw new Error('AWS認証先とRuntime実行ロールのアカウントが一致しません。');
    const current = await aws(['bedrock-agentcore-control', 'get-agent-runtime', '--agent-runtime-id', config.agentRuntimeId]);
    if (current.status !== 'READY') throw new Error(`RuntimeがREADYではありません: ${current.status}`);
    log(`対象: ${config.agentRuntimeId} / ${region} / 現在のバージョン ${current.agentRuntimeVersion}`);

    // JSONに省略された既存設定を引き継ぐ。明示された設定はローカルJSONを優先。
    const payload = {};
    for (const key of ['roleArn', 'networkConfiguration', 'protocolConfiguration', 'lifecycleConfiguration',
      'authorizerConfiguration', 'requestHeaderConfiguration', 'description', 'environmentVariables',
      'metadataConfiguration', 'filesystemConfigurations', 'capacityProviderConfiguration']) {
      if (current[key] !== undefined) payload[key] = current[key];
    }
    Object.assign(payload, config);
    payload.environmentVariables = { ...current.environmentVariables, ...config.environmentVariables };
    validateConfig(payload);
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
    const s3Key = `coding-agent/deploy/${id}/deployment.zip`;
    payload.agentRuntimeArtifact = structuredClone(config.agentRuntimeArtifact);
    payload.agentRuntimeArtifact.codeConfiguration.code.s3 = {
      bucket: config.agentRuntimeArtifact.codeConfiguration.code.s3.bucket, prefix: s3Key,
    };
    payload.clientToken = randomUUID();
    work = await mkdtemp(join(deployRoot, 'run-'));
    const pkg = join(work, 'package');
    await mkdir(pkg);

    stage = '型チェック・ビルド'; log(stage);
    await execute('npm', ['run', 'typecheck'], { cwd: root });
    // 新しい出力先へビルドし、古いdistファイルの混入を防ぐ。
    await execute('npm', ['run', 'build', '--', '--outDir', join(pkg, 'dist')], { cwd: root });
    await cp(join(root, 'package.json'), join(pkg, 'package.json'));
    await cp(join(root, 'package-lock.json'), join(pkg, 'package-lock.json'));
    stage = '本番依存・ZIP作成'; log(stage);
    await execute('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: pkg });
    const archive = join(work, 'deployment.zip');
    await execute('zip', ['-qr', archive, 'dist', 'node_modules', 'package.json'], { cwd: pkg });
    const inputPath = join(work, 'update-runtime.json');
    await writeFile(inputPath, JSON.stringify(payload), { mode: 0o600 });

    // ビルド中に他の更新が入っていないことを確認する。
    const latest = await aws(['bedrock-agentcore-control', 'get-agent-runtime', '--agent-runtime-id', config.agentRuntimeId]);
    if (latest.status !== 'READY' || latest.agentRuntimeVersion !== current.agentRuntimeVersion) {
      throw new Error('準備中にRuntimeの状態が変わりました。再実行前に確認してください。');
    }
    stage = 'S3アップロード'; log(stage);
    await execute('aws', ['s3', 'cp', archive, `s3://${payload.agentRuntimeArtifact.codeConfiguration.code.s3.bucket}/${s3Key}`,
      '--region', region, '--only-show-errors'], { cwd: root, capture: true });
    stage = 'Runtime更新'; log(stage);
    const updated = await aws(['bedrock-agentcore-control', 'update-agent-runtime', '--cli-input-json', `file://${inputPath}`]);
    if (!updated.agentRuntimeVersion) throw new Error('更新結果にバージョンがありません。AWS側の状態を確認してください。');
    const version = String(updated.agentRuntimeVersion);
    await writeFile(join(deployRoot, 'last-deploy.json'), JSON.stringify({
      runtimeId: config.agentRuntimeId, version, region, s3Key, status: 'UPDATING',
    }, null, 2), { mode: 0o600 });
    stage = 'READY・DEFAULTの稼働バージョン確認'; log(stage);
    await waitForDeployment(
      () => aws(['bedrock-agentcore-control', 'get-agent-runtime', '--agent-runtime-id', config.agentRuntimeId]),
      () => aws(['bedrock-agentcore-control', 'get-agent-runtime-endpoint', '--agent-runtime-id', config.agentRuntimeId, '--endpoint-name', 'DEFAULT']),
      version, { ...waitOptions, log },
    );
    await writeFile(join(deployRoot, 'last-deploy.json'), JSON.stringify({
      runtimeId: config.agentRuntimeId, version, region, s3Key, status: 'READY',
    }, null, 2), { mode: 0o600 });
    log(`デプロイ完了: DEFAULTの稼働バージョン ${version}`);
  } catch (error) {
    throw new Error(`${stage}: ${error.message}`);
  } finally {
    try { if (work) await rm(work, { recursive: true, force: true }); }
    finally { await lock.close(); await rm(lockPath, { force: true }); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  deploy().catch(error => { console.error(error.message); process.exitCode = 1; });
}
