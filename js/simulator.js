/**
 * Demo simulator – generates realistic price data when no live session is configured.
 * Simulates GBM (Geometric Brownian Motion) with trend + mean-reversion.
 */

class Simulator {
  constructor() {
    this._timers  = {};
    this._tickers = {};   // asset -> { price, trend, vol }
    this._handlers = {};
  }

  start(asset, period, onCandle, onTick) {
    const key = `${asset}|${period}`;
    if (this._timers[key]) this.stop(asset, period);

    // Init price state
    if (!this._tickers[asset]) {
      const base = this._basePrice(asset);
      this._tickers[asset] = {
        price:    base,
        trend:    (Math.random() - 0.5) * 0.00002,
        vol:      base * 0.0003,
        mean:     base,
        trendTTL: 200,
      };
    }

    // Build initial candle history
    const history = this._buildHistory(asset, period, 300);
    onCandle(history);

    // Tick interval (every ~500ms)
    const timer = setInterval(() => {
      const tick = this._nextTick(asset);
      onTick(tick);
    }, 500);

    this._timers[key] = timer;
  }

  stop(asset, period) {
    const key = `${asset}|${period}`;
    clearInterval(this._timers[key]);
    delete this._timers[key];
  }

  stopAll() {
    for (const t of Object.values(this._timers)) clearInterval(t);
    this._timers = {};
  }

  /* ── Internals ─── */

  _nextTick(asset) {
    const s = this._tickers[asset];

    // Occasionally flip trend
    s.trendTTL--;
    if (s.trendTTL <= 0) {
      s.trend    = (Math.random() - 0.48) * 0.00003;
      s.trendTTL = 80 + Math.floor(Math.random() * 200);
    }

    // Mean-reversion force
    const reversion = (s.mean - s.price) * 0.0001;

    // GBM step
    const driftedVol = s.vol * (0.8 + Math.random() * 0.4);
    const step       = (Math.random() - 0.5) * 2 * driftedVol + s.trend + reversion;
    s.price          = Math.max(s.price * 0.99, s.price + step);

    return {
      asset,
      price:     s.price,
      time:      Math.floor(Date.now() / 1000),
      open:      s.price - step,
      open_time: Math.floor(Date.now() / 1000),
    };
  }

  _buildHistory(asset, period, count) {
    const s     = this._tickers[asset];
    let   p     = s.price * 0.995;
    const now   = Math.floor(Date.now() / 1000);
    const start = now - period * count;
    const out   = [];

    for (let i = 0; i < count; i++) {
      const time  = start + i * period;
      const open  = p;
      const moves = Array.from({ length: Math.max(4, period / 15) })
        .map(() => p + (Math.random() - 0.5) * 2 * s.vol);

      const high  = Math.max(open, ...moves);
      const low   = Math.min(open, ...moves);
      const close = moves[moves.length - 1];

      out.push({ time, open, high, low, close, volume: 50 + Math.random() * 150 });
      p = close;
    }

    s.price = p;
    return out;
  }

  _basePrice(asset) {
    const bases = {
      EURUSD_otc: 1.0850, GBPUSD_otc: 1.2700, USDJPY_otc: 151.50,
      EURUSD: 1.0850, GBPUSD: 1.2700, USDJPY: 151.50,
      AUDUSD_otc: 0.6520, USDCAD_otc: 1.3620, USDCHF_otc: 0.9150,
      '#AAPL_otc': 185.0, '#TSLA_otc': 242.0, BTCUSD: 65000,
    };
    return bases[asset] || 1.0000;
  }
}
