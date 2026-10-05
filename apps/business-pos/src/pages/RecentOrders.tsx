import React, { useState, useEffect, useCallback, useMemo } from 'react';

export interface OrderItem {
  name: string;
  quantity: number;
  lineTotalCents: number;
  options?: string[];
}

export interface Transaction {
  id: string;
  paymentId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  orderType: 'dine_in' | 'takeout' | 'counter';
  tableNumber: number | null;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  currency: 'MXN' | 'USD';
  totalCents: number;
  tenderedCents: number;
  changeCents: number;
  method: 'cash';
  paidAt: string;
  cashierId: string;
  itemCount: number;
  items: OrderItem[];
}

interface RecentOrdersProps {
  limit?: number;
  autoRefreshIntervalMs?: number;
  onSelectOrder?: (orderId: string) => void;
  className?: string;
}

export function RecentOrders({
  limit = 10,
  autoRefreshIntervalMs = 15000,
  onSelectOrder,
  className = ''
}: RecentOrdersProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const fetchRecentTransactions = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`/api/recent-orders?limit=${limit}`);
      if (!response.ok) {
        throw new Error(`Failed to load recent orders (status ${response.status})`);
      }
      const data = await response.json();
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error fetching recent orders';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchRecentTransactions();
    if (autoRefreshIntervalMs > 0) {
      const timer = setInterval(() => fetchRecentTransactions(false), autoRefreshIntervalMs);
      return () => clearInterval(timer);
    }
  }, [fetchRecentTransactions, autoRefreshIntervalMs]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedTx(null);
    };
    if (selectedTx) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTx]);

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase();
    return transactions.filter(tx =>
      tx.orderNumber.toLowerCase().includes(q) ||
      tx.customerName.toLowerCase().includes(q) ||
      (tx.customerPhone && tx.customerPhone.includes(q)) ||
      tx.cashierId.toLowerCase().includes(q) ||
      tx.items.some(item => item.name.toLowerCase().includes(q))
    );
  }, [transactions, searchQuery]);

  const stats = useMemo(() => {
    const totalVolume = transactions.reduce((sum, tx) => sum + tx.totalCents, 0);
    const avgTicket = transactions.length > 0 ? Math.round(totalVolume / transactions.length) : 0;
    return { count: transactions.length, totalVolume, avgTicket };
  }, [transactions]);

  const formatCurrency = (cents: number, currency: string = 'MXN') => {
    const amount = cents / 100;
    return new Intl.NumberFormat(currency === 'MXN' ? 'es-MX' : 'en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const formatRelativeTime = (isoString: string) => {
    const timestamp = Date.parse(isoString);
    if (isNaN(timestamp)) return isoString;
    const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ago`;
  };

  const getStatusBadge = (status: Transaction['status']) => {
    switch (status) {
      case 'ready':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Ready</span>;
      case 'preparing':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Preparing</span>;
      case 'pending':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">New</span>;
      case 'completed':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-200">Completed</span>;
      case 'cancelled':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">Cancelled</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-stone-100 text-stone-600">{status}</span>;
    }
  };

  const getOrderTypeLabel = (type: Transaction['orderType'], table: number | null) => {
    switch (type) {
      case 'dine_in':
        return table ? `Dine-in · Table ${table}` : 'Dine-in';
      case 'takeout':
        return 'Takeout';
      case 'counter':
        return 'Counter';
      default:
        return type;
    }
  };

  return (
    <div className={`bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-5 border-b border-stone-100 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-stone-900 tracking-tight">Recent Orders</h2>
            <span className="text-xs font-medium px-2 py-0.5 bg-stone-100 text-stone-600 rounded-md tabular-nums">
              Last {limit} Transactions
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Real-time verified cash receipts from the MasaFlow ledger.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-stone-400 font-mono hidden sm:inline-block">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={() => fetchRecentTransactions(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Refresh recent orders"
          >
            <svg
              className={`w-3.5 h-3.5 text-stone-600 ${refreshing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{refreshing ? 'Syncing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-3 divide-x divide-stone-100 bg-stone-50/60 border-b border-stone-100 text-center py-2.5">
        <div>
          <div className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">Transactions</div>
          <div className="text-sm font-bold text-stone-800 font-mono tabular-nums">{stats.count}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">Volume</div>
          <div className="text-sm font-bold text-stone-800 font-mono tabular-nums">{formatCurrency(stats.totalVolume)}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">Avg Ticket</div>
          <div className="text-sm font-bold text-stone-800 font-mono tabular-nums">{formatCurrency(stats.avgTicket)}</div>
        </div>
      </div>

      {/* Search Filter */}
      <div className="p-3 border-b border-stone-100 bg-white flex items-center gap-2">
        <div className="relative flex-1">
          <svg className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter by ticket #, guest name, cashier, or dish..."
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 text-stone-800 placeholder-stone-400"
          />
        </div>
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-xs text-stone-500 hover:text-stone-800 px-2 py-1"
          >
            Clear
          </button>
        )}
      </div>

      {/* Error View */}
      {error && (
        <div className="p-4 m-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchRecentTransactions(true)}
            className="font-semibold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table Content */}
      <div className="flex-1 overflow-x-auto min-h-[220px]">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center justify-between py-2 border-b border-stone-50">
                <div className="h-4 bg-stone-100 rounded w-16"></div>
                <div className="h-4 bg-stone-100 rounded w-28"></div>
                <div className="h-4 bg-stone-100 rounded w-36"></div>
                <div className="h-4 bg-stone-100 rounded w-16"></div>
                <div className="h-4 bg-stone-100 rounded w-20"></div>
              </div>
            ))}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-stone-100 flex items-center justify-center text-stone-400 mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-stone-800">
              {searchQuery ? 'No matching transactions' : 'No transactions recorded yet'}
            </h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto mt-1">
              {searchQuery
                ? 'Try adjusting your search criteria.'
                : 'Finalized cash payments from the register will appear here automatically.'}
            </p>
            {!searchQuery && (
              <a
                href="/MenuUI.html"
                className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-colors"
              >
                Create New Order
              </a>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50/70 text-stone-500 font-medium">
                <th className="py-2.5 px-4">Ticket</th>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Items</th>
                <th className="py-2.5 px-3 text-right">Tendered / Change</th>
                <th className="py-2.5 px-3 text-right">Total</th>
                <th className="py-2.5 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredTransactions.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => {
                    setSelectedTx(tx);
                    if (onSelectOrder) onSelectOrder(tx.orderId);
                  }}
                  className="hover:bg-orange-50/40 cursor-pointer transition-colors group"
                >
                  <td className="py-3 px-4 font-mono font-bold text-stone-900 tabular-nums">
                    {tx.orderNumber}
                  </td>
                  <td className="py-3 px-3 text-stone-500 whitespace-nowrap">
                    <span title={new Date(tx.paidAt).toLocaleString()}>
                      {formatRelativeTime(tx.paidAt)}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-medium text-stone-800">{tx.customerName || 'Walk-in'}</div>
                    <div className="text-[11px] text-stone-400">
                      {getOrderTypeLabel(tx.orderType, tx.tableNumber)}
                    </div>
                  </td>
                  <td className="py-3 px-3 max-w-[200px]">
                    <div className="truncate text-stone-700 font-medium" title={tx.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}>
                      {tx.items.map(i => `${i.quantity}x ${i.name}`).join(', ') || 'No items'}
                    </div>
                    <div className="text-[11px] text-stone-400">
                      {tx.itemCount} {tx.itemCount === 1 ? 'item' : 'items'}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-stone-500">
                    <div>{formatCurrency(tx.tenderedCents, tx.currency)}</div>
                    <div className="text-[10px] text-stone-400">Chg: {formatCurrency(tx.changeCents, tx.currency)}</div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-stone-900 tabular-nums">
                    {formatCurrency(tx.totalCents, tx.currency)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {getStatusBadge(tx.status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Selected Transaction Detail Modal */}
      {selectedTx && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedTx(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Transaction {selectedTx.orderNumber}
                </h3>
                <p className="text-xs text-stone-500 font-mono">
                  Payment ID: {selectedTx.paymentId.slice(0, 8)}… · Cashier: {selectedTx.cashierId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-stone-50 p-3 rounded-xl border border-stone-100">
                <div>
                  <span className="text-stone-400 text-[10px] uppercase font-bold tracking-wider block">Customer</span>
                  <span className="font-semibold text-stone-800">{selectedTx.customerName || 'Walk-in'}</span>
                </div>
                <div>
                  <span className="text-stone-400 text-[10px] uppercase font-bold tracking-wider block">Order Type</span>
                  <span className="font-semibold text-stone-800">{getOrderTypeLabel(selectedTx.orderType, selectedTx.tableNumber)}</span>
                </div>
                <div>
                  <span className="text-stone-400 text-[10px] uppercase font-bold tracking-wider block">Fulfillment</span>
                  <span className="inline-block mt-0.5">{getStatusBadge(selectedTx.status)}</span>
                </div>
                <div>
                  <span className="text-stone-400 text-[10px] uppercase font-bold tracking-wider block">Date & Time</span>
                  <span className="font-mono text-stone-700">{new Date(selectedTx.paidAt).toLocaleTimeString()}</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-stone-800 mb-2">Order Items</h4>
                <div className="divide-y divide-stone-100 border border-stone-100 rounded-xl overflow-hidden">
                  {selectedTx.items.map((item, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between bg-white">
                      <div>
                        <div className="font-medium text-stone-800">
                          {item.quantity}x {item.name}
                        </div>
                        {item.options && item.options.length > 0 && (
                          <div className="text-[11px] text-stone-400">
                            {item.options.join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="font-mono font-semibold text-stone-900 tabular-nums">
                        {formatCurrency(item.lineTotalCents, selectedTx.currency)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-stone-50 rounded-xl p-3.5 border border-stone-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-500 font-medium">Payment Method</span>
                  <span className="font-semibold text-stone-900 inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Verified Cash (Efectivo)</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span>Cashier Register</span>
                  <span className="font-mono text-stone-800">{selectedTx.cashierId || 'Cashier 1'}</span>
                </div>
                <div className="pt-2 border-t border-stone-200/60 space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between text-stone-600">
                    <span>Tendered (Cash)</span>
                    <span className="tabular-nums">{formatCurrency(selectedTx.tenderedCents, selectedTx.currency)}</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Change Given</span>
                    <span className="tabular-nums">{formatCurrency(selectedTx.changeCents, selectedTx.currency)}</span>
                  </div>
                  <div className="flex justify-between text-stone-900 font-bold text-sm pt-1.5 border-t border-stone-200">
                    <span>Order Total</span>
                    <span className="tabular-nums text-orange-600">{formatCurrency(selectedTx.totalCents, selectedTx.currency)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-stone-50 border-t border-stone-100 flex items-center justify-end gap-2">
              <a
                href={`/businessDashbord.html?order=${encodeURIComponent(selectedTx.orderId)}`}
                className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Open in POS Queue
              </a>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                className="px-4 py-2 bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 rounded-lg text-xs font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RecentOrders;
