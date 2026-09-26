# ROADMAP.md

## プロジェクトのゴール

Amazon Bedrock AgentCoreを使ったコーディングエージェントのアーキテクチャを、自分で実装しながら理解します。

最終的には、複数の入口から開発依頼を受け取り、GitHubリポジトリを変更できるコーディングエージェントを作ります。

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
STEP 1
```

ステータス：

```text
未着手
```

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

エージェントにローカルまたはcloneされたリポジトリを変更させます。

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

* [ ] AgentCore Runtimeの実行環境を作成した
* [ ] AgentCore経由でClaudeを呼び出せる
* [ ] エージェントがRepositoryのファイルを確認できる
* [ ] エージェントが `README.md` を変更できる
* [ ] Runtimeのライフサイクルを説明できる
* [ ] 同じ実行を再現できる

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

* [ ] Issue作成またはラベル付与でWorkflowを開始できる
* [ ] GitHub ActionsがIssue本文を取得できる
* [ ] GitHub ActionsからAgentCoreを呼び出せる
* [ ] ClaudeがIssue本文を受け取れる
* [ ] ClaudeがIssue本文をタスクとして扱える
* [ ] 呼び出し失敗時に原因を確認できる

## まだ実装しないもの

* Pull Requestの自動作成
* Slack
* AgentCore Gateway
* Multi-Agent Workflow

---

# STEP 3 — コーディングエージェントにPull Requestを作らせる

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

* [ ] AgentがRepositoryを取得できる
* [ ] Agentが専用branchを作成できる
* [ ] 依頼されたファイルを変更できる
* [ ] `git diff` を確認できる
* [ ] commitできる
* [ ] branchをpushできる
* [ ] Pull Requestを作成できる
* [ ] `main` へ直接pushしない

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
未着手
```

メモ：

```text
-
```

## STEP 2

ステータス：

```text
未着手
```

メモ：

```text
-
```

## STEP 3

ステータス：

```text
未着手
```

メモ：

```text
-
```

## STEP 4

ステータス：

```text
未着手
```

メモ：

```text
-
```

## STEP 5

ステータス：

```text
未着手
```

メモ：

```text
-
```

## STEP 6

ステータス：

```text
未着手
```

メモ：

```text
-
```

## STEP 7

ステータス：

```text
未着手
```

メモ：

```text
-
```

## STEP 8

ステータス：

```text
未着手
```

メモ：

```text
-
```
