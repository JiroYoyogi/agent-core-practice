# AgentCore × Claude × GitHub

Amazon Bedrock AgentCoreとコーディングエージェントの連携を学ぶハンズオンです。
STEP 2まで動作確認済みです。今後の計画と引き継ぎは [ROADMAP.md](ROADMAP.md) を参照してください。

## 現在の構成

```text
GitHub Issue（ラベル付与 / 新規コメント）
    ↓
GitHub Actions（OIDCでAWS認証）
    ↓ InvokeAgentRuntime
AgentCore Runtime（Node.js 22 / HTTPサーバー）
    ↓
Amazon Bedrock（Claude Sonnet 4.6）
    ↓ read_readme / write_readme
Runtime内の練習用READMEを編集
    ↓
結果とGit差分をActionsログに表示
```

STEP 1のCLIからのRuntime呼び出しも利用できます。編集対象はRuntime内の
`/tmp/coding-agent-XXXXXX/README.md` です。GitHubリポジトリのclone・変更のpush・PR作成は未実装です。

## 実装の対応

| ファイル | 役割 |
| --- | --- |
| `.github/workflows/issue-agent.yml` | Issueイベントから依頼文を作り、AWS認証してRuntimeを呼び出す |
| `src/server.ts` | `GET /ping`、`POST /invocations`、入力検証 |
| `src/coding-agent.ts` | Claudeのツール要求に応じてREADMEを読み書きする |
| `src/workspace.ts` / `src/git.ts` | 一時Gitリポジトリ・初期commitの作成と差分取得 |
| `src/environment.ts` | Node.js・OS・Gitの環境確認 |

## GitHubとAWSの設定

対象はプライベートリポジトリ `JiroYoyogi/agent-core-practice-target` です。
STEP 2では `codex/step2` で動作確認しました。IssueイベントのWorkflowはデフォルトブランチに配置します。

| 登録場所 | 名前 | 値 |
| --- | --- | --- |
| Repository secrets | `AWS_ROLE_ARN` | Actions専用IAMロールのARN |
| Repository variables | `AGENT_RUNTIME_ARN` | Runtime本体のARN |
| Repository variables | `AGENT_RUNTIME_ENDPOINT` | エンドポイント名（例：`DEFAULT`）。ARNではない |

AWSリージョンは `ap-northeast-1` です。実際のARNや認証情報はこのドキュメントに記載しません。

* Actions用ロール：GitHub OIDCで一時認証情報を取得し、対象Runtimeを呼び出す。
* Runtime実行ロール：Runtime内からBedrockを呼び出す。Actions用ロールとは別。
* OIDC信頼条件：`aud` は `sts.amazonaws.com`、`sub` は確認した実値に合わせる。リポジトリ・ブランチ変更時は信頼条件も確認する。
* Actions用の許可：`bedrock-agentcore:InvokeAgentRuntime` を対象Runtime本体と対象エンドポイントのARNに限定する。
* Workflowのトークン権限は `id-token: write`。GitHubのコード変更・コメント投稿権限は使用していない。

## 実行手順

### Issue本文を依頼にする

1. Issue本文に、例えば「README.mdに『前提条件』セクションを追加してください。」と記載する。
2. `JiroYoyogi` が `run-agent` ラベルを付ける。
3. Actionsタブの `Issue Agent` で実行ログを確認する。

再実行はラベルを外して付け直します。本文の編集だけでは起動しません。

### コメントを依頼にする

`JiroYoyogi` がIssueに次のコメントを新規投稿します。

```text
/agent README.mdに「使い方」セクションを追加してください。
```

`/agent` の後ろは半角スペースです。ラベル操作は不要です。
コメントから先頭のコマンドを除いた文章だけを依頼にします。Issue本文や過去のコメントは追加しません。
通常コメント・PRへのコメントはジョブ条件で除外し、コメントの編集は起動イベントの対象外です。

### 結果を確認する

レスポンスの `summary`、`before`、`after`、`changed`、`diff`、`workspace` を確認します。
追加依頼では `changed: true` と、`after`・`diff` に依頼した内容があることを確認します。
本文や結果はActionsログに表示されるため、依頼には認証情報を含めないでください。

## セッションと制限

* Actionsは毎回UUIDを生成するため、再実行やコメント起動でも新しいRuntimeセッションになる。
* 前回の編集結果・会話履歴は引き継がない。会話履歴は依頼ごとに作り直す。
* STEP 1では、同じセッションの実行環境が存続する間のファイル引き継ぎと、停止後の初期化を確認済み。
* 入力JSONは16 KiB、READMEは32 KiBまで。モデル呼び出しは1依頼につき最大8回。
* Claudeに公開するツールはREADMEの読み書きだけ。同一プロセスで編集中の追加依頼は409を返す。
* Workflowのタイムアウトは5分、AWS CLIの読み取りタイムアウトは180秒。

## エラーの確認

| 症状 | 確認する内容 |
| --- | --- |
| `AssumeRoleWithWebIdentity` が拒否される | ロールARN、OIDCプロバイダー、信頼条件の `aud` / `sub` |
| Repository variableが未設定 | Repository variablesの名前と `vars` 参照。Secretsとは別 |
| `InvokeAgentRuntime` が拒否される | Actions用ロールの許可と、Runtime・エンドポイント指定 |
| リソースARNに `runtime-endpoint/arn:aws:...` が含まれる | エンドポイント変数にARNを入れていないか。指定値は名前のみ |
| Runtime処理が失敗する | ActionsのCLIエラー・応答本文と、Runtime側のログ |

`{"action":"check_environment"}` の呼び出しではClaudeを使わず、Node.js・OS・Gitを確認できます。
Workflowの成功表示だけでなく応答本文も確認します。現在は `changed` などの応答内容を自動判定する処理はありません。

## 開発とデプロイ

Dev ContainerでNode.js 22とAWS CLIを使います。ホスト側のworktreeをマウントし、
このプロジェクトのGit操作（diff・commit・push）はMac側で行います。

```bash
npm ci
npm run typecheck
npm run build
```

Runtimeへのデプロイは、ビルドした `dist/`・本番依存の `node_modules/`・`package.json` をZIP化してS3へ配置し、Runtimeを作成・更新する方式です。
設定例は `infra/*.example.json` を参照します。AWS認証と実値入り設定は別途準備し、既存Runtimeを再利用します。
再デプロイ前には現在のRuntime設定・バージョン・S3キーを確認してください。

## 動作確認済みの範囲

開発者がAWS上で以下の成功を確認しました（2026-09-26）。

* STEP 1：デプロイ、Claudeによる編集、Git差分、セッション存続時の引き継ぎと停止後の初期化。
* STEP 2：ラベル起動、OIDC認証、Runtime環境情報の取得、Issue本文による編集、コメントによる編集。
* 認証拒否、変数の参照先間違い、エンドポイント指定間違いをログから切り分け、修正後の成功を確認。

除外条件はWorkflowに実装済みですが、通常コメント・PRコメント・他ユーザーでの実機テスト結果は未記録です。
