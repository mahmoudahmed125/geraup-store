import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from '../lib/auth.js';
import { createCatalogHandler, validateProducts } from '../lib/catalog.js';
import { ApiError } from '../lib/http.js';

const origin = 'https://store.example';
const password = 'test-password-only-very-long';
const product = { id: 'new-part', name: 'قطعة جديدة', car: 'BMW', brand: 'BMW', price: 1250, img: 'data:image/png;base64,aGVsbG8=' };
function setup({ configured = true, fail = false, env = { GEAR_ADMIN_PASSWORD: password } } = {}) {
  let state = null;
  let serial = 0;
  let clock = Date.now();
  const auth = createAuth({ env, now: () => clock });
  const store = {
    configured: () => configured,
    read: async () => state,
    write: async (products, version) => {
      if (fail) throw new Error('storage unavailable');
      if ((state?.version ?? null) !== version) throw new ApiError(409, 'conflict');
      state = { products: structuredClone(products), version: 'v' + ++serial };
      return state;
    },
  };
  const handler = createCatalogHandler({ store, auth, seed: [product] });
  const request = (path, method = 'GET', body, cookie, requestOrigin = origin) => new Request(origin + path, {
    method, headers: { origin: requestOrigin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  async function login() {
    const response = await auth.handle(request('/api/admin', 'POST', { password }));
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }
  return { handler, auth, store, request, login, expire: () => { clock += 9 * 60 * 60 * 1000; } };
}

test('a saved new product and image are read by an anonymous visitor and a new handler instance', async () => {
  const app = setup();
  const cookie = await app.login();
  const result = await app.handler(app.request('/api/catalog', 'PUT', { products: [product], version: null }, cookie));
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.version, 'v1');
  const freshInstance = createCatalogHandler({ store: app.store, auth: app.auth, seed: [] });
  const visitor = await freshInstance(app.request('/api/catalog'));
  assert.deepEqual((await visitor.json()).products, [product]);
  assert.equal(visitor.headers.get('cache-control'), 'no-store');
});
test('unauthenticated and cross-origin writes are rejected without changing the catalog', async () => {
  const app = setup();
  assert.equal((await app.handler(app.request('/api/catalog', 'PUT', { products: [], version: null }))).status, 401);
  const cookie = await app.login();
  assert.equal((await app.handler(app.request('/api/catalog', 'PUT', { products: [], version: null }, cookie, 'https://attacker.example'))).status, 403);
  assert.equal(await app.store.read(), null);
});
test('storage outages return failure, never a successful save', async () => {
  const app = setup({ fail: true });
  const response = await app.handler(app.request('/api/catalog', 'PUT', { products: [product], version: null }, await app.login()));
  assert.equal(response.status, 503);
  assert.ok((await response.json()).error);
  assert.equal(await app.store.read(), null);
});
test('unconfigured storage serves the original catalog and rejects publishing', async () => {
  const app = setup({ configured: false });
  const result = await app.handler(app.request('/api/catalog'));
  assert.equal((await result.json()).storageReady, false);
  assert.equal((await app.handler(app.request('/api/catalog', 'PUT', { products: [], version: null }, await app.login()))).status, 503);
});
test('stale devices cannot overwrite a newer save, including first-save races', async () => {
  const app = setup();
  const cookie = await app.login();
  const save = (products, version) => app.handler(app.request('/api/catalog', 'PUT', { products, version }, cookie));
  assert.equal((await save([product], null)).status, 200);
  assert.equal((await save([], null)).status, 409);
  assert.equal((await save([{ ...product, price: 2000 }], 'v1')).status, 200);
  assert.equal((await save([], 'v1')).status, 409);
  assert.equal((await app.store.read()).products[0].price, 2000);
});
test('an intentionally empty catalog remains empty for new visitors', async () => {
  const app = setup();
  assert.equal((await app.handler(app.request('/api/catalog', 'PUT', { products: [], version: null }, await app.login()))).status, 200);
  assert.deepEqual((await (await app.handler(app.request('/api/catalog'))).json()).products, []);
});
test('invalid products and active image content cannot be published', () => {
  for (const products of [[{ ...product, price: -1 }], [{ ...product, img: 'javascript:alert(1)' }], [{ ...product, img: 'data:image/svg+xml,<svg onload=alert(1)>' }], [product, product], [{ ...product, name: '' }], [{ ...product, price: null }]]) {
    assert.throws(() => validateProducts(products), ApiError);
  }
  assert.equal(validateProducts([{ ...product, name: '<img onerror=alert(1)>' }])[0].name, '<img onerror=alert(1)>');
});
test('oversized bodies are rejected before a write', async () => {
  const app = setup();
  const response = await app.handler(app.request('/api/catalog', 'PUT', { version: null, products: [], padding: 'x'.repeat(3 * 1024 * 1024) }, await app.login()));
  assert.equal(response.status, 413);
  assert.equal(await app.store.read(), null);
});
test('wrong passwords, tampered cookies, expired sessions and missing setup fail closed', async () => {
  const app = setup();
  assert.equal((await app.auth.handle(app.request('/api/admin', 'POST', { password: 'bad' }))).status, 401);
  const cookie = await app.login();
  assert.equal((await app.auth.handle(app.request('/api/admin', 'GET', undefined, cookie))).status, 200);
  assert.equal((await app.auth.handle(app.request('/api/admin', 'GET', undefined, cookie + 'x'))).status, 401);
  app.expire();
  assert.equal((await app.auth.handle(app.request('/api/admin', 'GET', undefined, cookie))).status, 401);
  const unset = setup({ env: {} });
  assert.equal((await unset.auth.handle(unset.request('/api/admin', 'POST', { password }))).status, 503);
});
test('login uses a secure HttpOnly cookie and logout expires it', async () => {
  const app = setup();
  const response = await app.auth.handle(app.request('/api/admin', 'POST', { password }));
  const cookie = response.headers.get('set-cookie');
  for (const flag of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/api']) assert.ok(cookie.includes(flag));
  const logout = await app.auth.handle(app.request('/api/admin', 'DELETE'));
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});
