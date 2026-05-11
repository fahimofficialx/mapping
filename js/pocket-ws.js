/**
 * Pocket Option WebSocket Protocol Handler
 * Connects to wss://api.pocketoption.com/binary/websocket/v2
 * Protocol: Engine.IO / Socket.IO hybrid
 */

class PocketOptionWS {
  static URL = 'wss://api.pocketoption.com/binary/websocket/v2';

  constructor() {
    this._ws = null;
    this._session = '';
    this._uid = 0;
    this._isDemo = 1;
    this._handlers = {};
    this._subs = new Map();     // "asset|period" -> true
    this._reconnTries = 0;
    this._maxReconn = 8;
    this._reconnTimer = null;
    this._pingTimer = null;
    this.connected = false;
    this.authed = false;
    this._rawLog = [];           // last 50 raw messages for debug
  }

  /* ── Public API ─────────────────────────────────────────── */

  connect(session, uid = 0, isDemo = 1) {
    this._session = session;
    this._uid = uid;
    this._isDemo = isDemo;
    this._maxReconn = 8;
    this._doConnect();
  }

  subscribe(asset, period) {
    const key = `${asset}|${period}`;
    this._subs.set(key, { asset, period });
    if (this.authed) {
      this._sendSubscribe(asset, period);
    }
  }

  unsubscribeAll() {
    this._subs.clear();
  }

  disconnect() {
    this._maxReconn = 0;
    clearTimeout(this._reconnTimer);
    clearInterval(this._pingTimer);
    this._ws?.close();
  }

  on(event, fn) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(fn);
    return () => { this._handlers[event] = this._handlers[event].filter(h => h !== fn); };
  }

  getRawLog() { return [...this._rawLog]; }

  /* ── Internal ───────────────────────────────────────────── */

  _doConnect() {
    if (this._ws) {
      this._ws.onopen = this._ws.onclose = this._ws.onerror = this._ws.onmessage = null;
      try { this._ws.close(); } catch (_) {}
    }

    this.connected = false;
    this.authed = false;
    this._emit('status', { state: 'connecting', msg: 'Connecting to Pocket Option…' });

    try {
      this._ws = new WebSocket(PocketOptionWS.URL);
    } catch (e) {
      this._emit('status', { state: 'error', msg: 'Cannot open WebSocket: ' + e.message });
      return;
    }

    this._ws.onopen    = () => this._onOpen();
    this._ws.onclose   = e  => this._onClose(e);
    this._ws.onerror   = () => this._emit('status', { state: 'error', msg: 'WebSocket error' });
    this._ws.onmessage = e  => this._onMsg(e.data);
  }

  _onOpen() {
    this.connected = true;
    this._reconnTries = 0;
    this._emit('status', { state: 'connected', msg: 'Connected – authenticating…' });

    // Engine.IO heartbeat
    this._pingTimer = setInterval(() => {
      if (this._ws?.readyState === 1) this._ws.send('2');
    }, 20000);
  }

  _onMsg(raw) {
    // Keep a rolling debug log
    this._rawLog.push(raw.slice(0, 200));
    if (this._rawLog.length > 50) this._rawLog.shift();

    // Engine.IO opening handshake → trigger auth
    if (raw.startsWith('0{')) { this._sendAuth(); return; }

    // Socket.IO "connected" ack
    if (raw === '40') { this._sendAuth(); return; }

    // Pong
    if (raw === '3') return;

    // Socket.IO event packet "42[...]"
    if (raw.startsWith('42')) {
      let parsed;
      try { parsed = JSON.parse(raw.slice(2)); } catch (_) { return; }
      this._dispatchEvent(parsed[0], parsed[1]);
    }
  }

  _dispatchEvent(name, data) {
    switch (name) {
      case 'authorization':
      case 'successauth':
      case 'authorizationSuccess':
        this.authed = true;
        this._emit('status', { state: 'authenticated', msg: 'Authenticated ✓' });
        // Re-subscribe to all saved channels
        for (const { asset, period } of this._subs.values()) {
          this._sendSubscribe(asset, period);
        }
        break;

      case 'failAuth':
      case 'authorizationError':
        this._emit('status', { state: 'auth_failed', msg: 'Auth failed – check session ID' });
        break;

      case 'candles':
        this._emit('candles', data);
        break;

      case 'updateStream':
        this._emit('tick', data);
        break;

      case 'loadHistoryPeriod':
      case 'history':
      case 'historicalData':
        this._emit('history', data);
        break;

      case 'orders':
        this._emit('orders', data);
        break;

      case 'openOrder':
      case 'closeOrder':
        this._emit('order_update', { type: name, data });
        break;

      default:
        this._emit('raw_event', { name, data });
    }
  }

  _sendAuth() {
    this._sendRaw(['auth', {
      session:  this._session,
      isDemo:   this._isDemo,
      uid:      this._uid,
      platform: 2,
      isMobile: true,
      version:  '8.23.0',
    }]);
  }

  _sendSubscribe(asset, period) {
    this._sendRaw(['subscribeSymbol', { asset, period }]);
    // Also request candle history (last ~300 candles)
    this._sendRaw(['loadHistoryPeriod', {
      asset,
      period,
      time:  Math.floor(Date.now() / 1000),
      index: 0,
    }]);
  }

  _sendRaw(obj) {
    const msg = '42' + JSON.stringify(obj);
    if (this._ws?.readyState === 1) this._ws.send(msg);
  }

  _emit(event, data) {
    (this._handlers[event] || []).forEach(fn => { try { fn(data); } catch (_) {} });
    (this._handlers['*']   || []).forEach(fn => { try { fn(event, data); } catch (_) {} });
  }

  _onClose(e) {
    this.connected = false;
    this.authed    = false;
    clearInterval(this._pingTimer);
    this._emit('status', { state: 'disconnected', msg: `Disconnected (code ${e.code})` });

    if (this._reconnTries < this._maxReconn) {
      const delay = Math.min(1000 * 2 ** this._reconnTries, 30000);
      this._reconnTries++;
      this._reconnTimer = setTimeout(() => this._doConnect(), delay);
      this._emit('status', { state: 'reconnecting', msg: `Reconnecting in ${(delay/1000).toFixed(0)}s… (${this._reconnTries}/${this._maxReconn})` });
    }
  }
}
