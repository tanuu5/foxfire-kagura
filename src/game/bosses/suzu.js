// ステージ 2 のボス：すず（猫又）。爪・鈴・鬼火・2 本のしっぽ・九つの命。
import { SHAPE, TAU, DOWN, BF } from '../danmaku.js';

const nD = (D, arr) => arr[Math.max(0, Math.min(3, D))];

function* wander(b, S, every = 120, frames = 50, area = [-90, 90, 90, 150]) {
  for (;;) {
    yield every;
    yield* b.moveTo(S.rand(area[0], area[1]), S.rand(area[2], area[3]), frames, 'inOutQuad');
  }
}

/** 爪あと：3 本の弧（速さの違う扇）を自機へ。 */
function claw(S, x, y, a, n, base, color = 'violet') {
  const { B } = S;
  for (let j = 0; j < 3; j++) B.fan(x, y, n, base + j * 0.35, a + (j - 1) * 0.05, 0.5, SHAPE.rice, j === 1 ? 'magenta' : color);
}

export const SUZU_MID = {
  nameKey: 'name.suzu',
  portrait: 'suzu',
  model: 'girl:suzu',
  color: 'violet',
  spellColor: 0xc06aff,
  midboss: true,
  r: 26,
  phases: [
    {
      hp: 800, time: 22, start: [0, 130],
      *run(b, S) {
        const { D } = S;
        b.task(wander(b, S, 90, 36));
        for (;;) {
          claw(S, b.x, b.y, b.aim(), nD(D, [5, 7, 9, 11]), 2.4);
          S.B.sfx('kira');
          if (D >= 2) { yield 16; claw(S, b.x, b.y, b.aim() + 0.4, nD(D, [0, 0, 7, 9]), 2.2, 'purple'); }
          yield nD(D, [64, 50, 40, 34]);
        }
      },
    },
    {
      spell: true, name: 'spell.suzu.mid', hp: 1000, time: 28, bonus: 600000, start: [0, 140],
      *run(b, S) {
        const { B, D, BEH } = S;
        for (let k = 0; ; k++) {
          // 鈴をばらまく → 止まる → 鳴る（輪に割れる）
          const n = nD(D, [5, 7, 9, 11]);
          for (let j = 0; j < n; j++) {
            B.shot(b.x, b.y, S.rand(2.0, 3.6), S.rand(0, TAU), SHAPE.bell, 'gold', {
              accel: -0.06, minSpeed: 0,
              fn: BEH.split(nD(D, [100, 90, 85, 80]), nD(D, [5, 7, 8, 10]), 1.5, SHAPE.orb, k % 2 ? 'violet' : 'magenta'),
            });
          }
          B.sfx('bell');
          yield 40;
          B.fan(b.x, b.y, nD(D, [1, 3, 3, 5]), 2.8, b.aim(), 0.4, SHAPE.bell, 'gold');
          yield nD(D, [60, 44, 36, 30]);
          if (k % 2) yield* b.moveTo(S.rand(-70, 70), S.rand(110, 150), 40, 'inOutQuad');
        }
      },
    },
  ],
};

export const SUZU = {
  nameKey: 'name.suzu',
  portrait: 'suzu',
  model: 'girl:suzu',
  color: 'violet',
  spellColor: 0xc06aff,
  music: 'boss2',
  r: 26,
  dropLife: true,
  phases: [
    // 通常 1：曲がる鬼火の輪と、狙いの鱗弾
    {
      hp: 1600, time: 30, start: [0, 125],
      *run(b, S) {
        const { B, D } = S;
        b.task(wander(b, S, 160, 60, [-60, 60, 100, 140]));
        for (let k = 0; ; k++) {
          const s = k % 2 ? 1 : -1;
          B.ring(b.x, b.y, nD(D, [10, 14, 18, 22]), 2.0, k * 0.37, SHAPE.flame, s > 0 ? 'violet' : 'cyan', { angVel: s * 0.008, flags: BF.FLIP });
          B.sfx();
          if (k % 3 === 2) B.fan(b.x, b.y, nD(D, [3, 5, 7, 7]), 3.0, b.aim(), 0.5, SHAPE.scale, 'magenta');
          yield nD(D, [34, 26, 22, 18]);
        }
      },
    },
    // スペル 1：キャットウォーク（左右に歩きながら肉球の足あとを落とす）
    {
      spell: true, name: 'spell.suzu.1', hp: 2200, time: 40, bonus: 1300000, start: [-120, 150],
      *run(b, S) {
        const { B, D } = S;
        b.task((function* () {
          for (let k = 0; ; k++) {
            const tx = k % 2 ? -130 : 130;
            yield* b.moveTo(tx, 150 + Math.sin(k) * 15, nD(D, [150, 130, 120, 110]), 'inOutQuad');
          }
        })());
        for (let k = 0; ; k++) {
          // 肉球：大きな玉 1 つと、指の小さな玉 4 つ
          const x = b.x, y = b.y - 10;
          const sp = nD(D, [1.3, 1.6, 1.8, 2.0]);
          B.shot(x, y, sp, DOWN, SHAPE.ball, 'pink');
          for (const [dx, dy] of [[-10, 9], [-4, 14], [4, 14], [10, 9]]) B.shot(x + dx, y + dy, sp, DOWN, SHAPE.orb, 'magenta');
          if (k % 3 === 0) B.sfx();
          if (k % nD(D, [6, 5, 4, 3]) === 0) B.fan(b.x, b.y, nD(D, [1, 3, 5, 5]), 2.6, b.aim(), 0.6, SHAPE.scale, 'violet');
          yield nD(D, [26, 20, 16, 13]);
        }
      },
    },
    // 通常 2：二本のしっぽから逆まわりの渦
    {
      hp: 1800, time: 30, start: [0, 130],
      *run(b, S) {
        const { B, D } = S;
        let a = 0;
        for (let k = 0; ; k++) {
          const arms = nD(D, [2, 3, 3, 4]);
          for (let j = 0; j < arms; j++) {
            B.shot(b.x - 22, b.y - 10, 2.2, a + (j * TAU) / arms, SHAPE.scale, 'violet');
            B.shot(b.x + 22, b.y - 10, 2.2, -a + (j * TAU) / arms + 0.3, SHAPE.scale, 'cyan');
          }
          a += 0.1 + D * 0.012;
          if (k % 8 === 0) B.sfx();
          yield nD(D, [7, 5, 4, 3]);
        }
      },
    },
    // スペル 2：化け猫の灯籠流し（流れてくる灯籠が鬼火の輪を出す）
    {
      spell: true, name: 'spell.suzu.2', hp: 2500, time: 40, bonus: 1400000, start: [0, 150],
      *run(b, S) {
        const { B, D } = S;
        b.task((function* () {
          for (let k = 0; ; k++) {
            const x = S.rand(-150, 150);
            B.shot(x, 250, nD(D, [0.6, 0.75, 0.85, 0.95]), DOWN + S.rand(-0.12, 0.12), SHAPE.bigorb, 'orange', {
              flags: BF.NOEDGE, life: 900,
              fn: (Bb, i) => {
                const t = Bb.t[i];
                if (t > 30 && t % nD(D, [100, 84, 72, 60]) === 0) {
                  const n = nD(D, [5, 7, 8, 10]);
                  B.ring(Bb.x[i], Bb.y[i], n, 1.4, t * 0.1, SHAPE.flame, 'cyan', { flags: BF.FLIP });
                }
                if (Bb.y[i] < -280) Bb.kill(i);
              },
            });
            yield nD(D, [80, 64, 54, 46]);
          }
        })());
        for (;;) {
          yield nD(D, [90, 70, 60, 50]);
          B.fan(b.x, b.y, 3, 2.6, b.aim(), 0.35, SHAPE.rice, 'violet');
          B.sfx();
        }
      },
    },
    // 通常 3：すばやい爪の連撃と輪
    {
      hp: 1800, time: 30, start: [0, 120],
      *run(b, S) {
        const { B, D } = S;
        b.task(wander(b, S, 80, 30, [-90, 90, 100, 150]));
        for (let k = 0; ; k++) {
          for (let j = 0; j < nD(D, [2, 3, 3, 4]); j++) {
            claw(S, b.x, b.y, b.aim() + (j - 1) * 0.3, nD(D, [4, 5, 6, 7]), 2.6 + j * 0.2, j % 2 ? 'purple' : 'violet');
            S.B.sfx('kira');
            yield 8;
          }
          B.ring(b.x, b.y, nD(D, [12, 18, 24, 30]), 1.5, k * 0.2, SHAPE.orb, 'cyan');
          yield nD(D, [60, 46, 38, 32]);
        }
      },
    },
    // スペル 3（最後）：猫又「九つの命」（止まって消えかけ、生き返って自機へ）
    {
      spell: true, name: 'spell.suzu.3', hp: 3000, time: 45, bonus: 1800000, start: [0, 130],
      *run(b, S) {
        const { B, D } = S;
        const COLORS = ['violet', 'magenta', 'cyan', 'purple', 'pink', 'blue', 'violet', 'magenta', 'gold'];
        for (let life = 0; ; life++) {
          const color = COLORS[life % 9];
          const n = nD(D, [12, 16, 20, 24]);
          const a0 = life * 0.29;
          for (let j = 0; j < n; j++) {
            const a = a0 + (j * TAU) / n;
            B.shot(b.x, b.y, 2.6, a, life % 2 ? SHAPE.scale : SHAPE.orb, color, {
              accel: -0.065, minSpeed: 0,
              fn: (Bb, i) => {
                const t = Bb.t[i];
                if (t === 40) { Bb.alpha[i] = 0.22; Bb.flags[i] |= BF.NOHIT; }
                if (t === 40 + nD(D, [50, 42, 36, 32])) {
                  Bb.alpha[i] = 1; Bb.flags[i] &= ~BF.NOHIT;
                  Bb.angle[i] = Math.atan2(S.player.y - Bb.y[i], S.player.x - Bb.x[i]) + (j % 3 - 1) * 0.06;
                  Bb.speed[i] = 0.4; Bb.accel[i] = 0.03; Bb.maxSpeed[i] = nD(D, [1.8, 2.2, 2.6, 3.0]);
                }
              },
            });
          }
          B.sfx('bell');
          yield nD(D, [64, 52, 44, 38]);
          if (life % 3 === 2) yield* b.moveTo(S.rand(-70, 70), S.rand(110, 150), 36, 'inOutQuad');
        }
      },
    },
  ],
};

export const SUZU_DIALOGUE = {
  before: [
    { who: 'boss', key: 'dlg.s2.b1', face: { eyes: 'half', mouth: 'cat', brows: 'normal' } },
    { who: 'inaho', key: 'dlg.s2.i1', face: { eyes: 'open', mouth: 'open', brows: 'up' } },
    { who: 'boss', key: 'dlg.s2.b2', face: { eyes: 'closed', mouth: 'cat', brows: 'normal' } },
    { who: 'boss', key: 'dlg.s2.b3', face: { eyes: 'angry', mouth: 'grin', brows: 'angry' }, pose: 'cast' },
    { who: 'inaho', key: 'dlg.s2.i2', face: { eyes: 'wide', mouth: 'open', brows: 'up' } },
  ],
  after: [
    { who: 'boss', key: 'dlg.s2.b4', face: { eyes: 'sad', mouth: 'frown', brows: 'sad' } },
    { who: 'inaho', key: 'dlg.s2.i3', face: { eyes: 'open', mouth: 'smile', brows: 'normal' } },
    { who: 'boss', key: 'dlg.s2.b5', face: { eyes: 'half', mouth: 'cat', brows: 'normal' } },
  ],
};
