import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { repositoryConfig } from "./repository-config.js";
import { runAuthenticatedGit } from "./git-auth.js";

const execFileAsync = promisify(execFile);

async function runGit(
  workspace: string,
  args: string[],
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: workspace,
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });

  return stdout;
}

export async function getReadmeDiff(
  workspace: string,
): Promise<string> {
  return runGit(workspace, [
    "diff", "--no-color", "HEAD", "--", "README.md",
  ]);
}

export function assertWorkBranch(branch: string): void {
  if (!/^codex\/readme-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(branch) ||
      branch === repositoryConfig.baseBranch) throw new Error("作業ブランチ名が不正です。");
}

export async function validateReadmeChange(directory: string, baseCommit: string): Promise<boolean> {
  const file = repositoryConfig.allowedFile;
  if ((await runGit(directory, ["rev-parse", "HEAD"])).trim() !== baseCommit) throw new Error("HEADが取得時から変更されています。");
  const info = await lstat(join(directory, file));
  if (!info.isFile() || info.size > 32 * 1024) throw new Error("READMEの形式またはサイズが不正です。");
  if ((await runGit(directory, ["ls-files", "--others", "-z"])) !== "") throw new Error("未追跡ファイルがあります。");
  const mode = (await runGit(directory, ["ls-tree", "HEAD", "--", file])).split(" ")[0];
  if (mode !== "100644" && mode !== "100755") throw new Error("READMEの取得元の形式が不正です。");
  if (Boolean(info.mode & 0o111) !== (mode === "100755")) throw new Error("READMEの実行権限が変更されています。");
  // インデックスと作業ツリーの両方を見る。相殺されたステージ変更も拒否する。
  for (const flags of [[], ["--cached"]]) {
    const raw = await runGit(directory, ["diff", ...flags, "--raw", "--no-abbrev", "--no-renames", "-z", "HEAD", "--"]);
    if (!raw) continue;
    const parts = raw.split("\0");
    const header = parts[0]?.split(" ") ?? [];
    if (parts.length !== 3 || parts[1] !== file || header[0] !== `:${mode}` || header[1] !== mode || header[4] !== "M") {
      throw new Error("READMEの内容以外の変更を検出しました。");
    }
  }
  return (await getReadmeDiff(directory)) !== "";
}

export async function commitReadme(directory: string, baseCommit: string, branch: string): Promise<string> {
  assertWorkBranch(branch);
  if (!await validateReadmeChange(directory, baseCommit)) throw new Error("commitする変更がありません。");
  await runGit(directory, ["switch", "-c", branch]);
  await runGit(directory, ["config", "--local", "user.name", "Practice Agent"]);
  await runGit(directory, ["config", "--local", "user.email", "practice@example.invalid"]);
  await runGit(directory, ["add", "--", repositoryConfig.allowedFile]);
  await validateReadmeChange(directory, baseCommit);
  await runGit(directory, ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-m", "Update README"]);
  if ((await runGit(directory, ["status", "--porcelain"])) !== "") throw new Error("commit後に未反映の変更があります。");
  return (await runGit(directory, ["rev-parse", "HEAD"])).trim();
}

export async function pushReadme(directory: string, branch: string, commit: string, token: string,
  execute = runAuthenticatedGit): Promise<void> {
  assertWorkBranch(branch);
  const url = `https://github.com/${repositoryConfig.owner}/${repositoryConfig.repo}.git`;
  if ((await runGit(directory, ["branch", "--show-current"])).trim() !== branch ||
      (await runGit(directory, ["rev-parse", "HEAD"])).trim() !== commit ||
      (await runGit(directory, ["config", "--get", "remote.origin.url"])).trim() !== url) {
    throw new Error("push前のブランチ・commit・remoteが想定と異なります。");
  }
  await execute(["push", "--", url, `HEAD:refs/heads/${branch}`], token, directory);
}
