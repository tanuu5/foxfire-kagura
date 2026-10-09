// ステージ 1 のボス：ぽこ（豆狸）。葉っぱ・化け術・腹鼓。
// フェーズの run(b, S) はコルーチン。b はボス（x, y, aim()、moveTo、task）、S はステージの道具（B：弾、D：難易度 0〜3、BEH：弾の動き）。
import { SHAPE, TAU, DOWN, BF } from '../danmaku.js';

const nD = (D, arr) => arr[Math.max(0, Math.min(3, D))];

/** あちこちへ少しずつ動く（並べて走らせる）。 */
function* wander(b, S, every = 120, frames = 50, area = [-90, 90, 90, 150]) {
  for (;;) {
    yield every;
    yield* b.moveTo(S.rand(area[0], area[1]), S.rand(area[2], area[3]), frames, 'inOutQuad');
  }
}

// ---------------------------------------------------------------- 中ボス
export const POKO_MID = {
  nameKey: 'name.poko',
  portrait: 'poko',
  model: 'girl:poko',
  color: 'orange',
  spellColor: 0x6fe08a,
  midboss: true,
  r: 26,
  phases: [
    {
      hp: 700, time: 22, start: [0, 130],
      *run(b, S) {
        const { B, D } = S;
        b.task(wander(b, S, 100, 40));
        for (let k = 0; ; k++) {
          const a = b.aim();
          B.fanStack(b.x, b.y, nD(D, [3, 5, 7, 7]), 0.9, nD(D, [1, 2, 2, 3]), 2.0, 2.8, a, SHAPE.leaf, 'green');
          if (D >= 2 && k % 2) B.ring(b.x, b.y, nD(D, [0, 0, 14, 20]), 1.6, k * 0.3, SHAPE.orb, 'lime');
          B.sfx();
          yield nD(D, [56, 44, 38, 32]);
        }
      },
    },
    {
      spell: true, name: 'spell.poko.mid', hp: 900, time: 28, bonus: 500000, start: [0, 140],
      *run(b, S) {
        const { B, D, BEH } = S;
        // 上から木の葉が揺れながら舞い落ちる
        b.task((function* () {
          for (let k = 0; ; k++) {
            const x = S.rand(-175, 175);
            const sway = S.rand(0.012, 0.022) * (k % 2 ? 1 : -1);
            B.shot(x, 250, S.rand(1.0, 1.5) + D * 0.1, DOWN + S.rand(-0.2, 0.2), SHAPE.leaf, k % 3 ? 'green' : 'yellow', {
              fn: (Bb, i) => { Bb.angle[i] = DOWN + Math.sin(Bb.t[i] * sway * 3 + k) * 0.5; },
            });
            yield nD(D, [9, 6, 4, 3]);
          }
        })());
        for (let k = 0; ; k++) {
          yield nD(D, [90, 70, 60, 50]);
          B.fan(b.x, b.y, nD(D, [3, 5, 5, 7]), 2.6, b.aim(), 0.6, SHAPE.coin, 'gold');
          B.sfx('kira');
          if (k % 2) yield* b.moveTo(S.rand(-80, 80), S.rand(110, 150), 40, 'inOutQuad');
        }
      },
    },
  ],
};

// ---------------------------------------------------------------- ボス
export const POKO = {
  nameKey: 'name.poko',
  portrait: 'poko',
  model: 'girl:poko',
  color: 'orange',
  spellColor: 0x6fe08a,
  epithet: 'epithet.poko',
  music: 'boss1',
  r: 26,
  dropLife: true,
  phases: [
    // 通常 1：ぽんぽこの輪
    {
      hp: 1500, time: 30, start: [0, 120],
      *run(b, S) {
        const { B, D } = S;
        b.task((function* () { for (let k = 0; ; k++) { yield 150; yield* b.moveTo((k % 2 ? 1 : -1) * S.rand(40, 90), S.rand(100, 140), 60, 'inOutQuad'); } })());
        for (let k = 0; ; k++) {
          const n = nD(D, [14, 20, 26, 32]);
          B.ring(b.x, b.y, n, k % 2 ? 1.7 : 2.3, (k % 2) * (Math.PI / n), SHAPE.orb, k % 2 ? 'orange' : 'yellow');
          B.sfx();
          yield 15;
          if (D >= 1) { B.fan(b.x, b.y, nD(D, [1, 3, 3, 5]), 3.2, b.aim(), 0.35, SHAPE.kunai, 'red'); B.sfx(); }
          yield nD(D, [30, 22, 18, 15]);
        }
      },
    },
    // スペル 1：八百八狸の大行進（横に歩く列のすき間を抜ける）
    {
      spell: true, name: 'spell.poko.1', hp: 2200, time: 40, bonus: 1000000, start: [0, 150],
      *run(b, S) {
        const { B, D } = S;
        b.task((function* () {
          for (let k = 0; ; k++) {
            const side = k % 2 ? 1 : -1;
            const y = S.rand(-170, 110);
            const gw = nD(D, [64, 52, 44, 38]);
            const sp = nD(D, [1.2, 1.5, 1.8, 2.0]) * S.rand(0.9, 1.15);
            // 列は画面の外に並んで出て、横へ行進する。すき間（gap）も列と一緒に動く
            const step = nD(D, [22, 18, 15, 13]);
            const gapD = S.rand(60, 300);
            for (let d = 0; d <= 360; d += step) {
              if (Math.abs(d - gapD) < gw / 2) continue;
              const x0 = side < 0 ? -192 - d : 192 + d;
              B.shot(x0, y, sp, side < 0 ? 0 : Math.PI, SHAPE.leaf, k % 3 === 2 ? 'yellow' : 'green', { flags: BF.NOEDGE, life: Math.ceil((400 + d) / sp) });
            }
            B.sfx('tan');
            yield nD(D, [80, 62, 52, 44]);
          }
        })());
        for (;;) {
          yield nD(D, [80, 50, 40, 32]);
          if (D >= 1) { B.shot(b.x, b.y, 2.8, b.aim(), SHAPE.ball, 'orange'); B.sfx(); }
          if (D >= 3) B.fan(b.x, b.y, 3, 2.2, b.aim(), 0.5, SHAPE.orb, 'yellow');
        }
      },
    },
    // 通常 2：葉っぱの渦と小判
    {
      hp: 1700, time: 30, start: [0, 130],
      *run(b, S) {
        const { B, D } = S;
        b.task(wander(b, S, 140, 60, [-70, 70, 100, 140]));
        let a = 0;
        for (let k = 0; ; k++) {
          const arms = nD(D, [2, 3, 4, 5]);
          for (let j = 0; j < arms; j++) B.shot(b.x, b.y, 2.0 + D * 0.15, a + (j * TAU) / arms, SHAPE.leaf, j % 2 ? 'green' : 'lime');
          a += 0.13 + D * 0.01;
          if (k % 6 === 0) B.sfx();
          if (k % nD(D, [24, 18, 15, 12]) === 0) B.ring(b.x, b.y, nD(D, [6, 10, 12, 16]), 2.6, b.aim(), SHAPE.coin, 'gold');
          yield nD(D, [6, 5, 4, 4]);
        }
      },
    },
    // スペル 2：ぶんぶく茶釜（泡が割れて輪になる、湯気の米粒）
    {
      spell: true, name: 'spell.poko.2', hp: 2400, time: 40, bonus: 1200000, start: [0, 140],
      *run(b, S) {
        const { B, D, BEH } = S;
        b.task((function* () {
          // 湯気：左右に曲がる米粒
          for (let k = 0; ; k++) {
            const s = k % 2 ? 1 : -1;
            B.shot(b.x, b.y, 2.4, DOWN + s * 0.9, SHAPE.rice, 'white', { angVel: -s * 0.012 });
            yield nD(D, [10, 7, 5, 4]);
          }
        })());
        for (let k = 0; ; k++) {
          const n = nD(D, [3, 4, 5, 6]);
          for (let j = 0; j < n; j++) {
            const a = Math.PI / 2 + (j - (n - 1) / 2) * 0.55 + S.rand(-0.1, 0.1);
            const life = 70 + Math.floor(S.rand(0, 40));
            B.shot(b.x, b.y, 3.2, a, SHAPE.bubble, 'cyan', {
              accel: -0.05, minSpeed: 0.3,
              fn: BEH.chain(BEH.gravity(0.012, 1.4), BEH.split(life, nD(D, [8, 12, 14, 18]), 1.6, SHAPE.orb, 'sky')),
            });
          }
          B.sfx('kira');
          yield nD(D, [100, 80, 70, 60]);
          if (k % 2) yield* b.moveTo(S.rand(-60, 60), S.rand(110, 150), 40, 'inOutQuad');
        }
      },
    },
    // スペル 3（最後）：腹鼓「ぽんぽこ囃子」（拍子に合わせて輪）
    {
      spell: true, name: 'spell.poko.3', hp: 2800, time: 45, bonus: 1500000, start: [0, 120],
      *run(b, S) {
        const { B, D, G } = S;
        // ぽん・ぽん・ぽこ・ぽん（4 拍で 1 小節、最後に大きな輪）
        const beat = nD(D, [26, 22, 20, 18]);
        const rhythm = [0, 1, 1.5, 2, 3];
        for (let bar = 0; ; bar++) {
          for (let r = 0; r < rhythm.length; r++) {
            const big = r === rhythm.length - 1;
            const n = nD(D, [16, 22, 28, 34]) + (big ? 8 : 0);
            const off = (bar * 0.21 + r * 0.5) % TAU;
            B.ring(b.x, b.y, n, big ? 1.5 : r % 2 ? 2.4 : 1.9, off, big ? SHAPE.ball : SHAPE.orb, big ? 'orange' : r % 2 ? 'yellow' : 'red');
            if (big && D >= 2) B.ring(b.x, b.y, n, 1.1, off + Math.PI / n, SHAPE.ball, 'red');
            B.sfx(big ? 'drum_big' : 'drum');
            if (big) G.world.shake(3);
            const next = rhythm[r + 1] ?? 4;
            yield Math.round((next - rhythm[r]) * beat);
          }
          if (bar % 2) yield* b.moveTo(S.rand(-50, 50), S.rand(100, 140), 30, 'inOutQuad');
        }
      },
    },
  ],
};

export const POKO_DIALOGUE = {
  before: [
    { who: 'boss', key: 'dlg.s1.b1', face: { eyes: 'wide', mouth: 'open', brows: 'up' } },
    { who: 'inaho', key: 'dlg.s1.i1', face: { eyes: 'half', mouth: 'flat', brows: 'normal' } },
    { who: 'boss', key: 'dlg.s1.b2', face: { eyes: 'closed', mouth: 'grin', brows: 'sad' } },
    { who: 'inaho', key: 'dlg.s1.i2', face: { eyes: 'open', mouth: 'o', brows: 'up' } },
    { who: 'boss', key: 'dlg.s1.b3', face: { eyes: 'wink', mouth: 'grin', brows: 'normal' }, pose: 'cast' },
  ],
  after: [
    { who: 'boss', key: 'dlg.s1.b4', face: { eyes: 'dizzy', mouth: 'o', brows: 'sad' } },
    { who: 'inaho', key: 'dlg.s1.i3', face: { eyes: 'open', mouth: 'smile', brows: 'normal' } },
    { who: 'boss', key: 'dlg.s1.b5', face: { eyes: 'happy', mouth: 'grin', brows: 'normal' } },
  ],
};
