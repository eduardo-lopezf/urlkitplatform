/**
 * Raw headers in the safe transport (002/T009, research R3): order, original casing and
 * repetitions as received, next to the grouped object the inspector already uses.
 */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { headerPairs, undiciTransport } from '../../src/inspect/safe-fetch.ts';

let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer((_req, res) => {
    // writeHead with a flat array keeps the exact order and casing on the wire.
    res.writeHead(200, ['Set-Cookie', 'a=1', 'X-Test', '1', 'Set-Cookie', 'b=2', 'x-test', '2']);
    res.end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('undiciTransport raw headers', () => {
  it('returns [name, value] pairs in received order, casing and repetitions kept', async () => {
    const res = await undiciTransport({
      url: new URL(`http://127.0.0.1:${port}/`),
      address: '127.0.0.1',
      family: 4,
      signal: AbortSignal.timeout(2000),
    });
    res.body?.destroy?.();
    const custom = res.rawHeaders.filter(([name]) => /^(set-cookie|x-test)$/i.test(name));
    expect(custom).toEqual([
      ['Set-Cookie', 'a=1'],
      ['X-Test', '1'],
      ['Set-Cookie', 'b=2'],
      ['x-test', '2'],
    ]);
  });

  it('keeps the grouped headers object unchanged for Redirect Inspector', async () => {
    const res = await undiciTransport({
      url: new URL(`http://127.0.0.1:${port}/`),
      address: '127.0.0.1',
      family: 4,
      signal: AbortSignal.timeout(2000),
    });
    res.body?.destroy?.();
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toEqual(['a=1', 'b=2']);
    expect(res.headers['x-test']).toEqual(['1', '2']);
  });
});

describe('headerPairs', () => {
  it('reads the HTTP/2 header object: order kept, repetitions apart, no pseudo-headers', () => {
    expect(
      headerPairs({
        ':status': '200',
        'content-type': 'text/html',
        'set-cookie': ['a=1', 'b=2'],
        'x-test': Buffer.from('1'),
      }),
    ).toEqual([
      ['content-type', 'text/html'],
      ['set-cookie', 'a=1'],
      ['set-cookie', 'b=2'],
      ['x-test', '1'],
    ]);
  });

  it('reads the HTTP/1.1 flat array', () => {
    expect(headerPairs([Buffer.from('X-A'), Buffer.from('1'), 'x-b', '2'])).toEqual([
      ['X-A', '1'],
      ['x-b', '2'],
    ]);
  });
});
