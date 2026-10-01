import test from 'node:test';
import assert from 'node:assert/strict';
import { BlobPreconditionFailedError } from '@vercel/blob';
import { createBlobStore } from '../lib/blob-store.js';

test('private catalog reads bypass the CDN cache and return the storage version', async () => {
  const store = createBlobStore({ read: async (path, options) => {
    assert.equal(path, 'gear/catalog.json');
    assert.deepEqual(options, { access: 'private', useCache: false });
    return { statusCode: 200, stream: new Response('[]').body, blob: { etag: 'etag-1' } };
  } });
  assert.deepEqual(await store.read(), { products: [], version: 'etag-1' });
});
test('first save refuses overwrites and subsequent saves use the exact storage ETag', async () => {
  let calls = [];
  const store = createBlobStore({ write: async (path, content, options) => {
    calls.push(options);
    assert.equal(path, 'gear/catalog.json');
    assert.equal(content, '[]');
    return { etag: 'etag-2' };
  } });
  assert.equal((await store.write([], null)).version, 'etag-2');
  await store.write([], 'etag-1');
  assert.equal(calls[0].allowOverwrite, false);
  assert.equal(calls[0].access, 'private');
  assert.equal(calls[0].addRandomSuffix, false);
  assert.equal(calls[1].ifMatch, 'etag-1');
  assert.equal(calls[1].allowOverwrite, true);
});
test('both SDK precondition errors and first-save collisions become recoverable conflicts', async () => {
  const stale = createBlobStore({ write: async () => { throw new BlobPreconditionFailedError(); } });
  await assert.rejects(stale.write([], 'old'), (e) => e.status === 409);
  const collision = createBlobStore({
    write: async () => { throw new Error('Blob already exists'); },
    read: async () => ({ statusCode: 200, stream: new Response('[]').body, blob: { etag: 'new' } }),
  });
  await assert.rejects(collision.write([], null), (e) => e.status === 409);
});
test('a missing write acknowledgement cannot report success', async () => {
  const store = createBlobStore({ write: async () => ({}), read: async () => null });
  await assert.rejects(store.write([], null), /Missing catalog version/);
});
