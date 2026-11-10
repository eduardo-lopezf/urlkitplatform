/**
 * Privacy against a real Valkey (T098). Runs only when REDIS_URL is set
 * (`docker compose up -d redis`, or the Valkey service in CI); skipped otherwise.
 * Replays quickstart scenarios 5–7, then checks that the API logs carry no URL or IP and that
 * Valkey holds nothing but `quota:*` counters with a TTL.
 */
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFetchHop } from '../../src/inspect/fetch-hop.ts';
import { createSafeFetch } from '../../src/inspect/safe-fetch.ts';
import { isBlockedAddress } from '../../src/inspect/ssrf.ts';
import { createLimiter } from '../../src/quota/limiter.ts';
import { RedisStore, type QuotaStore } from '../../src/quota/store.ts';
import { post, testApp } from '../helpers.ts';

const REDIS_URL = process.env.REDIS_URL;
const CLIENT_IP = '198.51.100.23';
const SHORT_PATH = '/s/privado-123';

describe.skipIf(!REDIS_URL)('privacy with a real Valkey', () => {
  let redis: Redis;
  let server: Server;
  let port = 0;
  const touched = new Set<string>();

  beforeAll(async () => {
    redis = new Redis(REDIS_URL ?? '', { maxRetriesPerRequest: 2, lazyConnect: true });
    await redis.connect();
    // A two-hop shortener: /s/… → 301 → /r → 302 → /end (200).
    server = createServer((req, res) => {
      if (req.url === SHORT_PATH) return void res.writeHead(301, { location: '/r' }).end();
      if (req.url === '/r') return void res.writeHead(302, { location: '/end' }).end();
      res.writeHead(200, { 'content-type': 'text/html' }).end('<p>ok</p>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;
  });

  afterAll(async () => {
    if (touched.size > 0) await redis.del(...touched);
    redis.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('replays scenarios 5–7 without leaking URLs or IPs to logs or Valkey', async () => {
    const real = new RedisStore(redis);
    const store: QuotaStore = {
      increment: (key, ttl) => (touched.add(key), real.increment(key, ttl)),
    };
    // Real SSRF rules, except for the fixture server on 127.0.0.1.
    const safeFetch = createSafeFetch({
      resolve: async (host) =>
        host === 'acortador.test' ? ['127.0.0.1'] : host === 'interno.test' ? ['127.0.0.2'] : [],
      policy: { allowedPorts: null, isBlocked: (a) => a !== '127.0.0.1' && isBlockedAddress(a) },
    });
    const { app, lines } = testApp({
      // A fresh secret per run gives a fresh subject hash, so reruns never share counters.
      secret: randomBytes(32).toString('hex'),
      now: Date.now,
      limiter: createLimiter({ store, now: Date.now }),
      inspectFetcher: () => createFetchHop({ safeFetch }),
      clientIp: () => CLIENT_IP,
    });

    // Scenario 5: a two-hop shortened link.
    const short = `http://acortador.test:${port}${SHORT_PATH}`;
    const five = await post(app, '/v1/inspect', { url: short });
    expect(await five.json()).toMatchObject({ stopReason: 'final' });

    // Scenario 6: cloud metadata and a domain that resolves to loopback.
    for (const url of ['http://169.254.169.254/', 'http://interno.test/']) {
      const six = await post(app, '/v1/inspect', { url });
      expect(await six.json()).toMatchObject({ stopReason: 'blocked' });
    }

    // Scenario 7: the 11th inspection in the hour is refused; local tools keep working.
    for (let i = 4; i <= 10; i++)
      expect((await post(app, '/v1/inspect', { url: short })).status).toBe(200);
    const eleventh = await post(app, '/v1/inspect', { url: short });
    expect(eleventh.status).toBe(429);
    expect(eleventh.headers.get('retry-after')).toMatch(/^\d+$/);
    const clean = await post(app, '/v1/clean', { url: `${short}?utm_source=x` });
    expect(clean.status).toBe(200);

    const log = lines.join('\n');
    for (const needle of [
      'acortador.test',
      'interno.test',
      '169.254',
      '127.0.0',
      'privado-123',
      'utm_source',
      CLIENT_IP,
      'http',
    ])
      expect(log, needle).not.toContain(needle);

    expect(touched.size).toBeGreaterThan(0);
    const keys = await redis.keys('*');
    for (const key of keys) {
      expect(key).toMatch(/^quota:/);
      expect(await redis.ttl(key), key).toBeGreaterThan(0);
      expect(key).not.toContain(CLIENT_IP);
      expect(key).not.toContain('acortador');
    }
    for (const key of touched) expect(keys).toContain(key);
  });
});
