// ステージ 1「夕暮れの千本鳥居」：狐火・葉っぱの化け・からかさ・提灯の道中、中ボスのぽこ、ボスのぽこ。
import { SHAPE, TAU, DOWN } from '../danmaku.js';
import { POKO_MID, POKO, POKO_DIALOGUE } from '../bosses/poko.js';
import * as W from './waves.js';

const TORII = (() => {
  const p = [];
  for (let x = -120; x <= 120; x += 30) p.push([x, 0]);
  for (let x = -90; x <= 90; x += 45) p.push([x, -26]);
  for (const x of [-75, 75]) for (let y = -52; y >= -130; y -= 26) p.push([x, y]);
  return p;
})();

export default {
  world: 'stage1',
  *script(S) {
    S.music('st1');
    if (S.section('road1')) {
      S.title(1);
      yield 160;
      yield* W.vDrop(S, { color: 'sky', after: 90 });
      yield* W.sideStream(S, { kind: ['wisp', 'wisp', 'wispP'], color: ['sky', 'sky', 'orange'], n: 14 });
      yield* W.vDrop(S, { x: -50, kind: 'wispP', color: 'orange', shape: SHAPE.orb, after: 60 });
      yield* W.vDrop(S, { x: 50, color: 'sky', after: 100 });
      yield* W.approachRing(S, { pos: [[-110, 150], [110, 150], [-50, 100], [50, 100]], gap: 30 });
      S.par(W.crossX(S, { n: 8, gap: 26, color: 'sky' }));
      yield* W.procession(S, { side: 1, kind: 'wispP', color: 'orange', n: 16, after: 60 });
      yield* W.procession(S, { side: -1, kind: 'wisp', color: 'sky', n: 12, y: 190, amp: 30, after: 90 });
      yield* W.hopRain(S, { n: 6, after: 100 });
      yield* W.crossX(S, { n: 10, color: 'sky' });
      S.par(W.sideStream(S, { kind: 'wisp', color: 'sky', n: 10, gap: 24, y: 230 }));
      yield* W.bigTurret(S, { kind: 'lantern', after: 420 });
      yield* W.whirl(S, { n: 6, kind: 'leaf', shape: SHAPE.leaf, color: 'green', dur: 300 });
      S.par(W.riseFromBelow(S, { n: 6, shape: SHAPE.rice, color: 'orange', kind: 'wispP' }));
      yield* W.vDrop(S, { color: 'sky', n: 11, after: 200 });
    }
    // 中ボス：ぽこ
    if (S.section('mid')) {
      yield* S.boss(POKO_MID);
      yield 90;
    }
    if (S.section('road2')) {
      yield* W.sideStream(S, { kind: ['wisp', 'wispP'], color: ['orange', 'sky'], n: 22, gap: 10, after: 80 });
      S.par(W.bigTurret(S, { kind: 'lantern', x: -100, color: 'red', color2: 'orange', shape: SHAPE.ball, times: 6 }));
      yield* W.bigTurret(S, { kind: 'lantern', x: 100, color: 'orange', color2: 'yellow', times: 6, after: 380 });
      yield* W.riseFromBelow(S, { n: 8, shape: SHAPE.leaf, color: 'green' });
      S.par(W.sideStream(S, { kind: 'wisp', color: 'sky', n: 12, gap: 30, y: 230, ways: [1, 1, 2, 2] }));
      yield* W.hopRain(S, { n: 6, y: 80, gap: 60 });
      S.par(W.procession(S, { side: -1, kind: 'wispP', color: 'yellow', n: 14, y: 190 }));
      yield* W.approachRing(S, { pos: [[-130, 90], [130, 90]], count: [10, 14, 18, 22], after: 180 });
      yield* W.formation(S, { points: TORII, color: 'red' });
      S.par(W.whirl(S, { n: 5, x: -80, r: 50, dir: 1, dur: 280 }));
      yield* W.whirl(S, { n: 5, x: 80, r: 50, dir: -1, dur: 280, color: 'lime' });
      S.par(W.vDrop(S, { x: 0, color: 'orange', kind: 'wispP' }));
      yield* W.crossX(S, { n: 14, gap: 14, color: 'orange', after: 200 });
    }
    // ボスの前
    S.section('boss');
    S.world('boss');
    S.G.items.collectAll();
    yield 200;
    yield* S.boss(POKO, POKO_DIALOGUE);
    yield* S.clear();
  },
};
