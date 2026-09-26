# AgentCore * Claude * GitHub

## STEPs

## STEP.1 - AgentCore上でClaudeを動かす

### 目的

AgentCore Runtime上で、Claudeを使って練習用README（/tmp/coding-agent-XXXXXX/）を編集する

### 現在の構成

CLI → AgentCore Runtime → Node.jsのHTTPサーバー → BedrockのSonnet 4.6

### エージェントの処理

READMEの読み書きツールを実行し、Git差分を返す

### デプロイ方法

TypeScriptをビルドし、依存関係とZIP化してS3へ配置する

### 認証

開発者のAWS認証と、Runtimeの実行ロールを分ける

### 確認結果

同じセッションでは編集を引き継ぎ、実行環境の停止後はリポジトリが失われる

### 現在の範囲

Runtime内の練習用リポジトリを扱う。GitHubへのpushやPR作成は今後のSTEP