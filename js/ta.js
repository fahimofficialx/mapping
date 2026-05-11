/**
 * Technical Analysis Engine
 * Pure functions – no state, no side-effects.
 */

const TA = (() => {

  /* ── EMA ───────────────────────────────────────────────── */
  function ema(prices, period) {
    if (prices.length < period) return [];
    const k   = 2 / (period + 1);
    const out  = [avg(prices.slice(0, period))];
    for (let i = period; i < prices.length; i++) {
      out.push(prices[i] * k + out[out.length - 1] * (1 - k));
    }
    return out;
  }

  /* ── SMA ─────────────────────────────────────────────────  */
  function sma(prices, period) {
    if (prices.length < period) return [];
    const out = [];
    for (let i = period - 1; i < prices.length; i++) {
      out.push(avg(prices.slice(i - period + 1, i + 1)));
    }
    return out;
  }

  /* ── RSI ───────────────────────────────────────────────── */
  function rsi(prices, period = 14) {
    if (prices.length <= period) return null;

    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const d = prices[i] - prices[i - 1];
      d > 0 ? (gains += d) : (losses -= d);
    }
    let ag = gains / period;
    let al = losses / period;

    const vals = [];
    for (let i = period + 1; i < prices.length; i++) {
      const d = prices[i] - prices[i - 1];
      ag = (ag * (period - 1) + Math.max(d, 0))  / period;
      al = (al * (period - 1) + Math.max(-d, 0)) / period;
      vals.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
    }
    return { value: vals[vals.length - 1], history: vals };
  }

  /* ── MACD ──────────────────────────────────────────────── */
  function macd(prices, fast = 12, slow = 26, sig = 9) {
    if (prices.length < slow + sig) return null;

    const e12  = ema(prices, fast);
    const e26  = ema(prices, slow);
    const off  = e12.length - e26.length;

    const line = e26.map((v, i) => e12[i + off] - v);
    const sigL = ema(line, sig);
    const sigOff = line.length - sigL.length;
    const hist  = sigL.map((v, i) => line[i + sigOff] - v);

    return {
      line:      line[line.length - 1],
      signal:    sigL[sigL.length - 1],
      histogram: hist[hist.length - 1],
      lineHist:  line,
      sigHist:   sigL,
    };
  }

  /* ── Bollinger Bands ───────────────────────────────────── */
  function bollingerBands(prices, period = 20, mult = 2) {
    if (prices.length < period) return null;

    const midArr  = sma(prices, period);
    const upper   = [], lower = [];

    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean  = midArr[i - (period - 1)];
      const std   = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
      upper.push(mean + mult * std);
      lower.push(mean - mult * std);
    }

    const u = upper[upper.length - 1];
    const m = midArr[midArr.length - 1];
    const l = lower[lower.length - 1];

    return {
      upper: u, middle: m, lower: l,
      bandwidth: ((u - l) / m) * 100,
      percentB:  (prices[prices.length - 1] - l) / (u - l),
      upperHist: upper, middleHist: midArr, lowerHist: lower,
    };
  }

  /* ── Stochastic ────────────────────────────────────────── */
  function stochastic(candles, kPeriod = 14, dPeriod = 3) {
    if (candles.length < kPeriod + dPeriod) return null;

    const kVals = [];
    for (let i = kPeriod - 1; i < candles.length; i++) {
      const sl    = candles.slice(i - kPeriod + 1, i + 1);
      const hi    = Math.max(...sl.map(c => c.high));
      const lo    = Math.min(...sl.map(c => c.low));
      const close = sl[sl.length - 1].close;
      kVals.push(hi === lo ? 50 : (close - lo) / (hi - lo) * 100);
    }
    const dVals = sma(kVals, dPeriod);

    return {
      k: kVals[kVals.length - 1],
      d: dVals[dVals.length - 1],
      kHist: kVals,
      dHist: dVals,
    };
  }

  /* ── ATR ───────────────────────────────────────────────── */
  function atr(candles, period = 14) {
    if (candles.length < period + 1) return null;
    const tr = [];
    for (let i = 1; i < candles.length; i++) {
      const c = candles[i], p = candles[i - 1];
      tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    }
    return avg(tr.slice(-period));
  }

  /* ── CCI ───────────────────────────────────────────────── */
  function cci(candles, period = 14) {
    if (candles.length < period) return null;
    const sl = candles.slice(-period);
    const tp = sl.map(c => (c.high + c.low + c.close) / 3);
    const mean = avg(tp);
    const mad  = avg(tp.map(v => Math.abs(v - mean)));
    return mad === 0 ? 0 : (tp[tp.length - 1] - mean) / (0.015 * mad);
  }

  /* ── Williams %R ───────────────────────────────────────── */
  function williamsR(candles, period = 14) {
    if (candles.length < period) return null;
    const sl    = candles.slice(-period);
    const hi    = Math.max(...sl.map(c => c.high));
    const lo    = Math.min(...sl.map(c => c.low));
    const close = sl[sl.length - 1].close;
    return hi === lo ? -50 : ((hi - close) / (hi - lo)) * -100;
  }

  /* ── Trend detection (EMA alignment) ───────────────────── */
  function trendStrength(closes) {
    if (closes.length < 50) return { direction: 'neutral', strength: 0 };
    const e8  = last(ema(closes, 8));
    const e21 = last(ema(closes, 21));
    const e50 = last(ema(closes, 50));

    if (e8 > e21 && e21 > e50) return { direction: 'up',   strength: 0.9 };
    if (e8 < e21 && e21 < e50) return { direction: 'down', strength: 0.9 };
    if (e8 > e21)               return { direction: 'up',   strength: 0.55 };
    if (e8 < e21)               return { direction: 'down', strength: 0.55 };
    return { direction: 'neutral', strength: 0 };
  }

  /* ── Candlestick pattern recognition ────────────────────── */
  function patterns(candles) {
    if (candles.length < 3) return [];
    const result = [];
    const c0 = candles[candles.length - 1];  // latest
    const c1 = candles[candles.length - 2];  // previous
    const c2 = candles[candles.length - 3];  // two back

    const body0   = Math.abs(c0.close - c0.open);
    const range0  = c0.high - c0.low;
    const body1   = Math.abs(c1.close - c1.open);
    const bull0   = c0.close >= c0.open;
    const bull1   = c1.close >= c1.open;
    const bull2   = c2.close >= c2.open;
    const wick0U  = c0.high - Math.max(c0.open, c0.close);
    const wick0L  = Math.min(c0.open, c0.close) - c0.low;

    // Doji
    if (range0 > 0 && body0 < range0 * 0.1)
      result.push({ name: 'Doji', type: 'neutral', strength: 0.5 });

    // Hammer (bullish reversal)
    if (!bull0 === false && wick0L > body0 * 2 && wick0U < body0 * 0.5)
      result.push({ name: 'Hammer', type: 'bullish', strength: 0.72 });

    // Shooting Star (bearish reversal)
    if (!bull0 && wick0U > body0 * 2 && wick0L < body0 * 0.5)
      result.push({ name: 'Shooting Star', type: 'bearish', strength: 0.72 });

    // Bullish Engulfing
    if (!bull1 && bull0 && c0.open < c1.close && c0.close > c1.open)
      result.push({ name: 'Bullish Engulfing', type: 'bullish', strength: 0.82 });

    // Bearish Engulfing
    if (bull1 && !bull0 && c0.open > c1.close && c0.close < c1.open)
      result.push({ name: 'Bearish Engulfing', type: 'bearish', strength: 0.82 });

    // Morning Star (3-candle bullish reversal)
    if (!bull2 && body1 < Math.abs(c2.close - c2.open) * 0.3 &&
        bull0 && c0.close > (c2.open + c2.close) / 2)
      result.push({ name: 'Morning Star', type: 'bullish', strength: 0.88 });

    // Evening Star (3-candle bearish reversal)
    if (bull2 && body1 < Math.abs(c2.close - c2.open) * 0.3 &&
        !bull0 && c0.close < (c2.open + c2.close) / 2)
      result.push({ name: 'Evening Star', type: 'bearish', strength: 0.88 });

    // Three White Soldiers
    if (bull0 && bull1 && bull2 &&
        c0.open > c1.open && c1.open > c2.open &&
        c0.close > c1.close && c1.close > c2.close)
      result.push({ name: 'Three White Soldiers', type: 'bullish', strength: 0.85 });

    // Three Black Crows
    if (!bull0 && !bull1 && !bull2 &&
        c0.open < c1.open && c1.open < c2.open &&
        c0.close < c1.close && c1.close < c2.close)
      result.push({ name: 'Three Black Crows', type: 'bearish', strength: 0.85 });

    // Spinning Top (indecision)
    if (range0 > 0 && body0 < range0 * 0.25 && wick0U > body0 && wick0L > body0)
      result.push({ name: 'Spinning Top', type: 'neutral', strength: 0.45 });

    return result;
  }

  /* ── Support / Resistance ───────────────────────────────── */
  function srLevels(candles, lookback = 60) {
    const sl   = candles.slice(-lookback);
    const supp = [], res = [];

    for (let i = 2; i < sl.length - 2; i++) {
      const isSwingLow  = sl[i].low  < sl[i-1].low  && sl[i].low  < sl[i-2].low  &&
                          sl[i].low  < sl[i+1].low  && sl[i].low  < sl[i+2].low;
      const isSwingHigh = sl[i].high > sl[i-1].high && sl[i].high > sl[i-2].high &&
                          sl[i].high > sl[i+1].high && sl[i].high > sl[i+2].high;
      if (isSwingLow)  supp.push(sl[i].low);
      if (isSwingHigh) res.push(sl[i].high);
    }

    // Cluster nearby levels
    const cluster = (levels, tol = 0.0003) => {
      const out = [];
      for (const l of levels.sort((a,b) => a-b)) {
        if (!out.length || Math.abs(out[out.length-1] - l) / l > tol) out.push(l);
      }
      return out.slice(-4);
    };

    return { support: cluster(supp), resistance: cluster(res) };
  }

  /* ── Volume analysis ─────────────────────────────────────── */
  function volumeAnalysis(candles, period = 20) {
    if (candles.length < period) return null;
    const sl     = candles.slice(-period);
    const vols   = sl.map(c => c.volume || 0);
    const avgVol = avg(vols);
    const last0  = vols[vols.length - 1];
    return {
      current: last0,
      average: avgVol,
      ratio:   avgVol > 0 ? last0 / avgVol : 1,
      isHigh:  last0 > avgVol * 1.5,
    };
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function avg(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
  function last(arr) { return arr[arr.length - 1]; }

  /* ── Run all indicators at once ─────────────────────────── */
  function runAll(candles) {
    if (candles.length < 30) return null;
    const closes = candles.map(c => c.close);

    const rsiRes   = rsi(closes, 14);
    const macdRes  = macd(closes, 12, 26, 9);
    const bbRes    = bollingerBands(closes, 20, 2);
    const stochRes = stochastic(candles, 14, 3);
    const atrRes   = atr(candles, 14);
    const cciRes   = cci(candles, 14);
    const wrRes    = williamsR(candles, 14);
    const trendRes = trendStrength(closes);
    const pats     = patterns(candles);
    const volRes   = volumeAnalysis(candles, 20);
    const srRes    = srLevels(candles, 60);

    const ema8Hist  = ema(closes, 8);
    const ema21Hist = ema(closes, 21);
    const ema50Hist = closes.length >= 50 ? ema(closes, 50) : [];

    return {
      rsi:   rsiRes,
      macd:  macdRes,
      bb:    bbRes,
      stoch: stochRes,
      atr:   atrRes,
      cci:   cciRes,
      wr:    wrRes,
      trend: trendRes,
      patterns: pats,
      volume: volRes,
      sr:    srRes,
      ema: {
        e8:  last(ema8Hist),
        e21: last(ema21Hist),
        e50: ema50Hist.length ? last(ema50Hist) : null,
        e8Hist: ema8Hist,
        e21Hist: ema21Hist,
        e50Hist: ema50Hist,
      },
    };
  }

  return { ema, sma, rsi, macd, bollingerBands, stochastic, atr, cci, williamsR,
           trendStrength, patterns, srLevels, volumeAnalysis, runAll };
})();
