// 道中の「波」の部品。どのステージでも、敵の種類・弾の形・色を変えて使い回す。
// どれもジェネレーター：yield* W.vDrop(S, {...}) のように並べると、その波を出し終わるまで（敵が去るまでではない）待つ。
// 難易度 D（0〜3）で弾の数・速さが変わる。o で敵（kind）・弾（shape, color）・数・時間を変えられる。
import { SHAPE, TAU, DOWN, BF } from '../danmaku.js';

export const nD = (D, arr) => arr[Math.max(0, Math.min(3, D))];

/** V の字で降りてきて止まり、自機狙い → 斜めに去る。 */
export function* vDrop(S, o = {}) {
  const { B, D } = S;
  const n = o.n ?? 9, kind = o.kind ?? 'wisp', shape = o.shape ?? SHAPE.rice, color = o.color ?? 'sky';
  const cx = o.x ?? 0;
  for (let i = 0; i < n; i++) {
    const s = i % 2 ? 1 : -1, k = Math.ceil(i / 2);
    S.enemy(kind, cx + s * k * 32, 270, function* (e) {
      yield* e.moveTo(e.x, (o.y ?? 150) - k * 14, 50);
      yield 20 + k * 6;
      B.fan(e.x, e.y, nD(D, o.ways ?? [1, 3, 3, 5]), nD(D, [2.2, 2.6, 3.0, 3.4]), e.aim(), 0.3, shape, color);
      B.sfx();
      yield 30;
      yield* e.leave(s * 1.2, 1.6, 0, 0.02);
    });
    yield o.gap ?? 8;
  }
  yield o.after ?? 120;
}

/** 左右の上から、曲がりながら流れ込む列（ときどき自機狙い）。 */
export function* sideStream(S, o = {}) {
  const { B, D } = S;
  const n = o.n ?? 16, shape = o.shape ?? SHAPE.rice;
  for (let i = 0; i < n; i++) {
    const s = o.side ?? (i % 2 ? 1 : -1);
    const kind = Array.isArray(o.kind) ? o.kind[i % o.kind.length] : o.kind ?? 'wisp';
    const color = Array.isArray(o.color) ? o.color[i % o.color.length] : o.color ?? 'sky';
    S.enemy(kind, s * 200, (o.y ?? 210) - (i % 4) * 8, function* (e) {
      e.vx = -s * (o.speed ?? 2.6); e.vy = -0.6;
      for (let t = 0; e.alive && t < 260; t++) {
        e.vx += s * (o.curve ?? 0.016); e.vy -= 0.004;
        if (t === 40 || (D >= 2 && t === 90)) { B.fan(e.x, e.y, nD(D, o.ways ?? [1, 1, 2, 3]), nD(D, [2.0, 2.5, 3.0, 3.3]), e.aim(), 0.25, shape, color); B.sfx(); }
        yield 1;
      }
      yield* e.leave(e.vx, e.vy);
    });
    yield o.gap ?? 14;
  }
  yield o.after ?? 120;
}

/** 奥から近づいて止まり、回る輪を何度か → 去る。positions = [[x, y], …] */
export function* approachRing(S, o = {}) {
  const { B, D } = S;
  const pos = o.pos ?? [[-80, 120], [80, 120]];
  for (const [x, y] of pos) {
    const s = x < 0 ? -1 : 1;
    S.enemy(o.kind ?? 'leaf', x, y, function* (e) {
      yield* e.approach(o.approach ?? 70);
      for (let k = 0; k < nD(D, o.rings ?? [2, 3, 4, 4]); k++) {
        B.ring(e.x, e.y, nD(D, o.count ?? [8, 12, 14, 18]), o.speed ?? 1.8, k * 0.2 * s, o.shape ?? SHAPE.leaf, k % 2 ? o.color ?? 'green' : o.color2 ?? 'lime');
        B.sfx();
        yield nD(D, [40, 30, 26, 22]);
      }
      yield* e.leave(s * 0.6, 1.4, 0, 0.03);
    });
    yield o.gap ?? 0;
  }
  yield o.after ?? 110;
}

/** 跳ねながら横切り、重力で落ちる弾（雨）を降らせる。 */
export function* hopRain(S, o = {}) {
  const { B, D, BEH } = S;
  const n = o.n ?? 6;
  for (let i = 0; i < n; i++) {
    const s = i % 2 ? 1 : -1;
    S.enemy(o.kind ?? 'umbrella', -s * 200, (o.y ?? 180) - (i % 3) * 30, function* (e) {
      e.vx = s * (o.speed ?? 1.5);
      for (let t = 0; e.alive && t < 300; t++) {
        e.vy = Math.cos(t * 0.12) * 1.6;
        if (t % nD(D, [26, 18, 14, 11]) === 0 && t > 10) {
          B.shot(e.x, e.y, S.rand(0.6, 1.2), Math.PI / 2 + S.rand(-0.8, 0.8), o.shape ?? SHAPE.drop, o.color ?? 'sky', { fn: BEH.gravity(0.03, nD(D, [2.0, 2.4, 2.8, 3.2])) });
          B.sfx('kira');
        }
        yield 1;
      }
      yield* e.leave(e.vx, 0);
    });
    yield o.gap ?? 50;
  }
  yield o.after ?? 160;
}

/** 大きな敵が止まって、輪と狙いの扇を何度か。 */
export function* bigTurret(S, o = {}) {
  const { B, D } = S;
  const x = o.x ?? 0;
  S.enemy(o.kind ?? 'lantern', x, 280, function* (e) {
    yield* e.moveTo(x, o.y ?? 150, 70);
    for (let k = 0; k < (o.times ?? 7); k++) {
      B.ring(e.x, e.y, nD(D, o.count ?? [16, 22, 28, 36]), k % 2 ? 1.6 : 2.2, k * 0.12, o.shape ?? SHAPE.orb, k % 2 ? o.color ?? 'orange' : o.color2 ?? 'yellow');
      if (D >= 1) B.fanStack(e.x, e.y, 3, 0.4, nD(D, [1, 2, 3, 3]), 2.4, 3.4, e.aim(), o.aimShape ?? SHAPE.kunai, o.aimColor ?? 'red');
      B.sfx();
      yield nD(D, [46, 36, 30, 26]);
    }
    yield* e.leave(0, 1.2);
  });
  yield o.after ?? 60;
}

/** 長い列が蛇行しながら横切り、下へ弾を落としていく（幕）。 */
export function* procession(S, o = {}) {
  const { B, D } = S;
  const n = o.n ?? 18, s = o.side ?? 1;
  for (let i = 0; i < n; i++) {
    S.enemy(o.kind ?? 'wispP', -s * 200, o.y ?? 150, function* (e) {
      const y0 = e.y;
      for (let t = 0; e.alive && t < 520; t++) {
        e.x += s * (o.speed ?? 1.4);
        e.y = y0 + Math.sin((t + i * 10) * 0.035) * (o.amp ?? 40);
        if (t % nD(D, [70, 50, 40, 32]) === (i * 7) % 30) { B.shot(e.x, e.y, nD(D, [1.4, 1.8, 2.1, 2.4]), DOWN, o.shape ?? SHAPE.orb, o.color ?? 'orange'); }
        if (Math.abs(e.x) > 215 && t > 30) break;
        yield 1;
      }
      e.remove();
    });
    yield o.gap ?? 12;
  }
  yield o.after ?? 120;
}

/** 上のほうで円を描いて回りながら、外向きの渦を撃つ。 */
export function* whirl(S, o = {}) {
  const { B, D } = S;
  const n = o.n ?? 6, cx = o.x ?? 0, cy = o.y ?? 140, r = o.r ?? 70, dur = o.dur ?? 360;
  for (let i = 0; i < n; i++) {
    S.enemy(o.kind ?? 'leaf', cx, 280, function* (e) {
      const a0 = (i / n) * TAU;
      yield* e.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r * 0.6, 60);
      for (let t = 0; e.alive && t < dur; t++) {
        const a = a0 + t * 0.012 * (o.dir ?? 1);
        e.x = cx + Math.cos(a) * r; e.y = cy + Math.sin(a) * r * 0.6;
        if (t % nD(D, [16, 12, 9, 7]) === 0) B.shot(e.x, e.y, nD(D, [1.6, 2.0, 2.3, 2.6]), a, o.shape ?? SHAPE.leaf, o.color ?? 'green');
        if (t % 40 === 0) B.sfx();
        yield 1;
      }
      yield* e.leave(Math.cos(a0) * 1.5, 1.5);
    });
  }
  yield dur + 100;
}

/** 左右の上から斜めに X に交差して抜ける（自機狙いの単発）。 */
export function* crossX(S, o = {}) {
  const { B, D } = S;
  const n = o.n ?? 12;
  for (let i = 0; i < n; i++) {
    for (const s of [-1, 1]) {
      S.enemy(o.kind ?? 'wisp', s * 200, 250, function* (e) {
        e.vx = -s * 2.2; e.vy = -1.6;
        for (let t = 0; e.alive && t < 260; t++) {
          if (t === 30) { B.shot(e.x, e.y, nD(D, [2.0, 2.6, 3.0, 3.4]), e.aim(), o.shape ?? SHAPE.orb, o.color ?? 'sky'); B.sfx(); }
          if (D >= 2 && t === 60) B.ring(e.x, e.y, nD(D, [0, 0, 6, 8]), 1.4, 0, SHAPE.pellet, o.color2 ?? 'white');
          yield 1;
        }
        e.remove();
      });
    }
    yield o.gap ?? 20;
  }
  yield o.after ?? 120;
}

/** 下の両わきから上がってきて、上で反転して撃つ（真ん中は避ける）。 */
export function* riseFromBelow(S, o = {}) {
  const { B, D } = S;
  const n = o.n ?? 8;
  for (let i = 0; i < n; i++) {
    const s = i % 2 ? 1 : -1;
    S.enemy(o.kind ?? 'wisp', s * (150 + (i % 3) * 10), -260, function* (e) {
      e.vy = 3.6;
      for (let t = 0; e.alive && t < 90; t++) { e.vy *= 0.975; yield 1; }
      e.vy = 0;
      B.fan(e.x, e.y, nD(D, [3, 5, 5, 7]), nD(D, [1.8, 2.2, 2.6, 3.0]), e.aim(), 0.5, o.shape ?? SHAPE.scale, o.color ?? 'purple');
      B.sfx();
      yield 40;
      yield* e.leave(-s * 1.2, 0.8, 0, 0.02);
    });
    yield o.gap ?? 26;
  }
  yield o.after ?? 120;
}

/** 形に並んで降りてくる（鳥居・月など）。points = [[x, y], …]（y は上の基準からのずれ） */
export function* formation(S, o = {}) {
  const { B, D } = S;
  for (const [x, y] of o.points) {
    S.enemy(o.kind ?? 'wispP', x, 290 + y * 0.5, function* (e) {
      yield* e.moveTo(x, (o.y ?? 150) + y, 80);
      yield 30;
      for (let k = 0; k < 3; k++) {
        if ((k + Math.round(Math.abs(x) / 15)) % 2 === 0) B.shot(e.x, e.y, nD(D, [1.8, 2.2, 2.6, 3.0]), DOWN + S.rand(-0.15, 0.15), o.shape ?? SHAPE.orb, o.color ?? 'red');
        yield 40;
      }
      yield* e.leave(0, -1.3, 0, -0.01);
    });
  }
  yield o.after ?? 420;
}

/** 奥から近づく敵が、間をおいて自機の位置にレーザー（予告線つき）。 */
export function* laserTurrets(S, o = {}) {
  const { B, D } = S;
  for (const [x, y] of o.pos ?? [[-120, 160], [120, 160]]) {
    S.enemy(o.kind ?? 'star', x, y, function* (e) {
      yield* e.approach(60);
      for (let k = 0; k < (o.times ?? 3); k++) {
        B.laser(e.x, e.y, e.aim(), { len: 600, width: nD(D, [10, 14, 16, 18]), warn: nD(D, [70, 55, 45, 40]), on: 40, color: o.color ?? 'gold', owner: e });
        yield 110;
        B.ring(e.x, e.y, nD(D, [6, 10, 14, 18]), 1.8, 0, o.shape ?? SHAPE.star, o.color ?? 'gold');
        yield 20;
      }
      yield* e.leave(0, 1.4);
    });
    yield o.gap ?? 40;
  }
  yield o.after ?? 200;
}
