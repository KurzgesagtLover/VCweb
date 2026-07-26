type Bucket = number[];

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  consume(key: string, limit: number, windowMs: number, now = Date.now()) {
    const cutoff = now - windowMs;
    const active = (this.buckets.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (active.length >= limit) {
      this.buckets.set(key, active);
      return { allowed: false, retryAfterMs: Math.max(1, active[0] + windowMs - now) };
    }
    active.push(now);
    this.buckets.set(key, active);
    return { allowed: true, retryAfterMs: 0 };
  }
}

const globalRateLimit = globalThis as typeof globalThis & {
  virtualNationRateLimiter?: SlidingWindowRateLimiter;
};

export const actionRateLimiter =
  globalRateLimit.virtualNationRateLimiter ?? new SlidingWindowRateLimiter();
globalRateLimit.virtualNationRateLimiter = actionRateLimiter;

export function enforceActionRateLimit(key: string, limit: number, windowMs: number) {
  const result = actionRateLimiter.consume(key, limit, windowMs);
  if (!result.allowed) {
    throw new Error(
      `요청이 너무 빠릅니다. ${Math.ceil(result.retryAfterMs / 1000)}초 후 다시 시도해 주세요.`,
    );
  }
}
