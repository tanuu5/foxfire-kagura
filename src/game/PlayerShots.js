// 自機のショット：お札（まっすぐ）、狐火（敵を追う）、針（低速の集中弾）。
// 敵の弾より薄く描く（敵の弾を見えにくくしないため）。
import { HALF_W, HALF_H } from './config.js';
import { ICON } from './atlas.js';

const N = 400;
export const SHOT = { ofuda: 0, fox: 1, needle: 2 };
const LOOK = [
  { icon: ICON.shot_ofuda, w: 11, h: 22, alpha: 0.55 },
  { icon: ICON.shot_fox, w: 15, h: 19, alpha: 0.6 },
  { icon: ICON.shot_needle, w: 9, h: 30, alpha: 0.6 },
];

export class PlayerShots {
  constructor() {
    this.alive = new Uint8Array(N);
    this.x = new Float32Array(N); this.y = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N);
    this.type = new Uint8Array(N);
    this.dmg = new Float32Array(N);
    this.t = new Int32Array(N);
    this.free = [];
    for (let i = N - 1; i >= 0; i--) this.free.push(i);
    this.top = 0;
  }

  spawn(x, y, vx, vy, type, dmg) {
    const i = this.free.pop();
    if (i === undefined) return -1;
    this.alive[i] = 1;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.type[i] = type; this.dmg[i] = dmg; this.t[i] = 0;
    if (i >= this.top) this.top = i + 1;
    return i;
  }

  kill(i) { if (this.alive[i]) { this.alive[i] = 0; this.free.push(i); } }

  /**
   * 1 コマ進める。enemies：当たる相手の配列（{ x, y, r, alive, hittable }）。
   * 当たったら onHit(enemy, dmg, x, y, type) を呼んで弾を消す。
   */
  update(enemies, onHit) {
    let top = 0;
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue;
      const t = ++this.t[i];
      // 狐火：いちばん近い敵へ少しずつ向きを変える
      if (this.type[i] === SHOT.fox && t > 4) {
        let best = null, bd = 1e9;
        for (const e of enemies) {
          if (!e.alive || !e.hittable) continue;
          const dx = e.x - this.x[i], dy = e.y - this.y[i];
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          const sp = Math.hypot(this.vx[i], this.vy[i]);
          const want = Math.atan2(best.y - this.y[i], best.x - this.x[i]);
          let cur = Math.atan2(this.vy[i], this.vx[i]);
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          cur += Math.max(-0.16, Math.min(0.16, d));
          this.vx[i] = Math.cos(cur) * sp;
          this.vy[i] = Math.sin(cur) * sp;
        }
      }
      const x = (this.x[i] += this.vx[i]);
      const y = (this.y[i] += this.vy[i]);
      if (y > HALF_H + 30 || y < -HALF_H - 30 || x < -HALF_W - 30 || x > HALF_W + 30 || t > 240) { this.kill(i); continue; }
      let hit = false;
      for (const e of enemies) {
        if (!e.alive || !e.hittable) continue;
        const dx = e.x - x, dy = e.y - y, r = e.r + 6;
        if (dx * dx + dy * dy < r * r) { onHit(e, this.dmg[i], x, y, this.type[i]); hit = true; break; }
      }
      if (hit) { this.kill(i); continue; }
      top = i + 1;
    }
    this.top = top;
  }

  render(batch) {
    batch.begin();
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue;
      const L = LOOK[this.type[i]];
      const ang = Math.atan2(this.vy[i], this.vx[i]) - Math.PI / 2;
      const fade = Math.min(1, this.t[i] / 3);
      batch.push(this.x[i], this.y[i], ang, L.w, L.h, L.icon, 1, 1, 1, L.alpha * fade);
    }
    batch.end();
  }

  clear() {
    for (let i = 0; i < this.top; i++) this.kill(i);
    this.top = 0;
  }
}
