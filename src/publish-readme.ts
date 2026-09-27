import { randomUUID } from "node:crypto";
import { validateReadmeChange, commitReadme, pushReadme } from "./git.js";
import { createGitHubWriteToken, createReadmePullRequest } from "./github.js";
import type { Workspace } from "./workspace.js";

export class PublishError extends Error {
  constructor(public readonly stage: string, public readonly branch: string | null,
    public readonly commit: string | null, public readonly pushState: "not_attempted" | "unknown" | "confirmed") {
    super(`README公開処理に失敗しました: ${stage}`);
    this.name = "PublishError";
  }
}

export async function publishReadme(workspace: Workspace, summary: string, {
  writeToken = createGitHubWriteToken, push = pushReadme, createPr = createReadmePullRequest,
} = {}) {
  let stage = "validate";
  let branch: string | null = null;
  let commit: string | null = null;
  let pushState: "not_attempted" | "unknown" | "confirmed" = "not_attempted";
  try {
    if (!await validateReadmeChange(workspace.directory, workspace.source.commit)) {
      return { status: "no_changes" as const };
    }
    branch = `codex/readme-${randomUUID()}`;
    stage = "commit";
    commit = await commitReadme(workspace.directory, workspace.source.commit, branch);
    stage = "write_token";
    const token = await writeToken();
    stage = "push";
    pushState = "unknown";
    await push(workspace.directory, branch, commit, token);
    pushState = "confirmed";
    stage = "create_pr";
    const pr = await createPr(branch, summary, workspace.source.commit, token);
    return { status: "pr_created" as const, branch, commit, ...pr };
  } catch {
    // SDK/Gitの例外やトークンを外へ渡さない。通信失敗時はリモート状態を断定しない。
    throw new PublishError(stage, branch, commit, pushState);
  }
}
