import React, { useState, useEffect, useCallback } from 'react';
import { Card, Glyph, money } from '../shared/analytics-ui.jsx';

export function RecentOrdersCard({ lang = 'es', currency = 'MXN' }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTx, setSelectedTx] = useState(null);

  const fetchOrders = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/recent-orders?limit=10');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(() => fetchOrders(false), 20000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedTx(null);
    };
    if (selectedTx) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTx]);

  const t = {
    title: lang === 'es' ? 'Órdenes Recientes' : 'Recent Orders',
    subtitle: lang === 'es' ? 'Últimas 10 transacciones en efectivo' : 'Last 10 cash transactions',
    ticket: lang === 'es' ? 'Ticket' : 'Ticket',
    time: lang === 'es' ? 'Hora' : 'Time',
    guest: lang === 'es' ? 'Cliente' : 'Customer',
    items: lang === 'es' ? 'Artículos' : 'Items',
    total: lang === 'es' ? 'Total' : 'Total',
    status: lang === 'es' ? 'Estado' : 'Status',
    empty: lang === 'es' ? 'No hay transacciones registradas todavía.' : 'No transactions recorded yet.',
    refresh: lang === 'es' ? 'Actualizar' : 'Refresh',
    newOrder: lang === 'es' ? 'Crear orden' : 'New order',
    details: lang === 'es' ? 'Detalles de la Orden' : 'Order Details',
    paymentMethod: lang === 'es' ? 'Método de Pago' : 'Payment Method',
    cash: lang === 'es' ? 'Efectivo' : 'Cash',
    tendered: lang === 'es' ? 'Efectivo recibido' : 'Cash tendered',
    change: lang === 'es' ? 'Cambio devuelto' : 'Change returned',
    cashier: lang === 'es' ? 'Cajero' : 'Cashier',
    subtotal: lang === 'es' ? 'Subtotal' : 'Subtotal',
    openInPos: lang === 'es' ? 'Ver en Cola de Cocina' : 'Open in Kitchen Queue',
    close: lang === 'es' ? 'Cerrar' : 'Close',
    drawerKick: lang === 'es' ? 'Apertura de cajón' : 'Drawer kick'
  };

  const formatTime = (iso) => {
    try {
      return new Intl.DateTimeFormat(lang === 'es' ? 'es-MX' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const formatFullDateTime = (iso) => {
    try {
      return new Intl.DateTimeFormat(lang === 'es' ? 'es-MX' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium'
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <>
      <Card
        id="recent-orders-card"
        queryId="recent_orders"
        rows={transactions}
        title={t.title}
        className="mf-recent-orders-card"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <p className="mf-muted" style={{ margin: 0 }}>
            {t.subtitle} · {transactions.length} {lang === 'es' ? 'mostradas' : 'displayed'}
          </p>
          <button
            type="button"
            onClick={() => fetchOrders(true)}
            disabled={refreshing}
            className="mf-icon-button"
            style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent' }}
            aria-label={t.refresh}
            title={t.refresh}
          >
            <Glyph name="refresh" size={16} />
          </button>
        </div>

        {loading ? (
          <p className="mf-muted">{lang === 'es' ? 'Cargando órdenes recientes…' : 'Loading recent orders…'}</p>
        ) : error ? (
          <div className="mf-connection-alert" style={{ margin: '8px 0' }}>
            <span>{error}</span>
            <button type="button" onClick={() => fetchOrders(true)}>{t.refresh}</button>
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 12px' }}>
            <p className="mf-empty">{t.empty}</p>
            <a href="/MenuUI.html" className="mf-button" style={{ display: 'inline-block', marginTop: '8px' }}>
              {t.newOrder} →
            </a>
          </div>
        ) : (
          <div className="mf-table-scroll" role="region" tabIndex={0} aria-label={t.title}>
            <table className="mf-table mf-queue-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>{t.ticket}</th>
                  <th>{t.time}</th>
                  <th>{t.guest}</th>
                  <th>{t.items}</th>
                  <th style={{ textAlign: 'right' }}>{t.total}</th>
                  <th style={{ textAlign: 'center' }}>{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    style={{ cursor: 'pointer' }}
                    className="mf-clickable-row"
                    title={lang === 'es' ? 'Clic para ver desglose detallado' : 'Click to view breakdown'}
                  >
                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                        {tx.orderNumber}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {formatTime(tx.paidAt)}
                    </td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{tx.customerName || 'Walk-in'}</span>
                      <span className="mf-muted" style={{ display: 'block', fontSize: '11px' }}>
                        {tx.orderType === 'dine_in' ? `Mesa ${tx.tableNumber || '—'}` : tx.orderType === 'takeout' ? 'Para llevar' : 'Mostrador'}
                      </span>
                    </td>
                    <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.items && tx.items.length > 0 ? (
                        <span title={tx.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}>
                          {tx.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                        </span>
                      ) : (
                        <span className="mf-muted">—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {money(tx.totalCents, tx.currency || currency, lang)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`mf-badge ${tx.status}`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Transaction Breakdown Modal */}
      {selectedTx && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="recent-order-modal-title"
          onClick={() => setSelectedTx(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--surface, #ffffff)',
              color: 'var(--text, #1c1917)',
              borderRadius: '20px',
              maxWidth: '480px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--border, #e7e5e4)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border, #e7e5e4)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 id="recent-order-modal-title" style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                    {selectedTx.orderNumber}
                  </h3>
                  <span className={`mf-badge ${selectedTx.status}`}>
                    {selectedTx.status}
                  </span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--secondary, #78716c)' }}>
                  {formatFullDateTime(selectedTx.paidAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '20px',
                  lineHeight: 1,
                  cursor: 'pointer',
                  color: 'var(--secondary, #78716c)',
                  padding: '6px',
                  borderRadius: '8px'
                }}
                aria-label={t.close}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Customer & Dining Info */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '12px',
                background: 'var(--background, #f5f5f4)',
                fontSize: '13px'
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--secondary, #78716c)', fontWeight: 600, textTransform: 'uppercase' }}>
                    {t.guest}
                  </div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>
                    {selectedTx.customerName || 'Walk-in'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--secondary, #78716c)', fontWeight: 600, textTransform: 'uppercase' }}>
                    {lang === 'es' ? 'Modalidad' : 'Order Type'}
                  </div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>
                    {selectedTx.orderType === 'dine_in'
                      ? (lang === 'es' ? `Mesa ${selectedTx.tableNumber || '—'}` : `Dine-in · Table ${selectedTx.tableNumber || '—'}`)
                      : selectedTx.orderType === 'takeout'
                        ? (lang === 'es' ? 'Para llevar' : 'Takeout')
                        : (lang === 'es' ? 'Mostrador' : 'Counter')}
                  </div>
                </div>
              </div>

              {/* Items Breakdown */}
              <div>
                <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700 }}>
                  {lang === 'es' ? 'Desglose de Artículos' : 'Items Breakdown'}
                </h4>
                <div style={{
                  border: '1px solid var(--border, #e7e5e4)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  divideY: '1px solid var(--border, #e7e5e4)'
                }}>
                  {selectedTx.items && selectedTx.items.length > 0 ? (
                    selectedTx.items.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '10px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderBottom: idx < selectedTx.items.length - 1 ? '1px solid var(--border, #e7e5e4)' : 'none',
                          background: 'var(--surface, #ffffff)'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>
                            {item.quantity}x {item.name}
                          </div>
                          {item.options && item.options.length > 0 && (
                            <div style={{ fontSize: '11px', color: 'var(--secondary, #78716c)', marginTop: '2px' }}>
                              {item.options.join(' · ')}
                            </div>
                          )}
                        </div>
                        <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: '13px' }}>
                          {money(item.lineTotalCents, selectedTx.currency || currency, lang)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '12px', textAlign: 'center', color: 'var(--secondary)' }}>
                      {lang === 'es' ? 'Sin artículos detallados' : 'No items recorded'}
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Method & Total Breakdown */}
              <div style={{
                background: 'var(--background, #f5f5f4)',
                borderRadius: '14px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--secondary, #78716c)' }}>{t.paymentMethod}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Glyph name="cash" size={16} />
                    <span>{t.cash}</span>
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--secondary, #78716c)' }}>{t.cashier}</span>
                  <span style={{ fontSize: '12px', fontWeight: 500 }}>{selectedTx.cashierId || 'Cashier 1'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--secondary, #78716c)' }}>{t.tendered}</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    {money(selectedTx.tenderedCents, selectedTx.currency || currency, lang)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--secondary, #78716c)' }}>{t.change}</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    {money(selectedTx.changeCents, selectedTx.currency || currency, lang)}
                  </span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--border, #e7e5e4)',
                  marginTop: '4px'
                }}>
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>{t.total}</span>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent, #ea580c)', fontVariantNumeric: 'tabular-nums' }}>
                    {money(selectedTx.totalCents, selectedTx.currency || currency, lang)}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border, #e7e5e4)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              background: 'var(--surface, #ffffff)',
              borderBottomLeftRadius: '20px',
              borderBottomRightRadius: '20px'
            }}>
              <a
                href={`/businessDashbord.html?order=${encodeURIComponent(selectedTx.orderId)}`}
                className="mf-button"
                style={{
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  padding: '8px 16px',
                  borderRadius: '10px'
                }}
              >
                <Glyph name="kitchen" size={16} />
                <span>{t.openInPos}</span>
              </a>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                style={{
                  background: 'var(--control, #f5f5f4)',
                  color: 'var(--text, #1c1917)',
                  border: '1px solid var(--border, #e7e5e4)',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default RecentOrdersCard;
