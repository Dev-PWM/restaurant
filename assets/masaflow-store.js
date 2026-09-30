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
  function money(value, currency = 'MXN', locale = 'es-MX') {
    if (currency && typeof currency === 'object') { locale = currency.locale || locale; currency = currency.currency || 'MXN'; }
    const resolvedLocale = locale === 'es' ? 'es-MX' : locale === 'en' ? 'en-US' : locale;
    return new Intl.NumberFormat(resolvedLocale, { style: 'currency', currency }).format(value / 100);
  }
  function migrateState(input) {
    const state = clone(input);
    if (![1, 2].includes(state.version)) throw new Error('Unsupported saved data version.');
    for (const key of ['menu', 'orders', 'payments', 'shifts', 'cashDrops', 'audit', 'hardwareJobs']) {
      if (!Array.isArray(state[key])) throw new Error(`Invalid saved ${key} data.`);
    }
    if (state.version === 2) return state;
    const legacyCurrency = currencies.has(state.settings?.currency) ? state.settings.currency : 'USD';
    for (const key of ['menu', 'orders', 'payments', 'shifts', 'cashDrops']) {
      state[key].forEach(record => { if (record && typeof record === 'object' && !record.currency) record.currency = legacyCurrency; });
    }
    state.menu.forEach(item => { if (item && Array.isArray(item.options)) item.options.forEach(option => { if (option && !option.currency) option.currency = item.currency; }); });
    state.orders.forEach(order => { if (order && Array.isArray(order.items)) order.items.forEach(line => {
      if (!line) return;
      if (!line.currency) line.currency = order.currency;
      if (Array.isArray(line.options)) line.options.forEach(option => { if (option && !option.currency) option.currency = order.currency; });
    }); });
    state.settings = { ...state.settings, currency: 'MXN', timeZone: 'America/Mexico_City', locale: 'es', taxConfigured: false };
    state.version = 2;
    state.revision = (Number.isSafeInteger(state.revision) ? state.revision : 0) + 1;
    return state;
  }
  const currencies = new Set(['MXN', 'USD']);
  const validAmount = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_CENTS;
  const validTimestamp = value => {
    if (typeof value !== 'string') return false;
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!parts) return false;
    const [, year, month, day, hour, minute, second] = parts.map(Number);
    return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() &&
      hour <= 23 && minute <= 59 && second <= 59 && Number.isFinite(Date.parse(value));
  };
  function fail(message, code, statusCode = 400) { const error = new Error(message); error.code = code; error.statusCode = statusCode; throw error; }
  function cleanText(value, max = 120) { return String(value ?? '').trim().slice(0, max); }
  function cleanIncluded(value) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > 12) throw new Error('List at most 12 included toppings.');
    const names = value.map(name => cleanText(name, 40)).filter(Boolean);
    if (new Set(names.map(name => name.toLowerCase())).size !== names.length) throw new Error('Included toppings must be unique.');
    return names;
  }
  function options() {
    return [
      { id: 'white', name: 'Masa Blanca', description: 'Masa de maíz blanco', priceCents: 0, currency: 'MXN', group: 'masa', available: true },
      { id: 'blue', name: 'Masa Azul', description: 'Masa de maíz azul', priceCents: 0, currency: 'MXN', group: 'masa', available: true },
      { id: 'cheese', name: 'Extra Queso Cotija', description: 'Cotija añejo desmoronado', priceCents: 1000, currency: 'MXN', group: 'extras', available: true },
      { id: 'avocado', name: 'Aguacate', description: 'Medio aguacate en rebanadas', priceCents: 1500, currency: 'MXN', group: 'extras', available: true }
    ];
  }
  function initialState() {
    const dishes = [
      ['huarache', 'Huarache de Asada', 'Huaraches', 8500, 'Masa hecha a mano, carne asada, frijoles, cotija, crema y salsa.', 'https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_db75814d02_1b437c974642d683.png', ['Cilantro', 'Cebolla picada', 'Limón', 'Salsa verde']],
      ['sope', 'Sope de Chicharrón Prensado', 'Sopes', 3500, 'Masa gruesa con chicharrón prensado, frijoles y salsa verde.', '', ['Lechuga', 'Crema', 'Queso fresco', 'Salsa verde']],
      ['pambazo', 'Pambazo de Papa con Chorizo', 'Pambazos', 5000, 'Pan bañado en guajillo con papa, chorizo, lechuga y crema.', 'https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_4938590a45_a54c3c8ba55ab6d3.png', ['Lechuga', 'Crema', 'Queso fresco']],
      ['gordita', 'Gordita de Chicharrón', 'Gorditas', 3000, 'Gordita de masa rellena de chicharrón y salsa fresca.', 'https://storage.googleapis.com/uxpilot-auth.appspot.com/gen_825ad9b877_cafe10009ac0f8f2.png', ['Cilantro', 'Cebolla picada', 'Salsa roja']],
      ['quesadilla', 'Quesadilla de Flor de Calabaza', 'Quesadillas', 4500, 'Flor de calabaza y queso derretido en tortilla de maíz hecha a mano.', '', ['Crema', 'Salsa verde']]
    ];
    return { version: 2, revision: 0, nextOrderNumber: 2084,
      settings: { currency: 'MXN', taxBasisPoints: 0, taxConfigured: false, timeZone: 'America/Mexico_City', locale: 'es' },
      menu: dishes.map(([id, name, category, priceCents, description, imageUrl, included]) => ({ id, name, category, priceCents, currency: 'MXN', description, available: true, imageUrl, included, options: options() })),
      orders: [], payments: [], shifts: [], cashDrops: [], audit: [], hardwareJobs: [] };
  }
  function getOpenShift(state) { return state.shifts.find(s => s && !s.closedAt) || null; }
  function verifiedReceipts(state) {
    const records = key => Array.isArray(state?.[key]) ? state[key] : [];
    const rawPayments = records('payments');
    const validRecords = key => records(key).filter(row => row && typeof row === 'object' && !Array.isArray(row));
    const orderRecords = validRecords('orders'), paymentRecords = validRecords('payments'), shiftRecords = validRecords('shifts');
    const countIds = rows => rows.reduce((map, row) => { map.set(row.id, (map.get(row.id) || 0) + 1); return map; }, new Map());
    const orderIds = countIds(orderRecords), paymentIds = countIds(paymentRecords), shiftIds = countIds(shiftRecords);
    const orders = new Map(orderRecords.map(order => [order.id, order]));
    const shifts = new Map(shiftRecords.map(shift => [shift.id, shift]));
    const linkedOrderCounts = paymentRecords.reduce((map, payment) => { map.set(payment.orderId, (map.get(payment.orderId) || 0) + 1); return map; }, new Map());
    const receipts = [];
    for (const payment of paymentRecords) {
      const order = orders.get(payment.orderId), shift = shifts.get(payment.shiftId);
      if (!order || !shift || typeof order.id !== 'string' || !order.id || typeof payment.id !== 'string' || !payment.id || !shift.id) continue;
      if (orderIds.get(order.id) !== 1 || paymentIds.get(payment.id) !== 1 || shiftIds.get(shift.id) !== 1 || linkedOrderCounts.get(order.id) !== 1) continue;
      if (payment.method !== 'cash' || order.paymentStatus !== 'paid' || order.paymentId !== payment.id || !['pending', 'preparing', 'ready', 'completed'].includes(order.status)) continue;
      if (!currencies.has(order.currency) || order.currency !== payment.currency || order.currency !== shift.currency) continue;
      if (![order.subtotalCents, order.taxCents, order.totalCents, payment.totalCents, payment.tenderedCents, payment.changeCents].every(validAmount)) continue;
      if (!order.totalCents || order.subtotalCents + order.taxCents !== order.totalCents || payment.totalCents !== order.totalCents || payment.tenderedCents - payment.changeCents !== order.totalCents) continue;
      if (payment.subtotalCents !== undefined && payment.subtotalCents !== order.subtotalCents || payment.taxCents !== undefined && payment.taxCents !== order.taxCents) continue;
      if (!validTimestamp(payment.paidAt) || !validTimestamp(order.paidAt) || payment.paidAt !== order.paidAt) continue;
      if (!Array.isArray(order.items) || !order.items.length || !order.items.every(line => line &&
        typeof line.menuItemId === 'string' && !!line.menuItemId && typeof line.name === 'string' && !!line.name.trim() &&
        Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 99 && validAmount(line.unitPriceCents) && validAmount(line.lineTotalCents) &&
        line.lineTotalCents === line.quantity * line.unitPriceCents && line.currency === order.currency && Array.isArray(line.options) &&
        line.options.every(option => option && validAmount(option.priceCents) && option.currency === order.currency))) continue;
      if (order.items.reduce((total, line) => total + line.lineTotalCents, 0) !== order.subtotalCents) continue;
      receipts.push({ order, payment });
    }
    const missingPayments = orderRecords.filter(order => order.paymentStatus === 'paid' && !linkedOrderCounts.has(order.id)).length;
    return { receipts, excluded: rawPayments.length - receipts.length + missingPayments };
  }
  function isVerifiedPaid(state, order) {
    return !!order && verifiedReceipts(state).receipts.some(receipt => receipt.order.id === order.id);
  }
  function shiftSummary(state, shiftId) {
    const shift = state.shifts.find(s => s && s.id === shiftId) || (!shiftId ? getOpenShift(state) : null);
    if (!shift) return { currency: state.settings.currency, floatCents: 0, salesCents: 0, tenderedCents: 0, changeCents: 0, dropsCents: 0, expectedCents: 0, orderCount: 0, excludedReceipts: 0 };
    const verified = verifiedReceipts(state);
    const payments = verified.receipts.map(receipt => receipt.payment).filter(p => p.shiftId === shift.id && p.currency === shift.currency);
    const sum = (records, field) => records.reduce((total, row) => total + row[field], 0);
    const tenderedCents = sum(payments, 'tenderedCents');
    const changeCents = sum(payments, 'changeCents');
    const salesCents = tenderedCents - changeCents;
    const dropsCents = sum(state.cashDrops.filter(d => d && d.shiftId === shift.id && d.currency === shift.currency && validAmount(d.amountCents) && state.cashDrops.filter(other => other && other.id === d.id).length === 1), 'amountCents');
    const floatCents = validAmount(shift.floatCents) ? shift.floatCents : 0;
    const computedExpected = floatCents + salesCents - dropsCents;
    return { currency: shift.currency, floatCents, tenderedCents, changeCents, salesCents, dropsCents,
      expectedCents: shift.closedAt && validAmount(shift.expectedCentsAtClose) ? shift.expectedCentsAtClose : computedExpected,
      orderCount: payments.length, excludedReceipts: state.payments.filter(p => p && p.shiftId === shift.id).length - payments.length };
  }
  function createEngine({ state = initialState(), persist = async () => {} } = {}) {
    let current = migrateState(state);
    let queue = Promise.resolve();
    const listeners = new Set();
    // `data` carries the ids and before/after values a screen needs to offer an undo.
    function audit(s, action, message, data) { const entry = { id: uid(), at: now(), action, message }; if (data) entry.data = data; s.audit.push(entry); }
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
        const item = s.menu.find(m => m.id === line.menuItemId);
        if (!item) throw new Error(`${line.name} is no longer on the menu. Rebuild this order before taking payment.`);
        if (item.currency !== order.currency) fail('Menu currency changed. Rebuild this order before taking payment.', 'LEGACY_ORDER_CURRENCY');
        if (!item.available) throw new Error(`${item.name} is sold out. Rebuild this order before taking payment.`);
        line.options.forEach(option => { if (!item.options.find(o => o.id === option.id && o.available && o.currency === order.currency)) throw new Error(`${option.name} is sold out or changed currency. Rebuild this order before taking payment.`); });
      });
    }
    function itemData(data) {
      const name = cleanText(data.name); const category = cleanText(data.category, 50);
      if (!name || !category) throw new Error('Dish name and category are required.');
      const imageUrl = cleanText(data.imageUrl, 2000);
      if (imageUrl && !/^https?:\/\//i.test(imageUrl)) throw new Error('Image URL must start with https:// or http://.');
      return { name, category, description: cleanText(data.description, 500), priceCents: cents(data.priceCents, 'Price', false), imageUrl, included: cleanIncluded(data.included) };
    }
    const api = {
      getState: () => clone(current),
      getOrder: id => clone(current.orders.find(o => o.id === id) || null),
      getOpenShift: () => clone(getOpenShift(current)),
      shiftSummary: id => shiftSummary(current, id),
      money: (value, currency = current.settings.currency, locale = current.settings.locale) => money(value, currency, locale), parseMoney,
      verifiedReceipts: () => clone(verifiedReceipts(current)),
      isVerifiedPaid: order => isVerifiedPaid(current, order),
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      createDraft(data) { return mutate(s => {
        if (!Array.isArray(data.items) || !data.items.length || data.items.length > 100) throw new Error('Add at least one item to the order.');
        const customerName = cleanText(data.customerName, 80); if (!customerName) throw new Error('Customer name is required.');
        const orderType = data.orderType || 'takeout'; if (!['takeout', 'counter', 'dine_in'].includes(orderType)) throw new Error('Invalid order type.');
        const tableNumber = data.tableNumber == null ? null : Number(data.tableNumber);
        if (tableNumber !== null && (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 999)) throw new Error('Invalid table number.');
        const customerPhone = cleanText(data.customerPhone, 24);
        if (customerPhone && !/^[0-9+() .-]{7,24}$/.test(customerPhone)) throw new Error('Enter a valid phone number or leave it blank.');
        const normalizedLines = data.items.map(line => {
          if (!line || typeof line.menuItemId !== 'string') throw new Error('Invalid menu item.');
          if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) throw new Error('Quantity must be between 1 and 99.');
          const ids = line.optionIds ?? []; if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new Error('Invalid modifier selection.');
          const removed = line.removed ?? [];
          if (!Array.isArray(removed) || removed.some(name => typeof name !== 'string') || new Set(removed).size !== removed.length) throw new Error('Invalid topping selection.');
          return { menuItemId: line.menuItemId, quantity: line.quantity, optionIds: [...ids].sort(), removed: [...removed].sort(), onTheSide: line.onTheSide === true, notes: cleanText(line.notes, 300) };
        });
        const submissionId = data.submissionId == null ? uid() : String(data.submissionId).toLowerCase();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(submissionId)) fail('Submission ID must be a UUID.', 'INVALID_SUBMISSION_ID');
        const submissionFingerprint = JSON.stringify({ customerName, customerPhone, orderType, tableNumber, items: normalizedLines });
        const existing = s.orders.find(order => order.submissionId === submissionId);
        if (existing) {
          if (existing.submissionFingerprint !== submissionFingerprint) fail('This submission ID was already used for a different order.', 'SUBMISSION_CONFLICT', 409);
          return existing;
        }
        const currency = s.settings.currency;
        if (!currencies.has(currency)) throw new Error('Unsupported order currency.');
        const items = normalizedLines.map(line => {
          const item = menuFor(s, line.menuItemId); if (!item.available) throw new Error(`${item.name} is sold out.`);
          if (item.currency !== currency) fail(`${item.name} has legacy ${item.currency} prices. Reprice the dish in ${currency} before ordering.`, 'LEGACY_MENU_CURRENCY');
          const ids = line.optionIds;
          const selected = ids.map(id => { const option = item.options.find(o => o.id === id && o.available); if (!option) throw new Error('A selected modifier is unavailable.'); return clone(option); });
          if (selected.some(option => option.currency !== currency)) fail('A modifier has legacy prices. Reprice all modifiers before ordering.', 'LEGACY_MENU_CURRENCY');
          if (selected.filter(o => o.group === 'masa').length !== 1 || selected.filter(o => o.group === 'extras').length > 2) throw new Error('Choose one masa base and up to two extras.');
          cents(item.priceCents, 'Dish price', false); selected.forEach(option => cents(option.priceCents, 'Modifier price'));
          const included = item.included || [];
          if (line.removed.some(name => !included.includes(name))) throw new Error('Invalid topping selection.');
          const unitPriceCents = item.priceCents + selected.reduce((sum, o) => sum + o.priceCents, 0);
          return { menuItemId: item.id, name: item.name, quantity: line.quantity, currency, unitPriceCents, lineTotalCents: cents(unitPriceCents * line.quantity, 'Line total', false), options: selected, removed: line.removed, onTheSide: line.onTheSide && line.removed.length < included.length, notes: line.notes };
        });
        const subtotalCents = cents(items.reduce((sum, line) => sum + line.lineTotalCents, 0), 'Order total', false);
        if (!Number.isInteger(s.settings.taxBasisPoints) || s.settings.taxBasisPoints < 0 || s.settings.taxBasisPoints > 10000) throw new Error('Invalid tax configuration.');
        const taxCents = Math.round(subtotalCents * s.settings.taxBasisPoints / 10000);
        const order = { id: uid(), submissionId, submissionFingerprint, number: `MF-${s.nextOrderNumber++}`, customerName, customerPhone, orderType, tableNumber, items, currency, subtotalCents, taxCents, totalCents: cents(subtotalCents + taxCents), status: 'draft', paymentStatus: 'unpaid', paymentId: null, createdAt: now(), updatedAt: now(), paidAt: null, preparingAt: null, readyAt: null, completedAt: null };
        s.orders.push(order); audit(s, 'order_draft', `${order.number} held for upfront cash payment.`); return order;
      }); },
      cancelDraft(id) { return mutate(s => {
        const order = orderFor(s, id);
        if (order.status === 'cancelled') return order;
        if (order.status !== 'draft' || order.paymentStatus !== 'unpaid') throw new Error('Only an unpaid order can be cancelled.');
        order.status = 'cancelled'; order.updatedAt = now();
        audit(s, 'order_cancelled', `${order.number} cancelled before payment.`, { orderId: order.id }); return order;
      }); },
      payOrder(id, tenderedCents, cashierId = 'Cashier 1') { return mutate(s => {
        const order = orderFor(s, id);
        if (isVerifiedPaid(s, order)) return { order, payment: s.payments.find(p => p.id === order.paymentId), alreadyPaid: true };
        if (order.status !== 'draft' || order.paymentStatus !== 'unpaid') throw new Error('Only an unpaid draft can be finalized.');
        if (order.currency !== s.settings.currency) fail('This draft uses legacy currency. Rebuild it using the current menu before taking payment.', 'LEGACY_ORDER_CURRENCY');
        const shift = getOpenShift(s); if (!shift) throw new Error('Open a cash drawer shift and record the starting float first.');
        if (shift.currency !== order.currency) fail('Close the legacy currency drawer shift before taking current-currency payments.', 'SHIFT_CURRENCY_MISMATCH');
        cents(tenderedCents, 'Cash tendered', false);
        if (tenderedCents < order.totalCents) throw new Error(`Insufficient cash. ${money(order.totalCents - tenderedCents, order.currency)} still due.`);
        available(s, order);
        const paidAt = now(); const payment = { id: uid(), orderId: id, shiftId: shift.id, currency: order.currency, method: 'cash', subtotalCents: order.subtotalCents, taxCents: order.taxCents, totalCents: order.totalCents, tenderedCents, changeCents: tenderedCents - order.totalCents, paidAt, cashierId: cleanText(cashierId, 80) || shift.cashierId, drawerKickStatus: 'pending' };
        s.payments.push(payment);
        Object.assign(order, { status: 'pending', paymentStatus: 'paid', paymentId: payment.id, paidAt, updatedAt: paidAt });
        audit(s, 'cash_payment', `${order.number} (${order.currency}): received ${money(tenderedCents, order.currency)}, returned ${money(payment.changeCents, order.currency)}; sale ${money(order.totalCents, order.currency)}. Dispatched to kitchen.`);
        return { order, payment, alreadyPaid: false };
      }); },
      advanceOrder(id, expectedStatus) { return mutate(s => {
        const order = orderFor(s, id); if (!isVerifiedPaid(s, order)) throw new Error('Cash payment must be verified before kitchen dispatch.');
        if (expectedStatus && order.status !== expectedStatus) throw new Error('Another kitchen screen already updated this ticket. Check its current status.');
        const next = { pending: 'preparing', preparing: 'ready', ready: 'completed' }[order.status];
        if (!next) throw new Error('This order cannot advance.');
        order.status = next; order.updatedAt = now(); order[{ preparing: 'preparingAt', ready: 'readyAt', completed: 'completedAt' }[next]] = order.updatedAt;
        audit(s, 'kitchen_status', `${order.number} marked ${next}.`); return order;
      }); },
      openShift(floatCents, cashierId = 'Cashier 1') { return mutate(s => {
        const existing = getOpenShift(s);
        if (existing) throw new Error(existing.currency !== s.settings.currency ? 'Close the legacy USD drawer shift before opening an MXN shift.' : 'A drawer shift is already open.');
        cents(floatCents, 'Starting float');
        const shift = { id: uid(), currency: s.settings.currency, floatCents, cashierId: cleanText(cashierId, 80) || 'Cashier 1', openedAt: now(), closedAt: null, actualCents: null, varianceCents: null, expectedCentsAtClose: null };
        s.shifts.push(shift); audit(s, 'shift_open', `${shift.cashierId} opened ${shift.currency} drawer with ${money(floatCents, shift.currency)} float.`); return shift;
      }); },
      recordCashDrop(amountCents, note = '', cashierId = 'Cashier 1') { return mutate(s => {
        const shift = getOpenShift(s); if (!shift) throw new Error('Open a drawer shift first.');
        cents(amountCents, 'Cash drop', false); if (amountCents > shiftSummary(s, shift.id).expectedCents) throw new Error('Cash drop exceeds the expected drawer balance.');
        const drop = { id: uid(), shiftId: shift.id, currency: shift.currency, amountCents, note: cleanText(note, 300), cashierId: cleanText(cashierId, 80), createdAt: now() };
        s.cashDrops.push(drop); audit(s, 'cash_drop', `${shift.currency} ${money(amountCents, shift.currency)} moved to safe${drop.note ? `: ${drop.note}` : ''}.`); return drop;
      }); },
      closeShift(actualCents, cashierId = 'Cashier 1') { return mutate(s => {
        const shift = getOpenShift(s); if (!shift) throw new Error('No drawer shift is open.'); cents(actualCents, 'Actual cash count');
        const summary = shiftSummary(s, shift.id);
        Object.assign(shift, { closedAt: now(), expectedCentsAtClose: summary.expectedCents, actualCents, varianceCents: actualCents - summary.expectedCents, closedBy: cleanText(cashierId, 80) });
        audit(s, 'shift_close', `${shift.currency} drawer audited: expected ${money(summary.expectedCents, shift.currency)}, counted ${money(actualCents, shift.currency)}, variance ${money(shift.varianceCents, shift.currency)}.`); return shift;
      }); },
      updateMenuItem(id, patch) { return mutate(s => {
        const item = menuFor(s, id); const old = clone(item); const merged = { ...item, ...patch };
        Object.assign(item, itemData(merged)); if ('available' in patch) { if (typeof patch.available !== 'boolean') throw new Error('Availability must be true or false.'); item.available = patch.available; }
        if ('priceCents' in patch) { item.currency = s.settings.currency; item.options.forEach(option => { if (option.priceCents === 0) option.currency = s.settings.currency; }); }
        // One entry per kind of change, each with the data needed to undo it. A save that changes nothing writes nothing.
        const ref = { menuItemId: item.id, name: item.name };
        if (old.priceCents !== item.priceCents || old.currency !== item.currency) audit(s, 'menu_price', `${item.name} changed from ${old.currency} ${money(old.priceCents, old.currency)} to ${item.currency} ${money(item.priceCents, item.currency)}.`, { ...ref, fromCents: old.priceCents, toCents: item.priceCents, fromCurrency: old.currency, currency: item.currency });
        if (old.available !== item.available) audit(s, 'menu_stock', `${item.name} marked ${item.available ? 'in stock' : 'out of stock'}.`, { ...ref, available: item.available });
        if (['name', 'category', 'description', 'imageUrl'].some(field => old[field] !== item[field]) || JSON.stringify(old.included || []) !== JSON.stringify(item.included)) audit(s, 'menu_edit', `${item.name} details updated.`, ref);
        return item;
      }); },
      addMenuItem(data) { return mutate(s => { const item = { id: uid(), ...itemData(data), currency: s.settings.currency, available: true, options: options() }; s.menu.push(item); audit(s, 'menu_add', `${item.name} added at ${item.currency} ${money(item.priceCents, item.currency)}.`, { menuItemId: item.id, name: item.name, priceCents: item.priceCents, currency: item.currency }); return item; }); },
      deleteMenuItem(id) { return mutate(s => {
        const item = menuFor(s, id); s.menu = s.menu.filter(m => m.id !== id);
        audit(s, 'menu_delete', `${item.name} removed from the menu.`, { menuItemId: item.id, name: item.name, priceCents: item.priceCents, currency: item.currency }); return item;
      }); },
      updateMenuOption(menuId, optionId, patch) { return mutate(s => {
        const item = menuFor(s, menuId); const option = item.options.find(o => o.id === optionId); if (!option) throw new Error('Modifier not found.');
        if ('priceCents' in patch) { option.priceCents = cents(patch.priceCents, 'Modifier price'); option.currency = s.settings.currency; }
        if ('available' in patch) { if (typeof patch.available !== 'boolean') throw new Error('Invalid availability.'); option.available = patch.available; }
        audit(s, 'modifier_edit', `${item.name} · ${option.name}: ${option.currency} ${money(option.priceCents, option.currency)}, ${option.available ? 'in stock' : 'out of stock'}.`, { menuItemId: item.id, optionId: option.id, name: `${item.name} · ${option.name}`, available: option.available }); return option;
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
  const clientActions = ['createDraft', 'cancelDraft', 'payOrder', 'advanceOrder', 'openShift', 'recordCashDrop', 'closeShift', 'updateMenuItem', 'addMenuItem', 'deleteMenuItem', 'updateMenuOption'];
  function createBrowserStore() {
    let state = initialState(); const listeners = new Set();
    let connectionStatus = { connected: false, syncedAt: null, hasConfirmedState: false, revision: null };
    function connection(ok) {
      connectionStatus.connected = ok;
      document.dispatchEvent(new CustomEvent('masaflow:connection', { detail: clone(connectionStatus) }));
    }
    function accept(incoming) {
      if (!incoming || !Number.isSafeInteger(incoming.revision) || incoming.revision < 0 || !Array.isArray(incoming.orders)) throw new Error('Invalid service state.');
      if (connectionStatus.hasConfirmedState && incoming.revision < state.revision) return false;
      state = incoming;
      connectionStatus = { connected: true, syncedAt: now(), hasConfirmedState: true, revision: state.revision };
      connection(true);
      listeners.forEach(fn => { try { fn(clone(state)); } catch (error) { console.error(error); } });
      return true;
    }
    function unconfirmed() {
      const error = new Error('The transaction result could not be confirmed. Reconnect and check the ledger before retrying.');
      error.code = 'TRANSACTION_UNCONFIRMED'; return error;
    }
    function preferredLocale() {
      try { return globalThis.MasaFlowI18n?.getLocale() || localStorage.getItem('masaflow.locale') || state.settings.locale || 'es'; }
      catch (_) { return state.settings.locale || 'es'; }
    }
    const api = {
      getState: () => clone(state), getOrder: id => clone(state.orders.find(o => o.id === id) || null),
      getOpenShift: () => clone(getOpenShift(state)), shiftSummary: id => shiftSummary(state, id),
      isVerifiedPaid: order => isVerifiedPaid(state, order), verifiedReceipts: () => clone(verifiedReceipts(state)),
      getConnectionStatus: () => clone(connectionStatus), getConnection: () => clone(connectionStatus),
      money: (value, currency = state.settings.currency, locale = preferredLocale()) => money(value, currency, locale), parseMoney,
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
    clientActions.forEach(action => { api[action] = async (...args) => {
      if (action === 'createDraft' && args[0] && !args[0].submissionId) args[0] = { ...args[0], submissionId: uid() };
      await api.ready;
      if (action === 'advanceOrder' && args.length === 1) args.push(api.getOrder(args[0])?.status);
      let response; try { response = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, args }) }); } catch (_) { connection(false); throw unconfirmed(); }
      let data; try { data = await response.json(); } catch (_) { connection(false); throw unconfirmed(); }
      if (!response.ok) {
        const error = new Error(data.error || 'The action could not be saved.'); error.code = data.code || 'ACTION_REJECTED'; error.status = response.status; error.statusCode = response.status; throw error;
      }
      try { accept(data.state); } catch (_) { connection(false); throw unconfirmed(); } return data.result;
    }; });
    async function connect() {
      try {
        const response = await fetch('/api/state'); if (!response.ok) throw new Error('Service unavailable.'); accept(await response.json());
      } catch (error) {
        if (connectionStatus.hasConfirmedState && connectionStatus.connected) return;
        connection(false); error.code = 'SERVICE_UNAVAILABLE'; throw error;
      }
    }
    api.reconnect = () => { api.ready = connect(); api.ready.catch(() => {}); return api.ready; };
    api.ready = connect();
    api.ready.catch(() => {});
    (function listen() {
      const stream = new EventSource('/api/events');
      stream.onmessage = event => { try { accept(JSON.parse(event.data)); api.ready = Promise.resolve(); } catch (_) { connection(false); } };
      // Network drops retry on their own; an HTTP error closes the stream for good, so reopen it.
      stream.onerror = () => { connection(false); if (stream.readyState === 2 /* CLOSED */) setTimeout(listen, 3000); };
    })();
    return api;
  }
  return { createEngine, initialState, migrateState, createBrowserStore, money, parseMoney, clientActions, validTimestamp, verifiedReceipts, isVerifiedPaid, shiftSummary };
});
