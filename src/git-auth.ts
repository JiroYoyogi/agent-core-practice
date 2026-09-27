import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exec = promisify(execFile);
export async function runAuthenticatedGit(args: string[], token: string, cwd?: string): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "git-auth-"));
  try {
    const askpass = join(root, "askpass.sh");
    await writeFile(askpass, `#!/bin/sh
case "$1" in
  *Username*) printf '%s\\n' 'x-access-token' ;;
  *Password*) printf '%s\\n' "$AGENT_GITHUB_TOKEN" ;;
  *) exit 1 ;;
esac
`, { mode: 0o700 });
    await exec("git", ["-c", "credential.helper=", "-c", "http.followRedirects=false",
      "-c", "core.hooksPath=/dev/null", ...args], {
      ...(cwd ? { cwd } : {}),
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", LC_ALL: "C",
        GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
        GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: "0", AGENT_GITHUB_TOKEN: token },
      timeout: 60_000, maxBuffer: 1024 * 1024,
    });
  } catch {
    throw new Error("認証付きGit操作に失敗しました。リモート側の状態を確認してください。");
  } finally { await rm(root, { recursive: true, force: true }); }
}
