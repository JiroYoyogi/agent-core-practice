import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function checkEnvironment() {
  try {
    const { stdout } = await execFileAsync("git", ["--version"], {
      timeout: 5000,
      maxBuffer: 64 * 1024,
    });

    return {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      git: {
        available: true,
        version: stdout.trim(),
      },
    };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "UNKNOWN";

    return {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      git: {
        available: false,
        code,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}