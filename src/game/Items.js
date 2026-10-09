// アイテム：油揚げ（パワー）、金平糖（点）、星（弾消しの小さな点）、勾玉（ボム）、お守り（残機）。
// 出たときに少し跳ね上がってから落ちる。画面の上 1/4 に入ると全部が自機に吸い寄せられ、低速中は近くのものを吸う。
import { HALF_W, HALF_H, POC_Y } from './config.js';
import { ICON } from './atlas.js';

const N = 1024;
export const ITEM = { power: 0, bigpower: 1, point: 2, star: 3, bomb: 4, life: 5, fullpower: 6 };
const ICON_OF = [ICON.power, ICON.bigpower, ICON.point, ICON.star, ICON.bomb, ICON.life, ICON.bigpower];
const SIZE = [13, 22, 13, 9, 20, 22, 26];

export class Items {
  constructor() {
    this.alive = new Uint8Array(N);
    this.x = new Float32Array(N); this.y = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N);
    this.type = new Uint8Array(N);
    this.t = new Int32Array(N);
    this.home = new Uint8Array(N);   // 1 = 吸い寄せ中、2 = 自動回収（満点）
    this.free = [];
    for (let i = N - 1; i >= 0; i--) this.free.push(i);
    this.top = 0;
  }

  spawn(x, y, type, { vx, vy, home = 0 } = {}) {
    const i = this.free.pop();
    if (i === undefined) return -1;
    this.alive[i] = 1;
    this.x[i] = Math.max(-HALF_W + 8, Math.min(HALF_W - 8, x));
    this.y[i] = Math.min(HALF_H - 8, y);
    this.vx[i] = vx ?? (Math.random() - 0.5) * 1.4;
    this.vy[i] = vy ?? 2.4 + Math.random() * 0.9;
    this.type[i] = type;
    this.t[i] = 0;
    this.home[i] = home;
    if (i >= this.top) this.top = i + 1;
    return i;
  }

  /** いくつかまとめてばらまく。 */
  scatter(x, y, type, n, spread = 22) {
    for (let k = 0; k < n; k++) this.spawn(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread * 0.6, type);
  }

  /** 全部を自動回収にする（ボス撃破・画面の上に入ったとき）。 */
  collectAll() { for (let i = 0; i < this.top; i++) if (this.alive[i]) this.home[i] = 2; }

  /**
   * 1 コマ進める。player = { x, y, focus, alive }。拾ったアイテムごとに onPick(type, auto, y) を呼ぶ。
   */
  update(player, onPick) {
    const px = player.x, py = player.y;
    const canPick = player.alive;
    if (canPick && py > POC_Y) this.collectAll();
    let top = 0;
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue;
      this.t[i]++;
      const dx = px - this.x[i], dy = py - this.y[i];
      const d2 = dx * dx + dy * dy;
      if (canPick && !this.home[i] && player.focus && d2 < 64 * 64) this.home[i] = 1;
      if (canPick && this.home[i]) {
        const d = Math.sqrt(d2) || 1;
        const sp = this.home[i] === 2 ? 9 : 6;
        this.x[i] += (dx / d) * Math.min(sp, d);
        this.y[i] += (dy / d) * Math.min(sp, d);
      } else {
        if (!canPick) this.home[i] = 0;
        this.vy[i] = Math.max(-2.2, this.vy[i] - 0.07);
        this.vx[i] *= 0.95;
        this.x[i] += this.vx[i];
        this.y[i] += this.vy[i];
      }
      if (canPick && d2 < 20 * 20) {
        onPick(this.type[i], this.home[i] === 2, this.y[i]);
        this.alive[i] = 0; this.free.push(i);
        continue;
      }
      if (this.y[i] < -HALF_H - 24) { this.alive[i] = 0; this.free.push(i); continue; }
      top = i + 1;
    }
    this.top = top;
  }

  render(batch) {
    batch.begin();
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue;
      const ty = this.type[i];
      const s = SIZE[ty];
      // 出たばかりのときはくるっと回る。画面の上より上にあるときは、端に印だけ出す（今は省略）
      const spin = this.t[i] < 24 ? (1 - this.t[i] / 24) * 6.28 : 0;
      const pulse = ty === ITEM.life || ty === ITEM.bomb || ty === ITEM.fullpower ? 1 + Math.sin(this.t[i] * 0.2) * 0.08 : 1;
      batch.push(this.x[i], Math.min(this.y[i], HALF_H - 6), spin, s * pulse, s * pulse, ICON_OF[ty], 1, 1, 1, 1);
    }
    batch.end();
  }

  clear() {
    for (let i = 0; i < this.top; i++) if (this.alive[i]) { this.alive[i] = 0; this.free.push(i); }
    this.top = 0;
  }
}
