/**
 * Adaptive Machine Learning Engine
 * - Tracks all generated signals and their outcomes
 * - Uses Perceptron-style weight updates (gradient descent)
 * - Persists everything in localStorage
 */

class MLEngine {
  static STORAGE_KEYS = {
    weights:  'po_ml_weights',
    history:  'po_trade_history',
    pending:  'po_pending_signals',
    patterns: 'po_pattern_stats',
  };

  static DEFAULT_WEIGHTS = {
    rsi:     1.0,
    macd:    1.0,
    bb:      1.0,
    stoch:   1.0,
    ema:     1.1,
    cci:     0.9,
    wr:      0.9,
    volume:  0.8,
    trend:   1.1,
    pattern: 1.2,
  };

  constructor() {
    this.weights      = this._load(MLEngine.STORAGE_KEYS.weights,  MLEngine.DEFAULT_WEIGHTS);
    this.history      = this._load(MLEngine.STORAGE_KEYS.history,  []);
    this.pending      = this._load(MLEngine.STORAGE_KEYS.pending,  []);
    this.patternStats = this._load(MLEngine.STORAGE_KEYS.patterns, {});

    // Drop stale pending signals (>30 min old)
    const cutoff = Date.now() - 30 * 60 * 1000;
    this.pending = this.pending.filter(p => p.expiresAt > cutoff);
  }

  /* ── Record a newly generated signal ───────────────────── */
  recordSignal(sig) {
    const record = {
      id:             sig.id || Date.now(),
      asset:          sig.asset,
      direction:      sig.direction,
      entryPrice:     sig.price,
      confidence:     sig.confidence,
      winProb:        sig.winProbability,
      indicatorScores: sig.indicatorScores,
      patterns:       sig.patterns || [],
      duration:       sig.duration,
      timestamp:      Date.now(),
      expiresAt:      Date.now() + sig.duration * 1000,
      outcome:        null,
    };
    this.pending.push(record);
    this._save();
    return record;
  }

  /* ── Check pending signals against current price ─────────
     Call this every tick. Returns list of newly resolved trades. */
  resolveOutcomes(asset, currentPrice, now = Date.now()) {
    const resolved = [];

    this.pending = this.pending.filter(sig => {
      if (sig.asset !== asset) return true;
      if (now < sig.expiresAt)   return true;   // not expired yet

      const won = (sig.direction === 'CALL' && currentPrice > sig.entryPrice) ||
                  (sig.direction === 'PUT'  && currentPrice < sig.entryPrice);

      const completed = {
        ...sig,
        exitPrice: currentPrice,
        priceDiff: currentPrice - sig.entryPrice,
        outcome:   won ? 'WIN' : 'LOSS',
        resolvedAt: now,
      };

      this.history.push(completed);
      if (this.history.length > 1000) this.history = this.history.slice(-1000);

      this._learn(completed);
      this._updatePatternStats(completed);
      resolved.push(completed);
      return false;  // remove from pending
    });

    if (resolved.length) this._save();
    return resolved;
  }

  /* ── Perceptron weight update ────────────────────────────── */
  _learn(trade) {
    const LR   = 0.04;  // learning rate
    const won  = trade.outcome === 'WIN';
    const scores = trade.indicatorScores || {};

    for (const [ind, score] of Object.entries(scores)) {
      if (score === 0.5) continue;          // skip neutral

      const agreed = (score > 0.5 && trade.direction === 'CALL') ||
                     (score < 0.5 && trade.direction === 'PUT');

      let delta;
      if (won  &&  agreed) delta =  LR;       // reward
      if (won  && !agreed) delta = -LR * 0.5; // small penalty (disagreed but won)
      if (!won &&  agreed) delta = -LR;       // punish
      if (!won && !agreed) delta =  LR * 0.4; // small reward (disagreed and lost = saved)

      if (delta !== undefined && this.weights[ind] !== undefined) {
        this.weights[ind] = clamp(this.weights[ind] + delta, 0.1, 3.0);
      }
    }
  }

  _updatePatternStats(trade) {
    for (const p of (trade.patterns || [])) {
      if (!this.patternStats[p.name]) {
        this.patternStats[p.name] = { wins: 0, losses: 0, total: 0 };
      }
      const s = this.patternStats[p.name];
      s.total++;
      trade.outcome === 'WIN' ? s.wins++ : s.losses++;
    }
  }

  /* ── Probability calculation ─────────────────────────────── */
  getProbability(indicatorScores, detectedPatterns) {
    let totalW = 0, weightedSum = 0;

    for (const [name, score] of Object.entries(indicatorScores)) {
      const w = this.weights[name] ?? 1.0;
      totalW      += w;
      weightedSum += score * w;
    }

    let base = totalW > 0 ? weightedSum / totalW : 0.5;

    // Blend in pattern historical accuracy
    if (detectedPatterns && detectedPatterns.length > 0) {
      let patScore = 0, patW = 0;
      for (const p of detectedPatterns) {
        const stats = this.patternStats[p.name];
        let patternBias;

        if (stats && stats.total >= 5) {
          patternBias = stats.wins / stats.total;   // learned bias
        } else {
          // Prior from known pattern type
          patternBias = p.type === 'bullish' ? p.strength
                      : p.type === 'bearish' ? 1 - p.strength
                      : 0.5;
        }

        patScore += patternBias * (this.weights.pattern || 1.2);
        patW     += (this.weights.pattern || 1.2);
      }
      if (patW > 0) {
        const patAvg = patScore / patW;
        base = base * 0.65 + patAvg * 0.35;
      }
    }

    return clamp(base, 0.01, 0.99);
  }

  /* ── Stats ──────────────────────────────────────────────── */
  getStats() {
    const total   = this.history.length;
    const last100 = this.history.slice(-100);
    const wins    = last100.filter(t => t.outcome === 'WIN').length;
    const accuracy = last100.length ? (wins / last100.length * 100) : null;

    // Per-asset stats
    const byAsset = {};
    for (const t of this.history.slice(-200)) {
      if (!byAsset[t.asset]) byAsset[t.asset] = { wins: 0, total: 0 };
      byAsset[t.asset].total++;
      if (t.outcome === 'WIN') byAsset[t.asset].wins++;
    }

    return {
      totalTrades:  total,
      recentSample: last100.length,
      wins,
      accuracy,
      byAsset,
      weights:      { ...this.weights },
      patternStats: { ...this.patternStats },
      pendingCount: this.pending.length,
    };
  }

  getPendingForAsset(asset) {
    return this.pending.filter(p => p.asset === asset);
  }

  /* ── Reset learning ──────────────────────────────────────── */
  reset() {
    this.weights      = { ...MLEngine.DEFAULT_WEIGHTS };
    this.history      = [];
    this.pending      = [];
    this.patternStats = {};
    this._save();
  }

  /* ── Persistence ─────────────────────────────────────────── */
  _save() {
    try {
      const K = MLEngine.STORAGE_KEYS;
      localStorage.setItem(K.weights,  JSON.stringify(this.weights));
      localStorage.setItem(K.history,  JSON.stringify(this.history.slice(-500)));
      localStorage.setItem(K.pending,  JSON.stringify(this.pending.slice(-100)));
      localStorage.setItem(K.patterns, JSON.stringify(this.patternStats));
    } catch (_) {}
  }

  _load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      // Merge with fallback to handle new keys
      if (typeof fallback === 'object' && !Array.isArray(fallback)) {
        return { ...fallback, ...parsed };
      }
      return parsed;
    } catch (_) {
      return fallback;
    }
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
