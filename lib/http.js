export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

export function failure(error) {
  return json({ error: error instanceof ApiError ? error.message : 'تعذر الوصول للتخزين. المسودة موجودة عندك؛ جرّب الحفظ تاني.' }, error instanceof ApiError ? error.status : 503);
}

export function checkOrigin(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    throw new ApiError(403, 'افتح لوحة التحكم من نفس رابط المتجر.');
  }
}

export async function readJson(request, limit = 3 * 1024 * 1024) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new ApiError(415, 'صيغة الطلب غير صحيحة.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'الطلب فاضي.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, 'حجم المنتجات والصور كبير. قلّل عدد الصور أو حجمها وجرب تاني.');
    }
    chunks.push(Buffer.from(value));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400, 'بيانات الطلب غير صحيحة.'); }
}
