import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: "ap-northeast-1",
});

export async function askClaude(prompt: string): Promise<string> {
  if (!prompt.trim()) {
    throw new Error("質問を入力してください。");
  }

  const response = await client.send(
    new ConverseCommand({
      modelId: "global.anthropic.claude-sonnet-4-6",
      messages: [
        {
          role: "user",
          content: [{ text: prompt }],
        },
      ],
      inferenceConfig: { maxTokens: 256 },
      additionalModelRequestFields: {
        thinking: { type: "disabled" },
      },
    }),
  );

  console.log("終了理由:", response.stopReason);
  console.log("使用トークン:", response.usage);

  let answer = "";

  for (const block of response.output?.message?.content ?? []) {
    if (block.text !== undefined) {
      answer += block.text;
    }
  }

  if (!answer.trim()) {
    throw new Error("Claudeからテキストの回答が返りませんでした。");
  }

  return answer;
}