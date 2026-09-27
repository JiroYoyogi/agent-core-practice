import { sign } from "node:crypto";
import { getGitHubPrivateKey } from "./github-secret.js";
import { repositoryConfig } from "./repository-config.js";

async function createGitHubJwt(): Promise<string> {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;

  if (!clientId) {
    throw new Error("GITHUB_APP_CLIENT_IDが未設定です。");
  }

  const privateKey = await getGitHubPrivateKey();
  const now = Math.floor(Date.now() / 1000);

  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  const unsigned = [
    encode({ alg: "RS256", typ: "JWT" }),
    encode({
      iat: now - 60,
      exp: now + 540,
      iss: clientId,
    }),
  ].join(".");

  const signature = sign(
    "RSA-SHA256",
    Buffer.from(unsigned),
    privateKey,
  ).toString("base64url");

  return `${unsigned}.${signature}`;
}

async function githubJson(
  path: string,
  credential: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const method = body === undefined ? "GET" : "POST";

  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${credential}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "agent-core-practice",
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    // 認証情報やレスポンス本文はログに出さない
    console.error("GitHub API失敗:", method, path, response.status);
    throw new Error("GitHub APIの呼び出しに失敗しました。");
  }

  const value: unknown = await response.json();

  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("GitHub APIの応答形式が想定と異なります。");
  }

  return value as Record<string, unknown>;
}

async function createGitHubToken(permissions: Record<string, string>): Promise<string> {
  const { owner, repo } = repositoryConfig;
  const repository = `${owner}/${repo}`;
  const jwt = await createGitHubJwt();

  // 1. このAppの、targetに対するインストール情報を取得
  const installation = await githubJson(
    `/repos/${repository}/installation`,
    jwt,
  );

  if (
    typeof installation.id !== "number" ||
    !Number.isSafeInteger(installation.id) ||
    installation.id <= 0
  ) {
    throw new Error("Installation IDを取得できませんでした。");
  }

  // targetだけを対象に、用途に必要な権限で発行
  const access = await githubJson(
    `/app/installations/${installation.id}/access_tokens`,
    jwt,
    {
      repositories: [repo],
      permissions,
    },
  );

  if (typeof access.token !== "string" || !access.token) {
    throw new Error("GitHubトークンを取得できませんでした。");
  }

  return access.token;
}

export async function checkGitHubAccess() {
  const { owner, repo, baseBranch, allowedFile } = repositoryConfig;
  const repository = `${owner}/${repo}`;
  const token = await createGitHubReadToken();

  // 設定したベースブランチのREADMEを取得
  const readme = await githubJson(
    `/repos/${repository}/readme?ref=${encodeURIComponent(baseBranch)}`,
    token,
  );

  if (
    readme.path !== allowedFile ||
    readme.encoding !== "base64" ||
    typeof readme.content !== "string" ||
    typeof readme.sha !== "string"
  ) {
    throw new Error("READMEの応答形式が想定と異なります。");
  }

  const content = Buffer.from(readme.content, "base64");

  // トークン・秘密鍵・README本文は返さない
  return {
    ok: true,
    repository,
    branch: baseBranch,
    path: readme.path,
    bytes: content.length,
    sha: readme.sha,
  };
}


export function createGitHubReadToken(): Promise<string> {
  return createGitHubToken({ contents: "read" });
}

export function createGitHubWriteToken(): Promise<string> {
  return createGitHubToken({ contents: "write", pull_requests: "write" });
}

export async function createReadmePullRequest(branch: string, summary: string, baseCommit: string, token: string) {
  const { owner, repo, baseBranch } = repositoryConfig;
  const result = await githubJson(`/repos/${owner}/${repo}/pulls`, token, {
    title: "READMEの更新",
    head: branch,
    base: baseBranch,
    body: `READMEの変更概要\n\n${summary.slice(0, 8000)}\n\n取得元コミット: ${baseCommit}`,
  });
  if (typeof result.number !== "number" || !Number.isSafeInteger(result.number) || result.number <= 0 ||
      result.html_url !== `https://github.com/${owner}/${repo}/pull/${result.number}`) {
    throw new Error("PR作成結果が想定と異なります。GitHub側を確認してください。");
  }
  return { pullRequestNumber: result.number, pullRequestUrl: result.html_url as string };
}
