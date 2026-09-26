import { askClaude } from "./claude.js";

async function main() {
  const answer = await askClaude(
    "こんにちは。日本語で一文だけ自己紹介してください。",
  );

  console.log("回答:", answer);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});