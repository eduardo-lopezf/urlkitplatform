/**
 * TLS connector against local servers that present each test certificate (002/T050). The test
 * CA is passed as the trust store; everything else is the production code path.
 */
import { readFileSync } from 'node:fs';
import { createServer as createNetServer, type Server as NetServer, type Socket } from 'node:net';
import { createServer as createTlsServer, type Server as TlsServer } from 'node:tls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TlsObservation } from '@urlkit/core';
import { createProbeTls } from '../../src/probes/tls/connect.ts';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/tls/${name}`, import.meta.url));
const ROOT = fixture('root.pem');

const NAMES = [
  'valid',
  'expired',
  'not-yet-valid',
  'other-name',
  'no-intermediate',
  'self-signed',
  'sct',
] as const;
type Name = (typeof NAMES)[number];

const servers = new Map<Name, { server: TlsServer; port: number }>();
const received: Buffer[] = [];
let closedSockets = 0;
let silent: NetServer;
let silentPort = 0;
let plain: NetServer;
let plainPort = 0;
let refusedPort = 0;
const held: Socket[] = [];

const listen = (server: NetServer | TlsServer) =>
  new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const a = server.address();
      resolve(typeof a === 'object' && a ? a.port : 0);
    }),
  );

beforeAll(async () => {
  for (const name of NAMES) {
    const server = createTlsServer(
      { cert: fixture(`${name}.chain.pem`), key: fixture(`${name}.key`) },
      (socket) => socket.on('data', (chunk: Buffer) => received.push(chunk)),
    );
    // Counted on the TCP connection: with TLS 1.3 the client may close before the server
    // emits secureConnection.
    server.on('connection', (socket: Socket) => socket.on('close', () => closedSockets++));
    servers.set(name, { server, port: await listen(server) });
  }
  silent = createNetServer((socket) => held.push(socket)); // accepts, never answers
  silentPort = await listen(silent);
  plain = createNetServer((socket) =>
    socket.once('data', () => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')),
  );
  plainPort = await listen(plain);
  const closed = createNetServer();
  refusedPort = await listen(closed);
  await new Promise<void>((resolve) => closed.close(() => resolve()));
});

afterAll(async () => {
  for (const socket of held) socket.destroy();
  await Promise.all(
    [...[...servers.values()].map((s) => s.server), silent, plain].map(
      (s) => new Promise<void>((resolve) => s.close(() => resolve())),
    ),
  );
});

const relaxed = {
  resolve: async (host: string) => (host === 'localhost' ? ['127.0.0.1'] : []),
  policy: { allowedPorts: null, isBlocked: () => false },
  ca: [ROOT],
  now: () => new Date('2026-11-11T12:00:00Z'),
};

async function handshake(name: Name): Promise<TlsObservation> {
  const port = servers.get(name)?.port ?? 0;
  const result = await createProbeTls(relaxed)({ host: 'localhost', port, sni: true });
  if (result.kind !== 'handshake') throw new Error(`${name}: ${result.kind} ${result.code}`);
  return result;
}

describe('TLS connector', () => {
  it('describes a valid chain from leaf to root', async () => {
    const o = await handshake('valid');
    expect(o).toMatchObject({
      observedAt: '2026-11-11T12:00:00.000Z',
      host: 'localhost',
      sniSent: true,
      authorized: true,
      authorizationError: null,
      hostMatches: true,
    });
    expect(o.protocol).toMatch(/^TLSv1\.[23]$/);
    expect(o.chain.map((c) => c.subject)).toEqual([
      'CN=valid',
      'CN=URLkit Test Intermediate',
      'CN=URLkit Test Root',
    ]);
    expect(o.chain[0]).toMatchObject({
      issuer: 'CN=URLkit Test Intermediate',
      subjectAltNames: ['DNS:localhost', 'IP Address:127.0.0.1'],
      signatureAlgorithm: 'ecdsa-with-SHA256',
      isCa: false,
      selfIssued: false,
    });
    expect(o.chain[2]).toMatchObject({ isCa: true, selfIssued: true });
  });

  it.each([
    ['expired', 'CERT_HAS_EXPIRED'],
    ['not-yet-valid', 'CERT_NOT_YET_VALID'],
    ['self-signed', 'DEPTH_ZERO_SELF_SIGNED_CERT'],
    ['no-intermediate', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'],
  ] as const)('completes the handshake for %s and reports %s', async (name, code) => {
    const o = await handshake(name);
    expect(o).toMatchObject({ authorized: false, authorizationError: code });
    expect(o.chain.length).toBeGreaterThan(0);
  });

  it('reports a name mismatch without mixing it with the chain verification', async () => {
    const o = await handshake('other-name');
    expect(o).toMatchObject({ authorized: true, hostMatches: false });
  });

  it('reads embedded SCTs from the leaf', async () => {
    expect((await handshake('sct')).chain[0]?.sct).toEqual({ status: 'embedded', count: 1 });
    expect((await handshake('valid')).chain[0]?.sct).toEqual({ status: 'absent', count: 0 });
  });

  it('writes no application data and closes the connection', async () => {
    received.length = 0;
    const before = closedSockets;
    await handshake('valid');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(Buffer.concat(received).length).toBe(0);
    expect(closedSockets).toBeGreaterThan(before);
  });

  it('times out, detects a port without TLS and a refused connection', async () => {
    const probe = createProbeTls({ ...relaxed, timeoutMs: 200 });
    expect(await probe({ host: 'localhost', port: silentPort, sni: true })).toEqual({
      kind: 'error',
      code: 'tls.timeout',
    });
    expect(await probe({ host: 'localhost', port: plainPort, sni: true })).toEqual({
      kind: 'error',
      code: 'tls.no-tls',
    });
    expect(await probe({ host: 'localhost', port: refusedPort, sni: true })).toEqual({
      kind: 'error',
      code: 'tls.refused',
    });
  });

  it('blocks localhost with the default policy, before connecting', async () => {
    received.length = 0;
    const before = closedSockets;
    const port = servers.get('valid')?.port ?? 0;
    const result = await createProbeTls({ resolve: relaxed.resolve })({
      host: 'localhost',
      port,
      sni: true,
    });
    expect(result).toMatchObject({ kind: 'blocked' });
    expect(closedSockets).toBe(before);
  });
});
