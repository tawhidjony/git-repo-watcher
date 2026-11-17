export async function openInCursor(repoPath: string): Promise<void> {
  let child: Deno.ChildProcess;
  try {
    child = new Deno.Command("cursor", {
      args: [repoPath],
      stdin: "null",
      stdout: "null",
      stderr: "piped",
    }).spawn();
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      throw new Error("cursor was not found on PATH");
    }
    throw err;
  }

  const chunks: Uint8Array[] = [];
  const stderrDone = child.stderr.pipeTo(
    new WritableStream({
      write(chunk) {
        chunks.push(chunk);
      },
    }),
  ).catch(() => {});

  const status = await Promise.race([
    child.status,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 700)),
  ]);

  if (status === null || status.success) return;

  await stderrDone;
  const stderr = new TextDecoder().decode(
    chunks.reduce((all, chunk) => {
      const next = new Uint8Array(all.length + chunk.length);
      next.set(all);
      next.set(chunk, all.length);
      return next;
    }, new Uint8Array()),
  ).trim();
  throw new Error(stderr || `cursor exited with code ${status.code}`);
}
