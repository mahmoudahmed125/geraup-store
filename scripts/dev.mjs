import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { createAuth } from '../lib/auth.js';
import { createCatalogHandler } from '../lib/catalog.js';
import { ApiError } from '../lib/http.js';
import seed from '../assets/catalog.seed.json' with { type: 'json' };

// This local-only adapter never contacts production storage.
await fs.mkdir('.local', { recursive: true });
const password = process.env.GEAR_DEV_PASSWORD || randomBytes(24).toString('base64url');
if (!process.env.GEAR_DEV_PASSWORD) await fs.writeFile('.local/dev-password.txt', password);
const auth = createAuth({ env: { GEAR_ADMIN_PASSWORD: password } });
const file = '.local/catalog.json';
let writing = false;
const store = {
  configured: () => true,
  async read() { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } },
  async write(products, version) {
    if (process.env.GEAR_DEV_FAIL_SAVE === '1') throw new Error('Simulated storage failure');
    if (writing) throw new ApiError(409, 'في عملية حفظ تانية.');
    writing = true;
    try {
      if (((await this.read())?.version ?? null) !== version) throw new ApiError(409, 'في نسخة أحدث. حمّل أحدث نسخة قبل الحفظ.');
      const value = { products, version: randomUUID() };
      await fs.writeFile(file + '.tmp', JSON.stringify(value));
      await fs.rename(file + '.tmp', file);
      return value;
    } finally { writing = false; }
  },
};
const catalog = createCatalogHandler({ store, auth, seed });
const port = Number(process.env.PORT || 4173);
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const request = new Request(url, { method: req.method, headers: req.headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: req, duplex: 'half' }) });
      const handler = url.pathname === '/api/admin' ? auth.handle : url.pathname === '/api/catalog' ? catalog : null;
      const response = handler ? await handler(request) : new Response('Not found', { status: 404 });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
    if (name !== 'index.html' && !/^assets\/[a-zA-Z0-9._-]+$/.test(name)) { res.writeHead(404); res.end('Not found'); return; }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[path.extname(name)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(await fs.readFile(name));
  } catch { res.writeHead(500); res.end('Local server error'); }
}).listen(port, '127.0.0.1', () => console.log(`Local test storefront: http://localhost:${port} — password in .local/dev-password.txt (or GEAR_DEV_PASSWORD).`));
