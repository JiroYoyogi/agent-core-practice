import { mkdtemp, rm, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cloneGitHubRepository } from "./github-clone.js";
import { repositoryConfig } from "./repository-config.js";

export type Workspace = {
  directory: string;
  readmePath: string;
  source: Awaited<ReturnType<typeof cloneGitHubRepository>>;
};

// 同じプロセス・セッションでも、依頼ごとに新しいcloneを作る。
export async function withWorkspace<T>(
  task: (workspace: Workspace) => Promise<T>,
  clone: typeof cloneGitHubRepository = cloneGitHubRepository,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "coding-agent-"));
  const directory = join(root, "repository");
  try {
    const source = await clone(directory);
    const readmePath = join(directory, repositoryConfig.allowedFile);
    const info = await lstat(readmePath);
    if (!info.isFile() || info.size > 32 * 1024) {
      throw new Error("READMEは32 KiB以内の通常ファイルである必要があります。");
    }
    return await task({ directory, readmePath, source });
  } finally {
    // clone途中やモデル呼び出しの失敗時も、この依頼の領域だけを削除する。
    await rm(root, { recursive: true, force: true });
    console.log("作業領域を削除しました:", root);
  }
}

export async function checkGitHubClone() {
  return withWorkspace(async ({ source }) => source);
}
