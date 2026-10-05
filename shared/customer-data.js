'use strict';
const { verifiedReceipts } = require('../assets/masaflow-store.js');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pick = (record, fields) => Object.fromEntries(fields.filter(key => record[key] !== undefined).map(key => [key, record[key]]));
function customerOrder(order, verifiedPaid) {
  return { ...pick(order, ['id', 'submissionId', 'number', 'customerName', 'orderType', 'tableNumber', 'items', 'currency', 'subtotalCents', 'taxCents', 'totalCents', 'status', 'paymentStatus', 'paymentId', 'createdAt', 'updatedAt', 'paidAt', 'preparingAt', 'readyAt', 'completedAt']), verifiedPaid };
}
// Order and submission UUIDs are private tracking links. Public broadcasts never
// include those links, names, phone numbers, receipt rows, or drawer information.
function customerState(state, query = new URLSearchParams()) {
  const receipts = verifiedReceipts(state).receipts;
  const paid = new Map(receipts.map(receipt => [receipt.order.id, receipt]));
  const id = query.get('order'), submission = query.get('submissionId');
  const order = state.orders.find(row => row && ((UUID.test(id || '') && row.id === id.toLowerCase()) || (UUID.test(submission || '') && row.submissionId === submission.toLowerCase())));
  const board = query.get('board') === '1' && !id && !submission;
  const orders = order ? [customerOrder(order, paid.has(order.id))] : board ? receipts.filter(({ order }) => ['pending', 'preparing', 'ready'].includes(order.status)).map(({ order }) => ({ ...pick(order, ['number', 'status', 'paidAt', 'updatedAt']), verifiedPaid: true })) : [];
  const payment = order && paid.get(order.id)?.payment;
  return {
    version: state.version, revision: state.revision, settings: state.settings, menu: state.menu, orders,
    payments: payment ? [pick(payment, ['id', 'orderId', 'currency', 'subtotalCents', 'taxCents', 'totalCents', 'tenderedCents', 'changeCents', 'paidAt'])] : [],
    shifts: [], cashDrops: [], audit: []
  };
}
module.exports = { customerState, customerOrder, UUID };
