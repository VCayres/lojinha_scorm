'use strict';
// Catálogo e preços preservados de VCayres/lojinha-do-ed (06f41fc).
const productsSeed = [
  { id: 1, name: 'Bola',  price: 40.00, img: 'assets/1.png'  },
  { id: 2, name: 'Boné',price: 20.00, img: 'assets/2.png'  },
  { id: 3, name: 'Caderno',   price: 10.00, img: 'assets/3.png'  },
  { id: 4, name: 'Camiseta', price: 80.00, img: 'assets/4.png' },
  { id: 5, name: 'Canetinhas',    price: 10.00,  img: 'assets/5.png' },
  { id: 6, name: 'Carrinho de controle Remoto',     price: 50.00, img: 'assets/6.png' },
  { id: 7, name: 'Celular',     price: 1500.00, img: 'assets/7.png' },
  { id: 8, name: 'Escova de dentes',     price: 15.00, img: 'assets/8.png' },
  { id: 9, name: 'Mochila',     price: 150.00, img: 'assets/9.png' },
  { id: 10, name: 'Pendrive',     price: 50.00, img: 'assets/10.png' },
  { id: 11, name: 'Perfume',     price: 150.00, img: 'assets/11.png' },
  { id: 12, name: 'Pulseira',     price: 40.00, img: 'assets/12.png' },
  { id: 13, name: 'Skate',     price: 120.00, img: 'assets/13.png' },
  { id: 14, name: 'Tênis',     price: 200.00, img: 'assets/14.png' },
  { id: 15, name: 'Ursinho de pelúcia',     price: 60.00, img: 'assets/15.png' },
  { id: 16, name: 'Arroz 5kg',     price: 20.00, img: 'assets/16.png' },
  { id: 17, name: 'Banana',     price: 5.00, img: 'assets/17.png' },
  { id: 18, name: 'Carne',      price: 30.00, img: 'assets/18.png' },
  { id: 19, name: 'Feijão 1Kg',     price: 8.00, img: 'assets/19.png' },
  { id: 20, name: 'Litro de leite',     price: 6.00, img: 'assets/20.png' },
  { id: 21, name: 'Pacote de balas',     price: 7.00, img: 'assets/21.png' },
  { id: 22, name: 'Pão 750 gramas',     price: 10.00, img: 'assets/22.png' },
  { id: 23, name: 'Sorvete',     price: 15.00, img: 'assets/23.png' },
  { id: 24, name: 'Caixa de suco 1l',     price: 6.00, img: 'assets/24.png' },
  { id: 25, name: 'Tomate',     price: 7.00, img: 'assets/25.png' },

];
const PRODUCTS = productsSeed.map(p => ({ ...p, cents: Math.round(p.price * 100) }));
const PRODUCT_BY_ID = new Map(PRODUCTS.map(p => [p.id, p]));
const LOCAL_KEY = 'lojinha-do-ed-scorm-v1';
const MAX_QTY = 99;
const els = {};
let state = { version: 1, cart: [], receipt: null, completed: false };
let memoryOnly = false;

function money(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
function validItems(items) {
  return Array.isArray(items) && items.length <= PRODUCTS.length &&
    items.every(i => Array.isArray(i) && i.length === 2 && PRODUCT_BY_ID.has(i[0]) &&
      Number.isInteger(i[1]) && i[1] > 0 && i[1] <= MAX_QTY) &&
    new Set(items.map(i => i[0])).size === items.length;
}
function restore(raw) {
  if (!raw) return;
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || !validItems(value.cart) || typeof value.completed !== 'boolean') return;
    if (value.receipt !== null && (!value.receipt || !validItems(value.receipt.items) ||
      !value.receipt.items.length || !/^\d{6}$/.test(value.receipt.number) ||
      typeof value.receipt.date !== 'string' || !Number.isFinite(Date.parse(value.receipt.date)))) return;
    // Whitelist persisted fields. Prices and labels always come from the catalog.
    state = {
      version: 1, cart: value.cart.map(i => [...i]), completed: value.completed,
      receipt: value.receipt ? {
        items: value.receipt.items.map(i => [...i]), number: value.receipt.number, date: value.receipt.date
      } : null
    };
  } catch (_) { /* Ignore incompatible or corrupted saved data. */ }
}
function totals(items) {
  const base = items.reduce((sum, [id, qty]) => sum + PRODUCT_BY_ID.get(id).cents * qty, 0);
  const taxes = items.reduce((sum, [id, qty]) => sum + Math.round(PRODUCT_BY_ID.get(id).cents * qty * .20), 0);
  return { base, taxes };
}
function reportConnection() {
  const bridge = window.Scorm;
  els.connectionStatus.dataset.error = String(Boolean(bridge.error));
  els.connectionStatus.textContent = bridge.error || (bridge.connected
    ? 'Conectado ao LMS · progresso registrado neste curso.'
    : memoryOnly ? 'Modo livre · o navegador não permite salvar. O progresso dura apenas nesta aba.'
      : 'Modo livre · progresso salvo apenas neste navegador.');
}
function reportProgress(saved = true) {
  const pending = !saved;
  const completion = state.completed ? 'Atividade concluída.' : state.receipt ? 'Nota gerada. Observe os impostos e conclua a atividade.' : 'Escolha seus produtos para começar.';
  els.activityStatus.textContent = completion + (pending ? ' Salvamento pendente.' : '');
  els.activityStatus.dataset.error = String(pending);
  els.receiptStatus.textContent = state.completed
    ? pending ? 'Você concluiu a atividade, mas o salvamento não foi confirmado.' : 'Atividade concluída. Você pode continuar explorando a loja.'
    : '';
  els.receiptStatus.dataset.error = String(pending);
  els.retrySave.hidden = !pending || !window.Scorm.connected;
  els.completeBtn.disabled = state.completed;
  els.completeBtn.textContent = state.completed ? 'Atividade concluída ✓' : 'Concluir atividade';
  const active = state.completed ? 'step-complete' : state.receipt ? 'step-receipt' : 'step-shop';
  for (const id of ['step-shop', 'step-receipt', 'step-complete']) {
    document.getElementById(id).removeAttribute('aria-current');
  }
  document.getElementById(active).setAttribute('aria-current', 'step');
}
function persist() {
  let saved = false;
  if (window.Scorm.connected) {
    saved = window.Scorm.save(state, state.completed ? 'completed' : state.receipt ? 'receipt' : 'shop', state.completed);
  } else if (!window.Scorm.api) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); saved = true; memoryOnly = false; }
    catch (_) { memoryOnly = true; }
  }
  reportConnection();
  reportProgress(saved);
  return saved;
}
function renderProducts() {
  for (const p of PRODUCTS) {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.innerHTML = `<img class="product-img" src="${p.img}" alt="${p.name}" loading="lazy" width="1500" height="1500">
      <div class="product-info"><h3>${p.name}</h3><div class="price">${money(p.cents)}</div>
      <button type="button" data-id="${p.id}" aria-label="Adicionar ${p.name} ao carrinho">Adicionar ao carrinho</button></div>`;
    card.querySelector('button').addEventListener('click', () => changeQty(p.id, 1));
    els.products.append(card);
  }
}
function changeQty(id, delta) {
  const current = state.cart.find(i => i[0] === id);
  const qty = (current ? current[1] : 0) + delta;
  if (qty > MAX_QTY) {
    els.announcement.textContent = `Limite de ${MAX_QTY} unidades por produto.`;
    return;
  }
  if (qty <= 0) state.cart = state.cart.filter(i => i[0] !== id);
  else if (current) current[1] = qty;
  else state.cart.push([id, qty]);
  // A receipt is a snapshot of a specific cart; a new purchase needs a new receipt.
  state.receipt = null;
  const focused = document.activeElement;
  const containerID = focused.closest('.cart-items')?.id;
  const action = focused.dataset.action;
  refreshUI();
  if (containerID) {
    const container = document.getElementById(containerID);
    const replacement = container.querySelector(`[data-product="${id}"][data-action="${action}"]`) || container.querySelector('button');
    if (replacement) replacement.focus();
    else (containerID === 'cart-items' ? els.cartHeading : els.drawerTitle).focus();
  }
  const count = state.cart.reduce((sum, i) => sum + i[1], 0);
  els.announcement.textContent = `${PRODUCT_BY_ID.get(id).name}: ${Math.max(0, qty)} unidades. Carrinho com ${count} itens, total ${money(totals(state.cart).base)}.`;
  persist();
}
function renderCart(list) {
  list.replaceChildren();
  if (!state.cart.length) {
    const empty = document.createElement('li');
    empty.className = 'cart-empty';
    empty.textContent = 'Seu carrinho está esperando a primeira escolha.';
    list.append(empty);
    return;
  }
  for (const [id, qty] of state.cart) {
    const p = PRODUCT_BY_ID.get(id);
    const li = document.createElement('li');
    li.innerHTML = `<span class="cart-name">${p.name}</span><div class="qty">
      <button class="qty-btn" data-product="${id}" data-action="minus" aria-label="Diminuir quantidade de ${p.name}">−</button>
      <span aria-label="${qty} unidades">${qty}</span>
      <button class="qty-btn" data-product="${id}" data-action="plus" aria-label="Aumentar quantidade de ${p.name}" ${qty >= MAX_QTY ? 'disabled' : ''}>+</button>
      </div><strong>${money(p.cents * qty)}</strong>`;
    li.querySelector('[data-action="minus"]').addEventListener('click', () => changeQty(id, -1));
    li.querySelector('[data-action="plus"]').addEventListener('click', () => changeQty(id, 1));
    list.append(li);
  }
}
function refreshUI() {
  renderCart(els.cartItems);
  renderCart(els.cartItemsMobile);
  const value = money(totals(state.cart).base);
  for (const element of [els.cartTotal, els.drawerTotal, els.mobileTotal]) element.textContent = value;
  els.mobileCount.textContent = state.cart.reduce((sum, i) => sum + i[1], 0);
  for (const button of [els.checkoutBtn, els.mobileCheckout, els.drawerCheckout]) button.disabled = !state.cart.length;
}
function renderReceipt() {
  const receipt = state.receipt;
  if (!receipt) return;
  els.nfNumero.textContent = receipt.number;
  els.nfData.textContent = new Date(receipt.date).toLocaleString('pt-BR');
  els.nfItens.replaceChildren();
  for (const [id, qty] of receipt.items) {
    const p = PRODUCT_BY_ID.get(id);
    const tr = document.createElement('tr');
    for (const text of [p.name, String(qty), money(p.cents), money(Math.round(p.cents * qty * .20)), money(p.cents * qty)]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    els.nfItens.append(tr);
  }
  const t = totals(receipt.items);
  els.nfBase.textContent = money(t.base);
  els.nfImpostos.textContent = money(t.taxes);
  els.nfTotal.textContent = money(t.base);
}
function openReceipt() {
  if (!state.cart.length) return;
  if (els.drawer.open) els.drawer.close();
  if (!state.receipt) state.receipt = {
    items: state.cart.map(i => [...i]),
    number: String(Math.floor(100000 + Math.random() * 900000)), date: new Date().toISOString()
  };
  renderReceipt();
  persist();
  if (!els.receiptModal.open) els.receiptModal.showModal();
}
function completeActivity() {
  if (!state.receipt || !els.receiptModal.open) return;
  state.completed = true;
  persist();
}
function closeOnBackdrop(dialog, event) {
  const bounds = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
}

document.addEventListener('DOMContentLoaded', () => {
  const ids = {
    products: 'products', cartItems: 'cart-items', cartTotal: 'cart-total', checkoutBtn: 'checkout-btn',
    cartHeading: 'cart-heading', mobileCount: 'mobile-cart-count', mobileTotal: 'mobile-cart-total',
    mobileCheckout: 'mobile-checkout-btn', drawer: 'drawer', drawerTitle: 'drawer-title',
    cartItemsMobile: 'cart-items-mobile', drawerTotal: 'drawer-total', drawerCheckout: 'drawer-checkout',
    receiptModal: 'receipt-modal', nfNumero: 'nf-numero', nfData: 'nf-data', nfItens: 'nf-itens',
    nfBase: 'nf-base', nfImpostos: 'nf-impostos', nfTotal: 'nf-total', completeBtn: 'complete-btn',
    connectionStatus: 'connection-status', activityStatus: 'activity-status', receiptStatus: 'receipt-status',
    retrySave: 'retry-save', announcement: 'cart-announcement'
  };
  for (const [key, id] of Object.entries(ids)) els[key] = document.getElementById(id);
  els.cartHeading.tabIndex = -1;
  els.drawerTitle.tabIndex = -1;
  window.Scorm.initialize();
  if (window.Scorm.connected) {
    restore(window.Scorm.get('cmi.suspend_data'));
    // The LMS completion status remains authoritative even if suspend data is unavailable.
    const status = window.Scorm.get('cmi.core.lesson_status');
    if (['completed', 'passed'].includes(status)) state.completed = true;
  } else if (!window.Scorm.api) {
    try { restore(localStorage.getItem(LOCAL_KEY)); } catch (_) { memoryOnly = true; }
  }
  renderProducts();
  refreshUI();
  for (const button of [els.checkoutBtn, els.mobileCheckout, els.drawerCheckout]) button.addEventListener('click', openReceipt);
  document.getElementById('mobile-cart-open').addEventListener('click', () => els.drawer.showModal());
  document.getElementById('drawer-close').addEventListener('click', () => els.drawer.close());
  document.getElementById('nf-close').addEventListener('click', () => els.receiptModal.close());
  document.getElementById('nf-print').addEventListener('click', () => window.print());
  els.completeBtn.addEventListener('click', completeActivity);
  els.retrySave.addEventListener('click', persist);
  for (const dialog of [els.drawer, els.receiptModal]) dialog.addEventListener('click', e => closeOnBackdrop(dialog, e));
  persist();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(); });
  window.addEventListener('pagehide', () => { persist(); window.Scorm.finish(); });
  window.addEventListener('pageshow', e => {
    if (!e.persisted || !window.Scorm.finished) return;
    window.Scorm.finished = false;
    window.Scorm.connected = false;
    window.Scorm.startedAt = Date.now();
    window.Scorm.error = '';
    window.Scorm.initialize();
    persist();
  });
});
