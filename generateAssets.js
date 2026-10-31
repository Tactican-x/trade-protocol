const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// Ensure assets folder exists
const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir);
}

// ── Colors ────────────────────────────────────────────────────────────────────
const COLORS = {
  bg1: '#0b0b14',
  bg2: '#13131f',
  bg3: '#1c1c2e',
  green: '#00d68f',
  red: '#ff6b6b',
  blue: '#4fc3f7',
  text: '#eeeef0',
  muted: 'rgba(238,238,240,0.4)',
  grid: 'rgba(255,255,255,0.04)',
};

// ── Helper: Draw rounded rect ─────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Helper: Draw candlestick ──────────────────────────────────────────────────
function drawCandlestick(ctx, x, wickTop, wickBot, bodyTop, bodyH, color, opacity) {
  ctx.save();
  ctx.globalAlpha = opacity;

  // Wick
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, wickTop);
  ctx.lineTo(x, wickBot);
  ctx.stroke();

  // Body
  roundRect(ctx, x - 16, bodyTop, 32, bodyH, 4);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

// ── Helper: Draw shield with checkmark ────────────────────────────────────────
function drawShield(ctx, cx, cy, size, color, opacity) {
  ctx.save();
  ctx.globalAlpha = opacity;

  const s = size / 200;

  // Shield outline
  ctx.strokeStyle = color;
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 85 * s);
  ctx.lineTo(cx + 70 * s, cy - 55 * s);
  ctx.lineTo(cx + 70 * s, cy + 10 * s);
  ctx.quadraticCurveTo(cx + 70 * s, cy + 65 * s, cx, cy + 85 * s);
  ctx.quadraticCurveTo(cx - 70 * s, cy + 65 * s, cx - 70 * s, cy + 10 * s);
  ctx.lineTo(cx - 70 * s, cy - 55 * s);
  ctx.closePath();
  ctx.stroke();

  // Shield fill
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.12;
  ctx.fill();

  // Checkmark
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = 7 * s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 28 * s, cy + 5 * s);
  ctx.lineTo(cx - 8 * s, cy + 30 * s);
  ctx.lineTo(cx + 32 * s, cy - 20 * s);
  ctx.stroke();

  ctx.restore();
}

// ── Helper: Draw grid ─────────────────────────────────────────────────────────
function drawGrid(ctx, x1, y1, x2, y2, cols, rows) {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;

  const colW = (x2 - x1) / cols;
  const rowH = (y2 - y1) / rows;

  for (let i = 0; i <= cols; i++) {
    const x = x1 + i * colW;
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();
  }

  for (let i = 0; i <= rows; i++) {
    const y = y1 + i * rowH;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GENERATE ICON (1024x1024)
// ══════════════════════════════════════════════════════════════════════════════
function generateIcon() {
  const size = 1024;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // ── Background gradient ──
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, COLORS.bg1);
  grad.addColorStop(0.5, COLORS.bg2);
  grad.addColorStop(1, COLORS.bg3);
  roundRect(ctx, 0, 0, size, size, 220);
  ctx.fillStyle = grad;
  ctx.fill();

  // ── Glow circle ──
  const glow = ctx.createRadialGradient(512, 420, 0, 512, 420, 300);
  glow.addColorStop(0, 'rgba(0,214,143,0.12)');
  glow.addColorStop(1, 'rgba(0,214,143,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // ── Grid ──
  drawGrid(ctx, 180, 280, 844, 760, 5, 4);

  // ── Candlesticks ──
  //                   ctx, x,   wickT, wickB, bodyT, bodyH, color,       opacity
  drawCandlestick(ctx, 280, 360, 640,  400,   140,   COLORS.red,   0.7);
  drawCandlestick(ctx, 400, 320, 580,  350,   150,   COLORS.green, 0.7);
  drawCandlestick(ctx, 520, 380, 570,  410,   100,   COLORS.red,   0.6);
  drawCandlestick(ctx, 640, 270, 560,  300,   180,   COLORS.green, 0.8);
  drawCandlestick(ctx, 760, 250, 480,  280,   130,   COLORS.green, 0.7);

  // ── Trend line ──
  ctx.save();
  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(220, 580);
  ctx.lineTo(800, 300);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ── Shield ──
  drawShield(ctx, 512, 700, 180, COLORS.green, 0.9);

  // ── "TP" text ──
  ctx.save();
  ctx.font = '800 72px monospace';
  ctx.fillStyle = COLORS.text;
  ctx.globalAlpha = 0.85;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TP', 512, 895);
  ctx.restore();

  // ── Accent bar ──
  ctx.save();
  ctx.globalAlpha = 0.6;
  roundRect(ctx, 420, 930, 184, 4, 2);
  ctx.fillStyle = COLORS.green;
  ctx.fill();
  ctx.restore();

  // ── Save ──
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), buffer);
  console.log('✅ icon.png generated (1024x1024)');
}

// ══════════════════════════════════════════════════════════════════════════════
// GENERATE ADAPTIVE ICON (1024x1024, transparent bg)
// ══════════════════════════════════════════════════════════════════════════════
function generateAdaptiveIcon() {
  const size = 1024;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Transparent background — Android will add bg color from app.json

  // ── Glow ──
  const glow = ctx.createRadialGradient(512, 400, 0, 512, 400, 280);
  glow.addColorStop(0, 'rgba(0,214,143,0.08)');
  glow.addColorStop(1, 'rgba(0,214,143,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // ── Candlesticks (shifted up slightly) ──
  drawCandlestick(ctx, 280, 320, 600, 360, 140, COLORS.red,   0.7);
  drawCandlestick(ctx, 400, 280, 540, 310, 150, COLORS.green, 0.7);
  drawCandlestick(ctx, 520, 340, 530, 370, 100, COLORS.red,   0.6);
  drawCandlestick(ctx, 640, 230, 520, 260, 180, COLORS.green, 0.8);
  drawCandlestick(ctx, 760, 210, 440, 240, 130, COLORS.green, 0.7);

  // ── Trend line ──
  ctx.save();
  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(220, 540);
  ctx.lineTo(800, 260);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ── Shield ──
  drawShield(ctx, 512, 660, 180, COLORS.green, 0.9);

  // ── "TP" text ──
  ctx.save();
  ctx.font = '800 72px monospace';
  ctx.fillStyle = COLORS.text;
  ctx.globalAlpha = 0.85;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TP', 512, 855);
  ctx.restore();

  // ── Accent bar ──
  ctx.save();
  ctx.globalAlpha = 0.6;
  roundRect(ctx, 420, 890, 184, 4, 2);
  ctx.fillStyle = COLORS.green;
  ctx.fill();
  ctx.restore();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(assetsDir, 'adaptive-icon.png'), buffer);
  console.log('✅ adaptive-icon.png generated (1024x1024)');
}

// ══════════════════════════════════════════════════════════════════════════════
// GENERATE SPLASH SCREEN (1284x2778)
// ══════════════════════════════════════════════════════════════════════════════
function generateSplash() {
  const w = 1284;
  const h = 2778;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  // ── Background ──
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, COLORS.bg1);
  grad.addColorStop(0.5, COLORS.bg2);
  grad.addColorStop(1, COLORS.bg1);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // ── Glow circles ──
  const glow1 = ctx.createRadialGradient(642, 1150, 0, 642, 1150, 350);
  glow1.addColorStop(0, 'rgba(0,214,143,0.06)');
  glow1.addColorStop(1, 'rgba(0,214,143,0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, w, h);

  const glow2 = ctx.createRadialGradient(642, 1150, 0, 642, 1150, 200);
  glow2.addColorStop(0, 'rgba(0,214,143,0.04)');
  glow2.addColorStop(1, 'rgba(0,214,143,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, w, h);

  // ── Shield (centered, large) ──
  drawShield(ctx, 642, 1100, 240, COLORS.green, 0.8);

  // ── App name ──
  ctx.save();
  ctx.font = '800 52px monospace';
  ctx.fillStyle = COLORS.text;
  ctx.globalAlpha = 0.9;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TRADE PROTOCOL', 642, 1350);
  ctx.restore();

  // ── Subtitle ──
  ctx.save();
  ctx.font = '400 20px monospace';
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DISCIPLINE JOURNAL', 642, 1410);
  ctx.restore();

  // ── Accent bar ──
  ctx.save();
  ctx.globalAlpha = 0.5;
  roundRect(ctx, 570, 1450, 144, 4, 2);
  ctx.fillStyle = COLORS.green;
  ctx.fill();
  ctx.restore();

  // ── Bottom badge ──
  ctx.save();
  ctx.font = '400 14px monospace';
  ctx.fillStyle = 'rgba(238,238,240,0.2)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TRADING PSYCHOLOGY OS', 642, 2500);
  ctx.restore();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(assetsDir, 'splash.png'), buffer);
  console.log('✅ splash.png generated (1284x2778)');
}

// ══════════════════════════════════════════════════════════════════════════════
// RUN ALL
// ══════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('🎨 Generating Trade Protocol assets...');
console.log('');

generateIcon();
generateAdaptiveIcon();
generateSplash();

console.log('');
console.log('✅ All assets generated in /assets/');
console.log('');