// ステージ 3「雲海の上、月の社」：月のうさぎ・星の精・鬼火の道中、中ボスとラスボスのつくよ。
import { SHAPE, TAU, DOWN } from '../danmaku.js';
import { TSUKUYO_MID, TSUKUYO, TSUKUYO_DIALOGUE } from '../bosses/tsukuyo.js';
import * as W from './waves.js';
import { ending } from '../Ending.js';

// 三日月の形の隊列
const CRESCENT = (() => {
  const p = [];
  for (let k = 0; k < 11; k++) {
    const a = Math.PI * 0.3 + (k / 10) * Math.PI * 1.4;
    p.push([Math.cos(a) * 90, Math.sin(a) * 60]);
  }
  return p;
})();

export default {
  world: 'stage3',
  *script(S) {
    S.music('st3');
    if (S.section('road1')) {
      S.title(3);
      yield 160;
      yield* W.vDrop(S, { kind: 'rabbit', color: 'pink', shape: SHAPE.mochi, after: 80 });
      yield* W.sideStream(S, { kind: ['star', 'rabbit'], color: ['gold', 'pink'], shape: SHAPE.star, n: 16 });
      yield* W.laserTurrets(S, { kind: 'star', pos: [[-120, 160], [120, 160]], color: 'gold' });
      yield* W.approachRing(S, { kind: 'rabbit', pos: [[-120, 140], [120, 140], [-60, 90], [60, 90]], shape: SHAPE.crescent, color: 'gold', color2: 'yellow', gap: 24 });
      S.par(W.procession(S, { side: 1, kind: 'star', color: 'yellow', shape: SHAPE.star, n: 14, y: 200 }));
      yield* W.procession(S, { side: -1, kind: 'rabbit', color: 'pink', shape: SHAPE.mochi, n: 14, y: 120, after: 80 });
      yield* W.hopRain(S, { kind: 'rabbit', n: 6, shape: SHAPE.mochi, color: 'white' });
      yield* W.whirl(S, { kind: 'star', n: 7, shape: SHAPE.star, color: 'gold', dur: 320 });
      S.par(W.riseFromBelow(S, { kind: 'rabbit', n: 8, shape: SHAPE.crescent, color: 'gold' }));
      yield* W.bigTurret(S, { kind: 'wheel', color: 'gold', color2: 'white', shape: SHAPE.star, aimShape: SHAPE.crescent, aimColor: 'yellow', after: 380 });
      yield* W.crossX(S, { kind: 'star', n: 12, color: 'gold', shape: SHAPE.star, after: 200 });
    }
    if (S.section('mid')) {
      yield* S.boss(TSUKUYO_MID);
      yield 90;
    }
    if (S.section('road2')) {
      yield* W.formation(S, { kind: 'star', points: CRESCENT, color: 'gold', shape: SHAPE.star, after: 360 });
      yield* W.sideStream(S, { kind: ['rabbit', 'star'], color: ['pink', 'gold'], shape: SHAPE.crescent, n: 22, gap: 10 });
      yield* W.laserTurrets(S, { kind: 'star', pos: [[-140, 170], [0, 120], [140, 170]], color: 'sky', gap: 40, times: 4 });
      S.par(W.whirl(S, { kind: 'rabbit', n: 5, x: -80, r: 50, dir: 1, dur: 280, shape: SHAPE.mochi, color: 'pink' }));
      yield* W.whirl(S, { kind: 'star', n: 5, x: 80, r: 50, dir: -1, dur: 280, shape: SHAPE.star, color: 'gold' });
      S.par(W.bigTurret(S, { kind: 'wheel', x: -100, color: 'sky', color2: 'white', shape: SHAPE.star, times: 6 }));
      yield* W.bigTurret(S, { kind: 'wheel', x: 100, color: 'gold', color2: 'yellow', shape: SHAPE.crescent, times: 6, after: 380 });
      S.par(W.vDrop(S, { kind: 'rabbit', color: 'pink', shape: SHAPE.mochi, n: 11 }));
      yield* W.crossX(S, { kind: 'star', n: 16, gap: 12, color: 'gold', shape: SHAPE.star, after: 240 });
    }
    S.section('boss');
    S.world('boss');
    S.G.items.collectAll();
    yield 220;
    yield* S.boss(TSUKUYO, TSUKUYO_DIALOGUE);
    yield* S.clear({ final: true });
    if (!S.G.practice) yield* ending(S);
    else S.G.onStageClear();
  },
};
