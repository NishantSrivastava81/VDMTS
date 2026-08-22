import "server-only";

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimit {
  limit: number;
  windowMs: number;
}

/**
 * Per-instance fixed window. Enough to stop a runaway client or a casual probe
 * on a personal deployment; it is not a distributed limiter, and Vercel may run
 * several instances. Azure-side quotas remain the real spending ceiling.
 */
export function consumeRateLimit(key: string, { limit, windowMs }: RateLimit): boolean {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    pruneExpired(now);
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  existing.count += 1;
  return true;
}

export function clientKey(request: Request, route: string): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `${route}:${ip}`;
}

export function resetRateLimits(): void {
  windows.clear();
}

function pruneExpired(now: number): void {
  if (windows.size < 512) {
    return;
  }
  for (const [key, value] of windows) {
    if (value.resetAt <= now) {
      windows.delete(key);
    }
  }
}
