// STEP 3では、編集対象をこのリポジトリに固定する。
// Issue本文やClaudeの出力から変更しない。
export const repositoryConfig = {
  owner: "JiroYoyogi",
  repo: "agent-core-practice-target",
  baseBranch: "main",
  allowedFile: "README.md",
} as const;