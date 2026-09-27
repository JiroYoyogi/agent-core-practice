# AgentCore × Claude × GitHub

Amazon Bedrock AgentCoreとコーディングエージェントの連携を学ぶハンズオンです。
STEP 3は完了しました（2026-09-27）。IssueコメントからPR作成、変更なしの判定、Actionsサマリー表示まで開発者が実機確認済みです。今後の計画と引き継ぎは [ROADMAP.md](ROADMAP.md) を参照してください。

## 現在の構成

```text
GitHub Issue（ラベル付与 / 新規コメント）
    ↓
GitHub Actions（OIDCでAWS認証）
    ↓ InvokeAgentRuntime
AgentCore Runtime（Node.js 22 / HTTPサーバー）
    ↓ GitHub App認証でtargetのmainを依頼ごとにclone
Amazon Bedrock（Claude Sonnet 4.6）
    ↓ read_readme / write_readme
cloneしたREADMEを編集
    ↓
変更検証 → 専用ブランチでcommit・push → PR作成
    ↓
一時作業領域を削除 → PRのURLと編集結果をActionsログに表示
```

STEP 1のCLIからのRuntime呼び出しも利用できます。現在の編集対象は、依頼ごとにcloneした
`/tmp/coding-agent-XXXXXX/repository/README.md` です。編集結果を返す前に作業領域を削除します。
cloneしたREADMEの編集と同一セッションでの独立性は、開発者がAWS上で確認済みです。
IssueコメントからのPR作成はAWS上で確認済みです。target PR #4のmain反映後、「変更なし」「PR作成」のジョブ判定とサマリー表示も開発者が実機確認しました。

## 実装の対応

| ファイル | 役割 |
| --- | --- |
| target側の `.github/workflows/issue-agent.yml` | Issueイベントから依頼文を作り、AWS認証してRuntimeを呼び出す |
| `src/server.ts` | `GET /ping`、`POST /invocations`、入力検証 |
| `src/coding-agent.ts` | Claudeのツール要求に応じてREADMEを読み書きする |
| `src/workspace.ts` / `src/github-clone.ts` | 依頼ごとのclone・README検証・作業領域の削除 |
| `src/git.ts` | clone時のHEADからREADMEの差分を取得 |
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
* Runtime実行ロール：Bedrock呼び出しと、対象SecretのGetSecretValue。Actions用ロールとは別。
* GitHub App：target限定のinstallation tokenを発行。cloneはContents read、公開はContents writeとPull requests write。
* Secrets Manager：Appの秘密鍵を保管。Runtime環境変数にはSecret ARNとClient IDだけを設定。
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
`workspace` は削除済みの作業パスです。`workspaceRemoved: true` は削除処理の成功後に返します。
`repository`・`baseBranch`・`baseCommit` は今回の取得元です。`diff` はそのcloneのHEADからの差分です。
追加依頼では `changed: true` と、`after`・`diff` に依頼した内容があることを確認します。
本文や結果はActionsログに表示されるため、依頼には認証情報を含めないでください。

## セッションと制限

* Actionsは毎回UUIDを生成するため、再実行やコメント起動でも新しいRuntimeセッションになる。
* 同じRuntimeセッションで連続実行しても、毎回targetのmainを新しくcloneする。前回の未反映の編集は引き継がない。
* 成功・例外時ともに作業領域を削除する（プロセスの強制停止時にはfinallyの実行は保証されない）。
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
Workflowの成功表示だけでなく応答本文も確認します。応答判定はtargetのmainに反映済みで、「変更なし」「PR作成」のジョブ成功とサマリー表示を実機確認済みです。

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

### 反復デプロイを1コマンドで行う

Linux arm64のDev Container（Node.js 22、AWS CLI、zip）で実行します。
初回は `npm ci` とAWS認証を済ませ、Git管理対象外の `infra/update-runtime.json` に
既存RuntimeのID・実行ロール・デプロイ用S3バケットと必要な環境変数を設定してください。
現在このworktreeにある実値入り設定を再利用できます。

```bash
npm run deploy
```

`scripts/deploy.mjs` は次の順に処理します。

1. 設定・AWSアカウント・現在のRuntimeのREADY状態を確認。
2. 型チェックし、空の作業ディレクトリへビルド。
3. 本番依存を `npm ci --omit=dev --ignore-scripts` で導入し、`dist/`・`node_modules/`・`package.json` だけをZIP化。
4. 日時とUUIDから一意なS3キーを生成し、既存バケットへ配置。
5. 既存Runtimeを更新し、最大10分間、READYとDEFAULTの `liveVersion` が今回のバージョンに一致するまで確認。

ローカル設定ファイルは書き換えません。古いS3キー・versionIdは自動生成値に置き換えるため、毎回の編集は不要です。
AWSリージョンは `ap-northeast-1`、確認対象エンドポイントは `DEFAULT` です。
ロール・ネットワーク等はローカルJSONの指定を優先し、省略項目は取得した現在のRuntime設定から引き継ぎます。
環境変数は現在値にローカル指定を上書きして結合します（削除したい場合は別途明示的に変更してください）。
秘密鍵は引き続きSecrets Managerに置きます。設定JSON・`.env`・秘密鍵ファイルはZIPに含めず、AWS応答全体もログへ表示しません。
依存ライブラリのinstall scriptは無効です。今後ネイティブ依存等を追加した場合は、この梱包方法の見直しが必要です。

実行者には既存のS3アップロード・Runtime更新権限に加え、`GetAgentRuntime` と `GetAgentRuntimeEndpoint` の参照権限が必要です。
Runtimeの実行ロールやGitHub Actions用ロールの権限を自動で変更する処理はありません。

各段階をログ表示し、失敗・タイムアウトは非ゼロで終了します。
`.deploy/last-deploy.json` に更新先バージョン・S3キー・確認状態を記録します。
同じworktreeの同時実行は `.deploy/deploy.lock` で防ぎます。異常終了でロックが残った場合だけ、実行中のdeployがないことを確認して削除してください。
一時パッケージと更新JSONは通常終了・例外時に削除します。S3にアップロード済みの成果物は残し、自動ロールバックはしません。
更新失敗時はAWSコンソールのRuntime／DEFAULTの `failureReason` を確認してください。
タイムアウト後もAWS側で更新が続いている可能性があるため、再実行前に状態を確認します。

```bash
npm run test:deploy
```

これはAWSを模擬したテストです。成功・失敗・待機・設定維持・後片付けを検証します。
npm run deployによるデプロイ成功は開発者が確認済みです。エージェント処理の動作確認とは別に記録します。

## cloneしたREADMEの編集と実行間の独立性を確認する

Runtimeには `GITHUB_APP_CLIENT_ID` と `GITHUB_APP_PRIVATE_KEY_SECRET_ARN` が必要です。
Secrets Manager取得権限はRuntime実行ロールに、GitHub Appはtargetだけにインストールします。
clone用は `contents: read`、公開直前に発行するトークンは `contents: write` と `pull_requests: write` です。
対象リポジトリはtargetだけです。Claudeのツールには認証情報を渡しません。

Dev Containerで次を実行します。

```bash
npm run test:workspace
npm run typecheck
npm run build
```

テストはローカルGitリポジトリを実際にcloneし、Claudeの応答とGitHub認証部分を模擬します。
同一プロセスで2回実行して編集前の内容が同じこと、作業パスが異なること、差分に前回の変更が混ざらないこと、
完了後・モデル失敗時・clone失敗時に作業領域が消えることを確認します。
シンボリックリンクや32 KiB超のREADMEは編集前に拒否します。

AWSでは再デプロイ後、同じセッションIDで次の2依頼を順に呼び出します。

1. `README.mdに「独立性確認A」セクションを追加してください。`
2. `README.mdに「独立性確認B」セクションを追加してください。`

間にtargetのmainを変更しないでください。各応答で `changed: true` と `workspaceRemoved: true` を確認します。
2回の `before`・`baseCommit` が一致し、`workspace` が異なり、2回目の `before`・`after`・`diff` に
1回目で追加したAが含まれないことを確認します。CloudWatchには作業領域の削除ログも残ります。
現在は変更があれば実行ごとにPRを作成します。上記の2回確認では2つのPRができるため、実行後に確認してください。マージするまでGitHub上のmainは変わりません。

## README変更の公開

通常の `prompt` リクエストは、編集後に変更を検証し、差分があればPRまで作成します。
Claudeが呼べるツールはREADMEの読み書きだけです。Git操作・公開の順序はTypeScriptで制御します。

* README以外の変更（未追跡ファイルも含む）、削除、名前変更、形式・実行権限変更、32 KiB超、取得時からのHEAD変更は拒否。
* `codex/readme-<UUID>` を作成し、READMEだけをstageして再検証し、commit。
* targetのURL・現在ブランチ・commitを照合して、明示した専用ブランチだけへpush。force pushやmainへのpushは行わない。
* PRのbaseは `repositoryConfig.baseBranch`（main）。PR本文には変更概要と取得元コミットを記載。
* Gitの認証情報は子プロセスへ渡し、URL・Git設定・スクリプト本文には保存しない。

成功時は既存の編集結果に `status: "pr_created"`、`branch`、`commit`、`pullRequestNumber`、`pullRequestUrl` を追加します。
差分なしでは `status: "no_changes"` とし、書き込みトークン・commit・push・PR作成を省略します。
公開に失敗した場合はHTTP 500と `status: "publish_failed"`、`stage`、`branch`、`commit`、`pushState` を返します。
`pushState` は未試行 `not_attempted`、通信失敗等で成否不明 `unknown`、push成功確認済み `confirmed` のいずれかです。
PR作成で通信が切れた場合も、GitHub側でPRができている可能性があります。再実行前にブランチとPRを確認してください。
リモートのブランチを自動削除・ロールバックせず、ローカル作業領域は例外時も削除します。
同じ依頼の再実行は別ブランチ・別PRを作成する可能性があります。重複防止・自動復旧は未実装です。

```bash
npm run test:publish
npm run test:workspace
npm run typecheck
npm run build
```

公開テストは実際のローカルGitとbareリポジトリ、模擬GitHub APIを使います。GitHubへの実pushは行いません。
AWSで確認する場合は `npm run deploy` 後、READMEに小さなセクションを追加する依頼を1回実行します。
応答が `pr_created`・`workspaceRemoved: true` であること、URL先のPRがmain向けでREADMEだけの差分であること、
mainが未変更であることを確認してください。変更なしの依頼では `no_changes` となりPRが増えないことを確認します。
targetの応答判定は[PR #4](https://github.com/JiroYoyogi/agent-core-practice-target/pull/4)でmainへ取り込み済みです。2026-09-27に開発者が「変更なし」「PR作成」の実行サマリーとジョブ判定を確認しました。
`pr_created`／`no_changes`は必要項目と整合性を検証して成功、それ以外・JSON不正・呼び出し失敗はジョブ失敗にします。
実行サマリーには検証済みのPRリンクか変更なし、または失敗段階・ブランチ・push状態を表示します。README本文や依頼全文は出力しません。

## リポジトリの役割と再現手順

| リポジトリ | 管理するもの |
| --- | --- |
| `JiroYoyogi/agent-core-practice` | Runtimeのコード、デプロイスクリプト、テスト、学習記録 |
| `JiroYoyogi/agent-core-practice-target` | 編集対象READMEとIssue起動用Workflow |

1. 開発用のDev ContainerでAWS認証し、`infra/update-runtime.json`の実値を準備する。
2. Runtimeの環境変数、実行ロールのBedrock／Secret権限、Appのtargetへのインストールを確認する。
3. `npm ci` → `npm run deploy`。READYとDEFAULTのバージョン一致を確認する。
4. targetのmainにWorkflowを配置し、`AWS_ROLE_ARN`（Secret）とRuntime ARN／エンドポイント名（Variables）を登録する。
5. targetのIssueに `/agent README.mdに動作確認セクションを追加してください。` とコメントする。
6. Actionsの結果とPRのbase・READMEだけの差分を確認する。mainへの取り込みは人間が行う。

### 変更なしの実機確認（2026-09-27確認済み）

Runtimeに `{"prompt":"README.mdを読み取り、確認だけしてください。書き込みや変更は行わないでください。"}` を送る。
同じ依頼はtargetのIssueへ `/agent ` に続けてコメントしても実行できます。
`status: no_changes`、`changed: false`、`workspaceRemoved: true`と、新しいブランチ・PRがないことを確認します。
開発者がPR #4反映後に上記の確認を完了しました。新しいブランチ・PRは作成されず、Actionsは成功し、サマリーに「変更なし」が表示されます。

### 失敗と再実行の手順

再実行は新しいclone・ブランチで始まります。重複排除・自動復旧は行いません。
以下はMac側のGitHub CLIで、応答のブランチ名を設定して確認します。

```bash
RECOVERY_BRANCH='応答のcodex/readme-から始まるブランチ名'
gh api "repos/JiroYoyogi/agent-core-practice-target/git/ref/heads/$RECOVERY_BRANCH"
gh pr list --repo JiroYoyogi/agent-core-practice-target \
  --state all --head "$RECOVERY_BRANCH" \
  --json number,state,url,headRefName,baseRefName
```

* push未試行：原因を直して再実行する。
* push成否不明：まずリモートのrefとcommitを確認する。404以外の認証・通信エラーを「存在しない」と扱わない。
* push成功・PR未作成：既存ブランチと差分を確認し、そのブランチから手動でPRを作る。
* PR作成成否不明：上のPR一覧を確認し、存在すればそのPRを利用する。
* 既存PRがある状態で再実行すると別PRができ得る。不要なPRやブランチの削除は別途判断する。

既存ブランチの差分を確認し、PRがまだない場合の復旧コマンドです。

```bash
gh pr create --repo JiroYoyogi/agent-core-practice-target \
  --base main --head "$RECOVERY_BRANCH" \
  --title 'READMEの更新' --body '公開処理の途中失敗から、既存ブランチを確認してPRを作成しました。'
```

### Workflow応答判定のローカルテスト

Mac側で開発用worktreeとtargetを同じ親フォルダに置き、開発用で実行します。

```bash
npm run test:issue-response
```

別配置の場合は `TARGET_WORKFLOW=/絶対パス/.github/workflows/issue-agent.yml npm run test:issue-response`。
テストはtargetのWorkflowから実際のNode.jsコードを取り出して検証します。
Dev Containerで行う場合は、targetのWorkflowも参照できる場所にマウントする必要があります。

### 新プロジェクトへの引き継ぎ

次のプロジェクトでは同じRuntime処理とtarget連携を再利用し、ZIP作成・S3配置・Runtime更新の部分を
`agentcore deploy`へ置き換えて比較します。現在の認証境界とIssue→PRの再現を先に確認し、その後STEP 4以降へ進みます。
プロジェクト名・場所は未決定です。共有AWSリソースの削除は依存関係を確認する別作業です。

## 動作確認済みの範囲

開発者がAWS上で以下の成功を確認しました（2026-09-26）。

* STEP 1：デプロイ、Claudeによる編集、Git差分、セッション存続時の引き継ぎと停止後の初期化。
* STEP 2：ラベル起動、OIDC認証、Runtime環境情報の取得、Issue本文による編集、コメントによる編集。
* 認証拒否、変数の参照先間違い、エンドポイント指定間違いをログから切り分け、修正後の成功を確認。

除外条件はWorkflowに実装済みですが、通常コメント・PRコメント・他ユーザーでの実機テスト結果は未記録です。

2026-09-27の追加確認：

* 開発者がnpm run deploy、同一セッションでの独立した編集、IssueコメントからのPR作成を確認。
* PR #3（https://github.com/JiroYoyogi/agent-core-practice-target/pull/3）はmain向け、READMEへの4行追加のみ。
* 読み取り確認時のmainは取得元コミット `1e3ca7e513d2869f0f3c307fc8991644c666032e` と一致。エージェントのcommitは専用ブランチ上に存在。
* Workflow応答判定のローカルテスト12件は成功。PR #4をmainへマージ後、「変更なし」「PR作成」の両方でジョブ成功と対応するサマリー表示を開発者が実機確認。
* 「変更なし」では新しいブランチ・PRが増えず、「PR作成」ではサマリーのリンク先がmain向け・READMEだけの差分であることを確認。
* 失敗応答・不正JSON等の判定はローカルテストで確認。AWSの権限や設定を故意に壊す失敗系の実機試験は行っていません。
