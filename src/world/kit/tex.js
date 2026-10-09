// キャンバスで描く画像（葉・竹の葉・木肌・石畳）。外の画像ファイルは使わない。
import * as THREE from 'three';
import { rng } from './noise.js';

export function canvasTex(w, h, draw, o = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = o.aniso ?? 4;
  t.name = o.name || 'canvas';
  return t;
}

/** もみじの葉（白。色は材質で付ける）。 */
export function mapleLeafTex(size = 128) {
  return canvasTex(size, size, (g, w) => {
    const c = w / 2, R = w * 0.46;
    const N = 7;
    g.beginPath();
    for (let i = 0; i <= 360; i++) {
      const th = (i / 360) * Math.PI * 2;
      const k = (th * N) / (Math.PI * 2) + 0.5;
      const tri = 1 - Math.abs(2 * (k - Math.floor(k)) - 1);
      let r = 0.26 + 0.74 * Math.pow(tri, 1.45);
      // 下（柄のほう）の切れ込みを深く
      const down = Math.cos(th - Math.PI);
      r *= 1 - 0.45 * Math.max(0, down) ** 3;
      const x = c + Math.sin(th) * r * R, y = c - Math.cos(th) * r * R;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    const gr = g.createRadialGradient(c, c, 0, c, c, R);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(1, '#d8d0c8');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = 'rgba(120,90,80,0.35)';
    g.lineWidth = w / 90;
    for (let i = 0; i < N; i++) {
      const th = ((i - 0.0) / N) * Math.PI * 2;
      if (Math.cos(th - Math.PI) > 0.85) continue;
      g.beginPath();
      g.moveTo(c, c);
      g.lineTo(c + Math.sin(th) * R * 0.85, c - Math.cos(th) * R * 0.85);
      g.stroke();
    }
    g.strokeStyle = 'rgba(200,190,180,1)';
    g.lineWidth = w / 50;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c, c + R * 0.95);
    g.stroke();
  }, { name: 'mapleLeaf' });
}

/** 竹の葉の房（上から見た扇形の細い葉の集まり）。 */
export function bambooLeafTex(size = 256, seed = 5) {
  const R = rng(seed);
  return canvasTex(size, size, (g, w) => {
    const c = w / 2;
    for (let k = 0; k < 3; k++) {
      // 小枝の先に 4〜6 枚
      const base = R() * Math.PI * 2;
      const bx = c + Math.cos(base) * w * 0.12, by = c + Math.sin(base) * w * 0.12;
      const n = 4 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const a = base + (i - n / 2) * 0.42 + (R() - 0.5) * 0.3;
        const len = w * (0.22 + R() * 0.16), wid = len * 0.14;
        g.save();
        g.translate(bx, by);
        g.rotate(a);
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(len * 0.45, -wid, len, 0);
        g.quadraticCurveTo(len * 0.45, wid, 0, 0);
        const sh = 150 + Math.floor(R() * 70);
        g.fillStyle = `rgb(${sh},${sh + 20},${sh - 30})`;
        g.fill();
        g.restore();
      }
    }
  }, { name: 'bambooLeaf' });
}

/** 木肌（縦の筋）。繰り返す。 */
export function barkTex(w = 128, h = 256, seed = 3, base = [74, 50, 40]) {
  const R = rng(seed);
  return canvasTex(w, h, (g) => {
    g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const x = R() * w, wd = 1 + R() * 4, k = 0.55 + R() * 0.7;
      g.fillStyle = `rgba(${Math.floor(base[0] * k)},${Math.floor(base[1] * k)},${Math.floor(base[2] * k)},0.7)`;
      g.fillRect(x, 0, wd, h);
      g.fillRect(x - w, 0, wd, h);
    }
    for (let i = 0; i < 60; i++) {
      const x = R() * w, y = R() * h;
      g.fillStyle = 'rgba(20,14,10,0.35)';
      g.fillRect(x, y, 1 + R() * 2, 6 + R() * 30);
    }
  }, { repeat: true, name: 'bark' });
}

/** 石畳（不ぞろいな四角の石）。繰り返す。 */
export function flagstoneTex(size = 256, seed = 9) {
  const R = rng(seed);
  return canvasTex(size, size, (g, w) => {
    g.fillStyle = '#3a3630';
    g.fillRect(0, 0, w, w);
    const rows = 6;
    const rh = w / rows;
    for (let r = 0; r < rows; r++) {
      let x = -R() * rh;
      while (x < w) {
        const cw = rh * (0.9 + R() * 0.9);
        const k = 0.78 + R() * 0.32;
        const col = [128 * k, 122 * k, 110 * k].map(Math.floor);
        g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
        const pad = 2.2;
        for (const ox of [0, -w, w]) g.fillRect(x + pad + ox, r * rh + pad, cw - pad * 2, rh - pad * 2);
        // 石の上の小さなむら
        for (let s = 0; s < 6; s++) {
          g.fillStyle = `rgba(${R() < 0.5 ? '40,44,30' : '170,160,140'},${0.08 + R() * 0.1})`;
          g.fillRect(x + R() * cw, r * rh + R() * rh, 3 + R() * 8, 2 + R() * 6);
        }
        x += cw;
      }
    }
  }, { repeat: true, name: 'flagstone' });
}
