export interface RateLimitOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RateLimitOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes("429") || err.message.includes("rate_limit"));
      const isLastAttempt = attempt === maxRetries;

      if (!isRateLimit || isLastAttempt) throw err;

      const delay = baseDelayMs * Math.pow(2, attempt);
      console.log(`[rate-limit] Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Unreachable");
}
