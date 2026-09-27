import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { createGitHubReadToken } from "./github.js";
import { repositoryConfig } from "./repository-config.js";

import { runAuthenticatedGit } from "./git-auth.js";

const execFileAsync = promisify(execFile);

export async function cloneGitHubRepository(directory: string) {
  const { owner, repo, baseBranch, allowedFile } = repositoryConfig;
  const repository = `${owner}/${repo}`;
  const remoteUrl = `https://github.com/${repository}.git`;
  const token = await createGitHubReadToken();
  let stage = "clone";
  try {
    await runAuthenticatedGit([
      "clone", "--depth", "1", "--single-branch",
      "--branch", baseBranch, "--", remoteUrl, directory,
    ], token);

    stage = "verify";
    // ローカル確認にはトークンを渡さない。
    async function inspectGit(args: string[]): Promise<string> {
      const { stdout } = await execFileAsync("git", args, {
        cwd: directory,
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      });
      return stdout.trim();
    }

    const origin = await inspectGit(["config", "--get", "remote.origin.url"]);
    const branch = await inspectGit(["branch", "--show-current"]);
    const commit = await inspectGit(["rev-parse", "HEAD"]);
    const status = await inspectGit(["status", "--porcelain"]);

    if (origin !== remoteUrl) {
      throw new Error("remote URLが想定と異なります。");
    }
    if (branch !== baseBranch || status !== "") {
      throw new Error("clone後のGit状態が想定と異なります。");
    }

    const readme = await lstat(join(directory, allowedFile));
    if (!readme.isFile()) {
      throw new Error("READMEが通常ファイルではありません。");
    }

    return {
      ok: true, repository, branch, commit,
      path: allowedFile, bytes: readme.size, origin, clean: true,
    };
  } catch {
    // execFileの例外全体やstderrは出力しない。
    console.error("GitHub clone確認に失敗した段階:", stage);
    throw new Error(`GitHub clone確認に失敗しました: ${stage}`);
  }
}
