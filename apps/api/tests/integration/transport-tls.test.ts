/**
 * The safe transport against a server that cuts large ClientHellos, as badssl.com does with the
 * post-quantum key share Node offers by default (2026-11-12). The test CA is passed as the trust
 * store; everything else is the production code path.
 */
import { readFileSync } from 'node:fs';
import {
  createConnection,
  createServer as createNetServer,
  type Server as NetServer,
} from 'node:net';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUndiciTransport } from '../../src/inspect/safe-fetch.ts';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/tls/${name}`, import.meta.url));

let https: HttpsServer;
let picky: NetServer;
let pickyPort = 0;
const clientHellos: number[] = [];

const listen = (server: NetServer | HttpsServer) =>
  new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const a = server.address();
      resolve(typeof a === 'object' && a ? a.port : 0);
    }),
  );

beforeAll(async () => {
  https = createHttpsServer(
    { cert: fixture('valid.chain.pem'), key: fixture('valid.key') },
    (_req, res) => res.end('ok'),
  );
  const httpsPort = await listen(https);
  picky = createNetServer((socket) =>
    socket.once('data', (hello: Buffer) => {
      const size = hello.readUInt16BE(3); // TLS record length
      clientHellos.push(size);
      if (size > 1000) return socket.resetAndDestroy();
      const upstream = createConnection(httpsPort, '127.0.0.1', () => {
        upstream.write(hello);
        socket.pipe(upstream).pipe(socket);
      });
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
    }),
  );
  pickyPort = await listen(picky);
});

afterAll(async () => {
  await Promise.all(
    [https, picky].map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
});

describe('safe transport over TLS', () => {
  it('retries once with classic key exchange groups when the server cuts the handshake', async () => {
    clientHellos.length = 0;
    const transport = createUndiciTransport({ ca: [fixture('root.pem')] });
    const res = await transport({
      url: new URL(`https://localhost:${pickyPort}/`),
      address: '127.0.0.1',
      family: 4,
      signal: AbortSignal.timeout(5000),
    });
    res.body?.destroy?.();
    expect(res.status).toBe(200);
    // The first attempt is what a current browser sends; only the retry drops to classic groups.
    expect(clientHellos).toHaveLength(2);
    expect(clientHellos[1]).toBeLessThan(1000);
  });
});
