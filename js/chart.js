/**
 * Canvas-based chart renderer
 * Draws OHLCV candlesticks + EMA lines + Bollinger Bands + signal markers
 */

class ChartRenderer {
  constructor(mainId, volId) {
    this.mainCanvas = document.getElementById(mainId);
    this.volCanvas  = document.getElementById(volId);
    this.ctx  = this.mainCanvas?.getContext('2d');
    this.vctx = this.volCanvas?.getContext('2d');

    this.PAD   = { top: 24, right: 78, bottom: 28, left: 6 };
    this.SHOW  = 80;    // visible candles
    this.signals = [];  // [{direction, candleIndex, outcome}]

    this.C = {
      bg:        '#07090d',
      bull:      '#00d09c',
      bear:      '#ff4560',
      bullBody:  '#00d09c',
      bearBody:  '#ff4560',
      wick:      'rgba(255,255,255,0.35)',
      grid:      'rgba(255,255,255,0.04)',
      gridLabel: '#556070',
      bb:        'rgba(255,255,255,0.12)',
      bbFill:    'rgba(255,255,255,0.03)',
      ema8:      '#4c9bff',
      ema21:     '#f5c518',
      ema50:     '#9b6bff',
      volBull:   'rgba(0,208,156,0.25)',
      volBear:   'rgba(255,69,96,0.25)',
    };

    this._hovered = null;
    this._setupEvents();
  }

  resize() {
    if (!this.mainCanvas) return;
    const wrap = this.mainCanvas.parentElement;
    const w    = wrap.clientWidth;
    const mh   = wrap.clientHeight;
    this.mainCanvas.width  = w;
    this.mainCanvas.height = mh;
    if (this.volCanvas) {
      this.volCanvas.width  = w;
      this.volCanvas.height = this.volCanvas.parentElement.clientHeight;
    }
  }

  /**
   * @param {object[]} candles
   * @param {object}   indicators  – result of TA.runAll()
   * @param {object[]} signals     – [{direction, price, outcome, candleTime}]
   */
  render(candles, indicators, signals = []) {
    if (!this.ctx || !candles?.length) return;

    const visible = candles.slice(-this.SHOW);
    const { w, h, pw, ph, x0, y0 } = this._dims(this.mainCanvas);

    // Background
    this.ctx.fillStyle = this.C.bg;
    this.ctx.fillRect(0, 0, w, h);

    // Price range (include BB)
    let pLo = Infinity, pHi = -Infinity;
    for (const c of visible) {
      pLo = Math.min(pLo, c.low);
      pHi = Math.max(pHi, c.high);
    }
    if (indicators?.bb) {
      pLo = Math.min(pLo, indicators.bb.lower);
      pHi = Math.max(pHi, indicators.bb.upper);
    }
    const pad    = (pHi - pLo) * 0.08;
    const vLo    = pLo - pad;
    const vHi    = pHi + pad;
    const toY    = p  => y0 + ph - (p - vLo) / (vHi - vLo) * ph;
    const toX    = i  => x0 + (i + 0.5) * (pw / visible.length);
    const n      = visible.length;

    // Grid lines
    this._drawGrid(w, h, x0, y0, pw, ph, vLo, vHi);

    // Bollinger Bands
    if (indicators?.bb?.upperHist) this._drawBB(visible, indicators.bb, toX, toY, n);

    // EMA lines
    if (indicators?.ema?.e8Hist?.length)  this._drawLine(indicators.ema.e8Hist.slice(-n),  toX, toY, this.C.ema8,  1.5, n);
    if (indicators?.ema?.e21Hist?.length) this._drawLine(indicators.ema.e21Hist.slice(-n), toX, toY, this.C.ema21, 1.5, n);
    if (indicators?.ema?.e50Hist?.length) this._drawLine(indicators.ema.e50Hist.slice(-n), toX, toY, this.C.ema50, 1.0, n);

    // Candles
    const cw = Math.max(2, pw / n * 0.65);
    for (let i = 0; i < n; i++) {
      const c  = visible[i];
      const x  = toX(i);
      const isBull = c.close >= c.open;
      const col    = isBull ? this.C.bull : this.C.bear;

      // Wick
      this.ctx.strokeStyle = this.C.wick;
      this.ctx.lineWidth   = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x, toY(c.high));
      this.ctx.lineTo(x, toY(c.low));
      this.ctx.stroke();

      // Body
      this.ctx.fillStyle = col;
      const bY = Math.min(toY(c.open), toY(c.close));
      const bH = Math.max(1, Math.abs(toY(c.open) - toY(c.close)));
      this.ctx.fillRect(x - cw / 2, bY, cw, bH);
    }

    // Signal markers
    this._drawSignals(visible, signals, toX, toY);

    // Price scale
    this._drawPriceScale(w, y0, ph, vLo, vHi);

    // Latest price line
    const latestClose = visible[visible.length - 1]?.close;
    if (latestClose) {
      const ly = toY(latestClose);
      this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      this.ctx.setLineDash([4, 4]);
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x0, ly);
      this.ctx.lineTo(w - this.PAD.right, ly);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // Volume
    this._renderVolume(visible);
  }

  _renderVolume(visible) {
    if (!this.vctx || !visible.length) return;
    const { w, h, pw, x0 } = this._dims(this.volCanvas);

    this.vctx.fillStyle = this.C.bg;
    this.vctx.fillRect(0, 0, w, h);

    const vols   = visible.map(c => c.volume || 0);
    const maxVol = Math.max(...vols, 1);
    const bw     = Math.max(1, pw / visible.length * 0.65);

    for (let i = 0; i < visible.length; i++) {
      const c   = visible[i];
      const x   = x0 + (i + 0.5) * (pw / visible.length);
      const bh  = ((c.volume || 0) / maxVol) * (h - 4);
      const col = c.close >= c.open ? this.C.volBull : this.C.volBear;
      this.vctx.fillStyle = col;
      this.vctx.fillRect(x - bw / 2, h - bh, bw, bh);
    }
  }

  _drawGrid(w, h, x0, y0, pw, ph, vLo, vHi) {
    const LEVELS = 5;
    this.ctx.strokeStyle = this.C.grid;
    this.ctx.lineWidth   = 1;
    this.ctx.fillStyle   = this.C.gridLabel;
    this.ctx.font        = '10px monospace';
    this.ctx.textAlign   = 'left';

    for (let i = 0; i <= LEVELS; i++) {
      const p = vLo + (vHi - vLo) * (i / LEVELS);
      const y = y0 + ph - (p - vLo) / (vHi - vLo) * ph;
      this.ctx.beginPath();
      this.ctx.moveTo(x0, y);
      this.ctx.lineTo(x0 + pw, y);
      this.ctx.stroke();
    }
  }

  _drawPriceScale(w, y0, ph, vLo, vHi) {
    const LEVELS = 5;
    this.ctx.fillStyle = this.C.gridLabel;
    this.ctx.font      = '10px monospace';
    this.ctx.textAlign = 'left';
    const x = w - this.PAD.right + 5;

    for (let i = 0; i <= LEVELS; i++) {
      const p  = vLo + (vHi - vLo) * (i / LEVELS);
      const y  = y0 + ph - (p - vLo) / (vHi - vLo) * ph;
      const lbl = p < 10 ? p.toFixed(5) : p < 1000 ? p.toFixed(4) : p.toFixed(2);
      this.ctx.fillText(lbl, x, y + 4);
    }
  }

  _drawLine(vals, toX, toY, color, lw, n) {
    if (!vals?.length) return;
    const offset = n - vals.length;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth   = lw;
    this.ctx.beginPath();
    let started = false;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] == null) continue;
      const x = toX(i + offset), y = toY(vals[i]);
      started ? this.ctx.lineTo(x, y) : (this.ctx.moveTo(x, y), started = true);
    }
    this.ctx.stroke();
  }

  _drawBB(visible, bb, toX, toY, n) {
    const { upperHist, lowerHist, middleHist } = bb;
    if (!upperHist?.length || !lowerHist?.length) return;

    const u = upperHist.slice(-n);
    const l = lowerHist.slice(-n);
    const offset = n - u.length;

    // Fill between bands
    this.ctx.fillStyle = this.C.bbFill;
    this.ctx.beginPath();
    for (let i = 0; i < u.length; i++) this.ctx.lineTo(toX(i + offset), toY(u[i]));
    for (let i = l.length - 1; i >= 0; i--) this.ctx.lineTo(toX(i + offset), toY(l[i]));
    this.ctx.closePath();
    this.ctx.fill();

    // Band lines
    this._drawLine(u, toX, toY, this.C.bb, 1, n);
    this._drawLine(l, toX, toY, this.C.bb, 1, n);
    if (middleHist) this._drawLine(middleHist.slice(-n), toX, toY, 'rgba(255,255,255,0.08)', 0.8, n);
  }

  _drawSignals(visible, signals, toX, toY) {
    for (const sig of signals) {
      const idx = visible.findIndex(c => Math.abs((c.time || 0) - (sig.candleTime || 0)) < 5);
      if (idx < 0) continue;

      const x    = toX(idx);
      const c    = visible[idx];
      const call = sig.direction === 'CALL';
      const col  = call ? this.C.bull : this.C.bear;
      const y    = call ? toY(c.low) + 18 : toY(c.high) - 18;

      this.ctx.font      = 'bold 13px Arial';
      this.ctx.fillStyle = col;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(call ? '▲' : '▼', x, y);

      if (sig.outcome) {
        const oc = sig.outcome === 'WIN' ? '#00ff88' : '#ff4444';
        this.ctx.fillStyle = oc;
        this.ctx.font      = 'bold 9px Arial';
        this.ctx.fillText(sig.outcome === 'WIN' ? '✓' : '✗', x, y + (call ? 13 : -4));
      }
    }
    this.ctx.textAlign = 'left';
  }

  _dims(canvas) {
    const w  = canvas.width;
    const h  = canvas.height;
    const x0 = this.PAD.left;
    const y0 = this.PAD.top;
    const pw = w - this.PAD.left - this.PAD.right;
    const ph = h - this.PAD.top - this.PAD.bottom;
    return { w, h, pw, ph, x0, y0 };
  }

  _setupEvents() {
    this.mainCanvas?.addEventListener('mousemove', e => {
      // Could add crosshair/tooltip here
    });
  }
}
