import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/node';
import { scrubEvent } from '../../src/observability/errors.ts';
import { safeAttributes } from '../../src/observability/tracing.ts';
import { generateKey } from '../../src/auth/key-format.ts';

const INPUT = [
  'https://ejemplo.com/secret-path?token=abc',
  'secret-path',
  'token=abc',
  '203.0.113.7',
];

describe('error reporting scrubbing', () => {
  it('lets no input field reach the error service', () => {
    const event = {
      event_id: 'e1',
      level: 'error',
      message: 'failed on https://ejemplo.com/secret-path?token=abc',
      request: {
        url: INPUT[0],
        query_string: 'token=abc',
        data: { url: INPUT[0] },
        headers: { 'x-forwarded-for': '203.0.113.7' },
      },
      user: { ip_address: '203.0.113.7' },
      extra: { input: INPUT[0] },
      tags: { url: INPUT[0] },
      contexts: { request: { url: INPUT[0] } },
      breadcrumbs: [{ message: `GET ${INPUT[0]}`, data: { url: INPUT[0] } }],
      exception: {
        values: [
          {
            type: 'TypeError',
            value: `Invalid URL: ${INPUT[0]} from 203.0.113.7`,
            stacktrace: {
              frames: [
                {
                  filename: 'app.ts',
                  function: 'run',
                  lineno: 3,
                  colno: 9,
                  vars: { url: INPUT[0] },
                },
              ],
            },
          },
        ],
      },
    } as unknown as ErrorEvent;
    const scrubbed = JSON.stringify(scrubEvent(event));
    for (const needle of INPUT) expect(scrubbed).not.toContain(needle);
    expect(JSON.parse(scrubbed)).toMatchObject({
      event_id: 'e1',
      exception: {
        values: [
          { type: 'TypeError', stacktrace: { frames: [{ filename: 'app.ts', lineno: 3 }] } },
        ],
      },
    });
  });
});

describe('trace attributes', () => {
  it('keep only registrable domain, status, duration and bounded enums', () => {
    expect(
      safeAttributes({
        'url.registrable_domain': 'ejemplo.com',
        'http.response.status_code': 301,
        'urlkit.duration_ms': 12,
        'urlkit.tool': 'inspect',
        'url.full': INPUT[0],
        'url.path': '/secret-path',
        'client.address': '203.0.113.7',
      }),
    ).toEqual({
      'url.registrable_domain': 'ejemplo.com',
      'http.response.status_code': 301,
      'urlkit.duration_ms': 12,
      'urlkit.tool': 'inspect',
    });
  });

  it('keep the TLS protocol version and nothing else of a certificate (002/T092)', () => {
    expect(
      safeAttributes({
        'tls.protocol': 'TLSv1.3',
        'tls.subject': 'CN=ejemplo.com',
        'tls.fingerprint': 'AB:CD',
        'dns.records': '93.184.215.14',
        'http.headers': 'set-cookie: sid=1',
      }),
    ).toEqual({ 'tls.protocol': 'TLSv1.3' });
  });

  it('drop allowed keys whose value looks like a URL or a path', () => {
    expect(safeAttributes({ 'url.registrable_domain': 'https://ejemplo.com/secret-path' })).toEqual(
      {},
    );
  });
});

describe('API keys never reach the error service (003, FR-042)', () => {
  it('scrubs the Authorization header and any key in messages', () => {
    const key = generateKey();
    const event = {
      event_id: 'e2',
      level: 'error',
      message: `verification failed for ${key.key}`,
      request: { headers: { authorization: `Bearer ${key.key}` } },
      extra: { authorization: `Bearer ${key.key}` },
      exception: { values: [{ type: 'Error', value: `bad key ${key.key}` }] },
    } as unknown as ErrorEvent;
    const scrubbed = JSON.stringify(scrubEvent(event));
    expect(scrubbed).not.toContain(key.key);
    expect(scrubbed).not.toContain(key.secret);
  });
});
