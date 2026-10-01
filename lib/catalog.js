import { ApiError, checkOrigin, failure, json, readJson } from './http.js';

export function validateProducts(products) {
  if (!Array.isArray(products) || products.length > 200) throw new ApiError(400, 'عدد المنتجات غير صحيح؛ الحد الأقصى ٢٠٠ منتج.');
  const ids = new Set();
  return products.map((p) => {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(p.id) || ids.has(p.id)) {
      throw new ApiError(400, 'في منتج بياناته غير صحيحة أو مكرر.');
    }
    ids.add(p.id);
    const clean = { id: p.id };
    for (const [field, max] of [['name', 200], ['car', 120], ['brand', 80]]) {
      if (typeof p[field] !== 'string' || !p[field].trim() || p[field].length > max) throw new ApiError(400, 'اكتب اسم المنتج والعربية بشكل صحيح.');
      clean[field] = p[field].trim();
    }
    if (typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price < 0 || p.price > 10000000) throw new ApiError(400, 'سعر المنتج غير صحيح.');
    clean.price = Math.round(p.price * 100) / 100;
    const image = p.img ?? '';
    if (typeof image !== 'string' || image.length > 600000) throw new ApiError(400, 'صورة المنتج كبيرة؛ ارفع صورة أصغر.');
    if (image && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) {
      let url;
      try { url = new URL(image); } catch {}
      if (!url || url.protocol !== 'https:' || url.username || url.password || image.length > 2048) throw new ApiError(400, 'صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP.');
    }
    clean.img = image;
    return clean;
  });
}

export function createCatalogHandler({ store, auth, seed }) {
  return async function handle(request) {
    try {
      if (request.method === 'GET') {
        if (!store.configured()) return json({ products: seed, version: null, storageReady: false });
        const saved = await store.read();
        return json({ products: saved ? saved.products : seed, version: saved?.version ?? null, storageReady: true });
      }
      if (request.method !== 'PUT') return json({ error: 'طريقة غير مدعومة.' }, 405, { Allow: 'GET, PUT' });
      checkOrigin(request);
      auth.requireAdmin(request);
      if (!store.configured()) throw new ApiError(503, 'الحفظ على الموقع لسه محتاج تفعيل التخزين من الاستضافة. مسودتك محفوظة على الجهاز.');
      const input = await readJson(request);
      if (!input || !(input.version === null || (typeof input.version === 'string' && input.version.length > 0 && input.version.length <= 200))) throw new ApiError(400, 'افتح لوحة التحكم من جديد لتحميل النسخة الحالية.');
      const products = validateProducts(input.products);
      const saved = await store.write(products, input.version);
      return json({ products, version: saved.version, storageReady: true });
    } catch (error) { return failure(error); }
  };
}
