'use strict';
const { buildAnalytics, normalizeScope } = require('./analytics.js');

const DEFAULT_MODEL = 'openai/gpt-6-luna';
const ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const TTL = 5 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const METRICS = {
  cash_receipts: 'scope_total', net_sales: 'scope_total', tax_collected: 'scope_total',
  ticket_count: 'scope_total', average_ticket: 'per_ticket', pickup_minutes: 'completed_today',
  active_tickets: 'active_now', expected_cash: 'drawer_balance', drawer_variance: 'closed_audit'
};
function problem(statusCode, code, message) { const error = new Error(message); Object.assign(error, { statusCode, code }); return error; }
function metricValues(dto) {
  const s = dto.sales, o = dto.operations;
  return { cash_receipts: s.receiptsCents, net_sales: s.subtotalCents, tax_collected: s.taxCents,
    ticket_count: s.ticketCount, average_ticket: s.averageCents, pickup_minutes: o.medianPickupMinutes,
    active_tickets: o.activeCount, expected_cash: o.currentShift?.expectedCents ?? null,
    drawer_variance: o.latestAudit?.varianceCents ?? null };
}
function summaryInput(dto) {
  const values = metricValues(dto);
  return {
    scope: dto.scope, revision: dto.revision, currency: dto.currency, timeZone: dto.timeZone,
    metrics: dto.metricDefinitions.map(definition => ({ ...definition, value: values[definition.id],
      unit: definition.id === 'drawer_variance' ? dto.operations.latestAudit?.currency || dto.currency : definition.id === 'expected_cash' ? dto.operations.currentShift?.currency || dto.currency : definition.unit,
      valueScale: ['MXN', 'USD'].includes(definition.unit) ? 'integer minor units (centavos/cents); average may be fractional' : definition.unit })),
    quality: dto.quality, completedDate: dto.operations.completedDate,
    completedSampleCount: dto.operations.completedSampleCount,
    constraints: 'Choose up to three factual metric references. Never forecast, infer causes, recommend transactions, or supply numbers or free prose.'
  };
}
function validateSelection(selection, tab) {
  const allowed = tab === 'owner' ? ['cash_receipts', 'net_sales', 'tax_collected', 'ticket_count', 'average_ticket'] : Object.keys(METRICS);
  if (!selection || typeof selection !== 'object' || Array.isArray(selection) || Object.keys(selection).sort().join(',') !== 'findings,headline' || selection.headline !== `${tab === 'owner' ? 'sales' : 'operations'}_overview` || !Array.isArray(selection.findings) || !selection.findings.length || selection.findings.length > 3) throw problem(502, 'INVALID_SUMMARY', 'The provider returned an invalid summary.');
  const seen = new Set();
  for (const finding of selection.findings) {
    if (!finding || typeof finding !== 'object' || Object.keys(finding).sort().join(',') !== 'commentary,metricId' || !allowed.includes(finding.metricId) || METRICS[finding.metricId] !== finding.commentary || seen.has(finding.metricId)) throw problem(502, 'INVALID_SUMMARY', 'The provider returned unsupported metric references.');
    seen.add(finding.metricId);
  }
  return selection;
}
function renderSummary(selection, dto, locale) {
  const es = locale === 'es'; const values = metricValues(dto);
  const commentary = es ? {
    scope_total: 'Total del período seleccionado.', per_ticket: 'Cobros por ticket pagado del período.',
    completed_today: `Tickets entregados el ${dto.operations.completedDate}; muestra: ${dto.operations.completedSampleCount}.`,
    active_now: 'Todos los tickets pagados activos, sin filtro de fecha.', drawer_balance: 'Saldo calculado del turno abierto.',
    closed_audit: 'Conteo físico menos saldo esperado congelado del último cierre.'
  } : {
    scope_total: 'Total for the selected period.', per_ticket: 'Receipts per paid ticket in the selected period.',
    completed_today: `Tickets completed on ${dto.operations.completedDate}; sample: ${dto.operations.completedSampleCount}.`,
    active_now: 'All active paid tickets, without a date filter.', drawer_balance: 'Calculated balance of the open shift.',
    closed_audit: 'Physical count minus frozen expected balance of the latest closed shift.'
  };
  return {
    headline: es ? selection.headline === 'sales_overview' ? 'Resumen de ventas' : 'Resumen de operación' : selection.headline === 'sales_overview' ? 'Sales summary' : 'Operations summary',
    findings: selection.findings.map(finding => {
      const def = dto.metricDefinitions.find(x => x.id === finding.metricId);
      const unit = finding.metricId === 'drawer_variance' ? dto.operations.latestAudit?.currency || dto.currency : finding.metricId === 'expected_cash' ? dto.operations.currentShift?.currency || dto.currency : def.unit;
      return { metricId: def.id, label: def.label, commentary: commentary[finding.commentary], value: values[def.id], unit, definition: def.definition };
    }),
    caveats: [es ? 'Números calculados por el servidor; la IA selecciona las métricas. Sin pronósticos ni acciones de caja.' : 'Numbers calculated by the server; AI selects the metrics. No forecasts or cash actions.',
      es ? `Impuesto sin configurar (0%). Registros inconsistentes excluidos: ${dto.quality.excludedReceipts}.` : `Tax unconfigured (0%). Inconsistent records excluded: ${dto.quality.excludedReceipts}.`]
  };
}
function createSummaryService({ getState, apiKey = process.env.AI_GATEWAY_API_KEY, model = process.env.AI_GATEWAY_MODEL || DEFAULT_MODEL, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 20000 } = {}) {
  const cache = new Map(), inFlight = new Map(); let calls = [];
  const available = () => typeof apiKey === 'string' && apiKey.trim().length > 0;
  async function summarize(request) {
    if (!request || !request.scope || !Number.isSafeInteger(request.revision) || !['es', 'en'].includes(request.locale)) throw problem(400, 'INVALID_SCOPE', 'Supply displayed scope, locale and revision.');
    const state = getState();
    if (request.revision !== state.revision) throw problem(409, 'STALE_SCOPE', 'The displayed data changed. Refresh before requesting a summary.');
    const observedAt = new Date(now()).toISOString();
    const scope = normalizeScope(request.scope, state.settings.timeZone, observedAt);
    // Require the exact canonical scope the client displayed rather than silently summarizing a different filter.
    for (const field of ['tab', 'period', 'date']) if (request.scope[field] !== scope[field]) throw problem(400, 'INVALID_SCOPE', 'Use the normalized displayed analytics scope.');
    if (request.scope.lang !== request.locale) throw problem(409, 'STALE_SCOPE', 'Summary language must match the displayed data.');
    if (!available()) throw problem(503, 'SUMMARY_UNAVAILABLE', 'AI summaries are unavailable until a server Gateway key is configured.');
    const dto = buildAnalytics(state, scope, { observedAt, summaryAvailable: true });
    const key = JSON.stringify([scope.tab, scope.period, scope.date, request.locale, state.revision, dto.operations.completedDate, model]);
    for (const [entryKey, entry] of cache) if (entry.expires <= now()) cache.delete(entryKey);
    const cached = cache.get(key); if (cached) return { ...cached.value, cached: true };
    if (inFlight.has(key)) return inFlight.get(key);
    calls = calls.filter(timestamp => timestamp > now() - HOUR);
    if (calls.length >= 10) throw problem(429, 'SUMMARY_RATE_LIMIT', 'The hourly limit of ten new summaries has been reached.');
    calls.push(now());
    const task = (async () => {
      const controller = new AbortController(); let timer;
      try {
        const ids = scope.tab === 'owner' ? ['cash_receipts', 'net_sales', 'tax_collected', 'ticket_count', 'average_ticket'] : Object.keys(METRICS);
        const payload = await Promise.race([
          (async () => {
          const response = await fetchImpl(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, signal: controller.signal,
            body: JSON.stringify({ model, max_tokens: 400, messages: [
              { role: 'system', content: `Select the most relevant factual metrics for a short ${request.locale === 'es' ? 'Spanish' : 'English'} ${scope.tab} summary. Return only the schema. Headline must be ${scope.tab === 'owner' ? 'sales' : 'operations'}_overview. Each commentary code must match this mapping: ${JSON.stringify(METRICS)}. No free prose, numbers, forecasts, causes, or transaction actions.` },
              { role: 'user', content: JSON.stringify(summaryInput(dto)) }
            ], response_format: { type: 'json_schema', json_schema: { name: 'masaflow_summary', strict: true, schema: {
              type: 'object', additionalProperties: false, required: ['headline', 'findings'], properties: {
                headline: { type: 'string', enum: [`${scope.tab === 'owner' ? 'sales' : 'operations'}_overview`] },
                findings: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['metricId', 'commentary'], properties: {
                  metricId: { type: 'string', enum: ids }, commentary: { type: 'string', enum: [...new Set(Object.values(METRICS))] }
                } } }
              }
            } } } }) });
          if (!response.ok) throw problem(502, 'GATEWAY_ERROR', 'The Gateway could not generate a summary.');
          return response.json();
          })(),
          new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(problem(504, 'SUMMARY_TIMEOUT', 'Summary generation timed out.')); }, timeoutMs); })
        ]);
        let selection;
        try { selection = JSON.parse(payload.choices?.[0]?.message?.content); } catch (_) { throw problem(502, 'INVALID_SUMMARY', 'The provider returned an invalid summary.'); }
        validateSelection(selection, scope.tab);
        if (getState().revision !== request.revision) throw problem(409, 'STALE_SCOPE', 'Data changed during generation. Refresh and request again.');
        const value = { summary: renderSummary(selection, dto, request.locale), revision: request.revision, generatedAt: new Date(now()).toISOString(), model, cached: false };
        cache.set(key, { value, expires: now() + TTL }); return value;
      } catch (error) {
        if (error.statusCode) throw error;
        throw problem(502, 'GATEWAY_ERROR', 'The Gateway could not generate a summary.');
      } finally { clearTimeout(timer); }
    })();
    inFlight.set(key, task);
    try { return await task; } finally { inFlight.delete(key); }
  }
  return { available, summarize };
}
module.exports = { createSummaryService, summaryInput, validateSelection, DEFAULT_MODEL };
