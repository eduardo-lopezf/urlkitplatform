/**
 * The published package works on its own (004/T019, SC-007): `pnpm pack` (which compiles to dist
 * and applies publishConfig), install the tarball in an empty directory outside the repository,
 * and make one call from there against a minimal HTTP server. The package has no dependencies, so
 * installing the tarball needs no network.
 */
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { skipUnless } from './requires.ts';

const SDK = fileURLToPath(new URL('..', import.meta.url));
const hasNpm = spawnSync('npm', ['--version']).status === 0;

describe.skipIf(skipUnless(hasNpm, 'npm'))('published package (004, SC-007)', () => {
  let dir: string;
  let server: Server;
  let port = 0;
  const seen: Array<{ url: string; authorization: string | undefined }> = [];

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'urlkit-sdk-'));
    server = createServer((req, res) => {
      seen.push({ url: req.url ?? '', authorization: req.headers.authorization });
      res.writeHead(200, {
        'content-type': 'application/json',
        'RateLimit-Limit': '600',
        'RateLimit-Remaining': '599',
        'RateLimit-Reset': '60',
      });
      res.end(JSON.stringify({ output: 'https://ejemplo.com/?id=1' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  it('installs outside the monorepo and makes a typed call', async () => {
    execFileSync('pnpm', ['pack', '--pack-destination', dir], { cwd: SDK, stdio: 'pipe' });
    const tarball = readdirSync(dir).find((f) => f.endsWith('.tgz'));
    expect(tarball).toBeDefined();
    const project = join(dir, 'project');
    execFileSync('mkdir', [project]);
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'probe', type: 'module' }));
    execFileSync('npm', ['install', '--no-audit', '--no-fund', join(dir, tarball ?? '')], {
      cwd: project,
      stdio: 'pipe',
    });
    writeFileSync(
      join(project, 'probe.mjs'),
      `import { createClient, CONTRACT_VERSION } from '@urlkit/sdk';
const urlkit = createClient({ apiKey: 'uk_abcdefghjkmn_${'S'.repeat(43)}', baseUrl: process.argv[2] });
const res = await urlkit.cleanUrl({ url: 'https://ejemplo.com/?utm_source=x&id=1' });
console.log(JSON.stringify({ output: res.data.output, remaining: res.rateLimit.remaining, contract: CONTRACT_VERSION }));`,
    );
    // Asynchronous: the HTTP server lives in this process and must keep answering.
    const { stdout } = await promisify(execFile)(
      'node',
      ['probe.mjs', `http://127.0.0.1:${port}/v1`],
      {
        cwd: project,
        encoding: 'utf8',
      },
    );
    expect(JSON.parse(stdout)).toMatchObject({
      output: 'https://ejemplo.com/?id=1',
      remaining: 599,
    });
    expect(seen).toEqual([
      { url: '/v1/clean', authorization: `Bearer uk_abcdefghjkmn_${'S'.repeat(43)}` },
    ]);
    // Only the compiled package travels: no TypeScript sources, tests or generator.
    const installed = readdirSync(join(project, 'node_modules', '@urlkit', 'sdk'));
    expect(installed.sort()).toEqual(['LICENSE', 'README.md', 'dist', 'package.json']);
  });
});
