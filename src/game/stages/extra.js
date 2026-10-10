// おまけステージ「夜空のターミナル」：本編のあとの中秋の夜。小さな Clawd の群れの道中、中ボスとボスの Clawd。
// Clawd は Anthropic の Claude Code のマスコットの、非公式の二次創作。Clawd のデザインとモデル（ClawdModel.js・clawdActors.js）は
// MIT License の対象外（LICENSE の「例外」）。この台本と弾幕・会話は、ほかのステージと同じく MIT。
import { SHAPE } from '../danmaku.js';
import { CLAWD_MID, CLAWD, CLAWD_DIALOGUE, MINI, MINI_P, BIG_MINI } from '../bosses/clawd.js';
import * as W from './waves.js';

const nD = W.nD;

// 「>_」（ターミナルのプロンプト）の形の隊列
const PROMPT = [
  [-110, 36], [-88, 18], [-66, 0], [-88, -18], [-110, -36],
  [-24, -36], [2, -36], [28, -36], [54, -36], [80, -36],
];

/** 子分が横から一列に入ってきて、横歩きで画面を横切る（歩くたびに、ときどき狙いの四角）。 */
function* crabLine(S, o = {}) {
  const { B, D } = S;
  const n = o.n ?? 6, s = o.side ?? 1, y = o.y ?? 180;
  for (let i = 0; i < n; i++) {
    S.enemy(o.kind ?? MINI, -s * 205, y, function* (e) {
      for (let k = 0; e.alive && k < 40; k++) {
        yield* e.moveBy(s * 22, 0, 8, 'inOutQuad');
        if ((k + i) % nD(D, [4, 3, 3, 2]) === 0 && Math.abs(e.x) < 170) {
          B.shot(e.x, e.y, nD(D, [2.0, 2.4, 2.8, 3.1]), e.aim(), SHAPE.block, o.color ?? 'orange');
          B.sfx();
        }
        yield 6;
        if (Math.abs(e.x) > 215) break;
      }
      e.remove();
    });
    yield o.gap ?? 22;
  }
  yield o.after ?? 100;
}

export default {
  world: 'clawd',
  *script(S) {
    S.music('clawd');
    if (S.section('road1')) {
      S.title('ex');
      yield 160;
      yield* crabLine(S, { side: 1, y: 190, n: 7 });
      yield* crabLine(S, { side: -1, y: 150, n: 7, after: 60 });
      yield* W.vDrop(S, { kind: MINI, shape: SHAPE.block, color: 'orange', after: 90 });
      yield* W.sideStream(S, { kind: [MINI_P, 'wispP'], color: ['orange', 'gold'], shape: SHAPE.spark, n: 16 });
      S.par(crabLine(S, { side: 1, y: 200, n: 6, kind: MINI_P, color: 'white' }));
      yield* crabLine(S, { side: -1, y: 120, n: 6, after: 80 });
      yield* W.approachRing(S, { kind: MINI, pos: [[-110, 140], [110, 140], [-50, 100], [50, 100]], shape: SHAPE.block, color: 'orange', color2: 'white', gap: 24 });
      yield* W.bigTurret(S, { kind: BIG_MINI, color: 'orange', color2: 'white', shape: SHAPE.spark, aimShape: SHAPE.block, aimColor: 'sky', after: 380 });
    }
    if (S.section('mid')) {
      yield* S.boss(CLAWD_MID);
      yield 90;
    }
    if (S.section('road2')) {
      yield* W.formation(S, { kind: MINI_P, points: PROMPT, color: 'orange', shape: SHAPE.block, after: 360 });
      S.par(W.whirl(S, { kind: MINI, n: 5, x: -80, r: 50, dir: 1, dur: 260, shape: SHAPE.spark, color: 'orange' }));
      yield* W.whirl(S, { kind: MINI_P, n: 5, x: 80, r: 50, dir: -1, dur: 260, shape: SHAPE.block, color: 'white' });
      yield* W.crossX(S, { kind: MINI_P, n: 10, color: 'orange', shape: SHAPE.block, after: 160 });
    }
    S.section('boss');
    S.world('boss');
    S.G.items.collectAll();
    yield 200;
    yield* S.boss(CLAWD, CLAWD_DIALOGUE);
    // 練習あつかい（practice）なので、clear が暗転して onStageClear を呼ぶ → Game がおまけのリザルトへ
    yield* S.clear({ final: true });
  },
};
