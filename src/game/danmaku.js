// 弾幕を書くための道具。ステージやボスの台本から B.ring(...) のように使う。
// 角度はラジアン（0 = 右、π/2 = 上、-π/2 = 下）。速さは 1 コマあたりのドット。
import { SHAPE } from './atlas.js';
import { BF } from './Bullets.js';

export { SHAPE, BF };
export const TAU = Math.PI * 2;
export const DOWN = -Math.PI / 2;

export function makeDanmaku(G) {
  const bullets = G.bullets;
  const B = {
    /** 自機への向き。 */
    aim(x, y) { const p = G.player; return Math.atan2(p.y - y, p.x - x); },

    /** 1 発。o：{ accel, angVel, minSpeed, maxSpeed, scale, alpha, flags, fn, data, life, hitMul }。番号を返す。 */
    shot(x, y, speed, angle, shape = SHAPE.orb, color = 'red', o) {
      return bullets.spawn(x, y, speed, angle, shape, color, o);
    },

    /** n 発を等間隔の輪に。 */
    ring(x, y, n, speed, angle = 0, shape = SHAPE.orb, color = 'red', o) {
      const out = [];
      for (let k = 0; k < n; k++) out.push(bullets.spawn(x, y, speed, angle + (k * TAU) / n, shape, color, o));
      return out;
    },

    /** angle を中心に、全体で spread の幅の n-way。 */
    fan(x, y, n, speed, angle, spread, shape = SHAPE.orb, color = 'red', o) {
      const out = [];
      for (let k = 0; k < n; k++) {
        const a = n === 1 ? angle : angle - spread / 2 + (spread * k) / (n - 1);
        out.push(bullets.spawn(x, y, speed, a, shape, color, o));
      }
      return out;
    },

    /** 同じ向きに、速さを s0〜s1 に変えて n 発（重ねた列）。 */
    stack(x, y, n, s0, s1, angle, shape = SHAPE.orb, color = 'red', o) {
      const out = [];
      for (let k = 0; k < n; k++) out.push(bullets.spawn(x, y, n === 1 ? s0 : s0 + ((s1 - s0) * k) / (n - 1), angle, shape, color, o));
      return out;
    },

    /** 輪 × 列。 */
    ringStack(x, y, n, m, s0, s1, angle, shape = SHAPE.orb, color = 'red', o) {
      const out = [];
      for (let j = 0; j < m; j++) out.push(...B.ring(x, y, n, m === 1 ? s0 : s0 + ((s1 - s0) * j) / (m - 1), angle, shape, color, o));
      return out;
    },

    /** n-way × 列（自機狙いの扇を重ねる）。 */
    fanStack(x, y, n, spread, m, s0, s1, angle, shape = SHAPE.orb, color = 'red', o) {
      const out = [];
      for (let j = 0; j < m; j++) out.push(...B.fan(x, y, n, m === 1 ? s0 : s0 + ((s1 - s0) * j) / (m - 1), angle, spread, shape, color, o));
      return out;
    },

    /** 発射の音（同じ音は短い間隔で重ねない）。 */
    sfx(kind = 'tan') { G.audio.sfx(kind, { minGap: 0.05 }); },

    /** 乱数（ゲームの乱数。リプレイや撮影で同じ並びになる）。 */
    rand: (lo = 0, hi = 1) => G.rng.range(lo, hi),
    randSign: () => G.rng.sign(),
  };
  return B;
}

/** 色の名前を順番に回す（虹色の弾幕など）。 */
export const RAINBOW = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta'];
