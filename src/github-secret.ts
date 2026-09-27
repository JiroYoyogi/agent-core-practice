import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({
  region: "ap-northeast-1",
});

export async function getGitHubPrivateKey(): Promise<string> {
  const secretArn = process.env.GITHUB_APP_PRIVATE_KEY_SECRET_ARN;

  if (!secretArn) {
    throw new Error("GitHub App秘密鍵のSecret ARNが未設定です。");
  }

  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: secretArn,
    }),
  );

  if (!response.SecretString?.trim()) {
    throw new Error("Secretに秘密鍵の文字列がありません。");
  }

  return response.SecretString;
}