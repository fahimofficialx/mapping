"""
Generates a realistic preview screenshot of the PO Signal Analyzer UI.
"""
from PIL import Image, ImageDraw, ImageFont
import math, random, os

# ── Colours (match CSS variables) ─────────────────────────────
BG0   = (7,   9,  13)
BG1   = (13,  16,  24)
BG2   = (19,  23,  32)
BG3   = (26,  31,  42)
BG4   = (31,  37,  53)
BORD  = (37,  45,  61)
TXT   = (221, 227, 240)
TXT2  = (138, 147, 168)
TXT3  = (85,  96, 112)
GREEN = (0,   208, 156)
RED   = (255,  69,  96)
YELLOW= (245, 197,  24)
BLUE  = (76,  155, 255)
PURP  = (155, 107, 255)
ORANG = (255, 140,  42)

W, H  = 1440, 820
SIDE  = 360
HDRS  = 52
FOTS  = 28
CHARTW = W - SIDE

img = Image.new("RGB", (W, H), BG0)
d   = ImageDraw.Draw(img)

# ── Try to get a font (fallback to default) ────────────────────
def font(size, bold=False):
    try:
        if bold:
            return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size)
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", size)
    except:
        return ImageFont.load_default()

F8   = font(8)
F9   = font(9)
F10  = font(10)
F11  = font(11)
F12  = font(12)
F13  = font(13)
F14  = font(14)
F10B = font(10, bold=True)
F12B = font(12, bold=True)
F14B = font(14, bold=True)
F18B = font(18, bold=True)
F22B = font(22, bold=True)
F28B = font(28, bold=True)

def rect(x, y, w, h, col):
    d.rectangle([x, y, x+w, y+h], fill=col)

def hrect(x, y, w, h, fill, outline, thick=1):
    d.rectangle([x, y, x+w, y+h], fill=fill, outline=outline, width=thick)

def txt(x, y, s, col, f=F12):
    d.text((x, y), str(s), fill=col, font=f)

def txt_c(cx, y, s, col, f=F12):
    bb = d.textbbox((0, 0), str(s), font=f)
    w  = bb[2] - bb[0]
    d.text((cx - w//2, y), str(s), fill=col, font=f)

def txt_r(rx, y, s, col, f=F12):
    bb = d.textbbox((0, 0), str(s), font=f)
    w  = bb[2] - bb[0]
    d.text((rx - w, y), str(s), fill=col, font=f)

def line(x1, y1, x2, y2, col, w=1):
    d.line([(x1,y1),(x2,y2)], fill=col, width=w)

def pill(x, y, w, h, col, fill=None):
    r = h // 2
    if fill:
        d.rounded_rectangle([x, y, x+w, y+h], radius=r, fill=fill)
    d.rounded_rectangle([x, y, x+w, y+h], radius=r, outline=col, width=1)

# ═══════════════════════════════════════════════════════════════
# HEADER
# ═══════════════════════════════════════════════════════════════
rect(0, 0, W, HDRS, BG1)
line(0, HDRS, W, HDRS, BORD)

# Logo icon (green-blue gradient box)
d.rounded_rectangle([14, 10, 14+32, 10+32], radius=8, fill=(0, 160, 120))
txt(22, 18, "⚡", TXT, F18B)

# Logo text
txt(54, 11, "PO Signal Analyzer", TXT, F14B)
txt(54, 29, "WEBSOCKET · AI · SELF-LEARNING", TXT3, F9)

# Divider
line(240, 12, 240, 40, BORD)

# Asset selector
hrect(250, 14, 130, 24, BG3, BORD)
txt(258, 20, "EUR/USD (OTC)  ▾", TXT2, F11)

# Period selector
hrect(388, 14, 80, 24, BG3, BORD)
txt(396, 20, "1m  ▾", TXT2, F11)

# Duration
hrect(476, 14, 90, 24, BG3, BORD)
txt(484, 20, "1m trade  ▾", TXT2, F11)

# DEMO badge
d.rounded_rectangle([575, 16, 625, 36], radius=4, fill=(60, 50, 10))
d.rounded_rectangle([575, 16, 625, 36], radius=4, outline=(100, 82, 20))
txt(581, 20, "DEMO", YELLOW, F10B)

# Status (right)
d.ellipse([W-270, 20, W-270+8, 28], fill=GREEN)
txt(W-256, 18, "Demo mode active", TXT2, F11)

# Connect button (green pill)
d.rounded_rectangle([W-140, 12, W-12, 40], radius=6, fill=GREEN)
txt(W-132, 19, "⚡ Connect Live", BG0, F12B)


# ═══════════════════════════════════════════════════════════════
# CHART AREA  (left panel)
# ═══════════════════════════════════════════════════════════════
CY0  = HDRS        # chart area starts here
CVOL = 70          # volume height
CHST = 210         # history table height
CHDR = 36          # chart header
CHART_H = H - HDRS - FOTS - CVOL - CHST - CHDR

# Chart header bar
rect(0, CY0, CHARTW, CHDR, BG1)
line(0, CY0+CHDR, CHARTW, CY0+CHDR, BORD)
txt(14, CY0+9, "EUR/USD (OTC)", TXT, F14B)
txt(160, CY0+10, "1.08524", TXT, F18B)
d.rounded_rectangle([275, CY0+10, 330, CY0+26], radius=4, fill=(0, 60, 40))
txt(280, CY0+13, "+0.00012", GREEN, F10B)

# TF tabs
tabs = [("30s", False), ("1m", True), ("5m", False), ("15m", False), ("1H", False)]
tx = CHARTW - 250
for label, active in tabs:
    tw = 34
    if active:
        d.rounded_rectangle([tx, CY0+10, tx+tw, CY0+28], radius=4, fill=BG4)
        txt(tx+4, CY0+14, label, GREEN, F10B)
    else:
        txt(tx+4, CY0+14, label, TXT3, F10)
    tx += tw + 4

# ── Draw fake OHLCV chart ──────────────────────────────────────
CPADY = 20
CPADX_L = 6
CPADX_R = 68

CHART_TOP = CY0 + CHDR + CPADY
CHART_BOT = CHART_TOP + CHART_H - CPADY
CHART_LEFT = CPADX_L
CHART_RIGHT = CHARTW - CPADX_R

# Chart background
rect(0, CY0+CHDR, CHARTW, CHART_H, BG0)

# Grid lines
PRICE_HI = 1.08900
PRICE_LO = 1.08200

def price_to_y(p):
    ratio = (p - PRICE_LO) / (PRICE_HI - PRICE_LO)
    return int(CHART_BOT - ratio * (CHART_BOT - CHART_TOP))

def x_of(i, n):
    return CHART_LEFT + int((i + 0.5) * (CHART_RIGHT - CHART_LEFT) / n)

for i in range(6):
    p = PRICE_LO + (PRICE_HI - PRICE_LO) * i / 5
    y = price_to_y(p)
    line(CHART_LEFT, y, CHART_RIGHT, y, (255,255,255,8), 1)
    txt_r(CHARTW - 4, y-5, f"{p:.5f}", TXT3, F9)

# Generate fake candles
random.seed(42)
N     = 80
price = 1.08500
candles = []
for i in range(N):
    op    = price
    drift = (random.random() - 0.49) * 0.00060
    cl    = op + drift
    hi    = max(op, cl) + random.random() * 0.00020
    lo    = min(op, cl) - random.random() * 0.00020
    vol   = 30 + random.random() * 120
    candles.append((op, hi, lo, cl, vol))
    price = cl

# Draw EMA lines (simplified)
ema_vals = []
k = 2/(21+1)
ema_cur = candles[0][0]
for c in candles:
    ema_cur = c[3] * k + ema_cur * (1-k)
    ema_vals.append(ema_cur)

# EMA21 line
ema_pts = [(x_of(i, N), price_to_y(ema_vals[i])) for i in range(N)]
for i in range(1, len(ema_pts)):
    line(ema_pts[i-1][0], ema_pts[i-1][1], ema_pts[i][0], ema_pts[i][1], YELLOW, 1)

# EMA8 (faster)
ema8_vals = []
k8 = 2/(8+1)
e8 = candles[0][0]
for c in candles:
    e8 = c[3] * k8 + e8 * (1-k8)
    ema8_vals.append(e8)
ema8_pts = [(x_of(i, N), price_to_y(ema8_vals[i])) for i in range(N)]
for i in range(1, len(ema8_pts)):
    line(ema8_pts[i-1][0], ema8_pts[i-1][1], ema8_pts[i][0], ema8_pts[i][1], BLUE, 1)

# Bollinger band approximation
bb_mid = ema_vals
bb_up  = [v + 0.00120 for v in bb_mid]
bb_dn  = [v - 0.00120 for v in bb_mid]

# Draw BB fill (semi-transparent approximation)
for i in range(N):
    xu = x_of(i, N)
    yu = price_to_y(bb_up[i])
    yd = price_to_y(bb_dn[i])
    d.line([(xu, yu), (xu, yd)], fill=(255,255,255,8), width=1)

# BB upper/lower lines
bb_up_pts = [(x_of(i, N), price_to_y(bb_up[i])) for i in range(N)]
bb_dn_pts = [(x_of(i, N), price_to_y(bb_dn[i])) for i in range(N)]
for i in range(1, N):
    line(bb_up_pts[i-1][0], bb_up_pts[i-1][1], bb_up_pts[i][0], bb_up_pts[i][1], (255,255,255,40), 1)
    line(bb_dn_pts[i-1][0], bb_dn_pts[i-1][1], bb_dn_pts[i][0], bb_dn_pts[i][1], (255,255,255,40), 1)

# Draw candles
CW = max(2, int((CHART_RIGHT - CHART_LEFT) / N * 0.65))
for i, (op, hi, lo, cl, vol) in enumerate(candles):
    x    = x_of(i, N)
    bull = cl >= op
    col  = GREEN if bull else RED
    yhi  = price_to_y(hi)
    ylo  = price_to_y(lo)
    yop  = price_to_y(op)
    ycl  = price_to_y(cl)
    # Wick
    line(x, yhi, x, ylo, (col[0], col[1], col[2]), 1)
    # Body
    byt  = min(yop, ycl)
    byb  = max(yop, ycl)
    bh   = max(1, byb - byt)
    d.rectangle([x - CW//2, byt, x + CW//2, byt+bh], fill=col)

# Signal markers: CALL arrow (green ▲) at candle 68, PUT (red ▼) at 52
# CALL signal
sig_i = 71
sx = x_of(sig_i, N)
sy = price_to_y(candles[sig_i][2]) + 18
d.polygon([(sx, sy-10), (sx-7, sy+2), (sx+7, sy+2)], fill=GREEN)
txt(sx-12, sy+4, "WIN", GREEN, F9)

# PUT signal
sig_i2 = 55
sx2 = x_of(sig_i2, N)
sy2 = price_to_y(candles[sig_i2][1]) - 18
d.polygon([(sx2, sy2+10), (sx2-7, sy2-2), (sx2+7, sy2-2)], fill=RED)
txt(sx2-10, sy2-14, "LOSS", RED, F9)

# Latest price dashed line
last_p = candles[-1][3]
ly = price_to_y(last_p)
for xx in range(CHART_LEFT, CHART_RIGHT, 8):
    line(xx, ly, xx+4, ly, (255,255,255,50), 1)

# ── Volume bars ────────────────────────────────────────────────
VOL_TOP = CHART_BOT + CPADY
VOL_BOT = VOL_TOP + CVOL - 8
rect(0, VOL_TOP - CPADY, CHARTW, CVOL + CPADY, BG0)
line(0, VOL_TOP - CPADY, CHARTW, VOL_TOP - CPADY, BORD)
txt(CHART_LEFT+2, VOL_TOP - CPADY + 3, "VOL", TXT3, F9)

max_vol = max(c[4] for c in candles)
for i, (op, hi, lo, cl, vol) in enumerate(candles):
    x   = x_of(i, N)
    bh  = int((vol / max_vol) * (VOL_BOT - VOL_TOP))
    col = (0, 80, 60) if cl >= op else (100, 28, 38)
    d.rectangle([x - CW//2, VOL_BOT - bh, x + CW//2, VOL_BOT], fill=col)

# ── Signal history table ───────────────────────────────────────
HIST_TOP = VOL_TOP + CVOL
rect(0, HIST_TOP, CHARTW, CHST, BG1)
line(0, HIST_TOP, CHARTW, HIST_TOP, BORD)

# Table header
rect(0, HIST_TOP, CHARTW, 24, BG2)
line(0, HIST_TOP+24, CHARTW, HIST_TOP+24, BORD)
cols = ["TIME", "ASSET", "DIR", "ENTRY", "WIN%", "CONF%", "DUR", "OUTCOME"]
col_x = [14, 76, 155, 210, 295, 355, 420, 490]
for i, (cx, label) in enumerate(zip(col_x, cols)):
    txt(cx, HIST_TOP+7, label, TXT3, F9)

# Table rows
rows = [
    ("14:32:11", "EURUSD", "▲ CALL", "1.08512", "74%", "68%", "1m", "WIN",  True),
    ("14:28:44", "EURUSD", "▼  PUT", "1.08567", "63%", "52%", "1m", "LOSS", False),
    ("14:25:03", "EURUSD", "▲ CALL", "1.08490", "79%", "71%", "1m", "WIN",  True),
    ("14:22:18", "EURUSD", "▲ CALL", "1.08455", "66%", "58%", "1m", "WIN",  True),
    ("14:19:35", "EURUSD", "▼  PUT", "1.08530", "71%", "62%", "1m", "PENDING", None),
    ("14:16:50", "EURUSD", "▼  PUT", "1.08600", "68%", "60%", "1m", "WIN",  True),
]
for ri, row in enumerate(rows):
    ry = HIST_TOP + 24 + ri * 28
    if ri % 2 == 0:
        rect(0, ry, CHARTW, 28, BG2)
    line(0, ry+28, CHARTW, ry+28, (30, 35, 48))
    time_, asset, dir_, entry, winpct, conf, dur, outcome, won = row
    txt(col_x[0], ry+8, time_, TXT3, F10)
    txt(col_x[1], ry+8, asset, TXT2, F10)
    # DIR tag
    dc = GREEN if "CALL" in dir_ else RED
    d.rounded_rectangle([col_x[2]-2, ry+6, col_x[2]+50, ry+22], radius=3, fill=(dc[0]//5, dc[1]//5, dc[2]//5))
    txt(col_x[2], ry+8, dir_, dc, F10B)
    txt(col_x[3], ry+8, entry, TXT2, F10)
    txt(col_x[4], ry+8, winpct, GREEN if won else RED if won is False else YELLOW, F10)
    txt(col_x[5], ry+8, conf, TXT2, F10)
    txt(col_x[6], ry+8, dur, TXT2, F10)
    # Outcome tag
    oc = GREEN if outcome == "WIN" else RED if outcome == "LOSS" else YELLOW
    bg = (oc[0]//5, oc[1]//5, oc[2]//5)
    d.rounded_rectangle([col_x[7]-2, ry+5, col_x[7]+56, ry+23], radius=3, fill=bg)
    txt(col_x[7], ry+8, outcome, oc, F10B)


# ═══════════════════════════════════════════════════════════════
# RIGHT SIDEBAR
# ═══════════════════════════════════════════════════════════════
SX = CHARTW   # sidebar left edge
rect(SX, HDRS, SIDE, H - HDRS - FOTS, BG1)
line(SX, HDRS, SX, H-FOTS, BORD)

sy = HDRS    # current Y in sidebar

def card_title(y, label):
    txt(SX+14, y+5, label, TXT3, F9)
    return y + 20

def sidebar_card(y, h, draw_fn):
    rect(SX, y, SIDE, h, BG1)
    line(SX, y+h, SX+SIDE, y+h, BORD)
    draw_fn(y)
    return y + h

# ── SIGNAL CARD ────────────────────────────────────────────────
def draw_signal(y):
    card_title(y, "CURRENT SIGNAL")
    # CALL badge
    txt(SX+14, y+28, "▲", GREEN, F28B)
    txt(SX+52, y+33, "CALL", GREEN, F22B)
    # Small sub-label
    txt(SX+150, y+38, "BULLISH", TXT3, F10)

    # Gauge (arc)
    GCX = SX + 180
    GCY = y + 105
    GR  = 50
    # BG arc
    for a in range(-45, 225, 2):
        ar = math.radians(a)
        d.arc([GCX-GR, GCY-GR, GCX+GR, GCY+GR], start=-225, end=45, fill=(40,50,65), width=8)
    # Value arc (74%)
    prob = 0.74
    end_a = -225 + int(prob * 270)
    d.arc([GCX-GR, GCY-GR, GCX+GR, GCY+GR], start=-225, end=end_a, fill=GREEN, width=8)
    # Center text
    txt_c(GCX, GCY-14, "74%", GREEN, F18B)
    txt_c(GCX, GCY+8,  "WIN PROB", TXT3, F9)

    # Details grid (2x2)
    gx = [SX+14, SX+14+165]
    gy = [y+175, y+207]
    items = [
        ("Asset",      "EURUSD OTC"),
        ("Entry",      "1.08524"),
        ("Win Prob",   "74.2%"),
        ("Confidence", "68.4%"),
    ]
    for idx, (lbl, val) in enumerate(items):
        gxi = gx[idx % 2]
        gyi = gy[idx // 2]
        d.rounded_rectangle([gxi-2, gyi-2, gxi+155, gyi+26], radius=5, fill=BG3)
        txt(gxi+6, gyi+2, lbl, TXT3, F9)
        col = GREEN if "%" in val or "OTC" in val else TXT
        txt(gxi+6, gyi+14, val, col, F12B)

    # Note box
    d.rounded_rectangle([SX+12, y+240, SX+SIDE-12, y+270], radius=5, fill=(0, 40, 30), outline=(0, 80, 60))
    txt(SX+18, y+250, "BULL indicators: RSI, MACD, EMA, STOCH  |  Patterns: Hammer", TXT2, F9)

sy = sidebar_card(sy, 280, draw_signal)

# ── FUTURE SIGNALS ────────────────────────────────────────────
def draw_future(y):
    card_title(y, "FUTURE SIGNALS (MULTI-TIMEFRAME)")
    futures = [
        ("1m",  "▲ CALL", 0.74, GREEN),
        ("5m",  "▲ CALL", 0.68, GREEN),
        ("15m", "▼  PUT", 0.62, RED),
        ("1H",  "▼  PUT", 0.58, RED),
    ]
    for i, (tf, direction, prob, col) in enumerate(futures):
        fy = y + 22 + i * 36
        d.rounded_rectangle([SX+12, fy, SX+SIDE-12, fy+28], radius=5, fill=BG3, outline=BORD)
        txt(SX+18, fy+8, tf, TXT3, F10B)
        txt(SX+46, fy+8, direction, col, F10B)
        # Prob bar
        barx = SX+105
        bary = fy+16
        barw = SIDE - 130
        d.rectangle([barx, bary, barx+barw, bary+5], fill=BG4)
        d.rectangle([barx, bary, barx+int(prob*barw), bary+5], fill=col)
        txt(SX+SIDE-30, fy+6, f"{int(prob*100)}%", col, F10B)

sy = sidebar_card(sy, 175, draw_future)

# ── INDICATOR BARS ───────────────────────────────────────────
def draw_indicators(y):
    card_title(y, "INDICATOR ANALYSIS")
    indicators = [
        ("RSI",   0.82, "82.0", "BULL", GREEN),
        ("MACD",  0.75, "0.0004", "BULL", GREEN),
        ("BB",    0.68, "",     "BULL", GREEN),
        ("STOCH", 0.72, "22.3", "BULL", GREEN),
        ("EMA",   0.78, "",     "BULL", GREEN),
        ("CCI",   0.35, "-88.1","BEAR", RED),
        ("W%R",   0.28, "-81.2","BEAR", RED),
        ("VOL",   0.55, "",     "NEU",  TXT3),
    ]
    for i, (name, score, raw, sig, col) in enumerate(indicators):
        iy = y + 22 + i * 22
        txt(SX+14, iy+3, name, TXT2, F10)
        barx = SX+65
        barw = SIDE - 130
        d.rectangle([barx, iy+6, barx+barw, iy+12], fill=BG4)
        fill_col = col if col != TXT3 else (85, 96, 112)
        d.rectangle([barx, iy+6, barx+int(score*barw), iy+12], fill=fill_col)
        txt(barx+barw+4, iy+3, raw, col, F9)
        txt(SX+SIDE-38, iy+3, sig, col, F10B)

sy = sidebar_card(sy, 200, draw_indicators)

# ── ML STATS ─────────────────────────────────────────────────
def draw_ml(y):
    card_title(y, "AI LEARNING STATS")
    # Stats boxes
    stats = [("47", "Trades"), ("35", "Wins"), ("3", "Pending")]
    for i, (val, lbl) in enumerate(stats):
        bx = SX + 14 + i * 110
        d.rounded_rectangle([bx, y+22, bx+100, y+70], radius=6, fill=BG3)
        txt_c(bx+50, y+32, val, GREEN, F18B)
        txt_c(bx+50, y+52, lbl, TXT3, F9)

    # Accuracy text + bar
    txt(SX+14, y+80, "Accuracy (last 100)", TXT2, F10)
    txt(SX+SIDE-50, y+78, "74.5%", GREEN, F12B)
    d.rectangle([SX+14, y+96, SX+SIDE-14, y+103], fill=BG4)
    # Gradient bar: red → yellow → green
    barw = SIDE - 28
    for xi in range(barw):
        r = xi/barw
        c2 = (int(255*(1-r)), int(69 + (208-69)*r), int(r*96)) if r < 0.5 else (int(255*(1-r)*2), int(200), int(r*156))
        d.line([(SX+14+xi, y+96), (SX+14+xi, y+103)], fill=c2)
    # Cover beyond 74.5%
    fill_end = SX+14 + int(0.745*barw)
    d.rectangle([fill_end, y+96, SX+SIDE-14, y+103], fill=BG4)

    # Weights mini grid
    txt(SX+14, y+112, "INDICATOR WEIGHTS", TXT3, F9)
    weights = [("RSI","1.18"), ("MACD","0.96"), ("BB","1.04"), ("STOCH","1.12"),
               ("EMA","1.22"), ("CCI","0.88"), ("VOL","0.80"), ("TREND","1.10")]
    for i, (wn, wv) in enumerate(weights):
        wx = SX+14 + (i%2) * 162
        wy = y+126 + (i//2) * 24
        d.rounded_rectangle([wx, wy, wx+152, wy+18], radius=3, fill=BG3)
        txt(wx+6, wy+3, wn, TXT2, F10)
        txt(wx+130, wy+3, wv, GREEN, F10)

sy = sidebar_card(sy, 230, draw_ml)


# ═══════════════════════════════════════════════════════════════
# FOOTER
# ═══════════════════════════════════════════════════════════════
rect(0, H-FOTS, W, FOTS, BG1)
line(0, H-FOTS, W, H-FOTS, BORD)
d.ellipse([14, H-FOTS+10, 22, H-FOTS+18], fill=GREEN)
txt(26, H-FOTS+7, "Demo Mode", TXT2, F11)
txt(130, H-FOTS+7, "|", TXT3, F11)
txt(144, H-FOTS+7, "⚡ Pocket Option WebSocket Analyzer", TXT2, F11)
txt(400, H-FOTS+7, "|", TXT3, F11)
txt(414, H-FOTS+7, "EUR/USD OTC · 1m chart", TXT3, F11)
txt_r(W-14, H-FOTS+7, "v2.0 · AI Self-Learning  |  m.pocketoption.com", TXT3, F11)

# ── save ──────────────────────────────────────────────────────
out = "/home/user/mapping/preview.png"
img.save(out, "PNG", optimize=True)
print(f"Saved → {out}  ({W}x{H})")
