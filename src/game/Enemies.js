// 敵（道中の妖怪・ボス）。動きと弾幕はコルーチン（Tasks）で書き、ここは体力・当たり・やられたときの処理。
//
//   const e = G.spawnEnemy(KIND.wisp, x, y, function* (e) {
//     yield* e.moveTo(x, 100, 60);
//     yield 30;
//     B.ring(e.x, e.y, 12, 2.5, e.aim(), SHAPE.orb, 'red');
//     yield* e.leave(0, -1.5);
//   });
import { HALF_W, HALF_H } from './config.js';
import { ease } from '../core/math.js';
import { ITEM } from './Items.js';

export class Enemy {
  constructor(G, def, x, y) {
    this.G = G;
    this.def = def;
    this.x = x; this.y = y; this.z = def.z ?? 0;
    this.vx = 0; this.vy = 0;
    this.ax = 0; this.ay = 0;
    this.hp = this.maxHp = def.hp ?? 20;
    this.r = def.r ?? 12;            // ショットとの当たり
    this.bodyR = def.bodyR ?? this.r * 0.55; // 自機との体当たり
    this.alive = true;
    this.t = 0;
    this.hittable = def.hittable ?? true;
    this.entered = false;            // 一度フィールドに入ったか（出たら消す）
    this.drops = def.drops ?? { power: 1 };
    this.score = def.score ?? 100;
    this.flash = 0;
    this.color = def.color || 'orange';
    this.boss = false;
    this.facing = 0;                 // 見た目の向き（左右の動き）
    this.model = def.model ? G.models.make(def.model, def) : null;
    if (this.model) G.field.scene.add(this.model.root);
    this.sync(0);
  }

  get dead() { return !this.alive; }

  tick() {
    this.t++;
    this.vx += this.ax; this.vy += this.ay;
    this.x += this.vx; this.y += this.vy;
    if (this.flash > 0) this.flash--;
    const inside = this.x > -HALF_W - 10 && this.x < HALF_W + 10 && this.y > -HALF_H - 10 && this.y < HALF_H + 10;
    if (inside) this.entered = true;
    else if (this.entered && !this.boss && (this.x < -HALF_W - 60 || this.x > HALF_W + 60 || this.y < -HALF_H - 60 || this.y > HALF_H + 70)) this.remove();
    if (!this.boss && this.t > 60 * 40) this.remove();
  }

  damage(n) {
    if (!this.alive || !this.hittable) return;
    this.hp -= n;
    this.flash = 3;
    if (this.hp <= 0) this.destroy();
  }

  /** 倒された：アイテム・点・爆発。 */
  destroy() {
    if (!this.alive) return;
    const G = this.G;
    this.alive = false;
    G.addScore(this.score);
    const d = this.drops;
    const at = (n, type) => { for (let k = 0; k < (n || 0); k++) G.items.spawn(this.x + (Math.random() - 0.5) * 24, this.y + (Math.random() - 0.5) * 16, type); };
    at(d.power, ITEM.power); at(d.bigpower, ITEM.bigpower); at(d.point, ITEM.point); at(d.bomb, ITEM.bomb); at(d.life, ITEM.life);
    G.fx.burst(this.x, this.y, this.color, this.def.big ? 1 : 0);
    G.audio.sfx(this.def.big ? 'explode_m' : 'explode_s');
    this.def.onDeath?.(this, G);
    this.removeModel();
    G.tasks.kill(this);
  }

  /** 倒されずに消える（画面の外へ出た）。 */
  remove() {
    if (!this.alive) return;
    this.alive = false;
    this.removeModel();
    this.G.tasks.kill(this);
  }

  removeModel() {
    if (this.model) { this.model.root.removeFromParent(); this.model.dispose?.(); this.model = null; }
  }

  /** 自機への向き（ラジアン）。 */
  aim(dx = 0, dy = 0) { const p = this.G.player; return Math.atan2(p.y - this.y - dy, p.x - this.x - dx); }

  // ---------------------------------------------------------------- 動き（ジェネレーター）
  *moveTo(x, y, frames, e = 'outQuad') {
    const x0 = this.x, y0 = this.y;
    const f = ease[e] || ((t) => t);
    this.vx = this.vy = 0;
    for (let i = 1; i <= frames; i++) {
      const k = f(i / frames);
      const nx = x0 + (x - x0) * k, ny = y0 + (y - y0) * k;
      this.facing = nx - this.x;
      this.x = nx; this.y = ny;
      yield 1;
    }
    this.facing = 0;
  }
  *moveBy(dx, dy, frames, e = 'outQuad') { yield* this.moveTo(this.x + dx, this.y + dy, frames, e); }
  /** 奥（z が負）から手前のフィールドへ近づく。近づくまでは当たらない。 */
  *approach(frames = 60, z0 = -700) {
    const was = this.hittable;
    this.hittable = false;
    this.z = z0;
    for (let i = 1; i <= frames; i++) {
      const k = 1 - Math.pow(1 - i / frames, 3);
      this.z = z0 * (1 - k);
      yield 1;
    }
    this.z = 0;
    this.hittable = was;
  }
  /** 速さを与えて、画面の外へ出るまで待つ。 */
  *leave(vx = 0, vy = 1.6, ax = 0, ay = 0) {
    this.vx = vx; this.vy = vy; this.ax = ax; this.ay = ay;
    this.facing = vx;
    while (this.alive) yield 1;
  }

  /** 見た目を合わせる（描く前に）。 */
  sync(dt) {
    const m = this.model;
    if (!m) return;
    m.root.position.set(this.x, this.y, this.z);
    m.update?.(dt, this);
  }
}

/** 敵の種類の定義（見た目のモデル、体力、当たり、落とすもの）。ステージの台本から使う。 */
export const KIND = {
  wisp: { model: 'wisp', hp: 14, r: 11, score: 100, color: 'sky', drops: { power: 1 } },
  wispP: { model: 'wisp', hp: 14, r: 11, score: 100, color: 'orange', drops: { point: 1 } },
  leaf: { model: 'leaf', hp: 30, r: 12, score: 200, color: 'green', drops: { power: 1, point: 1 } },
  lantern: { model: 'lantern', hp: 120, r: 16, score: 1000, color: 'orange', big: true, drops: { power: 3, point: 3 } },
  umbrella: { model: 'umbrella', hp: 60, r: 14, score: 500, color: 'purple', drops: { point: 2 } },
  catspirit: { model: 'cat', hp: 40, r: 12, score: 300, color: 'violet', drops: { power: 1, point: 1 } },
  onibi: { model: 'wisp', hp: 20, r: 11, score: 150, color: 'cyan', drops: { point: 1 } },
  rabbit: { model: 'rabbit', hp: 50, r: 13, score: 400, color: 'pink', drops: { power: 1, point: 1 } },
  star: { model: 'starspirit', hp: 30, r: 12, score: 300, color: 'gold', drops: { point: 2 } },
  wheel: { model: 'wheel', hp: 600, r: 24, score: 5000, color: 'red', big: true, drops: { power: 4, point: 6 } },
};
