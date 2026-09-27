# ROADMAP.md

## プロジェクトのゴール

Amazon Bedrock AgentCoreを使ったコーディングエージェントのアーキテクチャを、自分で実装しながら理解します。

このプロジェクトはSTEP 3までを対象とし、GitHub Issue → GitHub Actions → AgentCore Runtime → README編集 → Pull Request作成を完成させます。

以下の複数入口・Gatewayなどを含む構成は、新プロジェクトに引き継ぐ長期目標です。

最終的な構成イメージ：

```text
GitHub Issue ─────┐
                  │
Slack ────────────┤
                  │
CLI / API ────────┤
                  ↓
          AgentCore Runtime
                  ↓
            Coding Agent
                  ↓
        AgentCore Gateway
                  ↓
              GitHub
                  ↓
           Pull Request
```

これは最終目標です。

最初からすべてを実装せず、STEPごとに段階的に構築します。

---

# 現在の状態

現在のSTEP：

```text
STEP 3
```

ステータス：

```text
完了（STEP 3までの現プロジェクトを2026-09-27に一区切り）
```

最終更新：2026-09-27。STEP 3まで完了。開発者がPR #4のマージと「変更なし」「PR作成」のActions判定・サマリー表示を実機確認しました。
直近の方針は以下の「プロジェクトの区切りと引き継ぎ」を参照してください。
STEP 3の「開始時の引き継ぎ」は開始時点の記録です。再開時は作業ブランチの実コード・差分と動作確認結果を確認し、実装済みとAWS上で確認済みを区別してください。

## プロジェクトの区切りと引き継ぎ（2026-09-27決定）

| 段階 | 対象 | 完了の目安 |
| --- | --- | --- |
| 現プロジェクト | STEP 3と `npm run deploy` の整備 | IssueからREADME変更のPR作成までを再現でき、既存Runtimeを1コマンドで更新できる |
| 新プロジェクトの最初 | `agentcore deploy` によるGitHub Actions × AgentCoreの再現 | 現プロジェクトと同じPR作成までの動作を確認し、デプロイ方法の違いを説明できる |
| 新プロジェクトの続き | STEP 4以降 | 再現後に各STEPを順番に実施する |

### 完了した作業：デプロイを1コマンドにまとめる

* 既存のZIP方式とRuntimeを維持し、`npm run deploy` で型チェック、ビルド、本番依存のZIP化、S3アップロード、Runtime更新を実行する。
* RuntimeがREADYになり、DEFAULTの稼働バージョンが今回の更新と一致するまで確認する。失敗時は原因を確認できる形で終了する。
* 毎回のS3キー・JSONの手編集や変数の再入力をなくす。秘密鍵・トークンをソース、ZIP、ログへ含めない。
* 自動化の整備後、STEP 3のPR作成までの実装・動作確認を完了した。現プロジェクトへのTerraform・CDK・公式CLI導入は行わない。
* `npm run deploy` のスクリプトを実装済み。AWSを模擬したテストと実AWS上での確認を区別する。npm run deployによる実AWSへのデプロイ成功を開発者が確認済み。

### STEP 3完了時に記録したもの

* 動作するコードと、デプロイ・Issue起動・PR作成を再現する手順。
* Runtime、Actions用ロール、Runtime実行ロール、GitHub App、Secrets Managerの役割と必要な権限。
* 手動構成で理解できたことと、公式CLIが代行する処理を比較するための記録。
* 新プロジェクト向けのSTEP 4以降の計画と、再現確認の条件。

新プロジェクトでは既存のエージェント処理をできるだけ再利用し、まずデプロイ方法の変更に集中します。新プロジェクト名・作成先は未決定です。
現プロジェクトの学習完了だけを理由にAWSリソースを削除しません。新構成の再現後に共有リソースの依存関係を確認し、旧リソースの後片付けを別作業として行います。

---

# STEP 1 — AgentCore上でコーディングエージェントを動かす

## ゴール

Amazon Bedrock AgentCore Runtime上で、Claudeを使ったコーディングエージェントを動かします。

この段階ではGitHub連携は不要です。

まず次の構成を理解します。

```text
開発者
   ↓
AgentCore Runtime
   ↓
Claude
```

## タスク例

Runtime内の `/tmp/coding-agent-XXXXXX/` に作成した練習用Gitリポジトリを変更させます。
このプロジェクト自体のリポジトリとは別物です。GitHubからのcloneはまだ行いません。

例：

```text
README.mdに「プロジェクト概要」セクションを追加する。
```

## 学ぶこと

* AgentCore Runtimeとは何か
* エージェントをどのようにデプロイするのか
* エージェントをどのように呼び出すのか
* どのような実行環境で動くのか
* filesystemやshellをどのように扱うのか
* Runtime上からClaudeをどのように呼び出すのか
* Runtime session終了時に何が起こるのか

## 完了条件

* [x] AgentCore Runtimeの実行環境を作成した
* [x] AgentCore経由でClaudeを呼び出せる
* [x] エージェントがRepositoryのファイルを確認できる
* [x] エージェントが `README.md` を変更できる
* [x] Runtimeのライフサイクルを説明できる
* [x] 同じ実行を再現できる

## まだ実装しないもの

* GitHub Issueからの起動
* GitHub Actions連携
* Pull Requestの自動作成
* Slack
* AgentCore Gateway
* Reviewer Agent
* LangGraph

---

# STEP 2 — GitHub IssueからAgentCoreを呼び出す

完了（2026-09-26）。以下の開始時の引き継ぎはSTEP 1完了時点の記録です。最新の実装・設定は `README.md` と末尾の進捗ログを参照してください。

## 開始時の引き継ぎ

### 進め方

* 最初に `AGENTS.md`、このファイル、`README.md` と現在の実装を読む。
* 実装の主体は開発者。Codexは先生・相談相手として、概念、小さな手順、写経用コードやコピペ用コマンドを提示する。明示的な依頼なしに実装を代行しない。
* STEP 2では既存Runtimeへの入口だけを追加する。編集対象は引き続きRuntime内の練習用READMEとし、GitHubリポジトリのclone・変更のcommit・push・PR作成はSTEP 3で扱う。

### 引き継ぐ実装と設定

| 項目 | 現在の内容 |
| --- | --- |
| 開発環境 | Dev ContainerでNode.js 22とAWS CLIを使用。Mac側はNode.js 24 |
| AWSリージョン | `ap-northeast-1` |
| モデル | Claude Sonnet 4.6。Converse APIのモデルIDは `global.anthropic.claude-sonnet-4-6` |
| HTTPサーバー | `src/server.ts`。Node.js標準HTTP、ポート8080、`GET /ping` と `POST /invocations` |
| エージェント | `src/coding-agent.ts`。Claudeのツール要求に応じてREADMEを読み書きし、結果をモデルへ返す |
| 作業領域・Git | `src/workspace.ts`、`src/git.ts`。一時ディレクトリにGitリポジトリと初期commitを作成 |
| デプロイ | TypeScriptをビルドし、`dist/`・本番依存の `node_modules/`・`package.json` をZIP化してS3へ配置。Runtimeを作成・更新 |
| Runtime設定 | `NODE_22`、エントリーポイント `dist/server.js`。設定例は `infra/*.example.json` |
| 認証 | 呼び出し元のAWS認証とRuntime実行ロールを分離。Runtime実行ロールでBedrockを呼び出す |

Sonnet 5はこのアカウントで呼び出せなかったため、動作確認済みのSonnet 4.6で継続する。

既存のリクエスト形式：

```json
{"prompt":"README.mdに前提条件セクションを追加してください。"}
```

* AWS上ではAgentCore Runtimeの呼び出しAPIを利用する。Actionsからコンテナのポート8080へ直接接続する構成にはしない。
* 成功時は `summary`、`before`、`after`、`changed`、`diff`、`workspace` を返す。
* `before` / `after` / `changed` は今回の依頼に対応する。`diff` は初期commitからの累積差分であり、編集ごとのcommitは行わない。
* `{"action":"check_environment"}` でNode.js・OS・Gitの診断ができる。AWS上でNode.js 22・Linux arm64・Gitの利用を確認済み。
* リクエスト本文は16 KiB、READMEは32 KiBまで。モデル呼び出しは1依頼につき最大8回。同一プロセスで編集中の追加依頼は409を返す。
* Claudeに公開しているツールは `read_readme` / `write_readme` のみ。任意のファイル操作やshell実行は公開していない。

### セッションについて確認済みのこと

* 同じRuntimeセッションの実行環境が存続している間は、READMEの変更と練習用Gitリポジトリを引き継げる。
* 実装はNode.jsプロセス内で作業領域の初期化結果を保持する。ローカルHTTPサーバー自体にセッションID別の作業領域管理はない。
* 会話履歴は依頼ごとに作り直す。引き継ぐのはファイルの状態であり、過去の会話ではない。
* Runtimeセッションを停止し、同じIDで再度呼び出した場合にも、作業領域は新しく作成されREADMEは初期状態に戻ることをAWS上で確認済み。
* セッションIDを控えるだけではファイルは永続化されない。Runtime内の `/tmp` と `.git` を永続ストレージとして扱わない。

### 次のタスクで最初に行うこと

1. GitHub側の対象リポジトリと公開範囲を確認する。引き継ぎ時点ではローカルGit管理済みだが、`git remote -v` に登録はない。
2. 起動条件を決める。まずは専用ラベルの付与を候補とし、誰が起動できるか、再実行時にどのセッションを使うかを整理する。
3. GitHub ActionsからAWSへ認証する方法を設計する。OIDCによる一時認証を第一候補とし、対象リポジトリ等に信頼条件を絞る。Actions用の呼び出しロールと既存Runtime実行ロールを区別する。
4. 既存RuntimeのARN・呼び出すエンドポイント等を確認し、必要最小限の呼び出し権限を決める。実値はローカル設定やAWSから確認し、このドキュメントには転記しない。
5. Issue本文を既存の `prompt` へ変換する最小Workflowを作る。Issue本文をshellコードに直接埋め込まず、JSONとして安全に受け渡す。
6. 練習用READMEへの変更結果と差分をActions側で確認する。認証失敗・Runtime呼び出し失敗・エージェント処理失敗を区別できるようにする。

上記の起動条件・認証・セッション方針はSTEP 2でこれから決める事項であり、未実装。
この段階でGitHubへの書き込み権限やRuntimeへのGitHub認証情報は不要。

### ローカル設定と再開時の注意

* `infra/*.example.json` は共有用テンプレート。実値入りのJSON、`.deploy/`、認証情報はGit管理対象外。
* 別の環境で始める場合は、AWS認証と実値入り設定を別途準備する。既存Runtimeを利用し、不要な再作成はしない。
* 再デプロイ前にはAWS上の現在のRuntime設定・バージョン・S3キーを確認する。テンプレートの `v1` / `v3` を最新の配置先と決めつけない。
* ローカルの確認コマンドは `npm run typecheck`、`npm run build`。STEP 1のCLI呼び出し確認をもって、STEP 5の複数入口の整備まで完了したとは扱わない。

## ゴール

GitHub Issueを最初の外部インターフェースとして利用します。

目標構成：

```text
GitHub Issue
    ↓
GitHub Actions
    ↓
AgentCore Runtime
    ↓
Claude
```

## Issue例

```text
README.mdに「前提条件」セクションを追加してください。

このRepositoryを利用するために必要なツールを説明してください。
```

## 学ぶこと

* GitHub Issueイベント
* GitHub Actionsのtrigger
* Issue情報を別システムへ渡す方法
* GitHub ActionsからAWSへ認証する方法
* GitHub ActionsからAgentCore Runtimeを呼び出す方法
* Issue本文をClaudeへ渡す方法

## 完了条件

* [x] Issue作成またはラベル付与でWorkflowを開始できる
* [x] GitHub ActionsがIssue本文を取得できる
* [x] GitHub ActionsからAgentCoreを呼び出せる
* [x] ClaudeがIssue本文を受け取れる
* [x] ClaudeがIssue本文をタスクとして扱える
* [x] 呼び出し失敗時に原因を確認できる
* [x] 新規Issueコメントの `/agent ` コマンドからも起動できる

## まだ実装しないもの

* Pull Requestの自動作成
* Slack
* AgentCore Gateway
* Multi-Agent Workflow

---

# STEP 3 — コーディングエージェントにPull Requestを作らせる

完了（2026-09-27）。このプロジェクトの最終STEPです。以降の方針は冒頭の「プロジェクトの区切りと引き継ぎ」を参照してください。

## 開始時の引き継ぎ

以下はSTEP 3開始時点の記録です。現在の実装状態を表すものではありません。

* 実装の主体は開発者。Codexはレビュー、概念説明、小さなコード例・コマンドで支援する。
* 最初に `AGENTS.md`、`README.md`、本ファイル、現在の実装を読む。
* STEP 2の入口は実装済み。ラベル起動ではIssue本文、コメント起動では `/agent ` を除いたコメント本文を `prompt` にする。
* 入口の対象は `JiroYoyogi/agent-core-practice-target`。STEP 2の作業ブランチは `codex/step2`。STEP 3を始める前に、現在のデフォルトブランチ、STEP 2の取り込み状況、PRのベースブランチを確認する。
* ローカルGit操作はMac側、編集・ビルド・AWS CLIはDev Container側で行う。STEP 3には専用作業ブランチを用意する。
* OIDC認証と対象Runtimeの呼び出しは動作確認済み。Secrets / Variablesとロールの役割は `README.md` を参照。実値はGitHub・AWSの設定から確認する。
* 現在のエージェントはRuntime内の練習用リポジトリを扱う。GitHub clone・GitHub認証・変更のcommit / push・PR作成は未実装。
* RuntimeのGitは初期commitと差分取得に使用。Actionsは実行ごとに新しいセッションを生成し、過去の編集や会話を引き継がない。

### 最初に整理すること

1. エージェントが変更するリポジトリとPRのベースブランチを確定する。Issueの入口と編集対象が同じかも明示する。
2. GitHubへの認証方法（GitHub Appなど）、Credentialの保管場所・取得方法・有効期間を決める。既存のGitHub→AWS OIDC認証とは別の認証である。
3. GitHub権限は対象リポジトリに絞り、contents / pull requestsの必要な権限を整理する。管理権限や任意のActions変更権限を先に付けない。
4. cloneからREADME編集、差分確認、専用ブランチへのcommit / push、PR作成までを小さく分けて確認する。mainへ直接pushしない。
5. 失敗時の後始末と再実行時のブランチ・PR重複の扱いを決める。

ここに記載した項目はSTEP 3の計画であり、実装済みではない。

## ゴール

基本的なコーディングエージェントの一連のWorkflowを完成させます。

目標構成：

```text
GitHub Issue
    ↓
GitHub Actions
    ↓
AgentCore
    ↓
Repositoryをclone
    ↓
Issueを読む
    ↓
README.mdを変更
    ↓
git diffを確認
    ↓
branch作成
    ↓
commit
    ↓
push
    ↓
Pull Request作成
```

## 学ぶこと

* Repositoryへの認証
* GitHub Appなどを使った認証
* branch作成
* commit / push
* Pull Request作成
* 安全なRepository権限
* エージェントのCredential管理

## 完了条件

* [x] AgentがRepositoryを取得できる
* [x] Agentが専用branchを作成できる
* [x] 依頼されたファイルを変更できる
* [x] `git diff` を確認できる
* [x] commitできる
* [x] branchをpushできる
* [x] Pull Requestを作成できる
* [x] `main` へ直接pushしない
* [x] `npm run deploy` で既存Runtimeの更新と稼働バージョン確認を再現できる
* [x] 現構成の再現手順・認証と権限・学び・新プロジェクトへの引き継ぎを記録した

## 仕上げの確認

* [x] targetのWorkflowへ応答判定と実行サマリーを実装し、ローカルテスト12件を確認
* [x] Workflow変更（target PR #4）をmainへ取り込み、Actions上で応答判定を確認
* [x] 変更なしの実機確認（PR #4反映後に開発者が確認）

自動重複排除・自動復旧は今回の範囲外。状態確認と手動復旧の手順をREADMEに記録。
2026-09-27、開発者の実機確認報告に基づきSTEP 3を完了とする。失敗系はローカルテストで確認し、AWSの権限・設定を故意に壊す実機試験は実施していない。

## 最初の大きなマイルストーン

STEP 3完了時点で：

```text
GitHub Issueを作成
        ↓
AgentCore上のCoding Agentが動く
        ↓
Pull Requestが作成される
```

という一連の処理が完成します。

---

# STEP 4 — エージェントへの指示を整備する

新プロジェクトで実施予定。`agentcore deploy` によるSTEP 3相当の再現が完了してから着手します。現プロジェクトでは実装しません。

## ゴール

コーディングエージェントがRepositoryのルールを理解できるようにします。

基本的には：

```text
AGENTS.md
```

を使用します。

Claude固有の指示が必要になった場合のみ：

```text
CLAUDE.md
```

の導入を検討します。

## 考え方

```text
AGENTS.md
= プロジェクト全体のルール

ROADMAP.md
= 現在地と今後の計画

Issue
= 今回実行するタスク
```

## 学ぶこと

* エージェントへの指示の階層
* Repository固有のコンテキスト
* タスクと行動ルールの分離
* エージェントが不要な作業をしないための制御

## 完了条件

* [ ] Coding Agentが `AGENTS.md` を読む
* [ ] Coding Agentが現在のSTEPを理解する
* [ ] 今回のタスクを別情報として扱える
* [ ] ROADMAP上の関係ない機能を勝手に実装しない
* [ ] CodexとClaudeの両方が同じ指示を理解できる

---

# STEP 5 — GitHub以外の入口を追加する

新プロジェクトで実施予定。`agentcore deploy` によるSTEP 3相当の再現が完了してから着手します。現プロジェクトでは実装しません。

## ゴール

Coding AgentがGitHub Issueに依存していないことを確認します。

まずは簡単な入口を追加します。

候補：

```text
CLI
```

または：

```text
HTTP API
```

目標構成：

```text
GitHub Issue ─┐
              ├──→ AgentCore Coding Agent
CLI / API ────┘
```

## 学ぶこと

* AgentCoreを独立したサービスとして扱う考え方
* triggerとAgent本体の分離
* 1つのAgentを複数クライアントから再利用する方法
* 共通のリクエスト形式

## 完了条件

* [ ] GitHub Issue経由の処理が引き続き動作する
* [ ] CLIまたはAPIから同じAgentを呼び出せる
* [ ] Agent本体のロジックを共通化できている
* [ ] 各入口固有の処理がAgent本体から適切に分離されている

---

# STEP 6 — Slackから呼び出す

新プロジェクトで実施予定。`agentcore deploy` によるSTEP 3相当の再現が完了してから着手します。現プロジェクトでは実装しません。

## ゴール

Slackからコーディング依頼を送信できるようにします。

依頼例：

```text
README.mdにArchitectureセクションを追加して、
現在のシステム構成を説明してください。
```

目標構成：

```text
Slack
  ↓
AgentCore Coding Agent
  ↓
GitHub
  ↓
Pull Request
  ↓
Slackへ結果通知
```

## 学ぶこと

* Slack連携
* WebhookまたはSlack Application Event
* 外部システム間のIdentity
* 実行結果を依頼元へ返す方法
* 複数インターフェースから同じAgentを利用する方法

## 完了条件

* [ ] SlackからCoding Agentを呼び出せる
* [ ] Coding Agentが依頼されたRepository変更を行える
* [ ] Pull Requestが作成される
* [ ] Slackへ結果を返せる
* [ ] GitHub Issue経由の処理も引き続き動作する

---

# STEP 7 — AgentCore GatewayとIdentityを導入する

新プロジェクトで実施予定。`agentcore deploy` によるSTEP 3相当の再現が完了してから着手します。現プロジェクトでは実装しません。

## ゴール

外部ツールへのアクセスを、よりAgentCoreらしい構成へ変更します。

候補となる構成：

```text
Coding Agent
     ↓
AgentCore Gateway
     ↓
GitHub Tool
     ↓
GitHub API
```

必要に応じてAgentCore Identityも利用します。

## 学ぶこと

* AgentCore Gateway
* AgentCore Identity
* MCP
* Toolの抽象化
* Credentialの分離
* Tool権限の集中管理

## 確認したいこと

* GitHub APIを直接呼ぶ場合とGatewayを使う場合の違いは何か
* Coding Agent自身はどのCredentialを持つべきか
* どのCredentialをGateway側へ分離できるか
* GitHub操作をどのようなToolとしてAgentへ公開するか
* 実際に必要な権限は何か

## 完了条件

* [ ] GitHubを直接操作する構成を理解している
* [ ] Gateway経由の構成を理解している
* [ ] 少なくとも1つのGitHub操作をTool経由で実行できる
* [ ] Credentialの所有範囲を説明できる
* [ ] 権限境界をドキュメント化できる

---

# STEP 8 — Reviewer Agentを追加する

新プロジェクトで実施予定。`agentcore deploy` によるSTEP 3相当の再現が完了してから着手します。現プロジェクトでは実装しません。

## ゴール

実装担当とレビュー担当の役割を分離します。

基本構成：

```text
依頼
  ↓
Coding Agent
  ↓
変更
  ↓
Reviewer Agent
  ↓
Pull Request
```

より発展させる場合：

```text
Coding Agent
    ↓
Reviewer Agent
    ↓
フィードバック
    ↓
Coding Agent
    ↓
Reviewer Agent
    ↓
Pull Request
```

## 学ぶこと

* Multi-Agent Workflow
* Agent間の役割分担
* Agent同士の連携
* レビューループ
* Workflow State

この段階で、LangGraphを導入する価値があるか評価します。

実際に解決したいオーケストレーション上の問題が存在する場合のみ導入します。

## 完了条件

* [ ] CodingとReviewの責務が分離されている
* [ ] Reviewerのフィードバックを最終結果へ反映できる
* [ ] Workflow Stateを理解できる
* [ ] なぜオーケストレーションが必要なのか説明できる
* [ ] LangGraphを導入する場合、その必要性を説明できる

---

# 今後の発展候補

以下は最初のロードマップには含めません。

候補：

* 複数Coding Agent
* 自動タスク計画
* Jira連携
* Approval Gate
* CI失敗原因の調査
* テスト自動修正
* 長時間セッション
* Persistent Workspace
* 複数Repository
* Human-in-the-loop
* Agent Observability
* Cost Monitoring
* 本番環境向けSecurity Control

コアとなるROADMAPが完了するか、明確に必要になった場合のみ実装を検討します。

---

# 進捗ログ

各STEPの主要な進捗をここに記録します。

## STEP 1

ステータス：

```text
完了（2026-09-26）
```

メモ：

```text
- Runtimeへのデプロイ・再デプロイ、CLI経由のClaude呼び出しを確認。
- 練習用READMEの読み書きとGit差分の返却を確認。
- 同一セッションでの編集引き継ぎと、停止後の初期化をAWS上で確認。
- README.mdに現在の構成・デプロイ方法・認証・確認結果を記録。
- プロジェクト自体をGit管理し、環境固有設定をexampleファイルと分離。
```

## STEP 2

ステータス：

```text
完了（2026-09-26）
```

メモ：

```text
- プライベートのagent-core-practice-targetを入口として、issue-agent.ymlを実装。
- run-agentラベルによるIssue本文の処理と、/agent コメントによる処理の成功を開発者が確認。
- JiroYoyogiの操作に限定し、PRコメントを除外する条件を実装。
- GitHub OIDCによるActions専用ロールの利用と、STSによるIdentity確認に成功。
- 信頼ポリシーのsubを実際の値に合わせて認証エラーを解決。
- Runtime本体・エンドポイントを対象にInvokeAgentRuntime権限を設定。
- Repository secretsとvariablesの参照先、およびエンドポイントARNと名前の違いを確認。
- 環境診断の呼び出し後、Issue由来のpromptで練習用READMEを編集し、結果・差分を確認。
- 本文をイベントJSONから読み取り、16 KiB以内のrequest.jsonとして送信。
- 実行ごとに新しいUUIDセッションを使用。前回の編集結果・会話は引き継がない。
- README.mdに構成・設定・再現手順・エラー確認方法を記録。
- 通常コメント・PRコメント・他ユーザーの除外条件は実装済み。実機テスト結果は未記録。
- GitHubリポジトリの変更、commit / push、PR作成はSTEP 3で扱う。
```

## STEP 3

ステータス：

```text
完了（2026-09-27）
```

メモ：

```text
- 2026-09-27：既存ZIP方式のデプロイをnpm run deployへまとめる方針を決定。自動化を実装し、模擬AWSによるテストを追加。npm run deployによる実AWSへのデプロイ成功を開発者が確認済み。
- 2026-09-27：依頼ごとのclone → ClaudeによるREADME編集 → 差分取得 → 作業領域削除を実装。同一プロセスでの2回実行と成功・失敗時の削除をローカルGit＋モデル模擬で確認。AWS上での編集・同一セッションの独立性も開発者が確認済み。
- 変更検証・専用ブランチのcommit/push・PR作成を実装。ローカルGitと模擬APIによる成功・変更なし・拒否・途中失敗を検証。実GitHubでPR #3の作成を開発者が確認。READMEのみの差分・mainと取得元コミットの一致を読み取り確認済み。
- 2026-09-27：target PR #4をmainへマージ。「変更なし」と「PR作成」のジョブ判定・サマリー表示を開発者が実機確認し、STEP 3を完了。
- 再現手順・認証と権限・制約・手動復旧手順をREADMEに記録。自動重複排除・自動復旧は未実装として引き継ぐ。
- STEP 3完了で現プロジェクトを一区切りとした。AWSリソースの削除は別作業。
- 新プロジェクトでagentcore deployによるGitHub Actions × AgentCoreとPR作成を再現し、その後STEP 4以降へ進む。
```

## STEP 4

ステータス：

```text
新プロジェクトへ引き継ぎ（未着手）
```

メモ：

```text
-
```

## STEP 5

ステータス：

```text
新プロジェクトへ引き継ぎ（未着手）
```

メモ：

```text
-
```

## STEP 6

ステータス：

```text
新プロジェクトへ引き継ぎ（未着手）
```

メモ：

```text
-
```

## STEP 7

ステータス：

```text
新プロジェクトへ引き継ぎ（未着手）
```

メモ：

```text
-
```

## STEP 8

ステータス：

```text
新プロジェクトへ引き継ぎ（未着手）
```

メモ：

```text
-
```
