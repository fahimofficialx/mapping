/**
 * App Controller – wires everything together
 */

class App {
  constructor() {
    // Core
    this.ws        = new PocketOptionWS();
    this.store     = new DataStore(500);
    this.ml        = new MLEngine();
    this.sigGen    = new SignalGenerator(this.ml);
    this.chart     = new ChartRenderer('mainChart', 'volChart');
    this.sim       = new Simulator();

    // State
    this.asset     = 'EURUSD_otc';
    this.period    = 60;           // chart candle period (seconds)
    this.tradeDur  = 60;           // signal trade duration
    this.isDemo    = true;
    this.liveMode  = false;        // true = connected to real WS
    this.lastTick  = null;
    this.lastSignalTime = 0;
    this.signalQueue = [];          // pending signal checks
    this.chartSignals = [];         // signals overlaid on chart

    this._renderLoop = null;
    this._resolveLoop = null;
  }

  init() {
    this._bindElements();
    this._bindWsEvents();
    this._loadSettings();
    this._startDemoMode();
    this._startRenderLoop();
    this._startResolveLoop();
    window.addEventListener('resize', () => { this.chart.resize(); this._renderChart(); });
    this.chart.resize();
    toast('info', 'Demo mode active – connect your Pocket Option session to go live');
  }

  /* ────────────────────────────────────────────────────────── */
  /*  WebSocket event wiring                                    */
  /* ────────────────────────────────────────────────────────── */

  _bindWsEvents() {
    this.ws.on('status', d => this._onWsStatus(d));
    this.ws.on('history', d => this._onHistory(d));
    this.ws.on('candles', d => this._onCandles(d));
    this.ws.on('tick',    d => this._onTick(d));
    this.ws.on('raw_event', ({ name, data }) => {
      // Show unrecognised events in debug log
      this._appendDebug(`[${name}]`, JSON.stringify(data).slice(0, 120));
    });
  }

  _onWsStatus({ state, msg }) {
    const dot   = el('statusDot');
    const label = el('statusLabel');
    if (dot)   dot.className   = `status-dot ${state}`;
    if (label) label.textContent = msg;

    if (state === 'authenticated') {
      this.liveMode = true;
      this.sim.stopAll();
      this.ws.subscribe(this.asset, this.period);
      toast('success', 'Live data feed connected!');
    }
    if (state === 'auth_failed') {
      toast('error', 'Authentication failed – check Session ID');
    }
    if (state === 'disconnected') {
      this.liveMode = false;
    }
  }

  _onHistory(data) {
    // Pocket Option sends history as {asset, period, history: [...]}
    const asset  = data.asset  ?? this.asset;
    const period = data.period ?? this.period;
    const arr    = data.history ?? data.data ?? data;
    if (Array.isArray(arr)) {
      this.store.loadHistory(asset, period, arr);
      this._appendDebug('history', `${arr.length} candles for ${asset}/${period}s`);
    }
    this._renderChart();
  }

  _onCandles(data) {
    this._onHistory(data);
  }

  _onTick(data) {
    const asset  = data.asset  ?? this.asset;
    const period = data.period ?? this.period;
    this.store.ingestTick(asset, period, data);
    this.lastTick = data.price ?? data.close;

    if (asset === this.asset && period === this.period) {
      this._updateLivePrice(this.lastTick);
      this._maybeGenerateSignal();
    }
  }

  /* ────────────────────────────────────────────────────────── */
  /*  Demo / Simulator                                          */
  /* ────────────────────────────────────────────────────────── */

  _startDemoMode() {
    this.sim.start(
      this.asset,
      this.period,
      (candles) => {
        this.store.loadHistory(this.asset, this.period, candles);
        this._renderChart();
      },
      (tick) => {
        if (this.liveMode) return;  // ignore sim ticks once live
        this.store.ingestTick(this.asset, this.period, tick);
        this.lastTick = tick.price;
        this._updateLivePrice(tick.price);
        this._maybeGenerateSignal();
      }
    );
  }

  /* ────────────────────────────────────────────────────────── */
  /*  Signal logic                                              */
  /* ────────────────────────────────────────────────────────── */

  _maybeGenerateSignal() {
    const now = Date.now();
    if (now - this.lastSignalTime < 8000) return;   // throttle: max 1 signal per 8s

    const candles = this.store.candles(this.asset, this.period);
    const price   = this.lastTick ?? this.store.latestPrice(this.asset);
    if (!price || candles.length < 35) return;

    const sig = this.sigGen.generate(candles, price, this.asset, this.tradeDur);
    if (!sig) return;

    this.lastSignalTime = now;
    const record = this.ml.recordSignal(sig);

    // Add to chart overlay
    const lastCandle = candles[candles.length - 1];
    this.chartSignals.push({ ...sig, candleTime: lastCandle.time, outcome: null, id: record.id });
    if (this.chartSignals.length > 30) this.chartSignals.shift();

    this._displaySignal(sig);
    this._addToHistory(sig, record);
    this._updateFutureSignals(candles, price);
    toast(sig.direction === 'CALL' ? 'success' : 'error',
      `${sig.direction} signal on ${this.asset} – ${sig.winProbability > 0.5 ? (sig.winProbability*100).toFixed(0) : ((1-sig.winProbability)*100).toFixed(0)}% win prob`);
  }

  _displaySignal(sig) {
    const call = sig.direction === 'CALL';

    // Direction
    const dirEl = el('sigDir');
    if (dirEl) {
      dirEl.className = `sig-dir ${call ? 'call' : 'put'}`;
      dirEl.innerHTML = `<span class="sig-arrow">${call ? '▲' : '▼'}</span>${sig.direction}`;
    }

    // Probability gauge
    this._drawGauge(sig.winProbability);

    // Confidence + win prob
    setTxt('sigProb',   (sig.winProbability * 100).toFixed(1) + '%');
    setTxt('sigConf',   sig.confidence + '%');
    setTxt('sigAsset',  sig.asset);
    setTxt('sigPrice',  formatPrice(sig.price));
    setTxt('sigDur',    fmtDuration(sig.duration));

    const noteEl = el('sigNote');
    if (noteEl) {
      const inds = sig.indicatorScores;
      const bullInds = Object.entries(inds).filter(([,v]) => v > 0.6).map(([k]) => k.toUpperCase());
      const bearInds = Object.entries(inds).filter(([,v]) => v < 0.4).map(([k]) => k.toUpperCase());
      const pats     = sig.patterns.map(p => p.name).join(', ') || 'none';
      noteEl.textContent =
        `${call ? 'BULL' : 'BEAR'} indicators: ${(call ? bullInds : bearInds).join(', ') || '—'} | Patterns: ${pats}`;
      noteEl.classList.add('visible');
    }

    // Indicator bars
    this._updateIndicatorBars(sig);

    // Patterns
    this._updatePatterns(sig.patterns);
  }

  _drawGauge(prob) {
    const canvas = el('gaugeCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const sz  = canvas.width;
    const cx  = sz / 2, cy = sz / 2;
    const r   = sz * 0.40;
    const pct = prob;
    const col = pct > 0.65 ? '#00d09c' : pct > 0.5 ? '#f5c518' : pct > 0.35 ? '#ff8c2a' : '#ff4560';

    ctx.clearRect(0, 0, sz, sz);

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25, false);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth   = 8;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Value arc
    const startA = Math.PI * 0.75;
    const endA   = startA + pct * Math.PI * 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, endA, false);
    ctx.strokeStyle = col;
    ctx.lineWidth   = 8;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Glow
    ctx.shadowColor = col;
    ctx.shadowBlur  = 14;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // Text
    ctx.fillStyle  = col;
    ctx.font       = 'bold 22px Inter, sans-serif';
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((pct * 100).toFixed(0) + '%', cx, cy - 4);
    ctx.fillStyle  = '#556070';
    ctx.font       = '9px Inter';
    ctx.fillText('WIN PROBABILITY', cx, cy + 16);
    ctx.textBaseline = 'alphabetic';
  }

  _updateIndicatorBars(sig) {
    const container = el('indList');
    if (!container) return;

    const labels = {
      rsi: 'RSI', macd: 'MACD', bb: 'BB', stoch: 'STOCH',
      ema: 'EMA', cci: 'CCI', wr: 'W%R', volume: 'VOL',
      trend: 'TREND', pattern: 'PATT',
    };
    const rawVals = {
      rsi:   sig.indicators?.rsi?.value?.toFixed(1),
      macd:  sig.indicators?.macd?.histogram?.toFixed(5),
      cci:   sig.indicators?.cci?.toFixed(1),
      stoch: sig.indicators?.stoch?.k?.toFixed(1),
    };

    container.innerHTML = Object.entries(sig.indicatorScores).map(([key, score]) => {
      const pct  = score * 100;
      const bull = score > 0.55;
      const bear = score < 0.45;
      const col  = bull ? '#00d09c' : bear ? '#ff4560' : '#8a93a8';
      const sigLbl = bull ? 'BULL' : bear ? 'BEAR' : 'NEU';
      const raw  = rawVals[key] ?? '';
      return `
        <div class="ind-row">
          <span class="ind-name">${labels[key] || key}</span>
          <div class="ind-bar-bg">
            <div class="ind-bar-fill" style="width:${pct}%;background:${col}"></div>
          </div>
          <span class="ind-val" style="color:${col}">${raw}</span>
          <span class="ind-sig ${bull ? 'bull' : bear ? 'bear' : 'neu'}">${sigLbl}</span>
        </div>`;
    }).join('');
  }

  _updatePatterns(pats) {
    const wrap = el('patternsWrap');
    if (!wrap) return;
    if (!pats?.length) {
      wrap.innerHTML = '<span style="color:var(--txt3);font-size:11px">No pattern detected</span>';
      return;
    }
    wrap.innerHTML = pats.map(p =>
      `<span class="pat-tag ${p.type}">${p.name}</span>`
    ).join('');
  }

  _updateFutureSignals(candles, price) {
    const durations = [60, 300, 900, 3600];
    const futures   = this.sigGen.generateFuture(candles, price, this.asset, durations);
    const grid      = el('futureGrid');
    if (!grid) return;

    grid.innerHTML = futures.map(f => {
      const call = f.direction === 'CALL';
      const pct  = f.probability * 100;
      const col  = call ? '#00d09c' : '#ff4560';
      return `
        <div class="future-row">
          <span class="future-tf">${fmtDuration(f.duration)}</span>
          <span class="future-dir ${call ? 'call' : 'put'}">${f.direction} ${call ? '▲' : '▼'}</span>
          <div class="future-prob">
            <span style="font-size:10px;color:var(--txt3)">${f.confidence.toFixed(0)}% conf</span>
            <div class="future-prob-bar">
              <div class="future-prob-fill" style="width:${pct}%;background:${col}"></div>
            </div>
          </div>
          <span class="future-pct" style="color:${col}">${pct.toFixed(0)}%</span>
        </div>`;
    }).join('') || '<span style="color:var(--txt3);font-size:11px;padding:8px">Building signals…</span>';
  }

  _addToHistory(sig, record) {
    const tbody = el('historyTbody');
    if (!tbody) return;

    const call = sig.direction === 'CALL';
    const row  = document.createElement('tr');
    row.id     = `hr_${record.id}`;
    row.innerHTML = `
      <td>${new Date().toLocaleTimeString()}</td>
      <td>${sig.asset.replace('_otc', '')}</td>
      <td><span class="tag ${call ? 'call' : 'put'}">${sig.direction}</span></td>
      <td>${formatPrice(sig.price)}</td>
      <td>${(sig.winProbability * 100).toFixed(0)}%</td>
      <td>${sig.confidence}%</td>
      <td>${fmtDuration(sig.duration)}</td>
      <td><span class="tag pending" id="oc_${record.id}">PENDING</span></td>`;

    tbody.insertBefore(row, tbody.firstChild);
    // Keep last 50 rows
    while (tbody.rows.length > 50) tbody.deleteRow(tbody.rows.length - 1);
  }

  /* ────────────────────────────────────────────────────────── */
  /*  Resolution loop – checks pending trades                   */
  /* ────────────────────────────────────────────────────────── */

  _startResolveLoop() {
    this._resolveLoop = setInterval(() => {
      const price = this.lastTick ?? this.store.latestPrice(this.asset);
      if (!price) return;

      const resolved = this.ml.resolveOutcomes(this.asset, price);
      for (const t of resolved) {
        this._markOutcome(t);
        this._updateMLStats();
      }
    }, 2000);
  }

  _markOutcome(trade) {
    // Update history table row
    const outcomeEl = el(`oc_${trade.id}`);
    if (outcomeEl) {
      outcomeEl.className  = `tag ${trade.outcome === 'WIN' ? 'win' : 'loss'}`;
      outcomeEl.textContent = trade.outcome;
    }

    // Update chart signal overlay
    const cs = this.chartSignals.find(s => s.id === trade.id);
    if (cs) cs.outcome = trade.outcome;

    toast(
      trade.outcome === 'WIN' ? 'success' : 'warn',
      `${trade.outcome}: ${trade.direction} @ ${formatPrice(trade.entryPrice)} → ${formatPrice(trade.exitPrice)} | ML learning…`
    );
  }

  /* ────────────────────────────────────────────────────────── */
  /*  ML Stats display                                          */
  /* ────────────────────────────────────────────────────────── */

  _updateMLStats() {
    const stats = this.ml.getStats();
    setTxt('mlTotal',  stats.totalTrades);
    setTxt('mlWins',   stats.wins);
    setTxt('mlPending', stats.pendingCount);

    if (stats.accuracy != null) {
      setTxt('mlAccuracy', stats.accuracy.toFixed(1) + '%');
      const bar = el('mlAccuracyFill');
      if (bar) bar.style.width = stats.accuracy + '%';
    }

    // Weights
    const wg = el('weightsGrid');
    if (wg) {
      wg.innerHTML = Object.entries(stats.weights)
        .map(([k, v]) => `
          <div class="weight-item">
            <span class="weight-name">${k.toUpperCase()}</span>
            <span class="weight-val">${v.toFixed(2)}</span>
          </div>`).join('');
    }
  }

  /* ────────────────────────────────────────────────────────── */
  /*  Chart render loop                                         */
  /* ────────────────────────────────────────────────────────── */

  _startRenderLoop() {
    this._renderLoop = setInterval(() => this._renderChart(), 500);
  }

  _renderChart() {
    const candles    = this.store.candles(this.asset, this.period);
    const indicators = candles.length >= 30 ? TA.runAll(candles) : null;
    const noData     = el('chartNoData');

    if (candles.length < 5) {
      if (noData) noData.classList.remove('hidden');
      return;
    }
    if (noData) noData.classList.add('hidden');

    this.chart.render(candles, indicators, this.chartSignals);
  }

  /* ────────────────────────────────────────────────────────── */
  /*  UI helpers                                                */
  /* ────────────────────────────────────────────────────────── */

  _updateLivePrice(price) {
    if (!price) return;
    const prev  = parseFloat(el('assetPrice')?.textContent) || price;
    const delta = price - prev;

    setTxt('assetPrice', formatPrice(price));
    const chg  = el('priceChange');
    if (chg) {
      chg.textContent = (delta >= 0 ? '+' : '') + delta.toFixed(5);
      chg.className   = `price-change ${delta >= 0 ? 'up' : 'down'}`;
    }
    this.lastTick = price;
  }

  _appendDebug(tag, msg) {
    const log = el('debugLog');
    if (!log) return;
    const line = document.createElement('div');
    line.style.cssText = 'font-family:monospace;font-size:10px;color:#556070;border-bottom:1px solid #1a1f2a;padding:2px 4px';
    line.textContent   = `[${new Date().toLocaleTimeString()}] ${tag}: ${msg}`;
    log.insertBefore(line, log.firstChild);
    while (log.children.length > 40) log.lastChild.remove();
  }

  /* ────────────────────────────────────────────────────────── */
  /*  DOM event bindings                                        */
  /* ────────────────────────────────────────────────────────── */

  _bindElements() {
    // Asset select
    on('assetSelect', 'change', e => {
      this.asset = e.target.value;
      this.chartSignals = [];
      if (this.liveMode) {
        this.ws.subscribe(this.asset, this.period);
      } else {
        this.sim.stop(this.asset, this.period);
        this._startDemoMode();
      }
    });

    // Period (chart TF)
    on('periodSelect', 'change', e => {
      this.period = +e.target.value;
      this.chartSignals = [];
      if (this.liveMode) this.ws.subscribe(this.asset, this.period);
      else { this.sim.stopAll(); this._startDemoMode(); }
    });

    // TF tabs
    document.querySelectorAll('.tf-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tf-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.period = +tab.dataset.period;
        this.chartSignals = [];
        const sel = el('periodSelect');
        if (sel) sel.value = this.period;
        if (this.liveMode) this.ws.subscribe(this.asset, this.period);
        else { this.sim.stopAll(); this._startDemoMode(); }
      });
    });

    // Duration
    on('durationSelect', 'change', e => { this.tradeDur = +e.target.value; });

    // Connect button
    on('connectBtn', 'click', () => this._handleConnect());

    // Disconnect
    on('disconnectBtn', 'click', () => {
      this.ws.disconnect();
      this.liveMode = false;
      this._startDemoMode();
      toast('info', 'Disconnected – returned to demo mode');
    });

    // Open setup modal
    on('openSetup', 'click', () => el('setupModal')?.classList.remove('hidden'));
    on('closeModal', 'click', () => el('setupModal')?.classList.add('hidden'));

    // Reset ML
    on('resetMLBtn', 'click', () => {
      if (confirm('Reset all ML learning data? This cannot be undone.')) {
        this.ml.reset();
        this._updateMLStats();
        toast('warn', 'ML weights reset to defaults');
      }
    });

    // Debug toggle
    on('debugToggle', 'click', () => {
      const d = el('debugPane');
      if (d) d.style.display = d.style.display === 'none' ? 'block' : 'none';
    });

    // Show WS raw log
    on('wsLogBtn', 'click', () => {
      const logs = this.ws.getRawLog();
      el('debugLog').innerHTML = logs.map(l =>
        `<div style="font-family:monospace;font-size:10px;color:#4c9bff;border-bottom:1px solid #1a1f2a;padding:2px 4px;word-break:break-all">${l}</div>`
      ).join('');
    });

    // Init gauge and stats
    this._drawGauge(0.5);
    this._updateMLStats();

    // Init demo asset label
    setTxt('assetLabel', this.asset.replace('_otc', ' (OTC)'));
  }

  _handleConnect() {
    const session = el('sessionInput')?.value.trim();
    const uid     = +(el('uidInput')?.value.trim() || 0);
    const demo    = el('demoToggle')?.checked;

    if (!session) {
      toast('error', 'Please enter your Session ID');
      el('setupModal')?.classList.remove('hidden');
      return;
    }

    this.isDemo = demo;
    this.sim.stopAll();
    this.ws.connect(session, uid, demo ? 1 : 0);
    el('setupModal')?.classList.add('hidden');
    toast('info', 'Connecting to Pocket Option WebSocket…');
  }

  _loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('po_app_settings') || '{}');
      if (s.session) el('sessionInput').value = s.session;
      if (s.uid)     el('uidInput').value     = s.uid;
      if (s.demo != null) el('demoToggle').checked = s.demo;
      if (s.asset)   { this.asset = s.asset;   el('assetSelect').value  = s.asset; }
      if (s.period)  { this.period = s.period;  el('periodSelect').value = s.period; }
      if (s.tradeDur){ this.tradeDur = s.tradeDur; el('durationSelect').value = s.tradeDur; }
    } catch (_) {}

    // Save on unload
    window.addEventListener('beforeunload', () => {
      try {
        localStorage.setItem('po_app_settings', JSON.stringify({
          session:  el('sessionInput')?.value,
          uid:      el('uidInput')?.value,
          demo:     el('demoToggle')?.checked,
          asset:    this.asset,
          period:   this.period,
          tradeDur: this.tradeDur,
        }));
      } catch (_) {}
    });
  }
}

/* ── Utility ─────────────────────────────────────────────── */
function el(id)          { return document.getElementById(id); }
function setTxt(id, txt) { const e = el(id); if (e) e.textContent = txt; }
function on(id, ev, fn)  { el(id)?.addEventListener(ev, fn); }

function formatPrice(p) {
  if (!p) return '—';
  return p < 10 ? p.toFixed(5) : p < 1000 ? p.toFixed(4) : p.toFixed(2);
}

function fmtDuration(s) {
  if (s < 60)   return s + 's';
  if (s < 3600) return (s / 60) + 'm';
  return (s / 3600) + 'h';
}

let _toastTimer = {};
function toast(type, msg, ms = 4000) {
  const id  = 'toast_' + Date.now();
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.id        = id;
  div.innerHTML = `
    <span style="font-size:14px">${{ success:'✓', error:'✗', warn:'⚠', info:'ℹ' }[type] || '•'}</span>
    <span>${msg}</span>`;
  document.getElementById('toastContainer')?.appendChild(div);
  setTimeout(() => div.remove(), ms);
}

/* ── Boot ─────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  window._app = new App();
  window._app.init();
});
