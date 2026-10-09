// ステージ 2「竹林と灯籠流しの川」：鬼火・化け猫の霊・灯籠・輪入道の道中、中ボスとボスのすず。
import { SHAPE, TAU, DOWN } from '../danmaku.js';
import { SUZU_MID, SUZU, SUZU_DIALOGUE } from '../bosses/suzu.js';
import * as W from './waves.js';

// 肉球の形の隊列
const PAW = [[0, 0], [-30, 6], [30, 6], [-14, -20], [14, -20], [-48, 38], [-18, 52], [18, 52], [48, 38]];

export default {
  world: 'stage2',
  *script(S) {
    S.music('st2');
    if (S.section('road1')) {
      S.title(2);
      yield 160;
      yield* W.vDrop(S, { kind: 'onibi', color: 'cyan', shape: SHAPE.flame, after: 80 });
      yield* W.sideStream(S, { kind: ['onibi', 'catspirit'], color: ['cyan', 'violet'], shape: SHAPE.scale, n: 16 });
      yield* W.approachRing(S, { kind: 'catspirit', pos: [[-120, 140], [120, 140], [-60, 90], [60, 90]], shape: SHAPE.scale, color: 'violet', color2: 'purple', gap: 24 });
      S.par(W.procession(S, { side: 1, kind: 'onibi', color: 'cyan', shape: SHAPE.flame, n: 14, y: 200 }));
      yield* W.procession(S, { side: -1, kind: 'onibi', color: 'violet', shape: SHAPE.flame, n: 14, y: 120, after: 80 });
      yield* W.bigTurret(S, { kind: 'lantern', color: 'orange', color2: 'yellow', shape: SHAPE.flame, aimShape: SHAPE.scale, aimColor: 'violet', after: 360 });
      yield* W.crossX(S, { kind: 'catspirit', color: 'violet', shape: SHAPE.scale, n: 10 });
      yield* W.riseFromBelow(S, { kind: 'onibi', shape: SHAPE.flame, color: 'cyan', n: 8 });
      yield* W.whirl(S, { kind: 'onibi', n: 6, shape: SHAPE.flame, color: 'cyan', dur: 300 });
      S.par(W.hopRain(S, { kind: 'umbrella', n: 4, shape: SHAPE.drop, color: 'sky' }));
      yield* W.vDrop(S, { kind: 'catspirit', color: 'magenta', shape: SHAPE.scale, n: 11, after: 220 });
    }
    if (S.section('mid')) {
      yield* S.boss(SUZU_MID);
      yield 90;
    }
    if (S.section('road2')) {
      // 輪入道（大きな炎の車輪）が転がって横切る
      S.enemy('wheel', -230, 120, function* (e) {
        const { B, D } = S;
        e.vx = 1.1;
        for (let t = 0; e.alive && t < 560; t++) {
          if (t % W.nD(D, [40, 30, 24, 20]) === 0) { B.ring(e.x, e.y, W.nD(D, [10, 14, 18, 22]), 1.8, t * 0.05, SHAPE.flame, 'orange'); B.sfx(); }
          yield 1;
        }
        yield* e.leave(e.vx, 0);
      });
      yield 300;
      yield* W.sideStream(S, { kind: ['onibi', 'onibi', 'catspirit'], color: ['cyan', 'cyan', 'violet'], shape: SHAPE.rice, n: 20, gap: 11 });
      yield* W.laserTurrets(S, { kind: 'lantern', pos: [[-120, 150], [120, 150], [0, 110]], color: 'violet', shape: SHAPE.flame, gap: 50 });
      yield* W.formation(S, { kind: 'catspirit', points: PAW, color: 'magenta', shape: SHAPE.scale, after: 380 });
      S.par(W.whirl(S, { kind: 'onibi', n: 5, x: -80, r: 50, dir: 1, dur: 260, shape: SHAPE.flame, color: 'violet' }));
      yield* W.whirl(S, { kind: 'onibi', n: 5, x: 80, r: 50, dir: -1, dur: 260, shape: SHAPE.flame, color: 'cyan' });
      // 両側から輪入道
      for (const s of [-1, 1]) {
        S.enemy('wheel', s * 230, 160 - (s + 1) * 30, function* (e) {
          const { B, D } = S;
          e.vx = -s * 0.9;
          for (let t = 0; e.alive && t < 600; t++) {
            if (t % W.nD(D, [60, 44, 36, 30]) === 0) { B.fan(e.x, e.y, W.nD(D, [3, 5, 7, 9]), 2.4, e.aim(), 0.9, SHAPE.flame, 'red'); B.sfx(); }
            yield 1;
          }
          yield* e.leave(e.vx, 0);
        });
      }
      yield 420;
      yield* W.crossX(S, { kind: 'onibi', n: 14, gap: 14, color: 'cyan', shape: SHAPE.scale, after: 220 });
    }
    S.section('boss');
    S.world('boss');
    S.G.items.collectAll();
    yield 200;
    yield* S.boss(SUZU, SUZU_DIALOGUE);
    yield* S.clear();
  },
};
