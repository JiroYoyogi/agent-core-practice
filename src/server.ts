import { PublishError } from "./publish-readme.js";
import { createServer, type ServerResponse } from "node:http";
import { runCodingAgent } from "./coding-agent.js";
import { checkEnvironment } from "./environment.js";
import { createPrivateKey } from "node:crypto";
import { getGitHubPrivateKey } from "./github-secret.js";
import { checkGitHubAccess } from "./github.js";
import { checkGitHubClone } from "./workspace.js";

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

let editing = false;

const server = createServer(async (req, res) => {
  try {
    // 稼働確認
    if (req.method === "GET" && req.url === "/ping") {
      sendJson(res, 200, { status: "Healthy" });
      return;
    }

    // 今回受け付ける依頼の入口
    if (req.method !== "POST" || req.url !== "/invocations") {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const contentType = req.headers["content-type"]
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();

    if (contentType !== "application/json") {
      sendJson(res, 415, {
        error: "Content-Typeにはapplication/jsonを指定してください。",
      });
      return;
    }

    // リクエスト本文は分割されて届くので、まとめて読み取る
    req.setEncoding("utf8");

    let rawBody = "";
    let bodyBytes = 0;

    for await (const chunk of req) {
      const text = String(chunk);
      bodyBytes += Buffer.byteLength(text, "utf8");

      // この練習用サーバーでは本文を16 KiBまでに制限する
      if (bodyBytes > 16 * 1024) {
        sendJson(res, 413, { error: "入力が大きすぎます。" });
        return;
      }

      rawBody += text;
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      sendJson(res, 400, { error: "JSONの形式が正しくありません。" });
      return;
    }

    if (
      typeof body === "object" &&
      body !== null &&
      "action" in body &&
      body.action === "check_environment"
    ) {
      const result = await checkEnvironment();
      sendJson(res, 200, result);
      return;
    }

    if (
      typeof body === "object" &&
      body !== null &&
      "action" in body &&
      body.action === "check_github_secret"
    ) {
      try {
        const pem = await getGitHubPrivateKey();
        const key = createPrivateKey(pem);

        if (key.asymmetricKeyType !== "rsa") {
          throw new Error("RSA秘密鍵ではありません。");
        }

        console.log("GitHub App秘密鍵の取得・形式確認に成功しました。");
        sendJson(res, 200, { ok: true });
      } catch (error) {
        // 秘密鍵やSDKのレスポンス全体は出力しない
        const errorType =
          error instanceof Error ? error.name : "UnknownError";

        console.error("GitHub App秘密鍵の確認に失敗:", errorType);

        sendJson(res, 500, {
          ok: false,
          error: "GitHub App秘密鍵の取得または形式確認に失敗しました。",
          errorType,
        });
      }

      return;
    }

    if (
      typeof body === "object" &&
      body !== null &&
      "action" in body &&
      body.action === "check_github_access"
    ) {
      try {
        const result = await checkGitHubAccess();
        sendJson(res, 200, result);
      } catch (error) {
        const errorType =
          error instanceof Error ? error.name : "UnknownError";

        console.error("GitHubアクセス確認に失敗:", errorType);

        sendJson(res, 500, {
          ok: false,
          error: "GitHubアクセスの確認に失敗しました。",
          errorType,
        });
      }

      return;
    }

    if (
      typeof body === "object" &&
      body !== null &&
      "action" in body &&
      body.action === "check_github_clone"
    ) {
      try {
        const result = await checkGitHubClone();
        sendJson(res, 200, result);
      } catch {
        sendJson(res, 500, {
          ok: false,
          error: "GitHub cloneの確認に失敗しました。",
        });
      }
      return;
    }

    // 外部から届くデータは実行時にも検証する
    if (
      typeof body !== "object" ||
      body === null ||
      !("prompt" in body) ||
      typeof body.prompt !== "string" ||
      !body.prompt.trim()
    ) {
      sendJson(res, 400, {
        error: "promptに空でない文字列を指定してください。",
      });
      return;
    }

    if (editing) {
      sendJson(res, 409, {
        error: "別の編集を実行中です。完了後に再試行してください。",
      });
      return;
    }

    editing = true;

    try {
      const result = await runCodingAgent(body.prompt);
      sendJson(res, 200, result);
    } finally {
      // 成功・失敗のどちらでも解除する
      editing = false;
    }

  } catch (error) {
    if (error instanceof PublishError) {
      const result = {
        status: "publish_failed", stage: error.stage, branch: error.branch,
        commit: error.commit, pushState: error.pushState,
        error: "公開に失敗しました。リモートブランチとPRの状態を確認してください。",
      };
      console.error("公開失敗:", result);
      if (!res.headersSent && !res.destroyed) sendJson(res, 500, result);
      return;
    }
    // 詳細はサーバーのログに残す
    console.error("リクエストの処理に失敗しました:", error);

    if (!res.headersSent && !res.destroyed) {
      sendJson(res, 500, { error: "回答の生成に失敗しました。" });
    }
  }
});

server.listen(8080, "0.0.0.0", () => {
  console.log("HTTPサーバーをポート8080で起動しました。");
});