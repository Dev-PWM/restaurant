'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { createService } = require('../server.js');

test('Socket.io server handles submit_client_order, pos_order_paid, and pos_update_status with bi-directional broadcasts', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mf-socket-'));
  const service = await createService({ dataDirectory: directory, printerHost: '' });
  
  t.after(async () => {
    await service.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const port = await new Promise(resolve => {
    service.server.listen(0, '127.0.0.1', () => resolve(service.server.address().port));
  });
  const url = `http://127.0.0.1:${port}`;

  // Open shift first so orders can be paid
  await service.engine.openShift(50000);

  const customer = io(url, { transports: ['websocket'] });
  const pos = io(url, { transports: ['websocket'] });
  const kitchen = io(url, { transports: ['websocket'] });

  t.after(() => {
    customer.disconnect();
    pos.disconnect();
    kitchen.disconnect();
  });

  await Promise.all([
    new Promise(res => customer.on('connect', res)),
    new Promise(res => pos.on('connect', res)),
    new Promise(res => kitchen.on('connect', res))
  ]);

  // 1. Verify submit_client_order
  const posOrderPromise = new Promise(resolve => pos.once('new_client_order', resolve));
  const orderSubmission = {
    customerName: 'Elena Rostova',
    orderType: 'dine_in',
    tableNumber: 4,
    items: [{ menuItemId: 'huarache', quantity: 2, optionIds: ['white', 'cheese'] }]
  };

  const createdOrder = await new Promise((resolve, reject) => {
    customer.emit('submit_client_order', orderSubmission, res => {
      if (res.success) resolve(res.order);
      else reject(new Error(res.error));
    });
  });

  assert.ok(createdOrder.id);
  assert.equal(createdOrder.customerName, 'Elena Rostova');
  assert.equal(createdOrder.status, 'draft');

  const posReceivedOrder = await posOrderPromise;
  assert.equal(posReceivedOrder.id, createdOrder.id);
  assert.equal(posReceivedOrder.customerName, 'Elena Rostova');

  // 2. Verify pos_order_paid
  const kitchenTicketPromise = new Promise(resolve => kitchen.once('kitchen_new_ticket', resolve));
  const customerPaidPromise = new Promise(resolve => customer.once('order_status_updated', resolve));

  const paidResult = await new Promise((resolve, reject) => {
    pos.emit('pos_order_paid', {
      orderId: createdOrder.id,
      tenderedCents: 20000,
      cashierId: 'Cashier 1'
    }, res => {
      if (res.success) resolve(res);
      else reject(new Error(res.error));
    });
  });

  assert.ok(paidResult.payment);
  assert.equal(paidResult.order.status, 'pending');

  const kitchenTicket = await kitchenTicketPromise;
  assert.equal(kitchenTicket.id, createdOrder.id);
  assert.equal(kitchenTicket.status, 'pending');

  const customerPaidNotice = await customerPaidPromise;
  assert.equal(customerPaidNotice.orderId, createdOrder.id);
  assert.equal(customerPaidNotice.status, 'pending');

  // 3. Verify pos_update_status: cooking -> ready
  const cookingPromise = new Promise(resolve => customer.once('status_change', resolve));
  await new Promise((resolve, reject) => {
    pos.emit('pos_update_status', { orderId: createdOrder.id, status: 'cooking' }, res => {
      if (res.success) resolve(res.order);
      else reject(new Error(res.error));
    });
  });

  const cookingUpdate = await cookingPromise;
  assert.equal(cookingUpdate.orderId, createdOrder.id);
  assert.equal(cookingUpdate.status, 'preparing');

  const readyPromise = new Promise(resolve => customer.once('status_change', resolve));
  await new Promise((resolve, reject) => {
    pos.emit('pos_update_status', { orderId: createdOrder.id, status: 'ready' }, res => {
      if (res.success) resolve(res.order);
      else reject(new Error(res.error));
    });
  });

  const readyUpdate = await readyPromise;
  assert.equal(readyUpdate.orderId, createdOrder.id);
  assert.equal(readyUpdate.status, 'ready');
});
