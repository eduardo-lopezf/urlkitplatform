/**
 * API entry point (T010). Wires the real dependencies: Valkey when REDIS_URL is set (memory
 * counters otherwise, development only), the daily-key secret, the safe network client.
 */
import { randomBytes } from 'node:crypto';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { catalog } from '@urlkit/rules';
import { createApp } from './app.ts';
import { createFetchHop } from './inspect/fetch-hop.ts';
import { createSafeFetch } from './inspect/safe-fetch.ts';
import { createMetrics } from './metrics/registry.ts';
import { initErrorReporting } from './observability/errors.ts';
import { initTracing } from './observability/tracing.ts';
import { createLogger } from './privacy/logger.ts';
import { clientIpFrom } from './quota/client-ip.ts';
import { createLimiter } from './quota/limiter.ts';
import { MemoryStore, RedisStore, type QuotaStore } from './quota/store.ts';

const env = process.env;
const production = env.NODE_ENV === 'production';
const logger = createLogger();

const secret = env.QUOTA_SECRET ?? (production ? undefined : randomBytes(32).toString('hex'));
if (!secret || secret.length < 32) {
  logger.error('config.invalid', {
    code: 'QUOTA_SECRET must be set (32+ characters) in production',
  });
  process.exit(1);
}

async function quotaStore(): Promise<QuotaStore> {
  if (!env.REDIS_URL) {
    if (production) {
      logger.error('config.invalid', { code: 'REDIS_URL is required in production' });
      process.exit(1);
    }
    logger.warn('quota.memory-store', {
      code: 'REDIS_URL not set: counters live in memory (development only)',
    });
    return new MemoryStore();
  }
  const { Redis } = await import('ioredis');
  return new RedisStore(
    new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false }),
  );
}

/** Behind Caddy (TRUST_PROXY=1) the client IP comes from X-Forwarded-For. */
function clientIp(c: Context): string {
  return clientIpFrom({
    forwardedFor: c.req.header('x-forwarded-for'),
    remote: getConnInfo(c).remote.address,
    trustProxy: env.TRUST_PROXY === '1',
  });
}

await initTracing(env);
await initErrorReporting(env);

const safeFetch = createSafeFetch();
const app = createApp({
  catalog,
  secret,
  now: Date.now,
  limiter: createLimiter({ store: await quotaStore() }),
  logger,
  metrics: createMetrics(),
  webOrigin: env.WEB_ORIGIN ?? 'http://localhost:4321',
  inspectFetcher: () => createFetchHop({ safeFetch }),
  clientIp,
});

const port = Number(env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () =>
  logger.info('api.listening', { port, version: catalog.version }),
);
