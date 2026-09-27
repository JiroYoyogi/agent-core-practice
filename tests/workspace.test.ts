import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, access, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { runCodingAgent } from "../src/coding-agent.js";
import { withWorkspace } from "../src/workspace.js";
import type { ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";

const exec = promisify(execFile);
const initial = "# Target\n\nOriginal README\n";
const absent = async (path: string) => assert.rejects(access(path), { code: "ENOENT" });

test("同一プロセスの2回の編集は独立したcloneを使い、完了後に削除する", async () => {
  const upstream = await mkdtemp(join(tmpdir(), "upstream-test-"));
  const paths: string[] = [];
  try {
    const git = (args: string[]) => exec("git", args, { cwd: upstream });
    await git(["init", "-b", "main"]);
    await writeFile(join(upstream, "README.md"), initial);
    await git(["add", "README.md"]);
    await git(["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "initial"]);
    const clone = async (directory: string) => {
      paths.push(directory);
      await exec("git", ["clone", "--", upstream, directory]);
      const { stdout } = await git(["rev-parse", "HEAD"]);
      return { ok: true, repository: "test/target", branch: "main" as const, commit: stdout.trim(), path: "README.md" as const, bytes: initial.length, origin: upstream, clean: true };
    };
    const run = (marker: string) => {
      let turn = 0;
      return runCodingAgent(marker, { clone, publish: async () => ({ status: "no_changes" as const }), converse: async (command) => {
        if (turn++ === 0) {
          assert.equal(command.input.messages?.length, 1);
          return { $metadata: {}, stopReason: "tool_use", output: { message: { role: "assistant", content: [
            { toolUse: { toolUseId: "read", name: "read_readme", input: {} } },
            { toolUse: { toolUseId: "write", name: "write_readme", input: { content: initial + marker } } },
          ] } } } as ConverseCommandOutput;
        }
        const results = command.input.messages?.at(-1)?.content;
        assert.equal(results?.[0]?.toolResult?.content?.[0]?.text, initial);
        return { $metadata: {}, stopReason: "end_turn", output: { message: { role: "assistant", content: [{ text: "edited" }] } } } as ConverseCommandOutput;
      } });
    };
    const first = await run("First");
    const second = await run("Second");
    assert.notEqual(first.workspace, second.workspace);
    assert.equal(first.before, initial);
    assert.equal(second.before, initial);
    assert.equal(first.after, initial + "First");
    assert.equal(second.after, initial + "Second");
    assert.match(second.diff, /Second/);
    assert.doesNotMatch(second.diff, /First/);
    assert.equal(first.baseCommit, second.baseCommit);
    assert.equal(first.workspaceRemoved, true);
    assert.equal(second.workspaceRemoved, true);
    assert.equal(await readFile(join(upstream, "README.md"), "utf8"), initial);

    await assert.rejects(runCodingAgent("fail", { clone, publish: async () => ({ status: "no_changes" as const }), converse: async () => { throw new Error("model failure"); } }), /model failure/);
    for (const path of paths) await absent(dirname(path));
  } finally { await rm(upstream, { recursive: true, force: true }); }
});

test("clone途中の失敗でも作業領域を削除する", async () => {
  let path = "";
  await assert.rejects(withWorkspace(async () => {}, async directory => {
    path = dirname(directory);
    await mkdir(directory);
    await writeFile(join(directory, "partial"), "partial clone");
    throw new Error("clone failure");
  }), /clone failure/);
  await absent(path);
});

test("シンボリックリンクや上限超過READMEを編集処理に渡さない", async () => {
  for (const kind of ["symlink", "large"]) {
    let root = "";
    await assert.rejects(withWorkspace(async () => { assert.fail("must not edit"); }, async directory => {
      root = dirname(directory);
      await mkdir(directory);
      if (kind === "symlink") await symlink("missing", join(directory, "README.md"));
      else await writeFile(join(directory, "README.md"), "x".repeat(32 * 1024 + 1));
      return { ok: true, repository: "test/target", branch: "main" as const, commit: "test", path: "README.md" as const, bytes: 0, origin: "test", clean: true };
    }), /32 KiB/);
    await absent(root);
  }
});
