import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError, checkOrigin, failure, json, readJson } from './http.js';

const COOKIE = 'gear-admin';
const TTL = 8 * 60 * 60;
const hash = (value) => createHash('sha256').update(value).digest();

export function createAuth({ env = process.env, now = Date.now } = {}) {
  function password() {
    const value = env.GEAR_ADMIN_PASSWORD;
    if (typeof value !== 'string' || value.length < 16) {
      throw new ApiError(503, 'لوحة التحكم محتاجة تفعيل من إعدادات الاستضافة.');
    }
    return value;
  }
  const sign = (value) => createHmac('sha256', password()).update('gear-session:' + value).digest('base64url');
  function valid(request) {
    password();
    const cookie = request.headers.get('cookie') || '';
    const token = cookie.split(';').map((x) => x.trim()).find((x) => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
    const [expiry, nonce, signature, extra] = token.split('.');
    if (extra || !/^\d+$/.test(expiry || '') || !/^[a-f0-9]{32}$/.test(nonce || '') || !/^[A-Za-z0-9_-]{43}$/.test(signature || '')) return false;
    const seconds = Math.floor(now() / 1000);
    if (Number(expiry) <= seconds || Number(expiry) > seconds + TTL) return false;
    return timingSafeEqual(Buffer.from(signature), Buffer.from(sign(expiry + '.' + nonce)));
  }
  function requireAdmin(request) {
    if (!valid(request)) throw new ApiError(401, 'جلسة الدخول انتهت. ادخل تاني؛ المسودة محفوظة.');
  }
  function cookie(request, value, maxAge) {
    return `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
  }
  async function handle(request) {
    try {
      if (request.method === 'GET') {
        requireAdmin(request);
        return json({ authenticated: true });
      }
      if (!['POST', 'DELETE'].includes(request.method)) return json({ error: 'طريقة غير مدعومة.' }, 405, { Allow: 'GET, POST, DELETE' });
      checkOrigin(request);
      if (request.method === 'DELETE') return json({ authenticated: false }, 200, { 'Set-Cookie': cookie(request, '', 0) });
      const input = await readJson(request, 4096);
      const expected = password();
      if (typeof input?.password !== 'string' || !timingSafeEqual(hash(input.password), hash(expected))) {
        throw new ApiError(401, 'كلمة المرور غير صحيحة.');
      }
      const payload = `${Math.floor(now() / 1000) + TTL}.${randomBytes(16).toString('hex')}`;
      return json({ authenticated: true }, 200, { 'Set-Cookie': cookie(request, payload + '.' + sign(payload), TTL) });
    } catch (error) { return failure(error); }
  }
  return { handle, requireAdmin };
}
