(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MasaFlow = factory().createBrowserStore();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = () => globalThis.crypto.randomUUID();
  const now = () => new Date().toISOString();
  const MAX_CENTS = 100000000;
  function cents(value, label = 'Amount', allowZero = true) {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > MAX_CENTS)
      throw new Error(`${label} must be a valid amount with at most two decimal places.`);
    return value;
  }
  function parseMoney(text) {
    const value = String(text).trim();
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) throw new Error('Enter a positive amount with at most two decimal places.');
    const [whole, decimal = ''] = value.split('.');
    return cents(Number(whole) * 100 + Number(decimal.padEnd(2, '0')));
  }
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
  function cleanText(value, max = 120) { return String(value ?? '').trim().slice(0, max); }
  function options() {
    return [
      { id: 'white', name: 'Masa Blanca', priceCents: 0, group: 'masa', available: true },
      { id: 'blue', name: 'Masa Azul', priceCents: 0, group: 'masa', available: true },
      { id: 'cheese', name: 'Extra Queso Cotija', priceCents: 100, group: 'extras', available: true },
      { id: 'avocado', name: 'Fresh Avocado', priceCents: 150, group: 'extras', available: true }
    ];
  }
  function initialState() {
    const dishes = [
      ['huarache', 'Huarache de Asada', 'Huaraches', 1250, 'Handmade masa, grilled asada, beans, cotija, crema and salsa.', 'https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_db75814d02_1b437c974642d683.png'],
      ['sope', 'Sope de Chicharrón Prensado', 'Sopes', 850, 'A thick masa shell with pressed chicharrón, beans and salsa verde.', ''],
      ['pambazo', 'Pambazo de Papa con Chorizo', 'Pambazos', 1000, 'Guajillo-dipped bread filled with potato, chorizo, lettuce and crema.', ''],
      ['gordita', 'Gordita de Chicharrón', 'Gorditas', 800, 'A warm masa pocket filled with chicharrón and fresh salsa.', 'https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_825ad9b877_cafe10009ac0f8f2.png'],
      ['quesadilla', 'Quesadilla de Flor de Calabaza', 'Quesadillas', 950, 'Squash blossoms and melted cheese in a handmade corn tortilla.', '']
    ];
    return { version: 1, revision: 0, nextOrderNumber: 2084,
      settings: { currency: 'USD', taxBasisPoints: 0, timeZone: 'America/Los_Angeles' },
      menu: dishes.map(([id, name, category, priceCents, description, imageUrl]) => ({ id, name, category, priceCents, description, available: true, imageUrl, options: options() })),
      orders: [], payments: [], shifts: [], cashDrops: [], audit: [], hardwareJobs: [] };
  }
  function getOpenShift(state) { return state.shifts.find(s => !s.closedAt) || null; }
  function isVerifiedPaid(state, order) {
    return !!order && order.paymentStatus === 'paid' && state.payments.some(p => p.id === order.paymentId && p.orderId === order.id && p.method === 'cash' && p.totalCents === order.totalCents && p.tenderedCents - p.changeCents === order.totalCents);
  }
  function shiftSummary(state, shiftId) {
    const shift = state.shifts.find(s => s.id === shiftId) || (!shiftId ? getOpenShift(state) : null);
    if (!shift) return { floatCents: 0, salesCents: 0, tenderedCents: 0, changeCents: 0, dropsCents: 0, expectedCents: 0, orderCount: 0 };
    const payments = state.payments.filter(p => p.shiftId === shift.id);
    const sum = (records, field) => records.reduce((total, row) => total + row[field], 0);
    const tenderedCents = sum(payments, 'tenderedCents');
    const changeCents = sum(payments, 'changeCents');
    const salesCents = tenderedCents - changeCents;
    const dropsCents = sum(state.cashDrops.filter(d => d.shiftId === shift.id), 'amountCents');
    return { floatCents: shift.floatCents, tenderedCents, changeCents, salesCents, dropsCents, expectedCents: shift.floatCents + salesCents - dropsCents, orderCount: payments.length };
  }
  function createEngine({ state = initialState(), persist = async () => {} } = {}) {
    let current = clone(state);
    let queue = Promise.resolve();
    const listeners = new Set();
    function audit(s, action, message) { s.audit.push({ id: uid(), at: now(), action, message }); }
    function mutate(work) {
      const operation = queue.then(async () => {
        const draft = clone(current);
        const result = work(draft);
        draft.revision++;
        await persist(draft);
        current = draft;
        listeners.forEach(fn => { try { fn(clone(current)); } catch (_) {} });
        return clone(result);
      });
      queue = operation.catch(() => {});
      return operation;
    }
    function orderFor(s, id) { const order = s.orders.find(o => o.id === id); if (!order) throw new Error('Order not found.'); return order; }
    function menuFor(s, id) { const item = s.menu.find(m => m.id === id); if (!item) throw new Error('Menu item not found.'); return item; }
    function available(s, order) {
      order.items.forEach(line => {
        const item = menuFor(s, line.menuItemId);
        if (!item.available) throw new Error(`${item.name} is sold out. Rebuild this order before taking payment.`);
        line.options.forEach(option => { if (!item.options.find(o => o.id === option.id && o.available)) throw new Error(`${option.name} is sold out. Rebuild this order before taking payment.`); });
      });
    }
    function itemData(data) {
      const name = cleanText(data.name); const category = cleanText(data.category, 50);
      if (!name || !category) throw new Error('Dish name and category are required.');
      const imageUrl = cleanText(data.imageUrl, 2000);
      if (imageUrl && !/^https?:\/\//i.test(imageUrl)) throw new Error('Image URL must start with https:// or http://.');
      return { name, category, description: cleanText(data.description, 500), priceCents: cents(data.priceCents, 'Price', false), imageUrl };
    }
    const api = {
      getState: () => clone(current),
      getOrder: id => clone(current.orders.find(o => o.id === id) || null),
      getOpenShift: () => clone(getOpenShift(current)),
      shiftSummary: id => shiftSummary(current, id),
      money, parseMoney,
      isVerifiedPaid: order => isVerifiedPaid(current, order),
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      createDraft(data) { return mutate(s => {
        if (!Array.isArray(data.items) || !data.items.length || data.items.length > 100) throw new Error('Add at least one item to the order.');
        const customerName = cleanText(data.customerName, 80); if (!customerName) throw new Error('Customer name is required.');
        const orderType = data.orderType || 'takeout'; if (!['takeout', 'counter', 'dine_in'].includes(orderType)) throw new Error('Invalid order type.');
        const tableNumber = data.tableNumber == null ? null : Number(data.tableNumber);
        if (tableNumber !== null && (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 999)) throw new Error('Invalid table number.');
        const items = data.items.map(line => {
          const item = menuFor(s, line.menuItemId); if (!item.available) throw new Error(`${item.name} is sold out.`);
          if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) throw new Error('Quantity must be between 1 and 99.');
          const ids = line.optionIds ?? []; if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw new Error('Invalid modifier selection.');
          const selected = ids.map(id => { const option = item.options.find(o => o.id === id && o.available); if (!option) throw new Error('A selected modifier is unavailable.'); return clone(option); });
          if (selected.filter(o => o.group === 'masa').length !== 1 || selected.filter(o => o.group === 'extras').length > 2) throw new Error('Choose one masa base and up to two extras.');
          const unitPriceCents = item.priceCents + selected.reduce((sum, o) => sum + o.priceCents, 0);
          return { menuItemId: item.id, name: item.name, quantity: line.quantity, unitPriceCents, lineTotalCents: unitPriceCents * line.quantity, options: selected, notes: cleanText(line.notes, 300) };
        });
        const subtotalCents = cents(items.reduce((sum, line) => sum + line.lineTotalCents, 0), 'Order total', false);
        const taxCents = Math.round(subtotalCents * s.settings.taxBasisPoints / 10000);
        const order = { id: uid(), number: `MF-${s.nextOrderNumber++}`, customerName, orderType, tableNumber, items, subtotalCents, taxCents, totalCents: cents(subtotalCents + taxCents), status: 'draft', paymentStatus: 'unpaid', paymentId: null, createdAt: now(), updatedAt: now(), paidAt: null, completedAt: null };
        s.orders.push(order); audit(s, 'order_draft', `${order.number} held for upfront cash payment.`); return order;
      }); },
      payOrder(id, tenderedCents, cashierId = 'Cashier 1') { return mutate(s => {
        const order = orderFor(s, id);
        if (isVerifiedPaid(s, order)) return { order, payment: s.payments.find(p => p.id === order.paymentId), alreadyPaid: true };
        if (order.status !== 'draft' || order.paymentStatus !== 'unpaid') throw new Error('Only an unpaid draft can be finalized.');
        const shift = getOpenShift(s); if (!shift) throw new Error('Open a cash drawer shift and record the starting float first.');
        cents(tenderedCents, 'Cash tendered', false);
        if (tenderedCents < order.totalCents) throw new Error(`Insufficient cash. ${money(order.totalCents - tenderedCents)} still due.`);
        available(s, order);
        const paidAt = now(); const payment = { id: uid(), orderId: id, shiftId: shift.id, method: 'cash', totalCents: order.totalCents, tenderedCents, changeCents: tenderedCents - order.totalCents, paidAt, cashierId: cleanText(cashierId, 80) || shift.cashierId, drawerKickStatus: 'pending' };
        s.payments.push(payment);
        Object.assign(order, { status: 'pending', paymentStatus: 'paid', paymentId: payment.id, paidAt, updatedAt: paidAt });
        audit(s, 'cash_payment', `${order.number}: received ${money(tenderedCents)}, returned ${money(payment.changeCents)}; sale ${money(order.totalCents)}. Dispatched to kitchen.`);
        return { order, payment, alreadyPaid: false };
      }); },
      advanceOrder(id, expectedStatus) { return mutate(s => {
        const order = orderFor(s, id); if (!isVerifiedPaid(s, order)) throw new Error('Cash payment must be verified before kitchen dispatch.');
        if (expectedStatus && order.status !== expectedStatus) throw new Error('Another kitchen screen already updated this ticket. Check its current status.');
        const next = { pending: 'preparing', preparing: 'ready', ready: 'completed' }[order.status];
        if (!next) throw new Error('This order cannot advance.');
        order.status = next; order.updatedAt = now(); if (next === 'completed') order.completedAt = order.updatedAt;
        audit(s, 'kitchen_status', `${order.number} marked ${next}.`); return order;
      }); },
      openShift(floatCents, cashierId = 'Cashier 1') { return mutate(s => {
        if (getOpenShift(s)) throw new Error('A drawer shift is already open.');
        cents(floatCents, 'Starting float');
        const shift = { id: uid(), floatCents, cashierId: cleanText(cashierId, 80) || 'Cashier 1', openedAt: now(), closedAt: null, actualCents: null, varianceCents: null, expectedCentsAtClose: null };
        s.shifts.push(shift); audit(s, 'shift_open', `${shift.cashierId} opened drawer with ${money(floatCents)} float.`); return shift;
      }); },
      recordCashDrop(amountCents, note = '', cashierId = 'Cashier 1') { return mutate(s => {
        const shift = getOpenShift(s); if (!shift) throw new Error('Open a drawer shift first.');
        cents(amountCents, 'Cash drop', false); if (amountCents > shiftSummary(s, shift.id).expectedCents) throw new Error('Cash drop exceeds the expected drawer balance.');
        const drop = { id: uid(), shiftId: shift.id, amountCents, note: cleanText(note, 300), cashierId: cleanText(cashierId, 80), createdAt: now() };
        s.cashDrops.push(drop); audit(s, 'cash_drop', `${money(amountCents)} moved to safe${drop.note ? `: ${drop.note}` : ''}.`); return drop;
      }); },
      closeShift(actualCents, cashierId = 'Cashier 1') { return mutate(s => {
        const shift = getOpenShift(s); if (!shift) throw new Error('No drawer shift is open.'); cents(actualCents, 'Actual cash count');
        const summary = shiftSummary(s, shift.id);
        Object.assign(shift, { closedAt: now(), expectedCentsAtClose: summary.expectedCents, actualCents, varianceCents: actualCents - summary.expectedCents, closedBy: cleanText(cashierId, 80) });
        audit(s, 'shift_close', `Drawer audited: expected ${money(summary.expectedCents)}, counted ${money(actualCents)}, variance ${money(shift.varianceCents)}.`); return shift;
      }); },
      updateMenuItem(id, patch) { return mutate(s => {
        const item = menuFor(s, id); const old = clone(item); const merged = { ...item, ...patch };
        Object.assign(item, itemData(merged)); if ('available' in patch) { if (typeof patch.available !== 'boolean') throw new Error('Availability must be true or false.'); item.available = patch.available; }
        audit(s, 'menu_edit', `${item.name}: price ${money(old.priceCents)} → ${money(item.priceCents)}; ${item.available ? 'in stock' : '86’d'}.`); return item;
      }); },
      addMenuItem(data) { return mutate(s => { const item = { id: uid(), ...itemData(data), available: true, options: options() }; s.menu.push(item); audit(s, 'menu_add', `${item.name} added at ${money(item.priceCents)}.`); return item; }); },
      updateMenuOption(menuId, optionId, patch) { return mutate(s => {
        const item = menuFor(s, menuId); const option = item.options.find(o => o.id === optionId); if (!option) throw new Error('Modifier not found.');
        if ('priceCents' in patch) option.priceCents = cents(patch.priceCents, 'Modifier price');
        if ('available' in patch) { if (typeof patch.available !== 'boolean') throw new Error('Invalid availability.'); option.available = patch.available; }
        audit(s, 'modifier_edit', `${item.name} · ${option.name}: ${money(option.priceCents)}, ${option.available ? 'in stock' : '86’d'}.`); return option;
      }); },
      reserveHardwareJob(key, paymentId = null) { return mutate(s => {
        const existing = s.hardwareJobs.find(j => j.key === key); if (existing) return { job: existing, duplicate: true };
        if (paymentId && !s.payments.some(p => p.id === paymentId && isVerifiedPaid(s, orderFor(s, p.orderId)))) throw new Error('Drawer pulse requires a verified cash payment.');
        if (!paymentId && !getOpenShift(s)) throw new Error('Open a drawer shift before a manual drawer pulse.');
        const job = { key, paymentId, status: 'reserved', createdAt: now(), message: '' }; s.hardwareJobs.push(job);
        audit(s, paymentId ? 'drawer_kick_requested' : 'manual_drawer_kick', paymentId ? 'Drawer pulse requested for verified cash sale.' : 'Cashier requested a manual drawer pulse.');
        return { job, duplicate: false };
      }); },
      finishHardwareJob(key, status, message) { return mutate(s => {
        const job = s.hardwareJobs.find(j => j.key === key); if (!job) throw new Error('Hardware job not found.');
        job.status = status; job.message = cleanText(message, 300); job.updatedAt = now();
        const payment = s.payments.find(p => p.id === job.paymentId); if (payment) payment.drawerKickStatus = status;
        audit(s, 'drawer_kick_result', `${status}: ${job.message}`); return job;
      }); }
    };
    return api;
  }
  const clientActions = ['createDraft', 'payOrder', 'advanceOrder', 'openShift', 'recordCashDrop', 'closeShift', 'updateMenuItem', 'addMenuItem', 'updateMenuOption'];
  function createBrowserStore() {
    let state = initialState(); const listeners = new Set();
    function accept(incoming) { if (incoming.revision < state.revision) return; state = incoming; listeners.forEach(fn => { try { fn(clone(state)); } catch (error) { console.error(error); } }); }
    function connection(ok) { document.dispatchEvent(new CustomEvent('masaflow:connection', { detail: { connected: ok } })); }
    const api = {
      getState: () => clone(state), getOrder: id => clone(state.orders.find(o => o.id === id) || null),
      getOpenShift: () => clone(getOpenShift(state)), shiftSummary: id => shiftSummary(state, id),
      isVerifiedPaid: order => isVerifiedPaid(state, order), money, parseMoney,
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
    clientActions.forEach(action => { api[action] = async (...args) => {
      await api.ready;
      if (action === 'advanceOrder' && args.length === 1) args.push(api.getOrder(args[0])?.status);
      let response; try { response = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, args }) }); } catch (_) { connection(false); throw new Error('The transaction result could not be confirmed. Reconnect and check the ledger before retrying.'); }
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'The action could not be saved.'); accept(data.state); connection(true); return data.result;
    }; });
    async function connect() {
      const response = await fetch('/api/state'); if (!response.ok) throw new Error('Service unavailable.'); accept(await response.json()); connection(true);
    }
    api.ready = connect().catch(error => { connection(false); throw error; });
    api.ready.catch(() => {});
    const stream = new EventSource('/api/events');
    stream.onmessage = event => { try { accept(JSON.parse(event.data)); api.ready = Promise.resolve(); connection(true); } catch (_) {} };
    stream.onerror = () => connection(false);
    return api;
  }
  return { createEngine, initialState, createBrowserStore, money, parseMoney, clientActions, isVerifiedPaid, shiftSummary };
});
