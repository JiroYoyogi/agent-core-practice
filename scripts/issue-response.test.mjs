import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

// targetの実際のWorkflow内のコードを取り出す。コピーした判定ロジックはテストしない。
const path = process.env.TARGET_WORKFLOW ?? new URL('../../agent-core-practice-target/.github/workflows/issue-agent.yml', import.meta.url);
const workflow = readFileSync(path, 'utf8');
const section = workflow.split('      - name: Validate response and summarize\n')[1];
assert.ok(section, 'targetの検証ステップがありません');
assert.match(section, /!cancelled\(\).*steps\.invoke\.outcome == 'failure'/);
const script = section.split("          node <<'NODE'\n")[1].split('          NODE')[0].split('\n').map(line => line.slice(10)).join('\n');
const repository = 'JiroYoyogi/agent-core-practice-target';
const base = { repository, baseBranch: 'main', baseCommit: 'a'.repeat(40), workspaceRemoved: true, before: 'old', after: 'new', diff: '+new', changed: true };
const pr = { ...base, status: 'pr_created', branch: 'codex/readme-00000000-0000-4000-8000-000000000001', commit: 'b'.repeat(40), pullRequestNumber: 3, pullRequestUrl: `https://github.com/${repository}/pull/3` };
const unchanged = { ...base, status: 'no_changes', changed: false, after: 'old', diff: '' };
function run(value, outcome = 'success', raw = false) {
  const root = mkdtempSync(join(tmpdir(), 'response-test-'));
  try {
    writeFileSync(join(root, 'response.json'), raw ? value : JSON.stringify(value));
    const summary = join(root, 'summary.md');
    const result = spawnSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8', env: {
      ...process.env, GITHUB_REPOSITORY: repository, GITHUB_STEP_SUMMARY: summary, INVOKE_OUTCOME: outcome,
    } });
    return { code: result.status, summary: readFileSync(summary, 'utf8') };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test('PR作成と変更なしは成功', () => {
  assert.equal(run(pr).code, 0); assert.match(run(pr).summary, /PR #3/);
  assert.equal(run(unchanged).code, 0); assert.match(run(unchanged).summary, /変更なし/);
});
test('公開失敗は段階・ブランチ・push状態を表示して失敗', () => {
  const result = run({ status: 'publish_failed', stage: 'create_pr', branch: pr.branch, commit: pr.commit, pushState: 'confirmed', error: 'DO_NOT_PRINT' });
  assert.equal(result.code, 1); assert.match(result.summary, /create_pr/); assert.match(result.summary, /confirmed/);
  assert.doesNotMatch(result.summary, /DO_NOT_PRINT/);
});
for (const [name, value] of Object.entries({ unknown: {...pr,status:'unknown'}, missing: {...pr,commit:null}, cleanup: {...pr,workspaceRemoved:false}, malicious_url:{...pr,pullRequestUrl:'https://example.com/'}, bad_repo:{...pr,repository:'other/repo'}, contradictory:{...unchanged,changed:true}, bad_failure:{status:'publish_failed',stage:'<script>DO_NOT_PRINT</script>'}, generic:{error:'DO_NOT_PRINT'}, array:[] })) {
  test(`不正応答を失敗にする: ${name}`, () => { const r=run(value); assert.equal(r.code,1); assert.doesNotMatch(r.summary,/DO_NOT_PRINT|example.com/); });
}
test('JSON不正とAWS呼び出し失敗を失敗にする', () => {
  assert.equal(run('{broken', 'success', true).code, 1);
  assert.equal(run(pr, 'failure').code, 1);
});
