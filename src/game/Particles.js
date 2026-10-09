// 火花・爆発・煙などの演出（当たり判定なし）。フィールドの座標で動く。
// 足し算の光（add）と、ふつうの重ね（alpha）の 2 つの束で描く。
//
//   fx.emit({ x, y, vx, vy, cell: SHAPE.p_dot, color: 'cyan', life: 30, size: 12, size1: 2 })
//   fx.burst(x, y, 'red', 1)   よく使う形（爆発・当たり・かすり）は下にまとめてある
import { SHAPE, SHAPE_INFO, PALETTE } from './atlas.js';

const N = 3000;

export class Particles {
  constructor() {
    this.alive = new Uint8Array(N);
    this.x = new Float32Array(N); this.y = new Float32Array(N); this.z = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N);
    this.drag = new Float32Array(N); this.grav = new Float32Array(N);
    this.t = new Float32Array(N); this.life = new Float32Array(N);
    this.s0 = new Float32Array(N); this.s1 = new Float32Array(N); this.aspect = new Float32Array(N);
    this.a0 = new Float32Array(N); this.a1 = new Float32Array(N);
    this.ang = new Float32Array(N); this.spin = new Float32Array(N);
    this.cell = new Uint8Array(N); this.add = new Uint8Array(N); this.dirA = new Uint8Array(N);
    this.r = new Float32Array(N); this.g = new Float32Array(N); this.b = new Float32Array(N);
    this.free = [];
    for (let i = N - 1; i >= 0; i--) this.free.push(i);
    this.top = 0;
  }

  emit(o) {
    const i = this.free.pop();
    if (i === undefined) return -1;
    const c = typeof o.color === 'string' ? PALETTE[o.color] || PALETTE.white : o.color || PALETTE.white;
    this.alive[i] = 1;
    this.x[i] = o.x; this.y[i] = o.y; this.z[i] = o.z || 0;
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0;
    this.drag[i] = o.drag ?? 0.96; this.grav[i] = o.grav || 0;
    this.t[i] = 0; this.life[i] = o.life || 30;
    const s = o.size ?? SHAPE_INFO[o.cell ?? SHAPE.p_dot].size[1];
    this.s0[i] = s; this.s1[i] = o.size1 ?? s; this.aspect[i] = o.aspect ?? 1;
    this.a0[i] = o.alpha ?? 1; this.a1[i] = o.alpha1 ?? 0;
    this.ang[i] = o.angle ?? 0; this.spin[i] = o.spin || 0;
    this.cell[i] = o.cell ?? SHAPE.p_dot;
    this.add[i] = o.add === false ? 0 : 1;
    this.dirA[i] = o.dirAngle ? 1 : 0; // 進む向きに絵を向ける（火花の筋）
    this.r[i] = c.r; this.g[i] = c.g; this.b[i] = c.b;
    if (i >= this.top) this.top = i + 1;
    return i;
  }

  update() {
    let top = 0;
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue;
      if (++this.t[i] >= this.life[i]) { this.alive[i] = 0; this.free.push(i); continue; }
      const d = this.drag[i];
      this.vx[i] *= d; this.vy[i] = this.vy[i] * d - this.grav[i];
      this.x[i] += this.vx[i]; this.y[i] += this.vy[i];
      this.ang[i] += this.spin[i];
      top = i + 1;
    }
    this.top = top;
  }

  render(addBatch, alphaBatch) {
    addBatch.begin();
    alphaBatch.begin();
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue;
      const k = this.t[i] / this.life[i];
      const s = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      const a = this.a0[i] + (this.a1[i] - this.a0[i]) * k;
      const ang = this.dirA[i] ? Math.atan2(this.vy[i], this.vx[i]) - Math.PI / 2 : this.ang[i];
      const info = SHAPE_INFO[this.cell[i]];
      const sx = (s * info.size[0]) / info.size[1] * this.aspect[i];
      (this.add[i] ? addBatch : alphaBatch).push(this.x[i], this.y[i], ang, sx, s, this.cell[i], this.r[i], this.g[i], this.b[i], a, this.z[i]);
    }
    addBatch.end();
    alphaBatch.end();
  }

  clear() {
    for (let i = 0; i < this.top; i++) if (this.alive[i]) { this.alive[i] = 0; this.free.push(i); }
    this.top = 0;
  }

  // ---------------------------------------------------------------- よく使う形
  /** 敵がやられたときの爆発。size：0 小さい敵〜2 ボス。 */
  burst(x, y, color = 'orange', size = 1) {
    const n = 8 + size * 10;
    this.emit({ x, y, cell: SHAPE.p_flash, color, life: 16 + size * 6, size: 26 + size * 30, size1: 60 + size * 70, alpha: 0.9 });
    this.emit({ x, y, cell: SHAPE.p_ring, color: 'white', life: 18 + size * 6, size: 10, size1: 70 + size * 60, alpha: 0.8 });
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = (1.5 + Math.random() * 4) * (1 + size * 0.4);
      this.emit({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, cell: SHAPE.p_spark, color, life: 18 + Math.random() * 16, size: 14 + size * 6, size1: 2, drag: 0.92, dirAngle: true });
    }
    for (let k = 0; k < 4 + size * 4; k++) {
      const a = Math.random() * Math.PI * 2, sp = Math.random() * 1.6;
      this.emit({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, cell: SHAPE.p_smoke, color: 'gray', add: false, life: 30 + Math.random() * 20, size: 14 + size * 8, size1: 34 + size * 20, alpha: 0.35, drag: 0.95, spin: (Math.random() - 0.5) * 0.05, angle: Math.random() * 6 });
    }
  }

  /** 弾が当たった火花（敵に）。 */
  hit(x, y, color = 'white') {
    const a = Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    this.emit({ x, y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, cell: SHAPE.p_spark, color, life: 8, size: 10, size1: 2, dirAngle: true, alpha: 0.8 });
  }

  /** かすり。 */
  graze(x, y) {
    const a = Math.random() * Math.PI * 2;
    this.emit({ x, y, vx: Math.cos(a) * 2.6, vy: Math.sin(a) * 2.6, cell: SHAPE.p_twinkle, color: 'white', life: 16, size: 9, size1: 2, alpha: 0.9, spin: 0.2 });
  }

  /** 弾が消えるときのきらめき。 */
  vanish(x, y, color = 'white') {
    this.emit({ x, y, cell: SHAPE.p_twinkle, color, life: 14, size: 14, size1: 3, alpha: 0.8, spin: 0.15 });
  }
}
