(function () {
  'use strict';
  const M = window.MasaFlow;
  const I = window.MasaFlowI18n;
  const tr = text => (I ? I.translate(text) : text);
  const localeTag = () => (I?.getLocale() === 'en' ? 'en-US' : 'es-MX');
  // Money in the record's own currency (a legacy USD receipt stays USD) and the viewer's language.
  const moneyFor = (cents, record) => M.money(cents, record?.currency || M.getState().settings.currency);
  const escape = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  // getState() deep-copies everything, so the time zone is tracked from updates instead of read per call.
  let timeZone = 'America/Mexico_City';
  if (M) { timeZone = M.getState().settings.timeZone || timeZone; M.subscribe(state => { timeZone = state.settings.timeZone || timeZone; }); }
  const zone = () => timeZone;
  const formatters = new Map();
  const formatter = (kind, options) => { const locale = kind === 'day' ? 'en-CA' : localeTag(); const key = `${kind}|${timeZone}|${locale}`; if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat(locale, { ...options, timeZone })); return formatters.get(key); };
  const time = at => formatter('time', { hour: 'numeric', minute: '2-digit' }).format(new Date(at));
  // YYYY-MM-DD in the restaurant's time zone, so "today" matches the analytics day.
  const dayKey = at => formatter('day', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
  // Modifiers, removed toppings and the on-the-side request for one order line, in kitchen reading order.
  function lineDetails(line) {
    const parts = (line.options || []).map(option => option.name);
    // Composed per part, because the joined line is too specific for the dictionary to match.
    if (line.removed && line.removed.length) parts.push(tr(`No ${line.removed.join(', ')}`));
    if (line.onTheSide) parts.push(tr('Toppings on the side'));
    return parts;
  }
  // Decides which tickets get the pulsing orange treatment on the order queue.
  // Default: every paid ticket the kitchen has not started yet. `nowMs` is there
  // for rules based on waiting time, for example order.paidAt older than 5 minutes.
  function needsAttention(order, nowMs) {
    return order.status === 'pending';
  }

  function toastHost() {
    let host = document.querySelector('.mf-toast-host');
    if (!host) { host = document.createElement('div'); host.className = 'mf-toast-host'; host.setAttribute('aria-live', 'polite'); document.body.append(host); }
    return host;
  }
  function showToast(note, duration) {
    const host = toastHost();
    // A modal <dialog> sits in the top layer; a toast outside it would be hidden under its backdrop.
    const container = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
    if (host.parentElement !== container) container.append(host);
    while (host.children.length >= 3) host.firstElementChild.remove();
    host.append(note);
    requestAnimationFrame(() => requestAnimationFrame(() => note.classList.add('is-open')));
    setTimeout(() => { note.classList.remove('is-open'); setTimeout(() => note.remove(), 500); }, duration);
  }
  function toast(message, kind = '', title = '') {
    const note = document.createElement('div'); note.className = `mf-toast ${kind === 'error' ? 'error' : ''}`; note.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    note.innerHTML = `<div class="mf-toast-icon"><i class="fa-solid ${kind === 'error' ? 'fa-triangle-exclamation' : title ? 'fa-rotate' : 'fa-check'}"></i></div><div class="min-w-0">${title ? `<p class="font-bold text-sm">${escape(title)}</p><p class="text-xs text-stone-400">${escape(message)}</p>` : `<p class="font-bold text-sm leading-snug">${escape(message)}</p>`}</div>`;
    showToast(note, 7000);
  }
  function orderToast(order) {
    const note = document.createElement('a'); note.className = 'mf-toast mf-toast-order'; note.href = 'businessDashbord.html#awaiting-cash'; note.setAttribute('role', 'status');
    note.innerHTML = `<div class="mf-toast-icon"><i class="fa-solid fa-bell-concierge animate-bounce"></i></div><div class="min-w-0"><p class="text-[10px] font-bold uppercase tracking-widest opacity-80">New order · awaiting cash</p><p class="font-bold truncate">#${escape(order.number)} • ${escape(order.customerName)}</p></div>`;
    showToast(note, 9000);
  }

  function connectionChanged(connected) {
    let banner = document.querySelector('.mf-service-banner');
    if (!banner) { banner = document.createElement('div'); banner.className = 'mf-service-banner'; banner.setAttribute('role', 'status'); document.body.prepend(banner); }
    banner.hidden = connected;
    banner.textContent = document.querySelector('[data-mf-shell]') ? 'Connection lost · cash actions paused. Check the ledger before retrying.' : 'Reconnecting… your order is saved.';
    document.querySelectorAll('[data-mf-sync]').forEach(pill => {
      pill.dataset.state = connected ? 'connected' : 'offline';
      const label = pill.querySelector('[data-mf-sync-label]'); if (label) label.textContent = tr(connected ? 'Live Sync Connected' : 'Reconnecting…');
    });
  }
  document.addEventListener('masaflow:connection', event => connectionChanged(event.detail.connected));
  if (M?.getConnection) { const status = M.getConnection(); if (status.hasConfirmedState || status.connected === false) connectionChanged(status.connected); }
  // While the service is unreachable a cash action could not be confirmed, so block it before it starts.
  const CASH_ACTIONS = '[data-tender],[data-advance],[data-cancel],#manual-drawer,#cash-finalize,[data-testid="open-shift"],[data-testid="record-cash-drop"],[data-testid="close-shift"]';
  const offline = () => M?.getConnection?.().connected === false;
  document.addEventListener('click', event => {
    if (!offline() || !event.target.closest(CASH_ACTIONS)) return;
    event.preventDefault(); event.stopImmediatePropagation(); toast('Connection lost. Cash actions are paused. Reconnect and check the ledger before retrying.', 'error');
  }, true);
  document.addEventListener('submit', event => {
    if (!offline() || !['open-shift-form', 'cash-drop-form', 'close-shift-form'].includes(event.target.id)) return;
    event.preventDefault(); event.stopImmediatePropagation(); toast('Connection lost. Cash actions are paused. Reconnect and check the ledger before retrying.', 'error');
  }, true);

  // Keeps the shared staff chrome live: the awaiting-cash bell, the cashier chip and new-order toasts.
  function shell() {
    let seen = null; let chip = null;
    function update() {
      const state = M.getState();
      const drafts = state.orders.filter(order => order.status === 'draft' && order.paymentStatus === 'unpaid');
      document.querySelectorAll('[data-mf-bell]').forEach(bell => {
        bell.setAttribute('aria-label', drafts.length ? `${drafts.length} ${drafts.length === 1 ? 'order' : 'orders'} awaiting cash` : 'No orders awaiting cash');
        const dot = bell.querySelector('[data-mf-bell-dot]'); if (dot) dot.hidden = !drafts.length;
      });
      const shift = M.getOpenShift();
      const initials = shift ? shift.cashierId.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join('') : '';
      if (initials !== chip) {
        chip = initials;
        document.querySelectorAll('[data-mf-cashier]').forEach(link => {
          link.setAttribute('aria-label', shift ? `Cash drawer open · ${shift.cashierId}` : 'Cash drawer closed · open a shift');
          link.title = shift ? `Drawer open · ${shift.cashierId}` : 'Drawer closed';
          link.innerHTML = shift ? escape(initials) : '<i class="fa-solid fa-cash-register text-sm"></i>';
        });
      }
      if (seen) drafts.filter(order => !seen.has(order.id)).forEach(orderToast);
      if (seen || state.revision > 0 || state.orders.length) seen = new Set(state.orders.map(order => order.id));
    }
    M.subscribe(update);
    Promise.resolve(M.ready).then(() => { seen = seen || new Set(M.getState().orders.map(order => order.id)); update(); }).catch(() => {});
  }

  function confirm({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog'); dialog.className = 'mf-dialog'; dialog.setAttribute('aria-labelledby', 'mf-confirm-title');
      dialog.innerHTML = `<div class="p-8"><div class="w-12 h-12 rounded-2xl ${danger ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'} flex items-center justify-center mb-5"><i class="fa-solid ${danger ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i></div><h2 id="mf-confirm-title" class="text-2xl font-bold text-stone-800">${escape(title)}</h2><p class="text-stone-500 text-sm leading-relaxed mt-2 mb-8">${escape(message)}</p><div class="space-y-3"><button type="button" data-confirm class="${danger ? 'w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl transition-all active:scale-95' : 'mf-btn-primary'}" data-testid="confirm-accept">${escape(confirmLabel)}</button><button type="button" data-cancel class="mf-btn-ghost" data-testid="confirm-cancel">${escape(cancelLabel)}</button></div></div>`;
      document.body.append(dialog);
      let answer = false;
      dialog.querySelector('[data-confirm]').onclick = () => { answer = true; dialog.close(); };
      dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener('close', () => { dialog.remove(); resolve(answer); });
      dialog.showModal(); dialog.querySelector('[data-cancel]').focus();
    });
  }

  async function pulse(paymentId = null) {
    const response = await fetch('/api/cash-drawer/kick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentId, requestId: crypto.randomUUID() }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  }
  async function manualKick() {
    if (!M.getOpenShift()) return toast('Open a drawer shift before opening the cash drawer.', 'error');
    try { const result = await pulse(); toast(result.message, ['failed', 'unknown'].includes(result.status) ? 'error' : ''); }
    catch (error) { toast(error.message, 'error'); }
  }

  const statCard = (tone, label, value, attrs = '') => `<div class="bg-${tone}-50 p-4 rounded-3xl border border-${tone}-100"><p ${attrs.label || ''} class="text-[10px] font-bold text-${tone}-400 uppercase tracking-widest mb-1">${label}</p><p ${attrs.value || ''} class="text-2xl font-bold text-${tone}-600">${value}</p></div>`;
  // Tailwind only ships classes it can read in full: bg-orange-50 border-orange-100 text-orange-400 text-orange-600 bg-green-50 border-green-100 text-green-400 text-green-600 bg-red-50 border-red-100 text-red-400 text-red-600

  function tender(orderId) {
    const order = M.getOrder(orderId); if (!order) return toast('Order not found.', 'error');
    if (order.paymentStatus === 'paid') return toast('This order is already paid. Check the cash ledger.');
    if (order.currency && order.currency !== M.getState().settings.currency) return toast('This draft uses legacy currency. Rebuild it using the current menu before taking payment.', 'error');
    if (!M.getOpenShift()) return toast('Open a drawer shift in History & Ledger before collecting cash.', 'error');
    if (document.getElementById('cash-tender-dialog')) return;
    const dialog = document.createElement('dialog'); dialog.id = 'cash-tender-dialog'; dialog.className = 'mf-dialog'; dialog.setAttribute('aria-labelledby', 'cash-dialog-title');
    const presetClass = 'flex-1 min-w-[64px] py-3 bg-white border border-stone-200 rounded-xl text-sm font-bold text-stone-700 hover:border-orange-500 transition-colors';
    const keyClass = 'py-3 bg-stone-50 rounded-2xl text-lg font-bold text-stone-700 hover:bg-stone-100 active:scale-95 transition-all';
    dialog.innerHTML = `<header class="p-8 pb-4 flex items-start justify-between gap-4"><div><h2 id="cash-dialog-title" class="text-2xl font-bold text-stone-800">Collect Cash</h2><p class="text-stone-400 text-sm font-medium mt-1">#${escape(order.number)} • ${escape(order.customerName)}</p></div><button type="button" class="mf-close w-10 h-10 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-400 transition-colors flex-shrink-0" aria-label="Close cash payment"><i class="fa-solid fa-xmark text-xl"></i></button></header><div class="mf-body px-8 pb-8"><div class="grid grid-cols-2 gap-4 mb-6">${statCard('orange', 'Total due', moneyFor(order.totalCents, order), { value: 'data-testid="total-due"' })}<div id="cash-change-card" class="bg-green-50 p-4 rounded-3xl border border-green-100"><p id="cash-change-label" class="text-[10px] font-bold text-green-400 uppercase tracking-widest mb-1">Change returned</p><p data-testid="change-returned" id="cash-change" class="text-2xl font-bold text-green-600">${moneyFor(0, order)}</p></div></div><p class="text-xs text-stone-500 -mt-3 mb-5">${escape(M.getState().settings.taxConfigured ? 'Tax' : 'Tax unconfigured · 0%')}</p><label class="mf-field-label" for="cash-tendered">Amount tendered</label><input id="cash-tendered" class="mf-input text-2xl font-bold" data-testid="cash-tendered" inputmode="decimal" autocomplete="off" placeholder="0.00"><div class="flex flex-wrap gap-2 mt-4" role="group" aria-label="Set cash tendered">${(order.currency === 'USD' ? [5, 10, 20, 50] : [20, 50, 100, 200, 500]).map(bill => `<button type="button" class="${presetClass}" data-bill="${bill * 100}">$${bill}</button>`).join('')}<button type="button" class="${presetClass}" data-bill="${order.totalCents}">Exact</button></div><p class="text-xs text-stone-400 leading-relaxed mt-3">Presets set the total tendered. Count the physical cash before finalizing. Return the change shown.</p><div class="grid grid-cols-3 gap-2 mt-4" role="group" aria-label="Cash numpad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(key => `<button type="button" class="${keyClass}" data-key="${key}" aria-label="${key === '⌫' ? 'Backspace' : key}">${key}</button>`).join('')}</div><p class="text-sm font-medium text-red-600 min-h-[20px] mt-3" id="cash-error" role="alert"></p><button type="button" class="mf-btn-primary mt-2" id="cash-finalize" data-testid="finalize-cash" disabled>Finalize · Paid cash</button><p class="text-xs text-stone-400 leading-relaxed mt-3 text-center">Finalizing saves the cash receipt, dispatches the ticket to the kitchen, and requests a drawer pulse.</p></div>`;
    document.body.append(dialog); dialog.showModal();
    const input = dialog.querySelector('#cash-tendered'); const finalize = dialog.querySelector('#cash-finalize'); const error = dialog.querySelector('#cash-error');
    let busy = false;
    function update() {
      let amount = 0; let valid = true;
      try { amount = M.parseMoney(input.value || '0'); } catch (_) { valid = false; }
      const delta = amount - order.totalCents; const short = delta < 0;
      dialog.querySelector('#cash-change-card').className = short ? 'bg-red-50 p-4 rounded-3xl border border-red-100' : 'bg-green-50 p-4 rounded-3xl border border-green-100';
      const label = dialog.querySelector('#cash-change-label'); label.textContent = short ? 'Still due' : 'Change returned';
      label.className = `text-[10px] font-bold uppercase tracking-widest mb-1 ${short ? 'text-red-400' : 'text-green-400'}`;
      const change = dialog.querySelector('#cash-change'); change.textContent = moneyFor(Math.abs(delta), order);
      change.className = `text-2xl font-bold ${short ? 'text-red-600' : 'text-green-600'}`;
      finalize.disabled = busy || !valid || short;
      error.textContent = valid ? '' : 'Enter a valid amount with at most two decimal places.';
    }
    input.addEventListener('input', update);
    dialog.querySelectorAll('[data-bill]').forEach(button => button.addEventListener('click', () => { input.value = (Number(button.dataset.bill) / 100).toFixed(2); update(); }));
    dialog.querySelectorAll('[data-key]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.key; input.value = key === '⌫' ? input.value.slice(0, -1) : input.value + key; update(); }));
    dialog.querySelector('.mf-close').onclick = () => { if (!busy) dialog.close(); };
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => {
      dialog.remove();
      setTimeout(() => { if (document.activeElement === document.body) document.querySelector(`[data-advance="${CSS.escape(orderId)}"], [data-tender="${CSS.escape(orderId)}"]`)?.focus(); });
    });
    finalize.onclick = async () => {
      if (busy) return; busy = true; finalize.disabled = true; finalize.textContent = 'Saving payment…';
      try {
        const result = await M.payOrder(orderId, M.parseMoney(input.value), M.getOpenShift()?.cashierId || 'Cashier 1');
        const savedPayment = M.getState().payments.find(p => p.id === result.payment.id);
        let message = 'Drawer pulse result unavailable. Payment is saved; check the ledger.';
        const status = savedPayment?.drawerKickStatus;
        if (status === 'simulated') message = 'Drawer pulse simulated · no physical printer configured.';
        if (status === 'sent') message = 'Drawer pulse sent · check the physical drawer.';
        if (status === 'failed' || status === 'unknown') message = 'Payment saved. Drawer pulse needs attention; inspect the printer and drawer.';
        if (result.hardwareWarning) message = result.hardwareWarning;
        dialog.querySelector('.mf-body').innerHTML = `<div class="mf-success flex items-center gap-4 bg-emerald-50 border border-emerald-100 rounded-3xl p-5 mb-6"><div class="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 flex-shrink-0"><i class="fa-solid fa-circle-check text-xl"></i></div><div><h3 class="text-lg font-bold text-stone-800">Paid · Cash</h3><p class="text-sm text-stone-500">#${escape(result.order.number)} is now in the kitchen queue.</p></div></div><div class="grid grid-cols-2 gap-4 mb-4">${statCard('orange', 'Cash tendered', moneyFor(result.payment.tenderedCents, result.payment))}${statCard('green', 'Return change', moneyFor(result.payment.changeCents, result.payment), { value: 'data-testid="payment-change"' })}</div><p class="text-xs text-stone-400 leading-relaxed mb-6" role="status">${escape(message)}</p><div class="space-y-3"><button type="button" class="mf-btn-dark" id="cash-print"><i class="fa-solid fa-print"></i> Print receipt</button><button type="button" class="mf-btn-ghost" id="cash-done">Done</button></div>`;
        busy = false; dialog.querySelector('#cash-done').onclick = () => dialog.close(); dialog.querySelector('#cash-print').onclick = () => printReceipt(orderId);
      } catch (failure) { busy = false; finalize.textContent = 'Finalize · Paid cash'; update(); error.textContent = failure.message; }
    };
    update(); input.focus();
  }

  const printStyle = 'body{font:14px monospace;max-width:300px;margin:24px auto;color:#000}h1{text-align:center;font-size:24px}.line{display:flex;justify-content:space-between;gap:12px}hr{border:0;border-top:1px dashed #888}@media print{button{display:none}body{margin:0;width:72mm}}';
  function printDocument(name, title, body) {
    const popup = window.open('', name, 'width=440,height=700'); if (!popup) return toast('Allow popups to print.', 'error');
    popup.document.open(); popup.document.write(`<!doctype html><html lang="${I?.getLocale() || 'es'}"><head><title>${escape(title)}</title><style>${printStyle}</style></head><body>${body}<hr><button onclick="window.print()">Print</button></body></html>`); popup.document.close();
    if (I) { const walker = popup.document.createTreeWalker(popup.document.body, 4); let node; while ((node = walker.nextNode())) if (!node.parentElement.closest('[data-i18n-skip]')) node.nodeValue = I.translate(node.nodeValue); }
    popup.focus(); popup.print();
  }
  function printReceipt(id) {
    const order = M.getOrder(id); if (!order) return toast('Order not found.', 'error');
    const payment = M.getState().payments.find(p => p.id === order.paymentId);
    printDocument('masaflow-receipt', `${order.number} receipt`, `<h1>MasaFlow</h1><p><span data-i18n-skip>${escape(order.number)} · ${escape(order.customerName)}</span>${order.customerPhone ? `<br>${escape(order.customerPhone)}` : ''}<br>${escape(order.orderType)}${order.tableNumber ? ` · Table ${order.tableNumber}` : ''}<br>${escape(new Date(order.createdAt).toLocaleString(localeTag(), { timeZone: zone() }))}</p><hr>${order.items.map(line => `<p class="line"><span>${line.quantity} × ${escape(line.name)}</span><b>${moneyFor(line.lineTotalCents, order)}</b></p><small>${lineDetails(line).map(escape).join(', ')}${line.notes ? `<br>${escape(line.notes)}` : ''}</small>`).join('')}<hr><p class="line"><span>Subtotal</span><b>${moneyFor(order.subtotalCents, order)}</b></p><p class="line"><span>Tax</span><b>${moneyFor(order.taxCents, order)}</b></p><p class="line"><span>Total</span><b>${moneyFor(order.totalCents, order)}</b></p>${payment ? `<p>PAID · CASH</p><p class="line"><span>Tendered</span><b>${moneyFor(payment.tenderedCents, payment)}</b></p><p class="line"><span>Change</span><b>${moneyFor(payment.changeCents, payment)}</b></p><p>Cashier: ${escape(payment.cashierId)}</p>` : '<p>UNPAID · Pay cash at counter<br>Kitchen dispatch follows cash payment.</p>'}`);
  }
  // Today's verified cash receipts and the open drawer, for the end-of-day printout.
  function printDailySummary() {
    const state = M.getState(); const today = dayKey(new Date());
    const receipts = state.payments.filter(payment => dayKey(payment.paidAt) === today && M.isVerifiedPaid(state.orders.find(order => order.id === payment.orderId)));
    const total = receipts.reduce((sum, payment) => sum + payment.totalCents, 0);
    const sold = new Map();
    for (const payment of receipts) for (const line of state.orders.find(order => order.id === payment.orderId).items) sold.set(line.name, (sold.get(line.name) || 0) + line.quantity);
    const shift = M.getOpenShift(); const drawer = shift ? M.shiftSummary(shift.id) : null;
    const row = (label, value) => `<p class="line"><span>${escape(label)}</span><b>${escape(value)}</b></p>`;
    printDocument('masaflow-summary', `MasaFlow daily summary ${today}`, `<h1>MasaFlow</h1><p>Daily summary · ${escape(today)}<br>${escape(zone())}</p><hr>${row('Cash receipts', M.money(total))}${row('Paid orders', String(receipts.length))}${row('Average ticket', M.money(receipts.length ? Math.round(total / receipts.length) : 0))}<hr>${[...sold].sort((a, b) => b[1] - a[1]).map(([name, quantity]) => row(name, `× ${quantity}`)).join('') || '<p>No items sold today.</p>'}<hr>${drawer ? `${row('Starting float', M.money(drawer.floatCents))}${row('Cash sales (shift)', M.money(drawer.salesCents))}${row('Cash drops', M.money(drawer.dropsCents))}${row('Expected in drawer', M.money(drawer.expectedCents))}<p>Cashier: ${escape(shift.cashierId)}</p>` : '<p>No drawer shift is open.</p>'}`);
  }

  window.MasaFlowUI = { toast, orderToast, confirm, tender, manualKick, printReceipt, printDailySummary, escape, time, dayKey, lineDetails, needsAttention };
  if (M && document.querySelector('[data-mf-shell]')) shell();
})();
