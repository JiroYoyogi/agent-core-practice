import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeRepository } from "./git.js";

type Workspace = {
  directory: string;
  readmePath: string;
};

// このNode.jsプロセスが動いている間、初期化結果を保持する
let workspacePromise: Promise<Workspace> | undefined;

async function createWorkspace(): Promise<Workspace> {
  const directory = await mkdtemp(join(tmpdir(), "coding-agent-"));
  const readmePath = join(directory, "README.md");

  const initialReadme =
    "# AgentCore Practice\n\n" +
    "AgentCore上でコーディングエージェントを動かす学習プロジェクトです。\n";

  await writeFile(readmePath, initialReadme, "utf8");
  await initializeRepository(directory);

  console.log("作業リポジトリを初期化しました:", directory);

  return { directory, readmePath };
}

export function getWorkspace(): Promise<Workspace> {
  if (!workspacePromise) {
    workspacePromise = createWorkspace().catch((error) => {
      // 初期化に失敗した場合、次のリクエストで再試行できるようにする
      workspacePromise = undefined;
      throw error;
    });
  }

  return workspacePromise;
}