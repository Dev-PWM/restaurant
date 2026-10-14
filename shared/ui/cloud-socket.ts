/** Minimal event transport matching the provider's Socket.IO calls. Cloud builds
 * use native WebSockets; local Node builds keep their existing Socket.IO server. */
export class CloudSocket {
  auth: { sessionId: string; token: string; delta: boolean };
  connected = false;
  active = false;
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  private pending = new Map<string, { callback: (...args: unknown[]) => void; timer: ReturnType<typeof setTimeout>; timed: boolean }>();
  private reconnect: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private serial = 0;
  constructor(auth: CloudSocket['auth']) { this.auth = auth; }
  on(event: string, callback: (...args: unknown[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
    return this;
  }
  removeAllListeners() { this.listeners.clear(); return this; }
  private notify(event: string, ...args: unknown[]) {
    for (const callback of this.listeners.get(event) || []) callback(...args);
  }
  connect() {
    if (this.ws && this.ws.readyState < WebSocket.CLOSING) return this;
    clearTimeout(this.reconnect);
    this.active = true;
    const url = new URL('/api/realtime', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws || !this.active) { ws.close(); return; }
      this.connected = true;
      // Credentials go in the encrypted message, never in a URL or access log.
      ws.send(JSON.stringify({ event: 'hello', payload: this.auth }));
      this.notify('connect');
      this.heartbeat = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('ping'); }, 25000);
    };
    ws.onmessage = message => {
      if (this.ws !== ws || message.data === 'pong') return;
      try {
        const packet = JSON.parse(message.data);
        if (packet.id && this.pending.has(packet.id)) {
          const pending = this.pending.get(packet.id)!;
          clearTimeout(pending.timer); this.pending.delete(packet.id);
          pending.callback(...(pending.timed ? [null, packet.reply] : [packet.reply]));
        } else if (typeof packet.event === 'string') this.notify(packet.event, packet.payload);
      } catch { this.notify('connect_error', new Error('Invalid server message')); }
    };
    ws.onerror = () => { if (this.ws === ws) this.notify('connect_error', new Error('Connection failed')); };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null; this.connected = false; clearInterval(this.heartbeat);
      this.rejectPending(); this.notify('disconnect');
      if (this.active && navigator.onLine) this.reconnect = setTimeout(() => this.connect(), 3000);
    };
    return this;
  }
  disconnect() {
    this.active = false; this.connected = false;
    clearTimeout(this.reconnect); clearInterval(this.heartbeat);
    const ws = this.ws; this.ws = null; ws?.close();
    this.rejectPending(); this.notify('disconnect');
    return this;
  }
  private rejectPending() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      if (pending.timed) pending.callback(new Error('Connection closed'));
    }
    this.pending.clear();
  }
  private send(event: string, args: unknown[], timeout: number, timed: boolean) {
    const callback = typeof args.at(-1) === 'function' ? args.pop() as (...values: unknown[]) => void : null;
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) {
      if (callback && timed) callback(new Error('Offline'));
      return this;
    }
    const id = callback ? String(++this.serial) : undefined;
    if (id && callback) {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (timed) callback(new Error('Acknowledgement timed out'));
      }, timeout);
      this.pending.set(id, { callback, timer, timed });
    }
    try { this.ws.send(JSON.stringify({ event, payload: args[0] ?? null, id })); }
    catch { this.disconnect(); }
    return this;
  }
  emit(event: string, ...args: unknown[]) { return this.send(event, args, 8000, false); }
  timeout(milliseconds: number) {
    return {
      emit: (event: string, ...args: unknown[]) => this.send(event, args, milliseconds, true),
      emitWithAck: (event: string, ...args: unknown[]) => new Promise<unknown>((resolve, reject) => {
        if (!this.connected) { reject(new Error('Offline')); return; }
        this.send(event, [...args, (error: unknown, reply: unknown) => error ? reject(error) : resolve(reply)], milliseconds, true);
      }),
    };
  }
}
