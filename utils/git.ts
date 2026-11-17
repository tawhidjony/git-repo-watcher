export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
  error?: string;
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes).trim();
}

export async function runGit(
  cwd: string,
  args: string[],
  timeoutMs = 15_000,
): Promise<GitResult> {
  try {
    const command = new Deno.Command("git", {
      args,
      cwd,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
      env: {
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const output = await command.output();
    return {
      code: output.code,
      stdout: decode(output.stdout),
      stderr: decode(output.stderr),
    };
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return {
        code: 127,
        stdout: "",
        stderr: "",
        error: "git is not installed or not on PATH",
      };
    }
    const timedOut = err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    const message = err instanceof Error ? err.message : String(err);
    return {
      code: 1,
      stdout: "",
      stderr: message,
      error: timedOut ? `git ${args[0] ?? "command"} timed out` : message,
    };
  }
}
