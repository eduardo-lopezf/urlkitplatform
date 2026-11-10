/**
 * Counter storage. Valkey in production; memory for development and tests. Only counters with a
 * TTL are stored, keyed by pseudonym: no IP and no URL ever reaches the store.
 */
import type { Redis } from 'ioredis';

export interface QuotaStore {
  /** Increments `key`, sets its TTL on first use, returns the new count. */
  increment(key: string, ttlSeconds: number): Promise<number>;
}

export class MemoryStore implements QuotaStore {
  private readonly counters = new Map<string, { count: number; expiresAt: number }>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const now = this.now();
    const entry = this.counters.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.counters.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
      if (this.counters.size > 100_000) this.sweep(now);
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  private sweep(now: number): void {
    for (const [key, entry] of this.counters) if (entry.expiresAt <= now) this.counters.delete(key);
  }
}

export class RedisStore implements QuotaStore {
  private readonly redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const result = await this.redis
      .multi()
      .incr(key)
      .expire(key, Math.max(1, Math.ceil(ttlSeconds)), 'NX')
      .exec();
    const count = result?.[0]?.[1];
    if (typeof count !== 'number') throw new Error('quota store: unexpected Valkey reply');
    return count;
  }
}
