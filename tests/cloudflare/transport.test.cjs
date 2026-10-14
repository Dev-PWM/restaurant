'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
test('cloud transport rejects acknowledgements during closing and disconnects without buffering actions', async () => {
  const original = new Map(['WebSocket','location','navigator'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let ws;
  class FakeWebSocket {
    static OPEN = 1; static CLOSING = 2;
    readyState = 0;
    sent = [];
    constructor() { ws = this; }
    send(value) { this.sent.push(value); }
    close() { this.readyState = 3; this.onclose?.(); }
    open() { this.readyState = 1; this.onopen(); }
  }
  let socket;
  try {
    for (const [name, value] of Object.entries({ WebSocket: FakeWebSocket, location: new URL('https://staff.example'), navigator: { onLine: true } })) Object.defineProperty(globalThis, name, { value, configurable: true });
    const { CloudSocket } = await import('../../shared/ui/cloud-socket.ts');
    socket = new CloudSocket({ sessionId: 'test', token: '', delta: true });
    socket.connect(); ws.open();
    assert.equal(ws.sent.length, 1);
    ws.readyState = FakeWebSocket.CLOSING;
    await assert.rejects(socket.timeout(100).emitWithAck('submit_client_order', {}), /Offline/);
    const reply = new Promise(resolve => socket.timeout(100).emit('pos_order_paid', {}, resolve));
    assert.match((await reply).message, /Offline/);
    ws.readyState = FakeWebSocket.OPEN;
    const pending = socket.timeout(100).emitWithAck('pos_order_paid', {});
    socket.disconnect();
    await assert.rejects(pending, /Connection closed/);
    assert.equal(socket.connected, false);
    socket.connect(); ws.open();
    assert.equal(ws.sent.length, 1, 'reconnect sends only hello, never a queued payment');
  } finally {
    socket?.disconnect();
    for (const [name, descriptor] of original) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name];
  }
});
