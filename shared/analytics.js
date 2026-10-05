'use strict';
const { verifiedReceipts, shiftSummary, validTimestamp } = require('../assets/masaflow-store.js');

const PERIODS = new Set(['day', 'week', 'month', 'year']);
const STATUSES = new Set(['pending', 'preparing', 'ready']);
const DAY = 86400000;
function dateParts(value, timeZone) {
  if (!validTimestamp(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: p.hour };
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
const dateKey = value => new Date(value).toISOString().slice(0, 10);
function normalizeScope(input = {}, timeZone = 'America/Mexico_City', observedAt = new Date().toISOString()) {
  const value = key => input instanceof URLSearchParams ? input.get(key) : input[key];
  const requestedTab = value('tab') || value('view');
  const tab = requestedTab === 'owner' || requestedTab === 'sales' ? 'owner' : 'operations';
  const period = PERIODS.has(value('period')) ? value('period') : 'day';
  const date = validDate(value('date')) ? value('date') : dateParts(observedAt, timeZone).date;
  const lang = (value('lang') || value('locale')) === 'en' ? 'en' : 'es';
  const anchor = new Date(`${date}T00:00:00Z`);
  let start = anchor.valueOf(), end = start + DAY;
  if (period === 'week') { start -= ((anchor.getUTCDay() + 6) % 7) * DAY; end = start + 7 * DAY; }
  if (period === 'month') { start = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1); end = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1); }
  if (period === 'year') { start = Date.UTC(anchor.getUTCFullYear(), 0, 1); end = Date.UTC(anchor.getUTCFullYear() + 1, 0, 1); }
  return { tab, view: tab, period, date, lang, startDate: dateKey(start), endDate: dateKey(end) };
}
function makeBuckets(scope) {
  const result = [];
  const locale = scope.lang === 'es' ? 'es-MX' : 'en-US';
  if (scope.period === 'day') {
    for (let hour = 0; hour < 24; hour++) { const h = String(hour).padStart(2, '0'); result.push({ date: `${scope.date}T${h}:00`, label: `${h}:00`, receiptsCents: 0, ticketCount: 0 }); }
  } else if (scope.period === 'year') {
    const year = Number(scope.startDate.slice(0, 4));
    for (let month = 0; month < 12; month++) result.push({ date: dateKey(Date.UTC(year, month, 1)), label: new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short' }).format(new Date(Date.UTC(year, month, 1))), receiptsCents: 0, ticketCount: 0 });
  } else {
    for (let day = new Date(`${scope.startDate}T00:00:00Z`).valueOf(); dateKey(day) < scope.endDate; day += DAY) result.push({ date: dateKey(day), label: scope.period === 'week' ? new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short' }).format(new Date(day)) : String(new Date(day).getUTCDate()), receiptsCents: 0, ticketCount: 0 });
  }
  return result;
}
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}
function definitions(lang, currency, timeZone, taxConfigured, taxBasisPoints) {
  const es = lang === 'es';
  const taxNote = taxConfigured
    ? es ? `Tasa actual configurada: ${taxBasisPoints / 100}%. No modifica tickets anteriores.` : `Current configured rate: ${taxBasisPoints / 100}%. Historical tickets are not repriced.`
    : es ? `Tasa actual sin configurar: ${taxBasisPoints / 100}%.` : `Current unconfigured rate: ${taxBasisPoints / 100}%.`;
  return [
    { id: 'cash_receipts', label: es ? 'Cobros en efectivo' : 'Cash receipts', definition: es ? 'Suma de pagos en efectivo verificados, incluido el impuesto, por fecha de pago. Incluye tickets aún en cocina; excluye borradores, fondo inicial y retiros.' : 'Verified cash-payment totals, including tax, by payment date. Includes tickets still in the kitchen; excludes drafts, float and drops.', formula: 'sum(verifiedPayment.totalCents)', unit: currency },
    { id: 'net_sales', label: es ? 'Ventas sin impuesto' : 'Sales excluding tax', definition: es ? 'Suma del subtotal conservado en los mismos tickets pagados.' : 'Sum of immutable order subtotals for the same paid receipts.', formula: 'sum(verifiedOrder.subtotalCents)', unit: currency },
    { id: 'tax_collected', label: es ? 'Impuesto cobrado' : 'Tax collected', definition: `${es ? 'Impuesto conservado en los mismos tickets pagados.' : 'Immutable tax for the same paid receipts.'} ${taxNote}`, formula: 'sum(verifiedOrder.taxCents)', unit: currency },
    { id: 'ticket_count', label: es ? 'Tickets pagados' : 'Paid tickets', definition: es ? 'Cantidad de pagos únicos que corresponden a un ticket pagado verificado.' : 'Count of unique payments linked to verified paid tickets.', formula: 'count(verifiedPayment)', unit: 'count' },
    { id: 'average_ticket', label: es ? 'Ticket promedio' : 'Average ticket', definition: es ? 'Cobros divididos entre tickets pagados. Sin pagos, no hay promedio.' : 'Cash receipts divided by paid tickets. No average is reported without receipts.', formula: 'cash_receipts / ticket_count', unit: currency },
    { id: 'drawer_variance', label: es ? 'Diferencia de caja' : 'Drawer variance', definition: es ? 'Conteo físico menos el saldo esperado congelado al cerrar cada turno, en la moneda de ese turno. Cero representa conciliación exacta.' : 'Physical count minus frozen expected cash for each closed shift, in that shift currency. Zero is exact reconciliation.', formula: 'actualCents - expectedCentsAtClose', unit: currency },
    { id: 'pickup_minutes', label: es ? 'Pago a entrega' : 'Paid to pickup', definition: es ? `Mediana de completedAt − paidAt para tickets verificados entregados hoy en ${timeZone}. Incluye la espera antes de preparar; muestra tamaño de muestra.` : `Median completedAt − paidAt for verified tickets completed today in ${timeZone}. Includes waiting before preparation; sample size is shown.`, formula: 'median(completedAt - paidAt) / 60000', unit: 'minutes' },
    { id: 'active_tickets', label: es ? 'Tickets en cocina' : 'Kitchen tickets', definition: es ? 'Todos los tickets verificados recibidos, en preparación o listos, independientemente del filtro de ventas.' : 'All verified received, preparing or ready tickets, independent of sales filters.', formula: 'count(verifiedOrder where status in pending,preparing,ready)', unit: 'count' },
    { id: 'expected_cash', label: es ? 'Efectivo esperado' : 'Expected drawer cash', definition: es ? 'Fondo inicial más efectivo recibido menos cambio y retiros registrados.' : 'Starting float plus cash tendered minus change and recorded drops.', formula: 'floatCents + tenderedCents - changeCents - dropsCents', unit: currency }
  ];
}
function buildAnalytics(state, input = {}, { observedAt = new Date().toISOString(), summaryAvailable = false } = {}) {
  const currency = state.settings.currency, timeZone = state.settings.timeZone;
  const taxConfigured = state.settings.taxConfigured === true, taxBasisPoints = state.settings.taxBasisPoints;
  const scope = normalizeScope(input, timeZone, observedAt);
  const verified = verifiedReceipts(state);
  const currencyTotals = [...new Set(verified.receipts.map(x => x.payment.currency))].sort().map(code => {
    const rows = verified.receipts.filter(({ payment }) => { const date = dateParts(payment.paidAt, timeZone)?.date; return payment.currency === code && date >= scope.startDate && date < scope.endDate; });
    return { currency: code, receiptsCents: rows.reduce((sum, x) => sum + x.payment.totalCents, 0), ticketCount: rows.length };
  });
  const selected = verified.receipts.filter(({ order, payment }) => {
    const key = dateParts(payment.paidAt, timeZone)?.date;
    return order.currency === currency && key >= scope.startDate && key < scope.endDate;
  });
  const buckets = makeBuckets(scope), bucketMap = new Map(buckets.map(x => [x.date, x]));
  const items = new Map(); let receiptsCents = 0, subtotalCents = 0, taxCents = 0;
  for (const { order, payment } of selected) {
    receiptsCents += payment.totalCents; subtotalCents += order.subtotalCents; taxCents += order.taxCents;
    const p = dateParts(payment.paidAt, timeZone);
    const key = scope.period === 'day' ? `${p.date}T${p.hour}:00` : scope.period === 'year' ? `${p.date.slice(0, 7)}-01` : p.date;
    const bucket = bucketMap.get(key); if (bucket) { bucket.receiptsCents += payment.totalCents; bucket.ticketCount++; }
    for (const line of order.items) {
      const key = `${line.menuItemId}\u0000${line.name}`;
      const item = items.get(key) || { menuItemId: line.menuItemId, name: line.name, quantity: 0, receiptsCents: 0 };
      item.quantity += line.quantity; item.receiptsCents += line.lineTotalCents; items.set(key, item);
    }
  }
  const active = verified.receipts.filter(({ order }) => STATUSES.has(order.status));
  const ageMinutes = paidAt => Math.max(0, Math.floor((Date.parse(observedAt) - Date.parse(paidAt)) / 60000));
  const activeOrders = active.map(({ order, payment }) => ({ id: order.id, ticket: order.number, status: order.status, paidAt: payment.paidAt, totalCents: order.totalCents, currency: order.currency, ageMinutes: ageMinutes(payment.paidAt) })).sort((a, b) => Date.parse(a.paidAt) - Date.parse(b.paidAt) || a.id.localeCompare(b.id));
  const today = dateParts(observedAt, timeZone).date;
  let invalidCompletionTimes = 0; const durations = [];
  for (const { order, payment } of verified.receipts) {
    if (order.status !== 'completed') continue;
    const completed = dateParts(order.completedAt, timeZone), duration = Date.parse(order.completedAt) - Date.parse(payment.paidAt);
    if (!completed || !Number.isFinite(duration) || duration < 0) { invalidCompletionTimes++; continue; }
    if (completed.date === today) durations.push(duration / 60000);
  }
  const shifts = state.shifts.filter(x => x && typeof x === 'object');
  const validCurrency = code => ['MXN', 'USD'].includes(code);
  const shift = shifts.find(x => typeof x.id === 'string' && x.id && validCurrency(x.currency) && !x.closedAt);
  const currentShift = shift ? { id: shift.id, currency: shift.currency, ...shiftSummary(state, shift.id) } : null;
  if (currentShift) currentShift.receiptsCents = currentShift.salesCents;
  const audits = shifts.filter(x => x.closedAt);
  const validAudit = x => typeof x.id === 'string' && !!x.id && shifts.filter(other => other.id === x.id).length === 1 &&
    validCurrency(x.currency) && validTimestamp(x.closedAt) && Number.isSafeInteger(x.expectedCentsAtClose) && x.expectedCentsAtClose >= 0 &&
    Number.isSafeInteger(x.actualCents) && x.actualCents >= 0 && Number.isSafeInteger(x.varianceCents) &&
    x.varianceCents === x.actualCents - x.expectedCentsAtClose;
  const validatedAudits = audits.filter(validAudit), invalidAudits = audits.length - validatedAudits.length;
  const audit = validatedAudits.sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt) || a.id.localeCompare(b.id))[0];
  const latestAudit = audit ? { id: audit.id, currency: audit.currency, closedAt: audit.closedAt, expectedCents: audit.expectedCentsAtClose, actualCents: audit.actualCents, varianceCents: audit.varianceCents } : null;
  const metricDefinitions = definitions(scope.lang, currency, timeZone, taxConfigured, taxBasisPoints).map(definition =>
    definition.id === 'drawer_variance' ? { ...definition, unit: latestAudit?.currency || currency } :
    definition.id === 'expected_cash' ? { ...definition, unit: currentShift?.currency || currency } : definition);
  const query = new URLSearchParams({ tab: scope.tab, period: scope.period, date: scope.date, lang: scope.lang });
  return {
    revision: state.revision, observedAt, currency, timeZone, timezone: timeZone, scope, summaryAvailable, currencyTotals, taxConfigured, taxBasisPoints,
    quality: { excludedReceipts: verified.excluded, invalidCompletionTimes, invalidAudits },
    sales: { receiptsCents, subtotalCents, taxCents, ticketCount: selected.length, averageCents: selected.length ? receiptsCents / selected.length : null,
      buckets, topItems: [...items.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name) || a.menuItemId.localeCompare(b.menuItemId)),
      recentReceipts: selected.map(({ order, payment }) => ({ orderId: order.id, ticket: order.number, totalCents: payment.totalCents, subtotalCents: order.subtotalCents, taxCents: order.taxCents, currency: order.currency, status: order.status, paidAt: payment.paidAt })).sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt) || a.orderId.localeCompare(b.orderId)) },
    operations: { activeCount: activeOrders.length, counts: { pending: activeOrders.filter(x => x.status === 'pending').length, preparing: activeOrders.filter(x => x.status === 'preparing').length, ready: activeOrders.filter(x => x.status === 'ready').length },
      oldestAgeMinutes: activeOrders.length ? Math.max(...activeOrders.map(x => x.ageMinutes)) : null,
      medianPickupMinutes: median(durations), completedSampleCount: durations.length, completedDate: today, activeOrders, currentShift, latestAudit },
    metricDefinitions,
    evidenceFlow: [
      { title: scope.lang === 'es' ? 'Consulta local confirmada' : 'Confirmed local request', detail: `GET /api/analytics?${query}; committed engine revision ${state.revision}; observedAt ${observedAt}; currency ${currency}; timeZone ${timeZone}.` },
      { title: scope.lang === 'es' ? 'Validación de pagos' : 'Payment validation', detail: 'Unique linked cash payment/order IDs; equal currencies; safe integer centavos; item, subtotal/tax/total reconciliation; tendered − change = total; valid payment timestamp. Inconsistent records are excluded and counted.' },
      { title: scope.lang === 'es' ? 'Poblaciones y cálculos' : 'Populations and calculations', detail: `Sales use paidAt in [${scope.startDate}, ${scope.endDate}) and ${currency}. Kitchen includes all active verified paid tickets. Pickup median uses completedAt on ${today}. Closed drawer values remain frozen and retain original currency. No SQL or external warehouse is used.` }
    ]
  };
}
module.exports = { buildAnalytics, normalizeScope, dateParts, validDate, median };
