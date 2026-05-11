/**
 * Signal Generator
 * Combines technical indicators → normalized scores → ML probability → CALL/PUT signal
 */

class SignalGenerator {
  static MIN_CONFIDENCE = 18;  // %; signals below this are discarded
  static MIN_CANDLES    = 35;  // minimum history needed

  constructor(mlEngine) {
    this.ml         = mlEngine;
    this.lastSignal = null;
    this.cooldown   = 0;  // seconds since last signal
  }

  /**
   * Generate signal for one specific duration.
   * @param {object[]} candles  OHLCV array (oldest → newest)
   * @param {number}   price    current bid price
   * @param {string}   asset
   * @param {number}   duration trade duration in seconds
   * @returns signal object or null
   */
  generate(candles, price, asset, duration = 60) {
    if (!candles || candles.length < SignalGenerator.MIN_CANDLES) return null;

    const indicators = TA.runAll(candles);
    if (!indicators) return null;

    const { rsi, macd, bb, stoch, cci, wr, trend, patterns: pats, volume, ema } = indicators;

    // ── Score each indicator 0..1 (1 = strong bullish) ──────
    const scores = {};

    // RSI
    if (rsi) {
      const v = rsi.value;
      scores.rsi = v < 25 ? 0.90
                 : v < 35 ? 0.70
                 : v < 45 ? 0.57
                 : v > 75 ? 0.10
                 : v > 65 ? 0.30
                 : v > 55 ? 0.43
                 : 0.50;
    }

    // MACD
    if (macd) {
      const { histogram: h, line, signal } = macd;
      if      (h > 0 && line > 0)  scores.macd = 0.80;
      else if (h > 0 && line < 0)  scores.macd = 0.62;
      else if (h < 0 && line < 0)  scores.macd = 0.20;
      else if (h < 0 && line > 0)  scores.macd = 0.38;
      else                          scores.macd = 0.50;

      // Crossover bonus
      const prevHist = macd.lineHist?.[macd.lineHist.length - 2] ?? 0;
      const prevSig  = macd.sigHist?.[macd.sigHist.length - 2]   ?? 0;
      if (prevHist <= prevSig && macd.line > macd.signal) scores.macd = Math.min(scores.macd + 0.1, 0.95);
      if (prevHist >= prevSig && macd.line < macd.signal) scores.macd = Math.max(scores.macd - 0.1, 0.05);
    }

    // Bollinger Bands
    if (bb) {
      const pct = bb.percentB;
      scores.bb = pct < 0.05 ? 0.85
                : pct < 0.20 ? 0.68
                : pct > 0.95 ? 0.15
                : pct > 0.80 ? 0.32
                : 0.50;
    }

    // Stochastic
    if (stoch) {
      const { k, d } = stoch;
      if      (k < 20 && d < 20)      scores.stoch = 0.82;
      else if (k < 30 && k > d)        scores.stoch = 0.65;  // oversold + K crossing D
      else if (k > 80 && d > 80)       scores.stoch = 0.18;
      else if (k > 70 && k < d)        scores.stoch = 0.35;  // overbought + K dropping
      else if (k > d && k < 50)        scores.stoch = 0.60;
      else if (k < d && k > 50)        scores.stoch = 0.40;
      else                             scores.stoch = 0.50;
    }

    // EMA trend
    if (ema) {
      const { e8, e21, e50 } = ema;
      const above = price > e21;
      if (e8 > e21 && e21 > (e50 || e21))  scores.ema = 0.78;
      else if (e8 < e21 && e21 < (e50 || e21)) scores.ema = 0.22;
      else if (e8 > e21)  scores.ema = above ? 0.65 : 0.58;
      else                scores.ema = above ? 0.42 : 0.35;
    }

    // CCI
    if (cci != null) {
      scores.cci = cci >  150 ? 0.75
                 : cci >   50 ? 0.58
                 : cci < -150 ? 0.25
                 : cci <  -50 ? 0.42
                 : 0.50;
    }

    // Williams %R
    if (wr != null) {
      scores.wr = wr < -80 ? 0.82   // oversold
               : wr < -60 ? 0.62
               : wr > -20 ? 0.18    // overbought
               : wr > -40 ? 0.38
               : 0.50;
    }

    // Volume
    if (volume) {
      const lastCandle = candles[candles.length - 1];
      const bull = lastCandle.close >= lastCandle.open;
      if (volume.isHigh)  scores.volume = bull ? 0.72 : 0.28;
      else                scores.volume = 0.50;
    }

    // Trend alignment
    if (trend) {
      scores.trend = trend.direction === 'up'   ? 0.5 + trend.strength * 0.3
                   : trend.direction === 'down' ? 0.5 - trend.strength * 0.3
                   : 0.50;
    }

    // Pattern average (raw, not ML-weighted)
    if (pats && pats.length) {
      let pScore = 0.50;
      for (const p of pats) {
        const contrib = p.type === 'bullish' ? p.strength
                      : p.type === 'bearish' ? 1 - p.strength
                      : 0.50;
        pScore = (pScore + contrib) / 2;
      }
      scores.pattern = pScore;
    } else {
      scores.pattern = 0.50;
    }

    // ── ML-weighted probability ──────────────────────────────
    const prob      = this.ml.getProbability(scores, pats);
    const direction = prob > 0.5 ? 'CALL' : 'PUT';
    const confidence = Math.abs(prob - 0.5) * 200;  // 0..100 %

    if (confidence < SignalGenerator.MIN_CONFIDENCE) return null;

    // ── Assemble signal ──────────────────────────────────────
    const signal = {
      id:              Date.now(),
      asset,
      direction,
      price,
      duration,
      winProbability:  direction === 'CALL' ? prob : 1 - prob,
      confidence:      +confidence.toFixed(1),
      indicatorScores: scores,
      patterns:        (pats || []).map(p => ({ name: p.name, type: p.type, strength: p.strength })),
      indicators,
      timestamp:       Date.now(),
    };

    this.lastSignal = signal;
    return signal;
  }

  /**
   * Generate future signals for multiple durations from current candle data.
   * Returns array of { duration, direction, probability, confidence }.
   */
  generateFuture(candles, price, asset, durations = [60, 300, 900]) {
    return durations.map(d => {
      const sig = this.generate(candles, price, asset, d);
      if (!sig) return { duration: d, direction: null, probability: 0.5, confidence: 0 };
      return {
        duration:    d,
        direction:   sig.direction,
        probability: sig.winProbability,
        confidence:  sig.confidence,
      };
    }).filter(s => s.confidence >= 10);
  }
}
