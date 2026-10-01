import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
import { ApiError } from './http.js';

const PATH = 'gear/catalog.json';
export function createBlobStore({ read = get, write = put, env = process.env } = {}) { return {
  configured() {
    return Boolean(env.BLOB_READ_WRITE_TOKEN || (env.BLOB_STORE_ID && env.VERCEL_OIDC_TOKEN));
  },
  async read() {
    const result = await read(PATH, { access: 'private', useCache: false });
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream) throw new Error('Unexpected catalog response');
    const products = await new Response(result.stream).json();
    if (!Array.isArray(products)) throw new Error('Invalid stored catalog');
    return { products, version: result.blob.etag };
  },
  async write(products, version) {
    try {
      const saved = await write(PATH, JSON.stringify(products), {
        access: 'private', contentType: 'application/json',
        addRandomSuffix: false, allowOverwrite: version !== null,
        ...(version !== null ? { ifMatch: version } : {}),
      });
      if (!saved.etag) throw new Error('Missing catalog version');
      return { version: saved.etag };
    } catch (error) {
      let changed = error instanceof BlobPreconditionFailedError;
      if (!changed) {
        // The SDK reports a create collision as a generic error. Re-read without
        // caching to distinguish it from an outage; never overwrite on retry.
        try { changed = ((await this.read())?.version ?? null) !== version; } catch {}
      }
      if (changed) {
        throw new ApiError(409, 'في نسخة أحدث اتحفظت من جهاز تاني. نزّل مسودتك احتياطي وراجع أحدث نسخة قبل الحفظ.');
      }
      throw error;
    }
  },
}; }
export const blobStore = createBlobStore();
