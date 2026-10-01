import { createAuth } from '../lib/auth.js';
export default { fetch: createAuth().handle };
