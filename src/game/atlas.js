// 弾・火花・アイテムの絵を、起動時に canvas で描いてアトラス（1 枚のテクスチャ）にする。画像ファイルは使わない。
//
// 弾のアトラス（buildMaskAtlas）は「型」：R = 本体（弾の色で塗る）、G = 芯（白）、B = 縁（暗く）、A = まわりの光。
// 4 つの層を別の canvas に灰色で描き、チャンネルに詰めて DataTexture にする
// （canvas の透明度は保存のときに RGB を掛け算してしまうので、型の入れ物には使えない）。
// アイテムのアトラス（buildColorAtlas）は色つきの絵そのまま。
//
// 絵は「上向き」に描く。進む向きが θ（0 = 右、π/2 = 上）の弾は、θ − π/2 だけ回して置く。
import * as THREE from 'three';

const CELL = 128;
const GRID = 8;      // 8 × 8 マス
const U = CELL / 2;  // 正規化した座標の 1（マスの半分）

// ---------------------------------------------------------------- 形（-1〜1 の座標、上が -y）
const P = {
  circle: (r, x = 0, y = 0) => { const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2); return p; },
  ellipse: (rx, ry, x = 0, y = 0) => { const p = new Path2D(); p.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); return p; },
  poly(pts) { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; },
  star(n, ro, ri, rot = -Math.PI / 2) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro; const a = rot + (i * Math.PI) / n; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return P.poly(pts);
  },
  path(d) { return new Path2D(d); },
  roundRect(x, y, w, h, r) { const p = new Path2D(); p.roundRect(x, y, w, h, r); return p; },
};

// 正規化した座標の Path2D を、マスの中心・大きさに合わせて描く
function withCell(ctx, i, fn) {
  const cx = (i % GRID) * CELL + U, cy = Math.floor(i / GRID) * CELL + U;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - U, cy - U, CELL, CELL);
  ctx.clip();
  ctx.setTransform(U, 0, 0, U, cx, cy);
  fn(ctx);
  ctx.restore();
}

// 層ごとの描き方の道具（灰色で、白 = 1）
const fill = (ctx, p, v = 1, blur = 0) => {
  ctx.fillStyle = `rgba(255,255,255,${v})`;
  if (blur) { ctx.shadowColor = `rgba(255,255,255,${v})`; ctx.shadowBlur = blur; }
  ctx.fill(p);
  ctx.shadowBlur = 0;
};
const stroke = (ctx, p, w, v = 1) => { ctx.strokeStyle = `rgba(255,255,255,${v})`; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.stroke(p); };
const radial = (ctx, r0, r1, v = 1, x = 0, y = 0, sx = 1, sy = 1) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  const g = ctx.createRadialGradient(0, 0, r0, 0, 0, r1);
  g.addColorStop(0, `rgba(255,255,255,${v})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
  ctx.restore();
};

// ---------------------------------------------------------------- 弾の型
// draw(layer, ctx)：layer は 'body' | 'core' | 'rim' | 'glow'
// size：フィールドでの板の大きさ（ドット）、r：当たり判定の半径、dir：進む向きに回すか、spin：くるくる回すか、layer：重ねる順（大きいほど上）
const SHAPES = {};
function shape(name, def) { SHAPES[name] = def; }

// 丸い弾（小・中）
// 丸い弾：芯を少し左上に寄せ、つやの点を足して、光る玉らしい立体感を出す
const orb = (bodyR, coreR) => (L, c) => {
  const b = P.circle(bodyR);
  if (L === 'body') fill(c, b);
  if (L === 'core') {
    fill(c, P.circle(coreR, -coreR * 0.12, -coreR * 0.14), 1, 3);
    fill(c, P.ellipse(coreR * 0.32, coreR * 0.22, -bodyR * 0.36, -bodyR * 0.42), 1, 1);
  }
  if (L === 'rim') stroke(c, P.circle(bodyR - 0.04), 0.09, 1);
  if (L === 'glow') radial(c, bodyR * 0.85, 1.0, 0.55);
};
shape('pellet', { size: [9, 9], r: 2.2, draw: orb(0.5, 0.36), layer: 3 });
shape('orb', { size: [14, 14], r: 3.6, draw: orb(0.56, 0.36), layer: 2 });
shape('ball', { size: [22, 22], r: 6.5, draw: orb(0.6, 0.42), layer: 1 });
shape('bigorb', { size: [52, 52], r: 15, draw: (L, c) => {
  if (L === 'body') fill(c, P.circle(0.66));
  if (L === 'core') radial(c, 0.18, 0.56, 1);
  if (L === 'rim') stroke(c, P.circle(0.64), 0.05, 0.6);
  if (L === 'glow') radial(c, 0.5, 1.0, 1);
}, layer: 0 });
// 米粒
shape('rice', { size: [9, 16], r: 2.5, dir: true, draw: (L, c) => {
  const b = P.ellipse(0.42, 0.8);
  if (L === 'body') fill(c, b);
  if (L === 'core') fill(c, P.ellipse(0.2, 0.5), 1, 6);
  if (L === 'rim') stroke(c, P.ellipse(0.38, 0.76), 0.08, 0.85);
  if (L === 'glow') radial(c, 0.3, 1, 0.8, 0, 0, 0.6, 1);
}, layer: 3 });
// クナイ
shape('kunai', { size: [10, 20], r: 2.6, dir: true, draw: (L, c) => {
  const blade = P.poly([[0, -0.95], [0.34, -0.1], [0.12, 0.3], [0.12, 0.5], [-0.12, 0.5], [-0.12, 0.3], [-0.34, -0.1]]);
  const ring = P.circle(0.2, 0, 0.72);
  if (L === 'body') { fill(c, blade); stroke(c, ring, 0.12); }
  if (L === 'core') fill(c, P.poly([[0, -0.7], [0.14, -0.12], [0, 0.2], [-0.14, -0.12]]), 1, 4);
  if (L === 'rim') stroke(c, blade, 0.08, 0.85);
  if (L === 'glow') radial(c, 0.2, 1, 0.75, 0, -0.1, 0.6, 1);
}, layer: 3 });
// 札（お札の弾）
shape('ofuda', { size: [12, 18], r: 3, dir: true, draw: (L, c) => {
  const b = P.roundRect(-0.5, -0.82, 1.0, 1.64, 0.08);
  if (L === 'body') fill(c, b);
  if (L === 'core') {
    fill(c, P.roundRect(-0.3, -0.6, 0.6, 1.2, 0.04), 1);
  }
  if (L === 'rim') {
    stroke(c, b, 0.08, 0.9);
    // 札の模様（芯の上に暗い線）
    stroke(c, P.path('M -0.16 -0.42 L 0.16 -0.42 M 0 -0.42 L 0 0.42 M -0.18 0 L 0.18 0 M -0.14 0.24 L 0.14 0.24'), 0.07, 1);
  }
  if (L === 'glow') radial(c, 0.4, 1, 0.6, 0, 0, 0.75, 1);
}, layer: 2 });
// 星（小・大）
const starShape = (L, c) => {
  const b = P.star(5, 0.86, 0.4);
  if (L === 'body') fill(c, b);
  if (L === 'core') fill(c, P.star(5, 0.42, 0.2), 1, 5);
  if (L === 'rim') stroke(c, P.star(5, 0.8, 0.37), 0.08, 0.85);
  if (L === 'glow') radial(c, 0.35, 1, 0.75);
};
shape('star', { size: [16, 16], r: 3.6, spin: 0.08, draw: starShape, layer: 2 });
shape('bigstar', { size: [34, 34], r: 9, spin: 0.05, draw: starShape, layer: 1 });
// 鱗弾
shape('scale', { size: [11, 15], r: 3, dir: true, draw: (L, c) => {
  const b = P.path('M 0 -0.9 C 0.7 -0.4 0.66 0.5 0 0.78 C -0.66 0.5 -0.7 -0.4 0 -0.9 Z');
  if (L === 'body') fill(c, b);
  if (L === 'core') fill(c, P.path('M 0 -0.55 C 0.36 -0.2 0.34 0.32 0 0.48 C -0.34 0.32 -0.36 -0.2 0 -0.55 Z'), 1, 4);
  if (L === 'rim') stroke(c, b, 0.08, 0.85);
  if (L === 'glow') radial(c, 0.3, 1, 0.75);
}, layer: 3 });
// 針
shape('needle', { size: [6, 24], r: 2, dir: true, draw: (L, c) => {
  const b = P.ellipse(0.38, 0.92);
  if (L === 'body') fill(c, b);
  if (L === 'core') fill(c, P.ellipse(0.16, 0.7), 1, 3);
  if (L === 'rim') stroke(c, b, 0.12, 0.7);
  if (L === 'glow') radial(c, 0.2, 1, 0.7, 0, 0, 0.5, 1);
}, layer: 3 });
// ハート
shape('heart', { size: [18, 18], r: 5, dir: true, draw: (L, c) => {
  const b = P.path('M 0 0.78 C -0.9 0.1 -0.9 -0.7 -0.42 -0.7 C -0.16 -0.7 0 -0.5 0 -0.34 C 0 -0.5 0.16 -0.7 0.42 -0.7 C 0.9 -0.7 0.9 0.1 0 0.78 Z');
  if (L === 'body') fill(c, b);
  if (L === 'core') radial(c, 0.1, 0.42, 1, 0, -0.08);
  if (L === 'rim') stroke(c, b, 0.08, 0.85);
  if (L === 'glow') radial(c, 0.4, 1, 0.75);
}, layer: 2 });
// 蝶
shape('butterfly', { size: [24, 24], r: 5, dir: true, draw: (L, c) => {
  const w = new Path2D();
  for (const s of [-1, 1]) {
    w.addPath(P.ellipse(0.36, 0.5, 0.36 * s, -0.28));
    w.addPath(P.ellipse(0.28, 0.32, 0.3 * s, 0.38));
  }
  if (L === 'body') fill(c, w);
  if (L === 'core') { fill(c, P.ellipse(0.1, 0.62), 1, 3); for (const s of [-1, 1]) fill(c, P.circle(0.13, 0.4 * s, -0.32), 0.85, 4); }
  if (L === 'rim') stroke(c, w, 0.07, 0.8);
  if (L === 'glow') radial(c, 0.4, 1, 0.7);
}, layer: 1 });
// 葉っぱ（たぬき）
shape('leaf', { size: [16, 20], r: 4, dir: true, draw: (L, c) => {
  const b = P.path('M 0 -0.92 C 0.66 -0.5 0.66 0.36 0 0.7 C -0.66 0.36 -0.66 -0.5 0 -0.92 Z');
  if (L === 'body') { fill(c, b); stroke(c, P.path('M 0 0.6 L 0 0.95'), 0.12); }
  if (L === 'core') fill(c, P.path('M 0 -0.55 C 0.32 -0.25 0.32 0.2 0 0.4 C -0.32 0.2 -0.32 -0.25 0 -0.55 Z'), 0.9, 3);
  if (L === 'rim') { stroke(c, b, 0.08, 0.9); stroke(c, P.path('M 0 -0.7 L 0 0.6 M 0 -0.2 L 0.28 -0.42 M 0 -0.2 L -0.28 -0.42 M 0 0.15 L 0.3 -0.05 M 0 0.15 L -0.3 -0.05'), 0.06, 0.75); }
  if (L === 'glow') radial(c, 0.3, 1, 0.7);
}, layer: 2 });
// 桜
shape('sakura', { size: [18, 18], r: 4.6, spin: 0.04, draw: (L, c) => {
  const f = new Path2D();
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
    const m = new DOMMatrix().rotate(0, 0, (a * 180) / Math.PI + 90);
    f.addPath(P.path('M 0 0 C 0.36 -0.2 0.42 -0.7 0.14 -0.86 L 0 -0.74 L -0.14 -0.86 C -0.42 -0.7 -0.36 -0.2 0 0 Z'), m);
  }
  if (L === 'body') fill(c, f);
  if (L === 'core') radial(c, 0.08, 0.36, 1);
  if (L === 'rim') stroke(c, f, 0.06, 0.8);
  if (L === 'glow') radial(c, 0.4, 1, 0.75);
}, layer: 2 });
// 鈴
shape('bell', { size: [16, 16], r: 4.4, draw: (L, c) => {
  const b = P.circle(0.66, 0, 0.12);
  if (L === 'body') { fill(c, b); stroke(c, P.circle(0.2, 0, -0.66), 0.12); }
  if (L === 'core') radial(c, 0.06, 0.34, 1, -0.2, -0.12);
  if (L === 'rim') { stroke(c, b, 0.08, 0.85); stroke(c, P.path('M -0.5 0.18 L 0.5 0.18 M 0 0.18 L 0 0.62'), 0.1, 1); fill(c, P.circle(0.1, 0, 0.42), 1); }
  if (L === 'glow') radial(c, 0.4, 1, 0.7);
}, layer: 2 });
// 鬼火（炎）：上向きの炎。進む向きと逆に尾を引かせたいときは、置くときに π 回す
shape('flame', { size: [20, 26], r: 5, dir: true, draw: (L, c) => {
  const b = P.path('M 0 -0.96 C 0.2 -0.56 0.62 -0.24 0.56 0.26 C 0.5 0.74 -0.5 0.74 -0.56 0.26 C -0.62 -0.24 -0.2 -0.56 0 -0.96 Z');
  if (L === 'body') fill(c, b, 0.95, 6);
  if (L === 'core') fill(c, P.ellipse(0.3, 0.36, 0, 0.3), 1, 8);
  if (L === 'rim') stroke(c, b, 0.05, 0.4);
  if (L === 'glow') radial(c, 0.4, 1, 0.55, 0, 0.15);
}, layer: 1 });
// 三日月
shape('crescent', { size: [22, 22], r: 5, dir: true, draw: (L, c) => {
  const b = P.path('M 0.3 -0.78 A 0.8 0.8 0 1 0 0.3 0.78 A 0.62 0.62 0 1 1 0.3 -0.78 Z');
  if (L === 'body') fill(c, b);
  if (L === 'core') fill(c, P.path('M 0.04 -0.6 A 0.62 0.62 0 1 0 0.04 0.6 A 0.52 0.52 0 1 1 0.04 -0.6 Z'), 0.9, 4);
  if (L === 'rim') stroke(c, b, 0.07, 0.85);
  if (L === 'glow') radial(c, 0.3, 1, 0.75);
}, layer: 2 });
// お餅（顔つき）
shape('mochi', { size: [20, 18], r: 5.5, draw: (L, c) => {
  const b = P.path('M -0.78 0.3 C -0.86 -0.4 -0.4 -0.7 0 -0.7 C 0.4 -0.7 0.86 -0.4 0.78 0.3 C 0.72 0.66 -0.72 0.66 -0.78 0.3 Z');
  if (L === 'body') fill(c, b);
  if (L === 'core') fill(c, P.ellipse(0.5, 0.36, 0, -0.08), 1, 10);
  if (L === 'rim') { stroke(c, b, 0.07, 0.8); fill(c, P.ellipse(0.07, 0.1, -0.24, 0.05)); fill(c, P.ellipse(0.07, 0.1, 0.24, 0.05)); stroke(c, P.path('M -0.08 0.24 Q 0 0.32 0.08 0.24'), 0.05); }
  if (L === 'glow') radial(c, 0.4, 1, 0.6);
}, layer: 2 });
// 泡
shape('bubble', { size: [30, 30], r: 10, draw: (L, c) => {
  if (L === 'body') stroke(c, P.circle(0.66), 0.16, 0.9);
  if (L === 'core') fill(c, P.ellipse(0.16, 0.1, -0.3, -0.36), 1, 4);
  if (L === 'rim') stroke(c, P.circle(0.75), 0.04, 0.5);
  if (L === 'glow') { radial(c, 0.5, 1, 0.6); }
}, layer: 0 });
// 雫
shape('drop', { size: [12, 16], r: 3.2, dir: true, draw: (L, c) => {
  const b = P.path('M 0 -0.9 C 0.3 -0.4 0.62 0 0.6 0.34 C 0.58 0.74 -0.58 0.74 -0.6 0.34 C -0.62 0 -0.3 -0.4 0 -0.9 Z');
  if (L === 'body') fill(c, b);
  if (L === 'core') radial(c, 0.06, 0.34, 1, 0, 0.3);
  if (L === 'rim') stroke(c, b, 0.08, 0.85);
  if (L === 'glow') radial(c, 0.3, 1, 0.75, 0, 0.2);
}, layer: 3 });
// 結晶（ひし形）
shape('crystal', { size: [10, 18], r: 2.8, dir: true, draw: (L, c) => {
  const b = P.poly([[0, -0.94], [0.46, 0], [0, 0.94], [-0.46, 0]]);
  if (L === 'body') fill(c, b);
  if (L === 'core') fill(c, P.poly([[0, -0.6], [0.2, 0], [0, 0.6], [-0.2, 0]]), 1, 3);
  if (L === 'rim') stroke(c, b, 0.08, 0.85);
  if (L === 'glow') radial(c, 0.3, 1, 0.75, 0, 0, 0.6, 1);
}, layer: 3 });
// 輪
shape('ring', { size: [18, 18], r: 4.6, draw: (L, c) => {
  if (L === 'body') stroke(c, P.circle(0.56), 0.36);
  if (L === 'core') stroke(c, P.circle(0.56), 0.14, 1);
  if (L === 'rim') { stroke(c, P.circle(0.76), 0.05, 0.8); stroke(c, P.circle(0.36), 0.05, 0.8); }
  if (L === 'glow') radial(c, 0.5, 1, 0.7);
}, layer: 2 });
// 小判
shape('coin', { size: [13, 17], r: 4, draw: (L, c) => {
  const b = P.ellipse(0.62, 0.86);
  if (L === 'body') fill(c, b);
  if (L === 'core') fill(c, P.ellipse(0.3, 0.5), 0.8, 6);
  if (L === 'rim') { stroke(c, b, 0.09, 0.9); stroke(c, P.path('M -0.3 -0.3 L 0.3 -0.3 M -0.3 0 L 0.3 0 M -0.3 0.3 L 0.3 0.3'), 0.06, 0.8); }
  if (L === 'glow') radial(c, 0.4, 1, 0.75);
}, layer: 2 });

// ---------------------------------------------------------------- 火花・演出の型（主に足し算の光で使う）
shape('p_dot', { size: [16, 16], draw: (L, c) => {
  if (L === 'body') radial(c, 0.0, 0.5, 1);
  if (L === 'core') radial(c, 0.0, 0.22, 1);
  if (L === 'glow') radial(c, 0.2, 1, 0.8);
} });
shape('p_ring', { size: [32, 32], draw: (L, c) => {
  if (L === 'body') stroke(c, P.circle(0.82), 0.08, 1);
  if (L === 'glow') { stroke(c, P.circle(0.82), 0.2, 0.5); }
} });
shape('p_spark', { size: [6, 24], draw: (L, c) => {
  if (L === 'body') radial(c, 0, 0.95, 1, 0, 0, 0.22, 1);
  if (L === 'core') radial(c, 0, 0.6, 1, 0, 0, 0.1, 1);
  if (L === 'glow') radial(c, 0.1, 1, 0.6, 0, 0, 0.4, 1);
} });
shape('p_twinkle', { size: [20, 20], draw: (L, c) => {
  const s = P.star(4, 0.96, 0.12, 0);
  if (L === 'body') fill(c, s, 1, 4);
  if (L === 'core') radial(c, 0, 0.3, 1);
  if (L === 'glow') radial(c, 0.1, 0.9, 0.7);
} });
shape('p_smoke', { size: [32, 32], draw: (L, c) => {
  if (L === 'body') { radial(c, 0.1, 0.9, 0.85); radial(c, 0, 0.45, 0.4, 0.2, -0.2); }
} });
shape('p_maple', { size: [16, 16], draw: (L, c) => {
  const m = P.path('M 0 -0.92 L 0.16 -0.5 L 0.5 -0.62 L 0.38 -0.22 L 0.86 -0.2 L 0.44 0.16 L 0.6 0.5 L 0.14 0.36 L 0.06 0.92 L -0.06 0.92 L -0.14 0.36 L -0.6 0.5 L -0.44 0.16 L -0.86 -0.2 L -0.38 -0.22 L -0.5 -0.62 L -0.16 -0.5 Z');
  if (L === 'body') fill(c, m);
  if (L === 'rim') stroke(c, P.path('M 0 -0.7 L 0 0.8 M 0 0 L 0.6 -0.18 M 0 0 L -0.6 -0.18 M 0 0.1 L 0.4 0.42 M 0 0.1 L -0.4 0.42'), 0.05, 0.6);
} });
shape('p_petal', { size: [12, 12], draw: (L, c) => {
  const b = P.path('M 0 0.8 C 0.6 0.3 0.5 -0.5 0.16 -0.8 L 0 -0.62 L -0.16 -0.8 C -0.5 -0.5 -0.6 0.3 0 0.8 Z');
  if (L === 'body') fill(c, b);
  if (L === 'core') radial(c, 0, 0.5, 0.5, 0, 0.4);
} });
shape('p_flash', { size: [64, 64], draw: (L, c) => {
  if (L === 'body') radial(c, 0.0, 0.7, 0.9);
  if (L === 'core') radial(c, 0.0, 0.35, 1);
  if (L === 'glow') radial(c, 0.0, 1.0, 1);
} });
shape('p_shard', { size: [10, 14], draw: (L, c) => {
  const b = P.poly([[0, -0.9], [0.5, 0.2], [0.1, 0.8], [-0.5, 0.3]]);
  if (L === 'body') fill(c, b);
  if (L === 'core') fill(c, P.poly([[0, -0.5], [0.2, 0.1], [-0.2, 0.2]]), 0.8, 2);
  if (L === 'glow') radial(c, 0.2, 1, 0.5);
} });
// レーザー：縦に伸ばして使う（上下は一様、左右に芯・本体・光）
shape('laser', { size: [16, 64], draw: (L, c) => {
  const band = (w, v) => { c.save(); c.scale(1, 1); const g = c.createLinearGradient(-1, 0, 1, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5 - w / 2, `rgba(255,255,255,${v})`); g.addColorStop(0.5, `rgba(255,255,255,${v})`); g.addColorStop(0.5 + w / 2, `rgba(255,255,255,${v})`); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-1, -1, 2, 2); c.restore(); };
  if (L === 'body') band(0.5, 1);
  if (L === 'core') band(0.18, 1);
  if (L === 'glow') band(0.9, 0.7);
} });
// 自機の当たり判定の印（白い丸と赤い縁）
shape('hitbox', { size: [12, 12], draw: (L, c) => {
  if (L === 'body') fill(c, P.circle(0.6));
  if (L === 'core') fill(c, P.circle(0.4));
  if (L === 'rim') stroke(c, P.circle(0.62), 0.16);
  if (L === 'glow') radial(c, 0.5, 1, 0.7);
} });

export const SHAPE_NAMES = Object.keys(SHAPES);
export const SHAPE = Object.fromEntries(SHAPE_NAMES.map((n, i) => [n, i]));
export const SHAPE_INFO = SHAPE_NAMES.map((n) => {
  const s = SHAPES[n];
  return { name: n, size: s.size, r: s.r ?? 0, dir: !!s.dir, spin: s.spin || 0, layer: s.layer ?? 2 };
});

/** 弾の型のアトラス（DataTexture）。 */
export function buildMaskAtlas() {
  const W = CELL * GRID;
  const layers = ['body', 'core', 'rim', 'glow'].map((L) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = W;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    SHAPE_NAMES.forEach((n, i) => withCell(ctx, i, (c) => SHAPES[n].draw(L, c)));
    return ctx.getImageData(0, 0, W, W).data;
  });
  // 層を 1 枚に詰める。canvas の上の行がテクスチャの上（v = 1）にくるように、行を逆に並べる
  const data = new Uint8Array(W * W * 4);
  for (let y = 0; y < W; y++) {
    const src = y * W * 4, dst = (W - 1 - y) * W * 4;
    for (let x = 0; x < W; x++) {
      const s = src + x * 4 + 3, d = dst + x * 4;   // 灰色の層は透明度（alpha）に濃さが入っている
      data[d] = layers[0][s];
      data[d + 1] = layers[1][s];
      data[d + 2] = layers[2][s];
      data[d + 3] = layers[3][s];
    }
  }
  const tex = new THREE.DataTexture(data, W, W, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- 色つきの絵（アイテム・自機のショット）
const ICON_GRID = 4;
const ICONS = {};
function icon(name, draw) { ICONS[name] = draw; }

function grad(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  return g;
}
// 油揚げ（パワー）
icon('power', (c) => {
  c.fillStyle = grad(c, 0, -0.6, 0, 0.6, [[0, '#ffd27a'], [0.55, '#e8a23c'], [1, '#b8691f']]);
  c.strokeStyle = '#6b3510'; c.lineWidth = 0.08;
  const p = P.roundRect(-0.62, -0.5, 1.24, 1.0, 0.22);
  c.fill(p); c.stroke(p);
  c.fillStyle = 'rgba(255,240,200,0.75)';
  for (const [x, y] of [[-0.3, -0.18], [0.12, -0.24], [0.32, 0.12], [-0.12, 0.2], [-0.38, 0.22]]) { c.beginPath(); c.arc(x, y, 0.06, 0, 7); c.fill(); }
});
// 大きな油揚げ
icon('bigpower', (c) => {
  c.fillStyle = grad(c, 0, -0.8, 0, 0.8, [[0, '#ffe39b'], [0.5, '#f0a83c'], [1, '#b4621a']]);
  c.strokeStyle = '#6b3510'; c.lineWidth = 0.08;
  const p = P.path('M -0.8 -0.5 L 0.8 -0.5 L 0.5 0.75 L -0.5 0.75 Z');
  c.fill(p); c.stroke(p);
  c.fillStyle = 'rgba(255,240,200,0.75)';
  for (const [x, y] of [[-0.4, -0.25], [0.1, -0.3], [0.4, -0.1], [-0.1, 0.15], [0.2, 0.4], [-0.3, 0.42]]) { c.beginPath(); c.arc(x, y, 0.07, 0, 7); c.fill(); }
});
// 金平糖（点）
icon('point', (c) => {
  const s = P.star(9, 0.82, 0.58, 0);
  c.fillStyle = grad(c, -0.6, -0.6, 0.6, 0.6, [[0, '#e9f6ff'], [0.5, '#8cc8ff'], [1, '#4b7fe0']]);
  c.fill(s);
  c.strokeStyle = '#2b4c9a'; c.lineWidth = 0.08; c.stroke(s);
  c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.ellipse(-0.22, -0.26, 0.18, 0.12, -0.6, 0, 7); c.fill();
});
// 星（弾消しで出る小さな点）
icon('star', (c) => {
  const s = P.star(5, 0.86, 0.4);
  c.fillStyle = grad(c, 0, -0.8, 0, 0.8, [[0, '#fff8d0'], [1, '#ffcf3a']]);
  c.fill(s);
  c.strokeStyle = '#b07a10'; c.lineWidth = 0.08; c.stroke(s);
});
// 勾玉（ボム）
icon('bomb', (c) => {
  const m = P.path('M 0.1 -0.8 A 0.56 0.56 0 1 1 0.1 0.32 C 0.1 0.6 -0.2 0.84 -0.52 0.86 C -0.2 0.6 -0.46 0.24 -0.46 -0.24 A 0.56 0.56 0 0 1 0.1 -0.8 Z');
  c.fillStyle = grad(c, -0.6, -0.8, 0.6, 0.8, [[0, '#9ff7c5'], [0.5, '#2fbf77'], [1, '#147a49']]);
  c.fill(m);
  c.strokeStyle = '#0b4a2c'; c.lineWidth = 0.08; c.stroke(m);
  c.fillStyle = '#0b4a2c'; c.beginPath(); c.arc(0.1, -0.24, 0.13, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.ellipse(-0.18, -0.5, 0.12, 0.07, -0.7, 0, 7); c.fill();
});
// お守り（残機）
icon('life', (c) => {
  const p = P.path('M -0.5 -0.5 L 0 -0.82 L 0.5 -0.5 L 0.5 0.86 L -0.5 0.86 Z');
  c.fillStyle = grad(c, 0, -0.8, 0, 0.9, [[0, '#ff9fb8'], [1, '#e2365f']]);
  c.fill(p);
  c.strokeStyle = '#7a0f2c'; c.lineWidth = 0.08; c.stroke(p);
  c.strokeStyle = '#ffe28a'; c.lineWidth = 0.12; c.beginPath(); c.moveTo(-0.5, -0.36); c.lineTo(0.5, -0.36); c.stroke();
  c.fillStyle = '#fff4d6'; c.fillRect(-0.24, -0.1, 0.48, 0.72);
  c.fillStyle = '#c4213f'; c.fillRect(-0.04, 0.0, 0.08, 0.5);
});
// 自機のショット：お札（白い紙・赤い縁と字）
icon('shot_ofuda', (c) => {
  const p = P.roundRect(-0.36, -0.86, 0.72, 1.72, 0.06);
  c.fillStyle = 'rgba(255,250,240,0.95)'; c.fill(p);
  c.strokeStyle = '#e23b3b'; c.lineWidth = 0.1; c.stroke(p);
  c.strokeStyle = '#e23b3b'; c.lineWidth = 0.08;
  c.beginPath(); c.moveTo(-0.14, -0.5); c.lineTo(0.14, -0.5); c.moveTo(0, -0.5); c.lineTo(0, 0.5); c.moveTo(-0.16, -0.06); c.lineTo(0.16, -0.06); c.moveTo(-0.12, 0.28); c.lineTo(0.12, 0.28); c.stroke();
});
// 自機のショット：狐火（青白い炎）
icon('shot_fox', (c) => {
  const b = P.path('M 0 -0.96 C 0.22 -0.56 0.64 -0.24 0.58 0.28 C 0.52 0.76 -0.52 0.76 -0.58 0.28 C -0.64 -0.24 -0.22 -0.56 0 -0.96 Z');
  c.fillStyle = grad(c, 0, -0.9, 0, 0.8, [[0, 'rgba(120,200,255,0)'], [0.35, 'rgba(120,200,255,0.85)'], [1, 'rgba(60,120,255,0.95)']]);
  c.fill(b);
  const g = c.createRadialGradient(0, 0.3, 0, 0, 0.3, 0.45);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, 'rgba(200,240,255,0)');
  c.fillStyle = g; c.fillRect(-1, -1, 2, 2);
});
// 自機のショット：針（低速）
icon('shot_needle', (c) => {
  const g = c.createLinearGradient(-0.3, 0, 0.3, 0);
  g.addColorStop(0, 'rgba(255,120,90,0)'); g.addColorStop(0.35, 'rgba(255,170,120,0.9)'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.65, 'rgba(255,170,120,0.9)'); g.addColorStop(1, 'rgba(255,120,90,0)');
  c.fillStyle = g;
  c.beginPath(); c.ellipse(0, 0, 0.3, 0.96, 0, 0, 7); c.fill();
});
// 狐火の子機（自機のまわりを回る）
icon('option', (c) => {
  const g = c.createRadialGradient(0, 0.1, 0, 0, 0.1, 0.9);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, 'rgba(160,220,255,0.95)'); g.addColorStop(0.7, 'rgba(70,140,255,0.5)'); g.addColorStop(1, 'rgba(40,90,255,0)');
  c.fillStyle = g;
  c.beginPath(); c.moveTo(0, -0.98);
  c.bezierCurveTo(0.3, -0.5, 0.8, -0.1, 0.7, 0.36); c.bezierCurveTo(0.6, 0.86, -0.6, 0.86, -0.7, 0.36); c.bezierCurveTo(-0.8, -0.1, -0.3, -0.5, 0, -0.98);
  c.fill();
});
// 文字の入った小さな札（点の値などに使う予備）
icon('kira', (c) => {
  const s = P.star(4, 0.95, 0.14, 0);
  c.fillStyle = '#ffffff'; c.fill(s);
});

export const ICON = Object.fromEntries(Object.keys(ICONS).map((n, i) => [n, i]));

/** アイテムなどの色つきの絵のアトラス（CanvasTexture）。 */
export function buildColorAtlas() {
  const W = CELL * ICON_GRID;
  const cv = document.createElement('canvas');
  cv.width = cv.height = W;
  const ctx = cv.getContext('2d');
  Object.values(ICONS).forEach((draw, i) => {
    const cx = (i % ICON_GRID) * CELL + U, cy = Math.floor(i / ICON_GRID) * CELL + U;
    ctx.save();
    ctx.setTransform(U, 0, 0, U, cx, cy);
    draw(ctx);
    ctx.restore();
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}
export const ICON_GRID_SIZE = ICON_GRID;
export const MASK_GRID_SIZE = GRID;

/** 弾の色。THREE.Color（リニア）で持つ。 */
export const PALETTE = {};
const HEX = {
  red: 0xff3b4e, orange: 0xff8a2a, yellow: 0xffd92e, lime: 0x9cff3a, green: 0x2fdc6c, teal: 0x1fd6b4, cyan: 0x38e2ff,
  sky: 0x5cb4ff, blue: 0x3b62ff, purple: 0x8a4bff, violet: 0xc44bff, magenta: 0xff3bd2, pink: 0xff8fc8, white: 0xf2f2ff,
  gray: 0x9aa0b8, gold: 0xffc44a, brown: 0xb87a3a, dark: 0x40306a,
};
for (const [k, v] of Object.entries(HEX)) PALETTE[k] = new THREE.Color(v);
export const COLOR_NAMES = Object.keys(HEX);

/** 色つきの絵 1 つを画像（dataURL）にする（HTML の HUD に出す残機・ボムの印など）。 */
export function iconDataURL(name, size = 48) {
  const draw = ICONS[name];
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  if (draw) { ctx.setTransform(size / 2, 0, 0, size / 2, size / 2, size / 2); draw(ctx); }
  return cv.toDataURL('image/png');
}
