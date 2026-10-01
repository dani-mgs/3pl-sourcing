// PostgREST answers PGRST303 when it can't validate the request's JWT claims,
// which with Supabase's signing keys can be transient clock skew between the
// caller and the API (a token "issued in the future"). It clears within
// seconds, so a short backoff is enough. Every other error is thrown at once.

export const PGRST303 = "PGRST303";

// Waits between attempts: 6 attempts in all, about 15.5 s of waiting at most.
export const PGRST303_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000] as const;
export const PGRST303_MAX_ATTEMPTS = PGRST303_RETRY_DELAYS_MS.length + 1;

export type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code: unknown }).code
    : undefined;
}

// Runs `call`, retrying only when it throws an error whose code is PGRST303.
// Logs each retry with the label, attempt, and code only (never the error's
// message or the request), and rethrows the last error once attempts run out.
export async function retryOnPgrst303<T>(
  label: string,
  call: () => Promise<T>,
  sleep: Sleep = realSleep,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (errorCode(error) !== PGRST303 || attempt >= PGRST303_MAX_ATTEMPTS) throw error;
      const delay = PGRST303_RETRY_DELAYS_MS[attempt - 1];
      console.warn(
        `${label}: Supabase returned ${PGRST303} (attempt ${attempt} of ${PGRST303_MAX_ATTEMPTS}); retrying in ${delay} ms.`,
      );
      await sleep(delay);
    }
  }
}
