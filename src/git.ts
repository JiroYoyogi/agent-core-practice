import { execFile } from "node:child_process";
import { promisify } from "node:util";

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

export async function initializeRepository(
  workspace: string,
): Promise<void> {
  await runGit(workspace, ["init", "-b", "agent-task"]);

  // この練習用リポジトリだけに適用する設定
  await runGit(workspace, [
    "config", "--local", "user.name", "Practice Agent",
  ]);
  await runGit(workspace, [
    "config", "--local", "user.email", "practice@example.invalid",
  ]);
  await runGit(workspace, [
    "config", "--local", "commit.gpgsign", "false",
  ]);

  await runGit(workspace, ["add", "--", "README.md"]);

  const initialDiff = await runGit(workspace, [
    "diff", "--cached", "--no-color", "--", "README.md",
  ]);
  console.log("初期コミットの内容:\n", initialDiff);

  await runGit(workspace, [
    "commit", "-m", "Initialize practice README",
  ]);
}

export async function getReadmeDiff(
  workspace: string,
): Promise<string> {
  return runGit(workspace, [
    "diff", "--no-color", "HEAD", "--", "README.md",
  ]);
}