/**
 * Distributed lock and rate-limit state, over Upstash Redis.
 *
 * Why Redis and not D1: cron invocations can overlap. Two hourly ticks running
 * at once would both see the same due experiments, both close them, and both
 * brief the Mind — the creator gets two messages about one result, and the
 * posterior takes the observation twice. That is the single worst failure this
 * system can have, because it corrupts beliefs silently.
 *
 * Upstash's REST API is used rather than a TCP client because Workers cannot
 * hold long-lived Redis connections.
 *
 * Everything degrades open: if Redis is unreachable the job still runs. A
 * missed lock is worse than a missed job, but an outage that stops all learning
 * is worse than both, so the caller is told which mode it got.
 */

export interface RedisOptions {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface LockHandle {
  acquired: boolean;
  /** True when Redis was unreachable and the job proceeded unlocked. */
  degraded: boolean;
  key: string;
  release(): Promise<void>;
}

export class RedisClient {
  private readonly url: string;
  private readonly token: string;
  private readonly doFetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: RedisOptions) {
    this.url = opts.url.replace(/\/$/, '');
    this.token = opts.token;
    this.doFetch = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 3_000;
  }

  private async command<T>(args: (string | number)[]): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.doFetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`redis command failed with ${res.status}`);
      const json = (await res.json()) as { result: T };
      return json.result;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * SET key value NX EX ttl — the standard single-instance lock.
   * The token lets release verify ownership, so a slow job cannot delete a
   * lock that has since expired and been taken by someone else.
   */
  async acquireLock(key: string, ttlSeconds: number): Promise<LockHandle> {
    const token = crypto.randomUUID();
    try {
      const result = await this.command<string | null>([
        'SET',
        key,
        token,
        'NX',
        'EX',
        ttlSeconds,
      ]);
      const acquired = result === 'OK';
      return {
        acquired,
        degraded: false,
        key,
        release: async () => {
          if (!acquired) return;
          try {
            // Only delete if we still own it.
            const current = await this.command<string | null>(['GET', key]);
            if (current === token) await this.command(['DEL', key]);
          } catch {
            // Lock expires on its own. Nothing to do.
          }
        },
      };
    } catch {
      return {
        acquired: true,
        degraded: true,
        key,
        release: async () => {},
      };
    }
  }

  async get(key: string): Promise<string | null> {
    return this.command<string | null>(['GET', key]);
  }

  async setEx(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.command(['SET', key, value, 'EX', ttlSeconds]);
  }

  /**
   * Fixed-window counter. Returns the count after increment.
   * Good enough for "at most one proactive message per creator per day"; a
   * sliding window would be more precise and is not worth the complexity here.
   */
  async incrementWindow(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.command<number>(['INCR', key]);
    if (count === 1) await this.command(['EXPIRE', key, ttlSeconds]);
    return count;
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.command<string>(['PING'])) === 'PONG';
    } catch {
      return false;
    }
  }
}

export function redisFromEnv(env: {
  UPSTASH_REDIS_REST_URL?: string | undefined;
  UPSTASH_REDIS_REST_TOKEN?: string | undefined;
}): RedisClient | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  return new RedisClient({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

/** Lock key for the hourly maturation run. One holder at a time, globally. */
export const CRON_LOCK_KEY = 'ratchet:lock:followup';
/** Lock TTL. Longer than a run, shorter than the cron interval. */
export const CRON_LOCK_TTL_SECONDS = 240;
