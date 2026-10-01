const DRAFT_KEY = 'gear-draft-v2';
let version = null;
let storageReady = false;
let draft = null;
let draftVersion = null;
let dirty = false;
let busy = false;
let imagesPending = 0;
const clone = (value) => JSON.parse(JSON.stringify(value));
const saveMsg = document.getElementById('saveMsg');

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { ...options, cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(30000) });
  } catch {
    throw new Error('تعذر تأكيد الحفظ أو التحميل. المسودة موجودة؛ راجع اتصالك وحاول تاني.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'خدمة الحفظ غير متاحة حاليًا. المسودة لسه على جهازك.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function applyPublished(products) {
  PRODUCTS.splice(0, PRODUCTS.length, ...products);
  if (filter !== 'الكل' && !PRODUCTS.some((p) => p.brand === filter)) filter = 'الكل';
  cart = cart.flatMap((item) => {
    const p = PRODUCTS.find((product) => product.id === item.id);
    return p ? [{ ...p, qty: item.qty }] : [];
  });
  save();
  renderChips(); renderGrid(); renderCart();
  document.getElementById('catalogStatus').textContent = PRODUCTS.length ? '' : 'لسه مفيش منتجات متاحة.';
}

async function loadCatalog() {
  const data = await api('/api/catalog');
  if (!Array.isArray(data.products) || !(data.version === null || typeof data.version === 'string')) throw new Error('تعذر قراءة المنتجات المنشورة.');
  version = data.version;
  storageReady = data.storageReady === true;
  applyPublished(data.products);
}

const initialLoad = loadCatalog().catch(async () => {
  try {
    const response = await fetch('/assets/catalog.seed.json');
    if (!response.ok) throw new Error();
    const seed = await response.json();
    // Keep the visitor's cart until the live catalog can be checked.
    PRODUCTS.splice(0, PRODUCTS.length, ...seed);
    renderChips(); renderGrid(); renderCart();
    document.getElementById('catalogStatus').textContent = 'تعذر تحديث المنتجات حاليًا؛ دي آخر نسخة مرفوعة مع الموقع.';
  } catch {
    document.getElementById('catalogStatus').textContent = 'تعذر تحميل المنتجات. حدّث الصفحة بعد التأكد من الاتصال.';
  }
});

function rememberDraft() {
  dirty = true;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ products: draft, version: draftVersion }));
    saveMsg.textContent = 'مسودة محفوظة على الجهاز. اضغط حفظ ونشر علشان تظهر للزوار.';
  } catch {
    saveMsg.textContent = 'مساحة المتصفح مش كفاية لحفظ المسودة. اضغط حفظ ونشر أو نزّل نسخة قبل إغلاق الصفحة.';
  }
}

function renderEdits() {
  document.getElementById('edits').innerHTML = draft.map((p, i) => `
    <div class="edit">
      ${safeImage(p.img) ? `<img style="height:90px;max-width:100%;object-fit:contain;margin-bottom:8px" src="${escapeHtml(safeImage(p.img))}" alt="${escapeHtml(p.name)}">` : ''}
      <div class="row">
        <label>الاسم<input data-f="name" data-i="${i}" maxlength="200" value="${escapeHtml(p.name)}"></label>
        <label>العربية<input data-f="car" data-i="${i}" maxlength="120" value="${escapeHtml(p.car)}"></label>
      </div>
      <label>السعر<input data-f="price" data-i="${i}" type="number" min="0" max="10000000" step="0.01" value="${escapeHtml(p.price)}"></label>
      <label>صورة جديدة<input data-img="${i}" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <button class="ghost" type="button" data-del="${i}" style="width:100%">حذف من المسودة</button>
    </div>`).join('');
  updateControls();
}

function updateControls() {
  document.getElementById('savePublic').disabled = busy || imagesPending > 0;
  for (const el of document.querySelectorAll('#edits input, #edits button, #addItem, #recoverLegacy, #refreshCatalog, #logout')) el.disabled = busy;
}

async function showDashboard() {
  await initialLoad;
  if (!draft) {
    const saved = readLocal(DRAFT_KEY, null);
    if (saved && Array.isArray(saved.products) && saved.products.every((p) => p && typeof p.id === 'string') && (saved.version === null || typeof saved.version === 'string')) {
      draft = saved.products;
      draftVersion = saved.version;
      dirty = true;
    } else {
      draft = clone(PRODUCTS);
      draftVersion = version;
    }
  }
  document.getElementById('pinForm').hidden = true;
  document.getElementById('dash').hidden = false;
  document.getElementById('recoverLegacy').hidden = !Array.isArray(readLocal('gear-catalog', null));
  saveMsg.textContent = !storageReady ? 'الحفظ على الموقع محتاج تفعيل التخزين من الاستضافة. تقدر تجهّز مسودة وتنزّل نسخة منها.' : dirty ? 'عندك مسودة لم يتم نشرها. راجعها واضغط حفظ ونشر.' : 'عدّل المنتجات، وبعدها اضغط حفظ ونشر علشان تظهر لكل الزوار.';
  renderEdits();
}

function openAdmin(on) { document.getElementById('admin').classList.toggle('open', on); }
document.getElementById('openAdmin').onclick = async () => {
  openAdmin(true);
  document.getElementById('pinForm').hidden = false;
  document.getElementById('dash').hidden = true;
  document.getElementById('pinErr').textContent = '';
  try { await api('/api/admin'); await showDashboard(); }
  catch (error) { if (error.status !== 401) document.getElementById('pinErr').textContent = error.message; }
};
document.getElementById('closeAdmin').onclick = () => openAdmin(false);
document.getElementById('closeDash').onclick = () => openAdmin(false);
document.getElementById('pinForm').onsubmit = async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  const input = document.getElementById('pinInput');
  button.disabled = true;
  try {
    await api('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: input.value }) });
    input.value = '';
    await showDashboard();
  } catch (error) { document.getElementById('pinErr').textContent = error.message; }
  finally { button.disabled = false; }
};
document.getElementById('logout').onclick = async () => {
  try {
    await api('/api/admin', { method: 'DELETE' });
    document.getElementById('pinForm').hidden = false;
    document.getElementById('dash').hidden = true;
    document.getElementById('pinErr').textContent = 'تم تسجيل الخروج.';
  } catch (error) { saveMsg.textContent = error.message; }
};

document.getElementById('edits').oninput = (event) => {
  const field = event.target.closest('[data-f]');
  if (!field || busy) return;
  const p = draft[Number(field.dataset.i)];
  if (field.dataset.f === 'price') p.price = field.value === '' ? null : Number(field.value);
  else p[field.dataset.f] = field.value;
  if (field.dataset.f === 'car') p.brand = p.car.trim().split(' ')[0] || 'متعدد';
  rememberDraft();
};
document.getElementById('edits').onclick = (event) => {
  const button = event.target.closest('[data-del]');
  if (!button || busy) return;
  draft.splice(Number(button.dataset.del), 1);
  rememberDraft(); renderEdits();
};

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) return reject(new Error('اختار صورة JPG أو PNG أو WebP أصغر من ١٥ ميجابايت.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 640 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', .6);
        if (data.length > 600000) throw new Error('الصورة كبيرة. اختار صورة أصغر.');
        resolve(data);
      } catch (error) { reject(error); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('الصورة مش قابلة للقراءة. اختار صورة تانية.')); };
    img.src = url;
  });
}
document.getElementById('edits').onchange = async (event) => {
  const field = event.target.closest('[data-img]');
  if (!field?.files[0] || busy) return;
  const product = draft[Number(field.dataset.img)];
  imagesPending++;
  updateControls();
  saveMsg.textContent = 'جاري تجهيز الصورة…';
  try {
    product.img = await resizeImage(field.files[0]);
    rememberDraft(); renderEdits();
  } catch (error) { saveMsg.textContent = error.message; }
  finally { imagesPending--; updateControls(); }
};
document.getElementById('addItem').onclick = () => {
  if (draft.length >= 200) { saveMsg.textContent = 'وصلت للحد الأقصى: ٢٠٠ منتج.'; return; }
  draft.push({ id: 'p-' + crypto.randomUUID(), name: 'منتج جديد', car: 'BMW', brand: 'BMW', price: 0, img: '' });
  rememberDraft(); renderEdits();
  document.querySelector('#edits .edit:last-child input')?.focus();
};
document.getElementById('recoverLegacy').onclick = () => {
  const old = readLocal('gear-catalog', null);
  if (!Array.isArray(old) || !old.every((p) => p && typeof p.id === 'string')) { saveMsg.textContent = 'ملف المنتجات القديمة غير صالح.'; return; }
  if (dirty && !confirm('استبدال المسودة الحالية بمنتجات الجهاز القديمة؟ نزّل نسخة من المسودة لو محتاجها.')) return;
  draft = clone(old);
  draftVersion = version;
  rememberDraft(); renderEdits();
};
document.getElementById('exportDraft').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'gear-products-backup.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.getElementById('refreshCatalog').onclick = async () => {
  if (dirty && !confirm('تحميل أحدث نسخة بدل المسودة؟ نزّل نسخة من المسودة أولًا لو محتاج تحتفظ بتعديلاتك.')) return;
  busy = true; updateControls();
  try {
    await loadCatalog();
    draft = clone(PRODUCTS); draftVersion = version; dirty = false;
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    renderEdits();
    saveMsg.textContent = 'تم تحميل أحدث نسخة منشورة.';
  } catch (error) { saveMsg.textContent = error.message; }
  finally { busy = false; updateControls(); }
};
document.getElementById('savePublic').onclick = async () => {
  if (busy || imagesPending) return;
  rememberDraft();
  const body = JSON.stringify({ products: draft, version: draftVersion });
  if (new Blob([body]).size > 3 * 1024 * 1024) { saveMsg.textContent = 'حجم المنتجات والصور كبير. قلّل الصور قبل النشر؛ مسودتك موجودة.'; return; }
  busy = true; updateControls();
  saveMsg.textContent = 'جاري حفظ المنتجات والصور على الموقع…';
  try {
    const data = await api('/api/catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
    if (!Array.isArray(data.products) || typeof data.version !== 'string' || !data.version || !data.storageReady) throw new Error('تعذر تأكيد الحفظ. المسودة موجودة؛ جرّب تحميل أحدث نسخة.');
    version = data.version; draftVersion = data.version; storageReady = true;
    draft = clone(data.products); dirty = false;
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    applyPublished(data.products); renderEdits();
    saveMsg.textContent = 'اتحفظت المنتجات والصور على الموقع. الزوار هيشوفوها عند فتح الصفحة أو تحديثها.';
    toast('تم الحفظ والنشر');
  } catch (error) {
    saveMsg.textContent = error.message;
    if (error.status === 401) {
      document.getElementById('dash').hidden = true;
      document.getElementById('pinForm').hidden = false;
      document.getElementById('pinErr').textContent = error.message;
    }
  } finally { busy = false; updateControls(); }
};
renderCart();
