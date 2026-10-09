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

    /** レーザー（予告線つき）。o = { len, width, warn, on, color, owner, angVel } */
    laser(x, y, angle, o) { G.audio.sfx('laser', { minGap: 0.1 }); return G.lasers.fire(x, y, angle, o); },

    /** 発射の音（同じ音は短い間隔で重ねない）。 */
    sfx(kind = 'tan') { G.audio.sfx(kind, { minGap: 0.05 }); },

    /** 乱数（ゲームの乱数。リプレイや撮影で同じ並びになる）。 */
    rand: (lo = 0, hi = 1) => G.rng.range(lo, hi),
    randSign: () => G.rng.sign(),
  };
  return B;
}

/**
 * 弾の特別な動き（spawn の o.fn に渡す）。どれも (B, i) を受ける関数を返す。B は Bullets（配列を直接読み書きする）。
 * 弾の年齢は B.t[i]（コマ）。いくつかを並べたいときは chain(f1, f2, …)。
 */
export function makeBehaviors(G) {
  const D = makeDanmaku(G);
  return {
    /** t コマ目に自機を狙い直す（速さ s、加速 accel）。 */
    aimAt: (t, s, accel = 0) => (B, i) => {
      if (B.t[i] !== t) return;
      B.angle[i] = D.aim(B.x[i], B.y[i]); B.speed[i] = s; B.accel[i] = accel; B.angVel[i] = 0; B.minSpeed[i] = -99; B.maxSpeed[i] = 99;
    },
    /** t コマ目に向きを da だけ変え、速さを s に。 */
    turn: (t, da, s = null) => (B, i) => { if (B.t[i] === t) { B.angle[i] += da; if (s !== null) B.speed[i] = s; B.angVel[i] = 0; } },
    /** t コマ目に止める → u コマ目に動き出す（向き a か、自機狙い 'aim'、速さ s）。 */
    stopGo: (t, u, s, a = 'aim', accel = 0) => (B, i) => {
      const k = B.t[i];
      if (k === t) { B.speed[i] = 0; B.accel[i] = 0; B.angVel[i] = 0; B.minSpeed[i] = -99; }
      if (k === u) { B.angle[i] = a === 'aim' ? D.aim(B.x[i], B.y[i]) : a === 'keep' ? B.angle[i] : a; B.speed[i] = s; B.accel[i] = accel; }
    },
    /** t コマ目に n 発の輪に割れる。 */
    split: (t, n, s, shape, color, o) => (B, i) => {
      if (B.t[i] !== t) return;
      const x = B.x[i], y = B.y[i], a0 = B.angle[i];
      B.kill(i);
      D.ring(x, y, n, s, a0, shape, color, o);
    },
    /** 重力（下へ g ずつ）。速さと向きを、速度の向きに合わせて直す。 */
    gravity: (g, vmax = 4) => (B, i) => {
      const a = B.angle[i], s = B.speed[i];
      let vx = Math.cos(a) * s, vy = Math.sin(a) * s - g;
      if (vy < -vmax) vy = -vmax;
      B.angle[i] = Math.atan2(vy, vx); B.speed[i] = Math.hypot(vx, vy);
      B.accel[i] = 0; B.angVel[i] = 0;
    },
    /** 左右の壁で 1 回はね返る。 */
    bounce: (times = 1) => (B, i) => {
      const x = B.x[i];
      const d = B.data[i] || (B.data[i] = { n: 0 });
      if (d.n >= times) return;
      if (x < -178 || x > 178) { B.angle[i] = Math.PI - B.angle[i]; d.n++; B.x[i] = Math.max(-178, Math.min(178, x)); }
      else if (B.y[i] > 238) { B.angle[i] = -B.angle[i]; d.n++; }
    },
    /** t1〜t2 コマのあいだだけ見えにくくする（a の濃さ）。 */
    fade: (t1, t2, a = 0.12) => (B, i) => {
      const k = B.t[i];
      B.alpha[i] = k >= t1 && k < t2 ? a : 1;
    },
    /** いくつかの動きを順に。 */
    chain: (...fs) => (B, i) => { for (const f of fs) { f(B, i); if (!B.alive[i]) return; } },
  };
}

/** 色の名前を順番に回す（虹色の弾幕など）。 */
export const RAINBOW = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta'];
