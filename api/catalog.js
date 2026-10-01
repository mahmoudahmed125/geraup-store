import seed from '../assets/catalog.seed.json' with { type: 'json' };
import { createAuth } from '../lib/auth.js';
import { blobStore } from '../lib/blob-store.js';
import { createCatalogHandler } from '../lib/catalog.js';
export default { fetch: createCatalogHandler({ store: blobStore, auth: createAuth(), seed }) };
