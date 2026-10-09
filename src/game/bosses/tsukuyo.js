// ステージ 3 のボス（ラスボス）：つくよ（月のうさぎ）。月の満ち欠け・餅つき・天の川・月光・中秋の名月。
import { SHAPE, TAU, DOWN, BF, RAINBOW } from '../danmaku.js';

const nD = (D, arr) => arr[Math.max(0, Math.min(3, D))];

function* wander(b, S, every = 120, frames = 50, area = [-90, 90, 90, 150]) {
  for (;;) {
    yield every;
    yield* b.moveTo(S.rand(area[0], area[1]), S.rand(area[2], area[3]), frames, 'inOutQuad');
  }
}

export const TSUKUYO_MID = {
  nameKey: 'name.tsukuyo',
  portrait: 'tsukuyo',
  model: 'girl:tsukuyo',
  color: 'pink',
  spellColor: 0xffd0f0,
  midboss: true,
  r: 26,
  phases: [
    // 跳ねるうさぎ（重力で放物線を描く弾）
    {
      hp: 900, time: 22, start: [0, 135],
      *run(b, S) {
        const { B, D, BEH } = S;
        b.task(wander(b, S, 100, 40));
        for (let k = 0; ; k++) {
          const n = nD(D, [6, 9, 12, 14]);
          for (let j = 0; j < n; j++) {
            const a = Math.PI / 2 + (j - (n - 1) / 2) * (2.4 / n);
            B.shot(b.x, b.y, nD(D, [2.6, 3.0, 3.3, 3.6]), a, SHAPE.mochi, j % 2 ? 'white' : 'pink', { fn: BEH.chain(BEH.gravity(0.045, nD(D, [2.0, 2.4, 2.8, 3.1])), BEH.bounce(1)) });
          }
          B.sfx();
          yield nD(D, [56, 44, 36, 30]);
        }
      },
    },
    // 月見団子の山（積んだ団子が崩れて落ちてくる）
    {
      spell: true, name: 'spell.tsukuyo.mid', hp: 1100, time: 28, bonus: 700000, start: [0, 160],
      *run(b, S) {
        const { B, D } = S;
        for (let k = 0; ; k++) {
          const cx = S.rand(-90, 90);
          const rows = nD(D, [4, 5, 6, 6]);
          const hs = [];
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c <= r; c++) {
              const x = cx + (c - r / 2) * 18, y = 210 - r * 15;
              hs.push(B.shot(x, y, 0, DOWN, SHAPE.ball, r % 2 ? 'white' : 'pink', { life: 900, flags: BF.NOEDGE }));
            }
          }
          B.sfx('kira');
          yield 50;
          // 崩れる：ばらばらの向きに転がり落ちる
          for (const i of hs) {
            if (i < 0) continue;
            S.G.bullets.angle[i] = DOWN + S.rand(-0.6, 0.6);
            S.G.bullets.speed[i] = 0.5;
            S.G.bullets.accel[i] = 0.025;
            S.G.bullets.maxSpeed[i] = nD(D, [1.8, 2.2, 2.6, 3.0]);
          }
          B.fan(b.x, b.y, nD(D, [3, 5, 5, 7]), 2.6, b.aim(), 0.5, SHAPE.crescent, 'gold');
          yield nD(D, [80, 64, 54, 46]);
        }
      },
    },
  ],
};

export const TSUKUYO = {
  nameKey: 'name.tsukuyo',
  portrait: 'tsukuyo',
  model: 'girl:tsukuyo',
  color: 'pink',
  spellColor: 0xffe6a0,
  epithet: 'epithet.tsukuyo',
  music: 'boss3',
  r: 26,
  final: true,
  phases: [
    // 通常 1：回る三日月の弧
    {
      hp: 1700, time: 30, start: [0, 125],
      *run(b, S) {
        const { B, D } = S;
        b.task(wander(b, S, 150, 60, [-60, 60, 100, 140]));
        for (let k = 0; ; k++) {
          const n = nD(D, [5, 6, 7, 8]);
          for (let j = 0; j < n; j++) {
            const a = k * 0.33 + (j * TAU) / n;
            B.fan(b.x, b.y, nD(D, [3, 4, 5, 5]), 2.2, a, 0.32, SHAPE.crescent, j % 2 ? 'gold' : 'yellow');
          }
          B.sfx();
          if (D >= 1 && k % 2) B.shot(b.x, b.y, 3.2, b.aim(), SHAPE.ball, 'pink');
          yield nD(D, [44, 34, 28, 24]);
        }
      },
    },
    // スペル 1：望月の餅つき（ずしんと落ちる餅が、ねばる小さな餅に割れる）
    {
      spell: true, name: 'spell.tsukuyo.1', hp: 2400, time: 40, bonus: 1500000, start: [0, 160],
      *run(b, S) {
        const { B, D, G } = S;
        for (let k = 0; ; k++) {
          const tx = S.player.x + S.rand(-30, 30);
          // 杵を振り上げて、自機の真上に大きな餅
          b.pose = 'cast';
          yield 18;
          b.pose = null;
          B.shot(tx, 250, 4.5, DOWN, SHAPE.mochi, 'white', {
            scale: 3,
            fn: (Bb, i) => {
              if (Bb.y[i] > S.player.y + nD(D, [150, 130, 120, 110])) return;
              const x = Bb.x[i], y = Bb.y[i];
              Bb.kill(i);
              G.world.shake(4);
              B.sfx('drum_big');
              const n = nD(D, [10, 14, 18, 22]);
              for (let j = 0; j < n; j++) {
                const a = (j * TAU) / n + k * 0.2;
                B.shot(x, y, 3.0, a, SHAPE.mochi, j % 2 ? 'white' : 'pink', { accel: -0.06, minSpeed: 0, fn: (B2, i2) => { if (B2.t[i2] === 70) { B2.angle[i2] = DOWN; B2.accel[i2] = 0.02; B2.maxSpeed[i2] = 2.0; } } });
              }
            },
          });
          B.sfx('kira');
          yield nD(D, [70, 56, 48, 40]);
          if (D >= 2 && k % 2) B.ring(b.x, b.y, nD(D, [0, 0, 16, 22]), 1.8, 0, SHAPE.crescent, 'gold');
        }
      },
    },
    // 通常 2：回る星の輪と、月光のレーザー
    {
      hp: 1900, time: 30, start: [0, 130],
      *run(b, S) {
        const { B, D } = S;
        for (let k = 0; ; k++) {
          B.ring(b.x, b.y, nD(D, [12, 16, 20, 24]), 2.0, k * 0.15, SHAPE.star, k % 2 ? 'yellow' : 'gold');
          B.sfx();
          if (k % 4 === 0) {
            const a = b.aim();
            for (const da of nD(D, [[0], [-0.5, 0.5], [-0.6, 0, 0.6], [-0.7, -0.23, 0.23, 0.7]])) B.laser(b.x, b.y, a + da, { len: 620, width: 16, warn: 50, on: 50, color: 'sky' });
          }
          yield nD(D, [30, 24, 20, 17]);
        }
      },
    },
    // スペル 2：天の川の渡し（斜めに流れる星の川を渡る）
    {
      spell: true, name: 'spell.tsukuyo.2', hp: 2600, time: 40, bonus: 1600000, start: [0, 170],
      *run(b, S) {
        const { B, D } = S;
        b.task((function* () {
          // 川：左上から右下へ、帯になって流れる星（すき間が少しずつずれる）
          for (let k = 0; ; k++) {
            const gap = Math.sin(k * 0.07) * 120;
            for (let j = -9; j <= 9; j++) {
              const off = j * 20;
              if (Math.abs(off - gap) < nD(D, [48, 40, 34, 30])) continue;
              const x0 = -220 + off * 0.5, y0 = 120 + off;
              B.shot(x0, y0, nD(D, [1.5, 1.8, 2.0, 2.2]), -0.35, j % 3 ? SHAPE.star : SHAPE.pellet, j % 2 ? 'sky' : 'white', { flags: BF.NOEDGE, life: 400 });
            }
            yield nD(D, [26, 22, 19, 16]);
          }
        })());
        for (;;) {
          yield nD(D, [80, 60, 50, 42]);
          B.fan(b.x, b.y, nD(D, [3, 5, 5, 7]), 2.4, b.aim(), 0.5, SHAPE.crescent, 'gold');
          B.sfx();
        }
      },
    },
    // 通常 3：満ち欠け（三日月の形に並んだ弾が回る）
    {
      hp: 2000, time: 30, start: [0, 125],
      *run(b, S) {
        const { B, D } = S;
        b.task(wander(b, S, 140, 50, [-60, 60, 100, 140]));
        for (let k = 0; ; k++) {
          const n = nD(D, [24, 30, 36, 42]);
          const phase = (k % 8) / 8; // 0〜1 で満ち欠け
          for (let j = 0; j < n; j++) {
            const a = (j * TAU) / n;
            const lit = Math.cos(a - k * 0.4) > Math.cos(phase * Math.PI);
            if (!lit) continue;
            B.shot(b.x, b.y, 1.9 + (j % 2) * 0.3, a, SHAPE.orb, k % 2 ? 'white' : 'sky');
          }
          B.sfx();
          yield nD(D, [32, 26, 22, 18]);
        }
      },
    },
    // スペル 3：玉兎の幻視（消えたり見えたりする弾。消えているあいだは当たらない）
    {
      spell: true, name: 'spell.tsukuyo.3', hp: 2600, time: 42, bonus: 1700000, start: [0, 140],
      *run(b, S) {
        const { B, D } = S;
        for (let k = 0; ; k++) {
          const n = nD(D, [14, 18, 22, 26]);
          const vis = nD(D, [30, 26, 22, 20]);
          for (let j = 0; j < n; j++) {
            const a = k * 0.21 + (j * TAU) / n;
            B.shot(b.x, b.y, 1.8, a, SHAPE.ball, j % 2 ? 'red' : 'pink', {
              fn: (Bb, i) => {
                const t = Bb.t[i];
                // しばらく見えにくくなる（そのあいだは当たらない）→ また現れる
                const hidden = t > vis && t < vis + 40;
                Bb.alpha[i] = hidden ? 0.15 : 1;
                if (hidden) Bb.flags[i] |= BF.NOHIT; else Bb.flags[i] &= ~BF.NOHIT;
                if (t === vis + 40) { Bb.angle[i] += (j % 2 ? 1 : -1) * 0.5; }
              },
            });
          }
          B.sfx('kira');
          yield nD(D, [46, 38, 32, 28]);
          if (k % 4 === 3) yield* b.moveTo(S.rand(-60, 60), S.rand(110, 150), 40, 'inOutQuad');
        }
      },
    },
    // 通常 4：速い狙いの波と輪
    {
      hp: 2000, time: 30, start: [0, 130],
      *run(b, S) {
        const { B, D } = S;
        b.task(wander(b, S, 100, 40));
        for (let k = 0; ; k++) {
          B.fanStack(b.x, b.y, nD(D, [3, 5, 7, 9]), 0.8, nD(D, [2, 3, 3, 4]), 2.2, 3.6, b.aim(), SHAPE.kunai, 'pink');
          B.sfx();
          yield 20;
          B.ring(b.x, b.y, nD(D, [12, 18, 24, 30]), 1.7, k * 0.3, SHAPE.crescent, 'gold');
          yield nD(D, [46, 36, 30, 26]);
        }
      },
    },
    // スペル 4：月光「静かの海」（ゆっくり回る月光のレーザーと、波の泡）
    {
      spell: true, name: 'spell.tsukuyo.4', hp: 2800, time: 45, bonus: 1800000, start: [0, 150],
      *run(b, S) {
        const { B, D } = S;
        b.task((function* () {
          for (let k = 0; ; k++) {
            const n = nD(D, [3, 4, 5, 6]);
            const s = k % 2 ? 1 : -1;
            for (let j = 0; j < n; j++) {
              const a = DOWN + (j - (n - 1) / 2) * 0.55 - s * 0.6;
              B.laser(b.x, b.y, a, { len: 640, width: 18, warn: 60, on: 120, color: 'sky', owner: b, angVel: s * nD(D, [0.004, 0.005, 0.006, 0.007]) });
            }
            yield 200;
          }
        })());
        for (let k = 0; ; k++) {
          const n = nD(D, [6, 8, 10, 12]);
          for (let j = 0; j < n; j++) B.shot(S.rand(-170, 170), 250, S.rand(0.8, 1.3), DOWN + S.rand(-0.2, 0.2), SHAPE.bubble, 'sky', { scale: 0.7 });
          yield nD(D, [50, 40, 34, 28]);
        }
      },
    },
    // 最後のスペル：名月「中秋の名月」（満月を背に、虹の輪が満ち欠けして広がる）
    {
      spell: true, name: 'spell.tsukuyo.5', hp: 3600, time: 60, bonus: 3000000, start: [0, 120],
      *run(b, S) {
        const { B, D } = S;
        let a = 0;
        for (let k = 0; ; k++) {
          const n = nD(D, [18, 24, 30, 36]);
          const col = RAINBOW[k % RAINBOW.length];
          B.ring(b.x, b.y, n, 1.6 + (k % 3) * 0.3, a, k % 4 === 3 ? SHAPE.ball : SHAPE.orb, col, { angVel: (k % 2 ? 1 : -1) * 0.002 });
          a += 0.11;
          if (k % 5 === 4) { B.fan(b.x, b.y, nD(D, [3, 5, 5, 7]), 3.0, b.aim(), 0.4, SHAPE.crescent, 'gold'); B.sfx('kira'); }
          B.sfx();
          // 後半ほど密に
          const hpK = b.hpRatio;
          yield Math.max(nD(D, [14, 11, 9, 8]), Math.round(nD(D, [26, 20, 17, 14]) * (0.6 + 0.4 * hpK)));
        }
      },
    },
  ],
};

export const TSUKUYO_DIALOGUE = {
  before: [
    { who: 'boss', key: 'dlg.s3.b1', face: { eyes: 'half', mouth: 'flat', brows: 'normal' } },
    { who: 'inaho', key: 'dlg.s3.i1', face: { eyes: 'open', mouth: 'open', brows: 'up' } },
    { who: 'boss', key: 'dlg.s3.b2', face: { eyes: 'sad', mouth: 'flat', brows: 'sad' } },
    { who: 'boss', key: 'dlg.s3.b3', face: { eyes: 'half', mouth: 'smile', brows: 'normal' } },
    { who: 'inaho', key: 'dlg.s3.i2', face: { eyes: 'happy', mouth: 'open', brows: 'up' } },
    { who: 'boss', key: 'dlg.s3.b4', face: { eyes: 'angry', mouth: 'smile', brows: 'angry' }, pose: 'declare' },
  ],
  after: [
    { who: 'boss', key: 'dlg.s3.b5', face: { eyes: 'closed', mouth: 'smile', brows: 'sad' } },
    { who: 'inaho', key: 'dlg.s3.i3', face: { eyes: 'happy', mouth: 'open', brows: 'normal' } },
    { who: 'boss', key: 'dlg.s3.b6', face: { eyes: 'open', mouth: 'smile', brows: 'normal', blush: 0.9 } },
  ],
};
