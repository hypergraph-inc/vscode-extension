const TIMEOUT_MS = 4000;

export async function serverUnreachable(origin: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/client-epoch`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.status >= 500 ? `answered HTTP ${res.status}` : null;
  } catch (err) {
    const { name, message, cause } = err as { name?: string; message?: string; cause?: { code?: string } };
    if (name === "TimeoutError") return `no answer within ${TIMEOUT_MS / 1000}s`;
    return cause?.code ? `${message} (${cause.code})` : String(message ?? err);
  }
}
