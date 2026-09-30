(function () {
  'use strict';
  const M = window.MasaFlow;
  const I = window.MasaFlowI18n;
  const moneyFor = (value, record) => M.money(value, record?.currency || M.getState().settings.currency, I?.getLocale() || 'es');
  const escape = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  function toast(message, kind = '') {
    let host = document.querySelector('.mf-toast-host');
    if (!host) { host = document.createElement('div'); host.className = 'mf-toast-host'; host.setAttribute('aria-live', 'polite'); document.body.append(host); }
    const note = document.createElement('div'); note.className = `mf-toast ${kind}`; note.textContent = message; host.append(note); setTimeout(() => note.remove(), 7000);
  }
  function connectionBanner(connected) {
    let banner = document.querySelector('.mf-service-banner');
    if (!banner) { banner = document.createElement('div'); banner.className = 'mf-service-banner'; banner.setAttribute('role', 'status'); document.body.prepend(banner); }
    banner.hidden = connected;
    banner.textContent = 'Connection lost. Cash actions are paused. Reconnect and check the ledger before retrying.';
  }
  document.addEventListener('masaflow:connection', event => connectionBanner(event.detail.connected));
  if (M.getConnection) connectionBanner(M.getConnection().connected);
  document.addEventListener('click',event=>{
    if(M.getConnection?.().connected !== false)return;
    if(!event.target.closest('[data-tender],[data-advance],#manual-drawer,#cash-finalize,[data-testid=\"open-shift\"],[data-testid=\"record-cash-drop\"],[data-testid=\"close-shift\"]'))return;
    event.preventDefault();event.stopImmediatePropagation();toast('Connection lost. Cash actions are paused. Reconnect and check the ledger before retrying.','error');
  },true);
  document.addEventListener('submit',event=>{if(M.getConnection?.().connected===false&&['open-shift-form','cash-drop-form','close-shift-form'].includes(event.target.id)){event.preventDefault();event.stopImmediatePropagation();toast('Connection lost. Cash actions are paused. Reconnect and check the ledger before retrying.','error');}},true);
  async function pulse(paymentId = null) {
    const response = await fetch('/api/cash-drawer/kick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentId, requestId: crypto.randomUUID() }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
  }
  async function manualKick() {
    try { const result = await pulse(); toast(result.message, ['failed', 'unknown'].includes(result.status) ? 'error' : ''); }
    catch (error) { toast(error.message, 'error'); }
  }
  function tender(orderId) {
    const order = M.getOrder(orderId); if (!order) return toast('Order not found.', 'error');
    if (order.paymentStatus === 'paid') return toast('This order is already paid. Check the cash ledger.');
    if (order.currency && order.currency !== M.getState().settings.currency) return toast('This draft uses legacy currency. Rebuild it using the current menu before taking payment.', 'error');
    if (!M.getOpenShift()) return toast('Open a drawer shift in Cash Ledger before collecting cash.', 'error');
    if (document.getElementById('cash-tender-dialog')) return;
    const dialog = document.createElement('dialog'); dialog.id = 'cash-tender-dialog'; dialog.className = 'mf-dialog'; dialog.setAttribute('aria-labelledby', 'cash-dialog-title');
    dialog.innerHTML = `<header><div><h2 id="cash-dialog-title">Collect cash</h2><p>${escape(order.number)} · ${escape(order.customerName)}</p></div><button class="mf-close" aria-label="Close cash payment">✕</button></header><div class="mf-body"><div class="mf-cash-totals"><div><small>Total due</small><strong data-testid="total-due">${moneyFor(order.totalCents, order)}</strong></div><div><small id="cash-change-label">Change returned</small><strong data-testid="change-returned" id="cash-change">$0.00</strong></div></div><p class="mf-help">${M.getState().settings.taxConfigured ? 'Tax' : 'Tax unconfigured · 0%'}</p><label class="mf-field">Amount tendered<input id="cash-tendered" data-testid="cash-tendered" inputmode="decimal" autocomplete="off" placeholder="0.00"></label><div class="mf-presets" aria-label="Set cash tendered">${[20,50,100,200,500].map(b => `<button type="button" data-bill="${b * 100}">$${b}</button>`).join('')}<button type="button" data-bill="${order.totalCents}">Exact</button></div><p class="mf-help">Presets set the total tendered. Count the physical cash before finalizing. Return the change shown.</p><div class="mf-keypad" aria-label="Cash numpad">${['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(k => `<button type="button" data-key="${k}" aria-label="${k === '⌫' ? 'Backspace' : k}">${k}</button>`).join('')}</div><p class="mf-error" id="cash-error" role="alert"></p><button type="button" class="mf-primary" id="cash-finalize" data-testid="finalize-cash" disabled>Finalize · Paid cash</button><p class="mf-help">Finalizing saves the cash receipt, dispatches the ticket to the kitchen, and requests a drawer pulse.</p></div>`;
    document.body.append(dialog); dialog.showModal();
    const input = dialog.querySelector('#cash-tendered'); const finalize = dialog.querySelector('#cash-finalize'); const error = dialog.querySelector('#cash-error');
    let busy = false;
    function update() {
      let amount = 0; let valid = true;
      try { amount = M.parseMoney(input.value || '0'); } catch (_) { valid = false; }
      const delta = amount - order.totalCents;
      dialog.querySelector('#cash-change-label').textContent = delta >= 0 ? 'Change returned' : 'Still due';
      dialog.querySelector('#cash-change').textContent = moneyFor(Math.abs(delta), order);
      finalize.disabled = busy || !valid || delta < 0;
      error.textContent = valid ? '' : 'Enter a valid amount with at most two decimal places.';
    }
    input.addEventListener('input', update);
    dialog.querySelectorAll('[data-bill]').forEach(button => button.addEventListener('click', () => { input.value = (Number(button.dataset.bill) / 100).toFixed(2); update(); }));
    dialog.querySelectorAll('[data-key]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.key; input.value = key === '⌫' ? input.value.slice(0,-1) : input.value + key; update(); }));
    dialog.querySelector('.mf-close').onclick = () => { if (!busy) dialog.close(); };
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => dialog.remove());
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
        dialog.querySelector('.mf-body').innerHTML = `<div class="mf-success"><h3>Paid · Cash</h3><p>${escape(result.order.number)} is now in the kitchen queue.</p></div><div class="mf-cash-totals"><div><small>Cash tendered</small><strong>${moneyFor(result.payment.tenderedCents, result.payment)}</strong></div><div><small>Return change</small><strong data-testid="payment-change">${moneyFor(result.payment.changeCents, result.payment)}</strong></div></div><p class="mf-help" role="status">${escape(message)}</p><button class="mf-primary" id="cash-print">Print receipt</button><button class="mf-close" id="cash-done" style="width:100%;margin-top:12px">Done</button>`;
        busy = false; dialog.querySelector('#cash-done').onclick = () => dialog.close(); dialog.querySelector('#cash-print').onclick = () => printReceipt(orderId);
      } catch (failure) { busy = false; error.textContent = failure.message; finalize.textContent = 'Finalize · Paid cash'; update(); error.textContent = failure.message; }
    };
    update(); input.focus();
  }
  function printReceipt(id) {
    const order = M.getOrder(id); if (!order) return toast('Order not found.', 'error');
    const payment = M.getState().payments.find(p => p.id === order.paymentId);
    const popup = window.open('', 'masaflow-receipt', 'width=440,height=700'); if (!popup) return toast('Allow popups to print this receipt.', 'error');
    popup.document.open(); popup.document.write(`<!doctype html><html><head><title>${escape(order.number)} receipt</title><style>body{font:14px monospace;max-width:300px;margin:24px auto;color:#000}h1{text-align:center;font-size:24px}.line{display:flex;justify-content:space-between;gap:12px}hr{border:0;border-top:1px dashed #888}@media print{button{display:none}body{margin:0;width:72mm}}</style></head><body><h1>MasaFlow</h1><p>${escape(order.number)} · ${escape(order.customerName)}<br>${escape(order.orderType)}${order.tableNumber ? ` · Table ${order.tableNumber}` : ''}<br>${escape(new Date(order.createdAt).toLocaleString(I?.getLocale() === 'en' ? 'en-US' : 'es-MX',{timeZone:M.getState().settings.timeZone}))}</p><hr>${order.items.map(line => `<p class="line"><span>${line.quantity} × ${escape(line.name)}</span><b>${moneyFor(line.lineTotalCents, order)}</b></p><small>${line.options.map(o => escape(o.name)).join(', ')}${line.notes ? `<br>${escape(line.notes)}` : ''}</small>`).join('')}<hr><p class="line"><span>Subtotal</span><b>${moneyFor(order.subtotalCents, order)}</b></p><p class="line"><span>Tax</span><b>${moneyFor(order.taxCents, order)}</b></p><p class="line"><span>Total</span><b>${moneyFor(order.totalCents, order)}</b></p>${payment ? `<p>PAID · CASH</p><p class="line"><span>Tendered</span><b>${moneyFor(payment.tenderedCents, payment)}</b></p><p class="line"><span>Change</span><b>${moneyFor(payment.changeCents, payment)}</b></p><p>Cashier: ${escape(payment.cashierId)}</p>` : '<p>UNPAID · Pay cash at counter<br>Kitchen dispatch follows cash payment.</p>'}<hr><button onclick="window.print()">Print receipt</button></body></html>`); popup.document.close(); if (I) { const walker=popup.document.createTreeWalker(popup.document.body,4); let node; while((node=walker.nextNode())) if(node.parentElement.tagName!=='SCRIPT')node.nodeValue=I.translate(node.nodeValue); popup.document.documentElement.lang=I.getLocale(); } popup.focus(); popup.print();
  }
  window.MasaFlowUI = { toast, tender, manualKick, printReceipt, escape };
})();
