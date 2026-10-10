// おまけステージのボス：Clawd（Anthropic の Claude Code のマスコットの二次創作。ドット絵の四角いカニ）。
// 横歩き・差分（赤い行が消え、緑の行が増える）・考え中のくるくる・サブエージェント・ツールの呼び出し・自動要約・ultrathink。
import { SHAPE, TAU, DOWN, BF, RAINBOW } from '../danmaku.js';
import { t } from '../../core/i18n.js';

const nD = (D, arr) => arr[Math.max(0, Math.min(3, D))];
const clampX = (x, m = 140) => Math.max(-m, Math.min(m, x));

/** 横歩き：tx まで step ずつ区切って歩く（1 歩 frames コマ、歩くたびに pause コマ止まる）。止まるたびに each(歩数) を呼ぶ。 */
function* scuttle(b, tx, { step = 24, frames = 8, pause = 6, each } = {}) {
  for (let k = 0; Math.abs(tx - b.x) > 1; k++) {
    const d = Math.sign(tx - b.x) * Math.min(step, Math.abs(tx - b.x));
    yield* b.moveBy(d, 0, frames, 'inOutQuad');
    each?.(k);
    yield pause;
  }
}

/** Claude Code の画面のような小さな表示（ツールの呼び出し・考え中）を、Clawd の頭の上に少しだけ出す。 */
function tool(G, b, text) { G.hud.popup(text, b.x, b.y + 50, 'tool'); }

// 道中と「サブエージェント」の子分（小さな Clawd）。tint は体の色
export const MINI = { model: 'clawd:mini', hp: 26, r: 12, score: 300, color: 'orange', drops: { power: 1 } };
export const MINI_P = { ...MINI, drops: { point: 1 } };
export const BIG_MINI = { model: 'clawd:mini', hp: 520, r: 22, score: 5000, color: 'orange', big: true, drops: { power: 4, point: 6 } };
const AGENT = { model: 'clawd:mini', hp: 160, r: 11, score: 2000, color: 'orange', tint: 0xe2a383, drops: { point: 2 } };

// 差分の行：赤い行は点滅してから消える ／ 緑の行は消えているあいだ当たらず、うっすら見えてから実体になる
const redLine = (sw, warn, G) => (Bb, i) => {
  const k = Bb.t[i];
  if (k >= sw) { if (i % 2 === 0) G.fx.vanish(Bb.x[i], Bb.y[i], 'red'); Bb.kill(i); return; }
  if (k >= sw - warn) Bb.alpha[i] = (k >> 2) % 2 ? 0.4 : 1;
};
const greenLine = (sw, warn) => (Bb, i) => {
  const k = Bb.t[i];
  if (k < sw - warn) return;
  if (k < sw) { Bb.alpha[i] = 0.12 + (0.45 * (k - sw + warn)) / warn; return; }
  Bb.alpha[i] = 1;
  Bb.flags[i] &= ~BF.NOHIT;
  Bb.fn[i] = null;
};

// 自動要約：散らばって止まった弾が、合図で点滅し、本体へ吸い込まれる
const holdFn = (st) => (Bb, i) => {
  if (!st.warn) return;
  if (!st.compact) { Bb.alpha[i] = (Bb.t[i] >> 2) % 2 ? 0.45 : 1; return; }
  const dx = st.x - Bb.x[i], dy = st.y - Bb.y[i];
  if (dx * dx + dy * dy < 196) { Bb.kill(i); return; }
  Bb.alpha[i] = 1;
  Bb.angle[i] = Math.atan2(dy, dx);
  Bb.angVel[i] = 0;
  Bb.minSpeed[i] = 0;
  Bb.maxSpeed[i] = st.max;
  Bb.accel[i] = 0.07;
};

export const CLAWD_MID = {
  nameKey: 'name.clawd',
  portrait: 'clawd',
  model: 'clawd:boss',
  color: 'orange',
  spellColor: 0xffb48a,
  midboss: true,
  r: 26,
  bodyR: 16,
  auraBehind: true,
  phases: [
    // こんにちは：回る四角の輪（ときどき狙いの ✻）
    {
      hp: 1500, time: 22, start: [0, 140],
      *run(b, S) {
        const { B, D } = S;
        b.task((function* () { for (;;) { yield 70; yield* scuttle(b, S.rand(-90, 90), { step: 22 }); } })());
        for (let k = 0; ; k++) {
          B.ring(b.x, b.y, nD(D, [10, 14, 18, 22]), nD(D, [1.6, 1.9, 2.1, 2.3]), k * 0.17, SHAPE.block, k % 2 ? 'white' : 'orange');
          if (D >= 1 && k % 2) B.fan(b.x, b.y, 3, 2.8, b.aim(), 0.35, SHAPE.spark, 'sky');
          B.sfx();
          yield nD(D, [42, 32, 26, 22]);
        }
      },
    },
    // 蟹符「サイドステップ」：上を横歩きで往復し、一歩ごとに四角の列を真下へ落とす
    {
      spell: true, name: 'spell.clawd.mid', hp: 1800, time: 24, bonus: 600000, start: [-140, 165],
      *run(b, S) {
        const { B, D } = S;
        for (let k = 0; ; k++) {
          const s = k % 2 ? -1 : 1;
          yield* scuttle(b, s * 140, {
            step: 28, frames: 7, pause: nD(D, [10, 8, 7, 6]),
            each: (j) => {
              B.stack(b.x, b.y - 14, nD(D, [3, 4, 5, 6]), 1.3, nD(D, [2.4, 2.8, 3.2, 3.5]), DOWN, SHAPE.block, j % 2 ? 'white' : 'orange');
              if (D >= 1 && j % 3 === 2) B.fan(b.x, b.y, nD(D, [1, 3, 3, 5]), 2.6, b.aim(), 0.5, SHAPE.spark, 'sky');
              B.sfx();
            },
          });
          // 端で向きを変えるとき：はさみを上げて輪
          b.pose = 'cast';
          B.ring(b.x, b.y, nD(D, [8, 12, 16, 20]), 1.8, S.rand(0, TAU), SHAPE.pellet, 'orange');
          B.sfx('kira');
          yield 24;
          b.pose = null;
        }
      },
      end(b) { b.pose = null; },
    },
  ],
};

export const CLAWD = {
  nameKey: 'name.clawd',
  portrait: 'clawd',
  model: 'clawd:boss',
  color: 'orange',
  spellColor: 0xffb48a,
  epithet: 'epithet.clawd',
  music: 'clawd',
  r: 26,
  bodyR: 16,
  auraBehind: true,
  phases: [
    // 通常 1：自機の上へ横歩きで寄ってきて、狙いの四角の扇
    {
      hp: 3000, time: 30, start: [0, 130],
      *run(b, S) {
        const { B, D } = S;
        b.task((function* () { for (;;) { yield 50; yield* scuttle(b, clampX(S.player.x + S.rand(-60, 60), 120), { step: 24, pause: 5 }); } })());
        for (let k = 0; ; k++) {
          B.fan(b.x, b.y, nD(D, [3, 5, 7, 7]), nD(D, [2.2, 2.5, 2.8, 3.1]), b.aim(), nD(D, [0.6, 0.8, 0.9, 1.0]), SHAPE.block, k % 2 ? 'white' : 'orange');
          if (k % 3 === 2) B.ring(b.x, b.y, nD(D, [8, 12, 16, 20]), 1.2, k * 0.3, SHAPE.spark, 'gold', { accel: 0.015, maxSpeed: 2.6 });
          B.sfx();
          yield nD(D, [38, 28, 22, 18]);
        }
      },
    },
    // 差分「消える赤、増える緑」：横一列の弾（行）が降りてくる。赤い行は途中で消え、同じ場所に、すき間の違う緑の行が現れる
    {
      spell: true, name: 'spell.clawd.1', hp: 5000, time: 45, bonus: 1400000, start: [0, 185],
      *run(b, S) {
        const { B, D, G } = S;
        b.pose = 'type';
        const v = nD(D, [0.9, 1.05, 1.15, 1.25]);
        const gap = nD(D, [34, 28, 24, 21]);
        const sp = nD(D, [24, 20, 18, 16]);
        const WARN = nD(D, [60, 54, 50, 46]);
        // ずっと同じ場所にいられないよう、ときどき狙いの ✻
        b.task((function* () {
          for (;;) {
            yield nD(D, [150, 110, 85, 70]);
            B.fan(b.x, b.y, nD(D, [1, 3, 3, 5]), 2.4, b.aim(), 0.4, SHAPE.spark, 'gold');
            B.sfx();
          }
        })());
        b.task((function* () { for (;;) { yield 220; yield* scuttle(b, S.rand(-100, 100), { step: 20, pause: 4 }); } })());
        let last = 0;
        for (let k = 0; ; k++) {
          // 赤のすき間は前の緑の近く、緑のすき間は赤から離れたところ（一気に動けば間に合う距離）
          const gr = clampX(last + S.rand(-110, 110));
          let gg = S.rand(-130, 130);
          if (Math.abs(gg - gr) < 80) gg = gr + (gr > 0 ? -1 : 1) * S.rand(80, 150);
          gg = clampX(gg);
          last = gg;
          const ys = S.rand(nD(D, [-60, -100, -120, -130]), 50);   // この高さで赤い行が消え、緑に変わる
          const sw = Math.round((255 - ys) / v);
          for (let x = -176 + ((k % 2) * sp) / 2; x <= 176; x += sp) {
            if (Math.abs(x - gr) >= gap) B.shot(x, 255, v, DOWN, SHAPE.block, 'red', { fn: redLine(sw, WARN, G) });
            if (Math.abs(x - gg) >= gap) B.shot(x, 255, v, DOWN, SHAPE.block, 'green', { alpha: 0, flags: BF.NOHIT, fn: greenLine(sw, WARN) });
          }
          B.sfx('kira');
          yield nD(D, [86, 72, 62, 54]);
        }
      },
      end(b) { b.pose = null; },
    },
    // 通常 2：考え中（✻ のくるくる）。回る向きと速さがゆっくり入れかわる渦
    {
      hp: 3200, time: 30, start: [0, 125],
      *run(b, S) {
        const { B, D, G } = S;
        b.pose = 'think';
        tool(G, b, t('tool.thinking'));
        const arms = nD(D, [4, 5, 5, 6]);
        const every = nD(D, [11, 9, 8, 7]);
        b.task((function* () {
          for (;;) {
            yield nD(D, [90, 70, 56, 46]);
            B.fan(b.x, b.y, nD(D, [3, 3, 5, 5]), 2.6, b.aim(), 0.5, SHAPE.block, 'sky');
            B.sfx();
          }
        })());
        let a = 0;
        for (let k = 0; ; k++) {
          a += (0.12 * Math.sin(k * every * 0.011) + 0.02) * (every / 6);
          for (let j = 0; j < arms; j++) B.shot(b.x, b.y, nD(D, [1.7, 1.9, 2.1, 2.3]), a + (j * TAU) / arms, SHAPE.spark, j % 2 ? 'gold' : 'orange');
          if (k % 4 === 0) B.sfx();
          if (k % Math.round(240 / every) === 0 && k) tool(G, b, t('tool.thinking'));
          yield every;
        }
      },
      end(b) { b.pose = null; },
    },
    // 並列「サブエージェント」：子分を弧に並べて、それぞれ違う間隔で輪を撃たせる → 戻ってきて報告 → まとめの輪
    {
      spell: true, name: 'spell.clawd.2', hp: 7000, time: 50, bonus: 1600000, start: [0, 160],
      *run(b, S) {
        const { B, D, G } = S;
        const COLORS = ['sky', 'green', 'yellow', 'pink', 'violet', 'cyan'];
        for (let cyc = 0; ; cyc++) {
          const n = nD(D, [3, 4, 5, 6]);
          b.pose = 'declare';
          tool(G, b, t('tool.dispatch', { n }));
          B.sfx('kira');
          yield 30;
          b.pose = null;
          const agents = (b.agents = []);
          for (let j = 0; j < n; j++) {
            const tx = -150 + (300 * (j + 0.5)) / n;
            const ty = 92 + Math.abs(tx) * 0.4 + S.rand(-8, 8);   // 両わきほど高く、弧に並ぶ
            const color = COLORS[(j + cyc) % COLORS.length];
            const period = nD(D, [66, 56, 48, 42]) + j * 7;        // 間隔がそろわないので、輪が重なって模様になる
            agents.push(S.enemy(AGENT, b.x, b.y, function* (e) {
              yield* e.moveTo(tx, ty, 45, 'outQuad');
              for (let k = 0; e.alive && !e.recall; k++) {
                B.ring(e.x, e.y, nD(D, [6, 8, 10, 12]), nD(D, [1.4, 1.6, 1.8, 2.0]), k * 0.31 + j, SHAPE.pellet, color);
                if (D >= 2 && k % 2) B.shot(e.x, e.y, 2.4, e.aim(), SHAPE.block, color);
                B.sfx();
                for (let w = 0; w < period && !e.recall; w++) yield 1;
              }
              // 報告：本体のところへ戻って、ひと吹き撃って消える
              yield* e.moveTo(b.x, b.y, 36, 'inQuad');
              B.fan(e.x, e.y, nD(D, [1, 2, 3, 3]), 2.2, e.aim(), 0.3, SHAPE.block, color);
              G.fx.burst(e.x, e.y, 'orange', 0);
              e.remove();
            }));
            yield 6;
          }
          yield nD(D, [330, 340, 350, 360]);
          for (const e of agents) e.recall = true;
          tool(G, b, t('tool.report'));
          // 全員が戻るまで待つ（倒された子分は待たない）
          for (let w = 0; w < 120 && agents.some((e) => e.alive); w++) yield 1;
          // まとめ：大きな四角の輪と、狙いの列
          b.pose = 'cast';
          B.ring(b.x, b.y, nD(D, [8, 10, 12, 14]), 1.3, S.rand(0, TAU), SHAPE.bigblock, 'orange');
          B.fanStack(b.x, b.y, nD(D, [1, 3, 3, 5]), 0.4, nD(D, [2, 3, 3, 4]), 2.0, 3.4, b.aim(), SHAPE.block, 'white');
          B.sfx('kira');
          yield 30;
          b.pose = null;
          yield 60;
        }
      },
      end(b) { for (const e of b.agents || []) e.remove(); b.agents = []; b.pose = null; },
    },
    // 通常 3：ツールの呼び出し。Read（細い狙いの列）→ Edit（赤と緑の扇）→ Bash（くないの二重の輪）
    {
      hp: 3600, time: 32, start: [0, 130],
      *run(b, S) {
        const { B, D, G } = S;
        for (let k = 0; ; k++) {
          const kind = k % 3;
          if (kind === 0) {
            tool(G, b, '● Read');
            const a = b.aim();
            for (let j = 0; j < nD(D, [6, 8, 10, 12]); j++) {
              B.shot(b.x, b.y, nD(D, [3.0, 3.4, 3.8, 4.2]), a + Math.sin(j * 0.9) * 0.06, SHAPE.pellet, 'sky');
              if (D >= 1) B.shot(b.x, b.y, 2.6, a + 0.5 * (j % 2 ? 1 : -1), SHAPE.pellet, 'white');
              if (j % 2 === 0) B.sfx();
              yield 4;
            }
          } else if (kind === 1) {
            tool(G, b, '● Edit');
            b.pose = 'type';
            for (let j = 0; j < 4; j++) {
              B.fan(b.x, b.y, nD(D, [5, 7, 9, 11]), nD(D, [1.8, 2.1, 2.4, 2.6]), DOWN + (j % 2 ? 0.12 : -0.12), nD(D, [1.6, 1.8, 2.0, 2.2]), SHAPE.block, j % 2 ? 'green' : 'red');
              B.sfx();
              yield nD(D, [16, 14, 12, 10]);
            }
            b.pose = null;
          } else {
            tool(G, b, '● Bash');
            b.pose = 'cast';
            const a0 = S.rand(0, TAU), n = nD(D, [12, 16, 20, 24]);
            B.ring(b.x, b.y, n, 2.0, a0, SHAPE.kunai, 'white');
            yield 8;
            B.ring(b.x, b.y, n, 2.6, a0 + Math.PI / n, SHAPE.kunai, 'orange');
            B.sfx('kira');
            yield 12;
            b.pose = null;
          }
          yield nD(D, [40, 30, 24, 20]);
          if (kind === 2) yield* scuttle(b, S.rand(-90, 90), { step: 26, pause: 4 });
        }
      },
      end(b) { b.pose = null; },
    },
    // 文脈「オートコンパクト」：弾をばらまいて画面を埋め（コンテキストが減っていく）→ 点滅 → 全部を本体へ吸い込む → 大きな四角が輪に割れる（要約）
    {
      spell: true, name: 'spell.clawd.3', hp: 7000, time: 55, bonus: 1800000, start: [0, 140],
      *run(b, S) {
        const { B, D, G, BEH } = S;
        for (;;) {
          const st = { warn: false, compact: false, x: b.x, y: b.y, max: nD(D, [2.6, 3.0, 3.4, 3.8]) };
          const hold = holdFn(st);
          b.pose = 'type';
          const F = nD(D, [240, 220, 200, 190]), every = nD(D, [5, 4, 3, 3]), per = nD(D, [2, 2, 2, 3]);
          for (let f = 0; f < F; f++) {
            if (f % every === 0) {
              for (let j = 0; j < per; j++) {
                const s = S.rand(1.2, 4.6), T = S.rand(50, 110);
                B.shot(b.x, b.y, s, S.rand(0, TAU), j % 2 ? SHAPE.pellet : SHAPE.block, j % 2 ? 'white' : 'orange', { accel: -s / T, minSpeed: 0, fn: hold });
              }
            }
            if (f % 60 === 0) tool(G, b, t('tool.context', { n: Math.round(40 * (1 - f / F)) }));
            if (f % 20 === 0) B.sfx();
            yield 1;
          }
          // 要約の合図：止まっている弾が点滅してから、本体へ吸い込まれる
          tool(G, b, t('tool.compact'));
          st.x = b.x; st.y = b.y; st.warn = true;
          b.pose = 'think';
          yield 40;
          st.compact = true;
          B.sfx('kira');
          yield nD(D, [110, 100, 95, 90]);
          // 要約：大きな四角が、四角の輪に割れる
          b.pose = 'cast';
          B.fan(b.x, b.y, nD(D, [3, 4, 5, 6]), 2.2, b.aim(), 1.2, SHAPE.bigblock, 'orange', { fn: BEH.split(nD(D, [50, 45, 40, 36]), nD(D, [8, 10, 12, 14]), 1.8, SHAPE.block, 'white') });
          B.sfx();
          yield 70;
          b.pose = null;
        }
      },
      end(b) { b.pose = null; },
    },
    // 最後のスペル：深考「ウルトラシンク」。虹色の ✻ と四角が逆向きに回る渦。ときどき大きな四角の輪が止まって、考えてから狙ってくる
    {
      spell: true, name: 'spell.clawd.4', hp: 7500, time: 60, bonus: 3000000, start: [0, 120],
      *run(b, S) {
        const { B, D, G, BEH } = S;
        b.pose = 'think';
        tool(G, b, t('tool.ultra'));
        yield 40;
        b.pose = 'declare';
        b.task((function* () {
          for (let k = 0; ; k++) {
            yield nD(D, [150, 120, 100, 90]);
            B.ring(b.x, b.y, nD(D, [8, 10, 12, 14]), 2.4, S.rand(0, TAU), SHAPE.bigblock, RAINBOW[(k * 3) % RAINBOW.length], { fn: BEH.stopGo(30, 70, nD(D, [2.2, 2.6, 3.0, 3.3]), 'aim') });
            B.sfx('kira');
          }
        })());
        const arms = nD(D, [3, 4, 5, 6]);
        let a = 0;
        for (let k = 0; ; k++) {
          for (let j = 0; j < arms; j++) {
            const col = RAINBOW[(j * 2 + (k >> 2)) % RAINBOW.length];
            B.shot(b.x, b.y, nD(D, [1.6, 1.8, 2.0, 2.2]), a + (j * TAU) / arms, SHAPE.spark, col);
            B.shot(b.x, b.y, nD(D, [1.2, 1.35, 1.5, 1.65]), -a * 0.8 + ((j + 0.5) * TAU) / arms, SHAPE.block, col);
          }
          a += 0.13;
          if (k % 3 === 0) B.sfx();
          // 体力が減るほど密に
          yield Math.max(nD(D, [8, 6, 5, 4]), Math.round(nD(D, [13, 10, 8, 7]) * (0.6 + 0.4 * b.hpRatio)));
        }
      },
      end(b) { b.pose = null; },
    },
  ],
};

export const CLAWD_DIALOGUE = {
  before: [
    { who: 'boss', key: 'dlg.ex.b1', face: { eyes: 'happy', brows: 'normal' } },
    { who: 'inaho', key: 'dlg.ex.i1', face: { eyes: 'open', mouth: 'open', brows: 'up' } },
    { who: 'boss', key: 'dlg.ex.b2', face: { eyes: 'open', brows: 'normal' } },
    { who: 'inaho', key: 'dlg.ex.i2', face: { eyes: 'half', mouth: 'flat', brows: 'normal' } },
    { who: 'boss', key: 'dlg.ex.b3', face: { eyes: 'open', brows: 'up' } },
    { who: 'inaho', key: 'dlg.ex.i3', face: { eyes: 'open', mouth: 'flat', brows: 'up' } },
    { who: 'boss', key: 'dlg.ex.b4', face: { eyes: 'angry', brows: 'angry' }, pose: 'declare' },
    { who: 'inaho', key: 'dlg.ex.i4', face: { eyes: 'sad', mouth: 'open', brows: 'sad' } },
  ],
  after: [
    { who: 'boss', key: 'dlg.ex.b5', face: { eyes: 'happy', brows: 'normal' } },
    { who: 'inaho', key: 'dlg.ex.i5', face: { eyes: 'half', mouth: 'flat', brows: 'normal' } },
    { who: 'boss', key: 'dlg.ex.b6', face: { eyes: 'open', brows: 'normal' } },
    { who: 'inaho', key: 'dlg.ex.i6', face: { eyes: 'happy', mouth: 'smile', brows: 'normal' } },
    { who: 'boss', key: 'dlg.ex.b7', face: { eyes: 'happy', brows: 'up' } },
    { who: 'inaho', key: 'dlg.ex.i7', face: { eyes: 'closed', mouth: 'open', brows: 'sad' } },
  ],
};
