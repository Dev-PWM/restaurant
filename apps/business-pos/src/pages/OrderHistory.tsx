import React from 'react';
import { RecentOrders } from './RecentOrders';

export function OrderHistory() {
  return (
    <div className="min-h-screen bg-stone-50 p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Order History &amp; Ledger</h1>
            <p className="text-sm text-stone-500 mt-1">Review finalized cash payments, customer tickets, and drawer balance records.</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/businessDashbord.html"
              className="px-4 py-2 text-xs font-semibold text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
            >
              ← Back to POS Queue
            </a>
            <a
              href="/MenuUI.html"
              className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-colors"
            >
              + New Order
            </a>
          </div>
        </header>

        <main>
          <RecentOrders limit={10} />
        </main>
      </div>
    </div>
  );
}

export default OrderHistory;
export { RecentOrders };
