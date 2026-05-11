/**
 * Candle & tick data store with tick-to-candle aggregation.
 */

class DataStore {
  constructor(maxCandles = 500) {
    this._max  = maxCandles;
    this._data = new Map();  // "asset|period" -> Candle[]
    this._tick = new Map();  // asset -> latestPrice
  }

  /* ── Ingest history (array from WS) ─── */
  loadHistory(asset, period, arr) {
    if (!Array.isArray(arr) || arr.length === 0) return;

    const key      = `${asset}|${period}`;
    const existing = this._data.get(key) || [];
    const timeSet  = new Set(existing.map(c => c.time));

    const parsed = arr
      .map(c => this._normalise(c))
      .filter(c => c && !timeSet.has(c.time));

    const merged = [...existing, ...parsed]
      .sort((a, b) => a.time - b.time)
      .slice(-this._max);

    this._data.set(key, merged);
  }

  /* ── Ingest a real-time tick ─── */
  ingestTick(asset, period, tick) {
    const price = tick.price ?? tick.close;
    if (price == null) return;

    this._tick.set(asset, price);

    const key     = `${asset}|${period}`;
    const candles = this._data.get(key) || [];
    if (candles.length === 0) return;

    const last     = candles[candles.length - 1];
    const tickTime = tick.time ?? Math.floor(Date.now() / 1000);

    if (tickTime >= last.time && tickTime < last.time + period) {
      // Update current candle in-place
      last.close  = price;
      last.high   = Math.max(last.high, price);
      last.low    = Math.min(last.low,  price);
      last.volume = (last.volume || 0) + 1;
    } else if (tickTime >= last.time + period) {
      // Start a new candle
      const openTime = tick.open_time ?? (last.time + period);
      candles.push({
        time:   openTime,
        open:   tick.open ?? price,
        high:   price,
        low:    price,
        close:  price,
        volume: 1,
      });
      if (candles.length > this._max) candles.shift();
    }
  }

  /* ── Queries ─── */

  candles(asset, period) {
    return this._data.get(`${asset}|${period}`) || [];
  }

  latestPrice(asset) {
    return this._tick.get(asset) ?? null;
  }

  latestCandle(asset, period) {
    const arr = this.candles(asset, period);
    return arr.length ? arr[arr.length - 1] : null;
  }

  hasData(asset, period) {
    return (this._data.get(`${asset}|${period}`) || []).length >= 10;
  }

  /* ── Helpers ─── */

  _normalise(raw) {
    // WS might send arrays [time, open, close, high, low, vol] or objects
    if (Array.isArray(raw)) {
      const [time, open, close, high, low, vol] = raw;
      return { time: +time, open: +open, high: +high, low: +low, close: +close, volume: +(vol || 0) };
    }
    const time   = +(raw.time || raw.t  || raw.timestamp);
    const open   = +(raw.open || raw.o);
    const high   = +(raw.high || raw.h);
    const low    = +(raw.low  || raw.l);
    const close  = +(raw.close || raw.c);
    const volume = +(raw.volume || raw.v || 0);
    if (!time || !open || !high || !low || !close) return null;
    return { time, open, high, low, close, volume };
  }
}
