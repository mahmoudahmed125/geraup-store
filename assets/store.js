
const WA = "201119592645";
const PRODUCTS = [];
const money = (n) => new Intl.NumberFormat("ar-EG").format(n) + " ج.م";

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function safeImage(value) { return typeof value === 'string' && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) || /^https:\/\/[^\s]+$/.test(value)) ? value : ''; }
let cart = readLocal('gear-cart', []);
if (!Array.isArray(cart)) cart = [];
cart = cart.filter((p) => p && typeof p.id === 'string' && Number.isFinite(p.price) && p.price >= 0 && Number.isInteger(p.qty) && p.qty > 0 && p.qty <= 999).slice(0, 200);
function toast(message) {
  const box = document.getElementById('toast');
  box.textContent = message;
  box.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { box.style.display = 'none'; }, 2600);
}

let filter = "الكل";
const side = document.getElementById("side");
function save() { try { localStorage.setItem('gear-cart', JSON.stringify(cart)); } catch { toast('المتصفح مش قادر يحتفظ بالسلة بعد إغلاق الصفحة.'); } }
function count() { return cart.reduce((s, i) => s + i.qty, 0); }
function sum() { return cart.reduce((s, i) => s + i.qty * i.price, 0); }
function renderChips() {
  const brands = ["الكل", ...new Set(PRODUCTS.map((p) => p.brand))];
  document.getElementById("chips").innerHTML = brands.map((b) =>
    `<button class="chip ${b === filter ? "on" : ""}" type="button" data-brand="${escapeHtml(b)}">${escapeHtml(b)}</button>`
  ).join("");
}
function shot(p) {
  if (p.img) return `<img src="${escapeHtml(safeImage(p.img))}" alt="${escapeHtml(p.name)} ${escapeHtml(p.car)}">`;
  return `<div class="plate"><div><b>${escapeHtml(p.car)}</b><span>${escapeHtml(p.name)}</span></div></div>`;
}
function renderGrid() {
  const list = PRODUCTS.filter((p) => filter === "الكل" || p.brand === filter);
  document.getElementById("grid").innerHTML = list.map((p) => `
    <article class="card">
      <div class="shot">${shot(p)}</div>
      <div class="body">
        <p class="car">${escapeHtml(p.car)}</p>
        <h2>${escapeHtml(p.name)}</h2>
        <p class="price">${money(p.price)}</p>
        <button class="add" type="button" data-add="${escapeHtml(p.id)}">أضف للسلة</button>
      </div>
    </article>`).join("");
}
function renderCart() {
  document.getElementById("count").textContent = count();
  document.getElementById("total").textContent = money(sum());
  const box = document.getElementById("lines");
  if (!cart.length) { box.innerHTML = `<p class="empty">لسه مفيش قطع. ضيف من المتجر.</p>`; return; }
  box.innerHTML = cart.map((item) => `
    <div class="line">
      ${item.img ? `<img class="thumb" src="${escapeHtml(safeImage(item.img))}" alt="">` : `<div class="thumb"></div>`}
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="car">${escapeHtml(item.car)}</div>
        <div class="qty">
          <button type="button" data-dec="${escapeHtml(item.id)}">−</button>
          <span>${item.qty}</span>
          <button type="button" data-inc="${escapeHtml(item.id)}">+</button>
        </div>
      </div>
    </div>`).join("");
}
function add(id) {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) return;
  const row = cart.find((x) => x.id === id);
  if (row) row.qty += 1;
  else cart.push({ id: p.id, name: p.name, car: p.car, price: p.price, img: p.img || "", qty: 1 });
  save(); renderCart();
  toast("اتضافت للسلة");
}
function setQty(id, delta) {
  const row = cart.find((x) => x.id === id);
  if (!row) return;
  row.qty += delta;
  if (row.qty < 1) cart = cart.filter((x) => x.id !== id);
  save(); renderCart();
}
document.getElementById("chips").onclick = (e) => {
  const b = e.target.closest("[data-brand]");
  if (!b) return;
  filter = b.dataset.brand;
  renderChips(); renderGrid();
};
document.getElementById("grid").onclick = (e) => {
  const b = e.target.closest("[data-add]");
  if (b) add(b.dataset.add);
};
document.getElementById("lines").onclick = (e) => {
  const inc = e.target.closest("[data-inc]");
  const dec = e.target.closest("[data-dec]");
  if (inc) setQty(inc.dataset.inc, 1);
  if (dec) setQty(dec.dataset.dec, -1);
};
side.querySelector(".side-head").onclick = (e) => {
  if (e.target.closest("#closeSide")) { side.classList.remove("open"); return; }
  if (matchMedia("(max-width: 799px)").matches) side.classList.add("open");
};
document.getElementById("closeSide").onclick = (e) => { e.stopPropagation(); side.classList.remove("open"); };
document.getElementById("toCheckout").onclick = () => {
  if (!cart.length) {
    toast("السلة فاضية");
    return;
  }
  document.getElementById("summary").textContent = count() + " قطع — " + money(sum());
  document.getElementById("err").textContent = "";
  document.getElementById("sheet").classList.add("open");
};
document.getElementById("cancelPay").onclick = () => document.getElementById("sheet").classList.remove("open");
document.getElementById("sheet").onclick = (e) => { if (e.target.id === "sheet") e.currentTarget.classList.remove("open"); };
document.getElementById("pay").onsubmit = (e) => {
  e.preventDefault();
  const err = document.getElementById("err");
  const fd = new FormData(e.target);
  const name = String(fd.get("name") || "").trim();
  const phone = String(fd.get("phone") || "").trim();
  const address = String(fd.get("address") || "").trim();
  if (name.length < 2) { err.textContent = "اكتب الاسم"; return; }
  if (phone.replace(/\D/g, "").length < 8) { err.textContent = "رقم الهاتف غير مكتمل"; return; }
  if (address.length < 4) { err.textContent = "اكتب العنوان"; return; }
  const lines = cart.map((i) => `- ${i.name} ${i.car} × ${i.qty} = ${i.price * i.qty}`).join("\n");
  const text = `طلب Gear Up\nالاسم: ${name}\nالهاتف: ${phone}\nالعنوان: ${address}\n${lines}\nالإجمالي: ${sum()} ج.م`;
  location.href = "https://wa.me/" + WA + "?text=" + encodeURIComponent(text);
};
