/**
 * Foreground static server for dist/, used by the e2e tests. `astro preview` in Astro 7 detaches
 * into a background daemon when there is no terminal, so Playwright could neither wait for it
 * nor stop it, and a stale server kept serving an old build between runs.
 */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT ?? 4321);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function resolve(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [clean, join(clean, 'index.html'), `${clean}.html`]) {
    const file = join(root, candidate);
    if (!file.startsWith(root)) return null;
    try {
      if (statSync(file).isFile()) return file;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

createServer((req, res) => {
  const file = resolve(req.url ?? '/');
  if (!file) return void res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  res.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.warn(`dist served at http://localhost:${port}`));
