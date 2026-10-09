// ※ このファイルと、4 人のキャラクター（いなほ・ぽこ・すず・つくよ）のデザインは MIT License の対象外です（LICENSE の「例外」を参照）。
//   The code in this file and the characters' designs are not covered by the MIT License (see the exception in LICENSE).
// 顔のテクスチャ（目・眉・口・ほお・化粧）を canvas に描く。表情を変えたときだけ描き直す。
// canvas の 1 辺 = 頭のローカル座標で 2 × FACE.half（m）。中心は頭の中心から FACE.cy だけ下。正面からの平行投影で貼る。
import * as THREE from 'three';

export const FACE = { half: 0.125, cy: -0.02 };
const S = 512;
const K = S / (FACE.half * 2); // px / m
const X = (x) => S / 2 + x * K;
const Y = (y) => S / 2 - (y - FACE.cy) * K; // y は頭の中心からの高さ（m）

export class FaceTexture {
  constructor(spec) {
    this.spec = spec;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = S;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.state = { eyes: 'open', mouth: 'smile', brows: 'normal', blush: 0.5, lookX: 0, lookY: 0 };
    this.key = '';
    this.draw();
  }

  /** 表情を変える（変わったときだけ描き直す）。 */
  set(o) {
    Object.assign(this.state, o);
    const s = this.state;
    const key = `${s.eyes}|${s.mouth}|${s.brows}|${s.blush.toFixed(2)}|${s.lookX.toFixed(2)}|${s.lookY.toFixed(2)}`;
    if (key !== this.key) this.draw();
  }

  draw() {
    const s = this.state, F = this.spec, c = this.ctx;
    this.key = `${s.eyes}|${s.mouth}|${s.brows}|${s.blush.toFixed(2)}|${s.lookX.toFixed(2)}|${s.lookY.toFixed(2)}`;
    c.clearRect(0, 0, S, S);
    // ほお
    if (s.blush > 0) {
      for (const side of [-1, 1]) {
        const g = c.createRadialGradient(X(0.072 * side), Y(-0.05), 2, X(0.072 * side), Y(-0.05), 0.03 * K);
        g.addColorStop(0, `rgba(255,120,130,${0.42 * s.blush})`);
        g.addColorStop(1, 'rgba(255,120,130,0)');
        c.fillStyle = g;
        c.beginPath(); c.ellipse(X(0.072 * side), Y(-0.05), 0.034 * K, 0.018 * K, 0, 0, 7); c.fill();
        // 斜線
        c.strokeStyle = `rgba(230,90,100,${0.5 * s.blush})`;
        c.lineWidth = 2.2;
        for (let k = -1; k <= 1; k++) {
          const x0 = X(0.072 * side + k * 0.011);
          c.beginPath(); c.moveTo(x0 + 4, Y(-0.044)); c.lineTo(x0 - 4, Y(-0.056)); c.stroke();
        }
      }
    }
    // 狐の化粧（目じりの朱）
    if (F.marks) {
      c.fillStyle = F.marks;
      for (const side of [-1, 1]) {
        c.beginPath();
        const x0 = X(0.084 * side), y0 = Y(-0.026);
        c.moveTo(x0, y0);
        c.quadraticCurveTo(x0 + side * 0.016 * K, y0 - 0.002 * K, x0 + side * 0.024 * K, y0 - 0.016 * K);
        c.quadraticCurveTo(x0 + side * 0.012 * K, y0 + 0.006 * K, x0, y0);
        c.fill();
      }
    }
    for (const side of [-1, 1]) this.eye(side);
    this.brows();
    this.mouth();
    this.texture.needsUpdate = true;
  }

  /** 片目。side = -1 が向かって左（キャラの右目）。 */
  eye(side) {
    const s = this.state, F = this.spec, c = this.ctx;
    let mode = s.eyes;
    if (mode === 'wink') mode = side < 0 ? 'open' : 'happy';
    const cx = X(0.051 * side), cy = Y(-0.012);
    const W = 0.029 * K * (F.eyeW || 1), H = 0.036 * K * (F.eyeH || 1);
    c.save();
    c.translate(cx, cy);
    c.scale(side, 1); // 外側が +x
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const lash = F.lash || '#2a1a1e';
    if (mode === 'closed' || mode === 'happy' || mode === 'sleepy') {
      c.strokeStyle = lash;
      c.lineWidth = 0.0055 * K;
      c.beginPath();
      if (mode === 'happy') { c.moveTo(-W * 0.9, H * 0.25); c.quadraticCurveTo(0, -H * 0.55, W * 0.95, H * 0.2); }
      else if (mode === 'sleepy') { c.moveTo(-W * 0.9, 0); c.quadraticCurveTo(0, H * 0.2, W * 0.95, -H * 0.05); }
      else { c.moveTo(-W * 0.9, -H * 0.05); c.quadraticCurveTo(0, H * 0.4, W * 0.95, -H * 0.12); }
      c.stroke();
      // まつげの先
      c.beginPath(); c.moveTo(W * 0.85, -H * 0.08); c.lineTo(W * 1.12, -H * 0.3); c.stroke();
      c.restore();
      return;
    }
    if (mode === 'dizzy') {
      c.strokeStyle = lash;
      c.lineWidth = 0.004 * K;
      c.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.2) { const r = (a / (Math.PI * 5)) * W * 0.85; c.lineTo(Math.cos(a) * r, Math.sin(a) * r * 1.1); }
      c.stroke();
      c.restore();
      return;
    }
    const wide = mode === 'wide' ? 1.12 : 1;
    const lid = mode === 'half' ? 0.45 : mode === 'angry' ? 0.3 : mode === 'sad' ? 0.2 : 0;
    // 白目の形
    const top = -H * (0.95 - lid) * wide;
    const shape = () => {
      c.beginPath();
      c.moveTo(-W * 0.92, H * 0.1);
      if (mode === 'angry') c.bezierCurveTo(-W * 0.7, top * 0.7, W * 0.3, top * 1.15, W * 1.0, top * 0.8);
      else if (mode === 'sad') c.bezierCurveTo(-W * 0.7, top * 1.1, W * 0.4, top * 0.95, W * 1.0, top * 0.55);
      else c.bezierCurveTo(-W * 0.78, top * 1.02, W * 0.42, top * 1.1, W * 1.0, -H * 0.3 * wide);
      c.bezierCurveTo(W * 1.02, H * 0.35, W * 0.6, H * 0.85 * wide, 0, H * 0.86 * wide);
      c.bezierCurveTo(-W * 0.6, H * 0.85 * wide, -W * 0.92, H * 0.5, -W * 0.92, H * 0.1);
      c.closePath();
    };
    shape();
    c.fillStyle = '#fffaf6';
    c.fill();
    c.save();
    shape();
    c.clip();
    // 虹彩
    const ir = W * 0.7 * (mode === 'wide' ? 0.82 : 1), iry = H * 0.92 * (mode === 'wide' ? 0.82 : 1);
    const ix = W * 0.02 + s.lookX * W * 0.3 * side, iy = H * 0.12 - s.lookY * H * 0.2;
    const [ic0, ic1, ic2] = F.iris || ['#3a1c14', '#a8452c', '#ffb26a'];
    let g = c.createLinearGradient(0, iy - iry, 0, iy + iry);
    g.addColorStop(0, ic0); g.addColorStop(0.45, ic1); g.addColorStop(1, ic2);
    c.fillStyle = g;
    c.beginPath(); c.ellipse(ix, iy, ir, iry, 0, 0, 7); c.fill();
    c.lineWidth = 0.0026 * K;
    c.strokeStyle = ic0;
    c.stroke();
    // 瞳
    c.fillStyle = F.pupil || 'rgba(30,10,10,0.9)';
    c.beginPath();
    if (F.slit) c.ellipse(ix, iy - iry * 0.04, ir * 0.16, iry * 0.62, 0, 0, 7);
    else c.ellipse(ix, iy - iry * 0.08, ir * 0.42, iry * 0.48, 0, 0, 7);
    c.fill();
    // 下の明るい反射
    g = c.createRadialGradient(ix, iy + iry * 0.55, 1, ix, iy + iry * 0.55, ir);
    g.addColorStop(0, 'rgba(255,240,210,0.6)'); g.addColorStop(1, 'rgba(255,240,210,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(ix, iy + iry * 0.5, ir * 0.8, iry * 0.45, 0, 0, 7); c.fill();
    // 上まぶたの影
    g = c.createLinearGradient(0, top, 0, top + H * 0.6);
    g.addColorStop(0, 'rgba(60,20,30,0.45)'); g.addColorStop(1, 'rgba(60,20,30,0)');
    c.fillStyle = g;
    c.fillRect(-W * 1.2, top - 4, W * 2.4, H * 0.7);
    // ハイライト
    c.fillStyle = '#ffffff';
    c.beginPath(); c.ellipse(ix - ir * 0.28 * side, iy - iry * 0.42, ir * 0.3, iry * 0.22, -0.4 * side, 0, 7); c.fill();
    c.beginPath(); c.ellipse(ix + ir * 0.35 * side, iy + iry * 0.38, ir * 0.13, iry * 0.1, 0, 0, 7); c.fill();
    c.restore();
    // 上まつげ（太い線）と目じりのはね
    c.strokeStyle = lash;
    c.lineWidth = 0.0085 * K;
    c.beginPath();
    c.moveTo(-W * 0.95, H * 0.12);
    if (mode === 'angry') c.bezierCurveTo(-W * 0.7, top * 0.7, W * 0.3, top * 1.15, W * 1.04, top * 0.8);
    else if (mode === 'sad') c.bezierCurveTo(-W * 0.7, top * 1.1, W * 0.4, top * 0.95, W * 1.04, top * 0.55);
    else c.bezierCurveTo(-W * 0.78, top * 1.02, W * 0.42, top * 1.1, W * 1.04, -H * 0.3 * wide);
    c.stroke();
    c.lineWidth = 0.0045 * K;
    c.beginPath(); c.moveTo(W * 0.96, -H * 0.28 * wide); c.lineTo(W * 1.24, -H * 0.5 * wide); c.stroke();
    // 下まつげ（短く細く）
    c.lineWidth = 0.0022 * K;
    c.strokeStyle = F.lashSoft || 'rgba(90,40,50,0.8)';
    c.beginPath(); c.moveTo(W * 0.2, H * 0.84 * wide); c.quadraticCurveTo(W * 0.62, H * 0.78 * wide, W * 0.86, H * 0.5); c.stroke();
    c.restore();
  }

  brows() {
    const s = this.state, F = this.spec, c = this.ctx;
    c.strokeStyle = F.brow || '#7a5040';
    c.lineWidth = 0.0035 * K;
    c.lineCap = 'round';
    for (const side of [-1, 1]) {
      const x0 = X(0.03 * side), x1 = X(0.075 * side);
      let y0 = Y(0.044), y1 = Y(0.046);
      if (s.brows === 'angry') { y0 = Y(0.034); y1 = Y(0.05); }
      if (s.brows === 'sad') { y0 = Y(0.05); y1 = Y(0.036); }
      if (s.brows === 'up') { y0 = Y(0.054); y1 = Y(0.056); }
      c.beginPath();
      c.moveTo(x0, y0);
      c.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 4, x1, y1);
      c.stroke();
    }
  }

  mouth() {
    const s = this.state, F = this.spec, c = this.ctx;
    const mx = X(0), my = Y(-0.072);
    const ink = F.mouthInk || '#6a2f35';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = ink;
    c.lineWidth = 0.0028 * K;
    const w = 0.012 * K;
    switch (s.mouth) {
      case 'open': case 'talk': {
        const h = s.mouth === 'talk' ? 0.008 * K : 0.012 * K;
        c.fillStyle = '#8c3240';
        c.beginPath(); c.moveTo(mx - w, my - 2); c.quadraticCurveTo(mx, my - 4, mx + w, my - 2); c.quadraticCurveTo(mx + w * 0.6, my + h, mx, my + h); c.quadraticCurveTo(mx - w * 0.6, my + h, mx - w, my - 2); c.fill();
        c.fillStyle = '#ff8a98';
        c.beginPath(); c.ellipse(mx, my + h * 0.65, w * 0.5, h * 0.3, 0, 0, 7); c.fill();
        if (F.fang) { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(mx + w * 0.3, my - 2); c.lineTo(mx + w * 0.5, my + 6); c.lineTo(mx + w * 0.7, my - 2); c.fill(); }
        break;
      }
      case 'o':
        c.fillStyle = '#8c3240';
        c.beginPath(); c.ellipse(mx, my + 2, w * 0.45, 0.008 * K, 0, 0, 7); c.fill();
        break;
      case 'flat':
        c.beginPath(); c.moveTo(mx - w * 0.6, my); c.lineTo(mx + w * 0.6, my); c.stroke();
        break;
      case 'frown':
        c.beginPath(); c.moveTo(mx - w * 0.7, my + 3); c.quadraticCurveTo(mx, my - 4, mx + w * 0.7, my + 3); c.stroke();
        break;
      case 'grin':
        c.fillStyle = '#8c3240';
        c.beginPath(); c.moveTo(mx - w * 1.1, my - 3); c.quadraticCurveTo(mx, my + 0.014 * K, mx + w * 1.1, my - 3); c.closePath(); c.fill();
        c.fillStyle = '#fff';
        c.fillRect(mx - w * 0.9, my - 3, w * 1.8, 4);
        if (F.fang) { c.beginPath(); c.moveTo(mx + w * 0.3, my); c.lineTo(mx + w * 0.5, my + 7); c.lineTo(mx + w * 0.7, my); c.fill(); }
        break;
      case 'cat':
        c.beginPath(); c.moveTo(mx - w, my - 2); c.quadraticCurveTo(mx - w * 0.5, my + 6, mx, my - 1); c.quadraticCurveTo(mx + w * 0.5, my + 6, mx + w, my - 2); c.stroke();
        if (F.fang) { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(mx + w * 0.35, my + 1); c.lineTo(mx + w * 0.5, my + 7); c.lineTo(mx + w * 0.65, my + 2); c.fill(); }
        break;
      case 'pout':
        c.beginPath(); c.moveTo(mx - w * 0.5, my + 2); c.quadraticCurveTo(mx, my - 3, mx + w * 0.5, my + 2); c.stroke();
        break;
      default: // smile
        c.beginPath(); c.moveTo(mx - w * 0.8, my - 2); c.quadraticCurveTo(mx, my + 7, mx + w * 0.8, my - 2); c.stroke();
        if (F.fang) { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(mx + w * 0.25, my + 1); c.lineTo(mx + w * 0.4, my + 7); c.lineTo(mx + w * 0.55, my + 1.5); c.fill(); }
    }
  }

  dispose() { this.texture.dispose(); }
}
