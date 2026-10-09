// 敵の弾。数千発を型付き配列（SoA）で持ち、1 コマごとに動かして自機との当たり・かすりを調べる。
//
// 動きは「速さ・向き」で持つ：毎コマ 向き += angVel、速さ = clamp(速さ + accel, minSpeed, maxSpeed)、位置 += 向き×速さ。
// 曲がる・速くなる・止まる弾はこれで書ける。もっと特別な動きは fn(B, i) を渡す（毎コマ呼ばれ、B の配列を直接いじる）。
//
//   const i = bullets.spawn(x, y, 2.5, angle, SHAPE.rice, 'red', { accel: 0.02, maxSpeed: 4 });
//   const h = bullets.handle(i);  … bullets.alive(h) で、その弾がまだ同じ弾として残っているか
import { HALF_W, HALF_H, OUT_MARGIN } from './config.js';
import { SHAPE_INFO, PALETTE } from './atlas.js';

export const MAX_BULLETS = 4096;
export const BF = { GRAZED: 1, NOCANCEL: 2, NOEDGE: 4, NOHIT: 8, FLIP: 16, BIG_CANCEL: 32 };
const SPAWN_FX = 9;  // 出てくるときの演出のコマ数
const HIT_AFTER = 3; // 出てから当たりが生まれるまで

export class Bullets {
  constructor() {
    const N = MAX_BULLETS;
    this.alive = new Uint8Array(N);
    this.x = new Float32Array(N);
    this.y = new Float32Array(N);
    this.speed = new Float32Array(N);
    this.angle = new Float32Array(N);
    this.accel = new Float32Array(N);
    this.angVel = new Float32Array(N);
    this.minSpeed = new Float32Array(N);
    this.maxSpeed = new Float32Array(N);
    this.t = new Int32Array(N);
    this.shape = new Uint8Array(N);
    this.r = new Float32Array(N);
    this.g = new Float32Array(N);
    this.b = new Float32Array(N);
    this.scale = new Float32Array(N);
    this.hitR = new Float32Array(N);
    this.alpha = new Float32Array(N);
    this.flags = new Uint8Array(N);
    this.spinA = new Float32Array(N);
    this.life = new Int32Array(N);       // 0 なら無期限（画面の外で消える）
    this.gen = new Uint32Array(N);
    this.fn = new Array(N).fill(null);
    this.data = new Array(N).fill(null);
    this.free = [];
    for (let i = N - 1; i >= 0; i--) this.free.push(i);
    this.top = 0;     // 使っている番号の最大 + 1（ループの範囲）
    this.spawnTop = 0; // update の途中で増えた弾の番号の最大 + 1（top を縮めすぎないように）
    this.count = 0;
    this.hitScale = 1; // 当たり判定の倍率（難易度・調整用）
  }

  spawn(x, y, speed, angle, shape, color = 'white', o = {}) {
    const i = this.free.pop();
    if (i === undefined) return -1;
    const info = SHAPE_INFO[shape];
    const c = typeof color === 'string' ? PALETTE[color] || PALETTE.white : color;
    this.alive[i] = 1;
    this.x[i] = x; this.y[i] = y;
    this.speed[i] = speed;
    this.angle[i] = angle;
    this.accel[i] = o.accel || 0;
    this.angVel[i] = o.angVel || 0;
    this.minSpeed[i] = o.minSpeed ?? -99;
    this.maxSpeed[i] = o.maxSpeed ?? 99;
    this.t[i] = 0;
    this.shape[i] = shape;
    this.r[i] = c.r; this.g[i] = c.g; this.b[i] = c.b;
    const sc = o.scale || 1;
    this.scale[i] = sc;
    this.hitR[i] = info.r * sc * (o.hitMul ?? 1);
    this.alpha[i] = o.alpha ?? 1;
    this.flags[i] = o.flags || 0;
    this.spinA[i] = Math.random() * 6.283;
    this.life[i] = o.life || 0;
    this.gen[i]++;
    this.fn[i] = o.fn || null;
    this.data[i] = o.data ?? null;
    if (i >= this.top) this.top = i + 1;
    if (i >= this.spawnTop) this.spawnTop = i + 1;
    this.count++;
    return i;
  }

  handle(i) { return i < 0 ? -1 : i * 65536 + (this.gen[i] & 0xffff); }
  /** handle がまだ同じ弾を指しているか。指していれば番号、でなければ -1。 */
  resolve(h) {
    if (h < 0) return -1;
    const i = Math.floor(h / 65536);
    return this.alive[i] && (this.gen[i] & 0xffff) === h % 65536 ? i : -1;
  }

  kill(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.fn[i] = null;
    this.data[i] = null;
    this.free.push(i);
    this.count--;
  }

  setColor(i, color) {
    const c = typeof color === 'string' ? PALETTE[color] || PALETTE.white : color;
    this.r[i] = c.r; this.g[i] = c.g; this.b[i] = c.b;
  }

  /**
   * 1 コマ進める。player = { x, y, r, grazeR, vulnerable }。
   * 戻り値：{ hit（当たった弾の番号、なければ -1）, grazes（このコマのかすりの数）, gx, gy（最後のかすりの位置） }
   */
  update(player) {
    const res = this._res || (this._res = { hit: -1, grazes: 0, gx: 0, gy: 0 });
    res.hit = -1; res.grazes = 0;
    const px = player.x, py = player.y, pr = player.r, gr = player.grazeR, vul = player.vulnerable;
    const X0 = -HALF_W - OUT_MARGIN, X1 = HALF_W + OUT_MARGIN, Y0 = -HALF_H - OUT_MARGIN, Y1 = HALF_H + OUT_MARGIN;
    let top = 0;
    this.spawnTop = 0;
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue;
      const t = ++this.t[i];
      if (this.fn[i]) {
        this.fn[i](this, i);
        if (!this.alive[i]) continue;
      }
      let a = this.angle[i] += this.angVel[i];
      let s = this.speed[i] + this.accel[i];
      if (s < this.minSpeed[i]) s = this.minSpeed[i];
      if (s > this.maxSpeed[i]) s = this.maxSpeed[i];
      this.speed[i] = s;
      const x = (this.x[i] += Math.cos(a) * s);
      const y = (this.y[i] += Math.sin(a) * s);
      const f = this.flags[i];
      if (this.life[i] && t >= this.life[i]) { this.kill(i); continue; }
      if (!(f & BF.NOEDGE) && (x < X0 || x > X1 || y < Y0 || y > Y1)) { this.kill(i); continue; }
      if ((f & BF.NOEDGE) && t > 60 * 30) { this.kill(i); continue; }
      top = i + 1;
      if (f & BF.NOHIT || t < HIT_AFTER) continue;
      const dx = x - px, dy = y - py;
      const d2 = dx * dx + dy * dy;
      const hr = this.hitR[i] * this.hitScale;
      if (!(f & BF.GRAZED)) {
        const g = hr + gr;
        if (d2 < g * g) { this.flags[i] |= BF.GRAZED; res.grazes++; res.gx = x; res.gy = y; }
      }
      if (vul && res.hit < 0) {
        const h = hr + pr;
        if (d2 < h * h) res.hit = i;
      }
    }
    this.top = Math.max(top, this.spawnTop);
    return res;
  }

  /** 全部の弾を消す（ボム・被弾・スペルの切り替え）。cb(x, y, i) を弾ごとに呼ぶ（星のアイテムに変えるなど）。 */
  cancelAll(cb = null, force = false) {
    let n = 0;
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue;
      if (!force && this.flags[i] & BF.NOCANCEL) continue;
      cb?.(this.x[i], this.y[i], i);
      this.kill(i);
      n++;
    }
    return n;
  }

  /** (x, y) から半径 r の中の弾を消す。 */
  cancelCircle(x, y, r, cb = null) {
    const r2 = r * r;
    let n = 0;
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i] || this.flags[i] & BF.NOCANCEL) continue;
      const dx = this.x[i] - x, dy = this.y[i] - y;
      if (dx * dx + dy * dy < r2) { cb?.(this.x[i], this.y[i], i); this.kill(i); n++; }
    }
    return n;
  }

  /** 描く。大きい弾を下に、小さい弾を上に重ねる（読みやすさ）。 */
  render(batch) {
    batch.begin();
    for (let layer = 0; layer < 4; layer++) {
      for (let i = 0; i < this.top; i++) {
        if (!this.alive[i]) continue;
        const sh = this.shape[i];
        const info = SHAPE_INFO[sh];
        if (info.layer !== layer) continue;
        const t = this.t[i];
        let sc = this.scale[i], al = this.alpha[i];
        if (t < SPAWN_FX) { const k = t / SPAWN_FX; sc *= 1 + (1 - k) * 1.1; al *= 0.35 + 0.65 * k; }
        let ang = 0;
        if (info.dir) ang = this.angle[i] - Math.PI / 2 + (this.flags[i] & BF.FLIP ? Math.PI : 0);
        if (info.spin) ang = this.spinA[i] += info.spin;
        batch.push(this.x[i], this.y[i], ang, info.size[0] * sc, info.size[1] * sc, sh, this.r[i], this.g[i], this.b[i], al);
      }
    }
    batch.end();
  }

  clear() {
    for (let i = 0; i < this.top; i++) if (this.alive[i]) this.kill(i);
    this.top = 0;
  }
}
