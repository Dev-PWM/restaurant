'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../assets/masaflow-store.js');
const draft = (line = {}, order = {}) => ({ customerName: 'Ana', orderType: 'counter', tableNumber: null, items: [{ menuItemId: 'huarache', quantity: 1, optionIds: ['white'], ...line }], ...order });

test('removed toppings must come from the dish, and on-the-side needs a topping left to move', async () => {
  const store = createEngine();
  const order = await store.createDraft(draft({ removed: ['Cilantro', 'Limón'], onTheSide: true }));
  assert.deepEqual(order.items[0].removed, ['Cilantro', 'Limón']); assert.equal(order.items[0].onTheSide, true);
  assert.equal(order.totalCents, 8500, 'removing a topping never changes the price');
  await assert.rejects(store.createDraft(draft({ removed: ['Piña'] })), /Invalid topping/);
  await assert.rejects(store.createDraft(draft({ removed: ['Cilantro', 'Cilantro'] })), /Invalid topping/);
  await assert.rejects(store.createDraft(draft({ removed: 'Cilantro' })), /Invalid topping/);
  const bare = await store.createDraft(draft({ removed: ['Cilantro', 'Cebolla picada', 'Limón', 'Salsa verde'], onTheSide: true }));
  assert.equal(bare.items[0].onTheSide, false);
  const plain = await store.createDraft(draft());
  assert.deepEqual(plain.items[0].removed, []); assert.equal(plain.items[0].onTheSide, false);
});

test('toppings and phone are part of the submission fingerprint, so a retry cannot change them', async () => {
  const store = createEngine(); const submissionId = crypto.randomUUID();
  const first = await store.createDraft({ ...draft({ removed: ['Cilantro'] }), submissionId });
  assert.equal((await store.createDraft({ ...draft({ removed: ['Cilantro'] }), submissionId })).id, first.id);
  await assert.rejects(store.createDraft({ ...draft({ removed: ['Limón'] }), submissionId }), /already used/);
  await assert.rejects(store.createDraft({ ...draft({ removed: ['Cilantro'] }, { customerPhone: '5551234567' }), submissionId }), /already used/);
});

test('phone number is optional but rejected when it is not a phone number', async () => {
  const store = createEngine();
  assert.equal((await store.createDraft(draft())).customerPhone, '');
  assert.equal((await store.createDraft(draft({}, { customerPhone: ' (55) 1234-5678 ' }))).customerPhone, '(55) 1234-5678');
  for (const customerPhone of ['call me', '123', '<script>alert(1)</script>']) await assert.rejects(store.createDraft(draft({}, { customerPhone })), /valid phone/);
});

test('an unpaid draft can be cancelled once; paid orders cannot, and a cancelled draft cannot be paid', async () => {
  const store = createEngine(); await store.openShift(0);
  const walkedAway = await store.createDraft(draft());
  assert.equal((await store.cancelDraft(walkedAway.id)).status, 'cancelled');
  assert.equal((await store.cancelDraft(walkedAway.id)).status, 'cancelled', 'a repeated tap is harmless');
  await assert.rejects(store.payOrder(walkedAway.id, 10000), /Only an unpaid draft/);
  await assert.rejects(store.advanceOrder(walkedAway.id), /payment must be verified/);
  const paid = await store.createDraft(draft()); await store.payOrder(paid.id, 10000);
  await assert.rejects(store.cancelDraft(paid.id), /Only an unpaid order/);
  assert.equal(store.getState().payments.length, 1);
});

test('the kitchen records when each step was reached', async () => {
  const store = createEngine(); await store.openShift(0);
  const order = await store.createDraft(draft()); await store.payOrder(order.id, 8500);
  assert.equal(store.getOrder(order.id).preparingAt, null);
  const preparing = await store.advanceOrder(order.id); assert.ok(preparing.preparingAt); assert.equal(preparing.readyAt, null);
  const ready = await store.advanceOrder(order.id); assert.ok(ready.readyAt >= ready.preparingAt);
  const completed = await store.advanceOrder(order.id); assert.ok(completed.completedAt >= completed.readyAt);
});

test('deleting a dish keeps paid history readable and blocks payment of drafts that contain it', async () => {
  const store = createEngine(); await store.openShift(0);
  const paid = await store.createDraft(draft()); await store.payOrder(paid.id, 8500);
  const waiting = await store.createDraft(draft());
  await store.deleteMenuItem('huarache');
  assert.equal(store.getState().menu.some(item => item.id === 'huarache'), false);
  assert.equal(store.getOrder(paid.id).items[0].name, 'Huarache de Asada');
  assert.equal(store.verifiedReceipts().receipts.length, 1, 'the paid receipt still counts');
  await assert.rejects(store.payOrder(waiting.id, 10000), /no longer on the menu/);
  await assert.rejects(store.createDraft(draft()), /Menu item not found/);
  await assert.rejects(store.deleteMenuItem('huarache'), /Menu item not found/);
  assert.equal((await store.advanceOrder(paid.id)).status, 'preparing', 'a paid ticket still moves through the kitchen');
});

test('menu audit entries carry what a screen needs to undo them, and only real changes are logged', async () => {
  const store = createEngine();
  const entries = action => store.getState().audit.filter(entry => entry.action === action);
  await store.updateMenuItem('pambazo', { priceCents: 6500 });
  assert.deepEqual(entries('menu_price')[0].data, { menuItemId: 'pambazo', name: 'Pambazo de Papa con Chorizo', fromCents: 5000, toCents: 6500, fromCurrency: 'MXN', currency: 'MXN' });
  await store.updateMenuItem('pambazo', { priceCents: 6500 });
  assert.equal(store.getState().audit.length, 1, 'saving without a change writes nothing');
  await store.updateMenuItem('gordita', { available: false });
  assert.deepEqual(entries('menu_stock')[0].data, { menuItemId: 'gordita', name: 'Gordita de Chicharrón', available: false });
  await store.updateMenuItem('pambazo', { priceCents: entries('menu_price')[0].data.fromCents });
  assert.equal(store.getState().menu.find(item => item.id === 'pambazo').priceCents, 5000, 'the logged price restores the dish');
  const added = await store.addMenuItem({ name: 'Taco de Pastor', category: 'Tacos', priceCents: 2500, description: '', imageUrl: '', included: ['Piña', 'Cilantro'] });
  assert.deepEqual(entries('menu_add')[0].data, { menuItemId: added.id, name: 'Taco de Pastor', priceCents: 2500, currency: 'MXN' });
  assert.deepEqual(added.included, ['Piña', 'Cilantro']);
  await store.updateMenuItem(added.id, { included: ['Piña'] });
  assert.equal(entries('menu_edit').length, 1);
  await assert.rejects(store.updateMenuItem(added.id, { included: ['Piña', 'piña'] }), /unique/);
  await store.deleteMenuItem(added.id);
  assert.equal(entries('menu_delete')[0].data.menuItemId, added.id);
});
