export interface FetchRetryOptions {
  readonly maxRetries?: number;
  readonly timeoutMs?: number;
  readonly backoffBaseMs?: number;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit & { forceRetry?: boolean },
  opts: FetchRetryOptions = {},
): Promise<Response> {
  const { maxRetries = 3, timeoutMs = 10_000, backoffBaseMs = 200 } = opts;
  const method = (init.method ?? 'GET').toUpperCase();
  const canRetry = init.forceRetry === true || method !== 'POST';

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const signal = controller.signal;
    try {
      const res = await fetch(url, { ...init, signal });
      clearTimeout(timeoutId);
      const retryable = res.status === 429 || res.status >= 500;
      if (!canRetry || attempt >= maxRetries || !retryable) return res;
      lastError = new Error();
    } catch (err) {
      clearTimeout(timeoutId);
      if (!canRetry) throw err;
      lastError = err;
    }
    if (attempt < maxRetries) {
      const delay = backoffBaseMs * Math.pow(2, attempt) + Math.random() * backoffBaseMs;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}
