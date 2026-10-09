// 動作確認用のステージ：道中の敵いくつかと、2 フェーズの小さなボス。
import { SHAPE, TAU, DOWN } from '../danmaku.js';

const testBoss = {
  nameKey: 'boss.test',
  model: 'girl:poko',
  color: 'pink',
  r: 24,
  phases: [
    {
      hp: 1200, time: 30,
      *run(b, S) {
        const { B, D } = S;
        for (let k = 0; ; k++) {
          B.ring(b.x, b.y, 16 + D * 6, 2.2, k * 0.17, SHAPE.orb, k % 2 ? 'red' : 'pink');
          B.sfx();
          yield 14;
          if (k % 6 === 5) yield* b.moveTo(S.rand(-80, 80), S.rand(90, 150), 40);
        }
      },
    },
    {
      spell: true, name: 'spell.test', hp: 1600, time: 40, bonus: 1000000,
      *run(b, S) {
        const { B, D } = S;
        for (let k = 0; ; k++) {
          const a = k * 0.21;
          for (let j = 0; j < 4; j++) B.shot(b.x, b.y, 2.4, a + (j * TAU) / 4, SHAPE.rice, 'cyan', { angVel: 0.004 });
          for (let j = 0; j < 4; j++) B.shot(b.x, b.y, 2.4, -a + (j * TAU) / 4 + 0.4, SHAPE.rice, 'blue', { angVel: -0.004 });
          if (k % 30 === 0) B.fan(b.x, b.y, 5 + D * 2, 3, b.aim(), 0.8, SHAPE.ball, 'white');
          if (k % 4 === 0) B.sfx();
          yield 3;
        }
      },
    },
  ],
};

export default {
  *script(S) {
    const { B, D } = S;
    S.music('play');
    S.title(1);
    yield 120;
    // 左右から狐火が並んで降りてくる
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1;
      S.enemy('wisp', side * 140, 260, function* (e) {
        yield* e.moveTo(side * (60 + i * 6), 120 - i * 4, 50);
        yield 20;
        B.fan(e.x, e.y, 3 + D, 2.6, e.aim(), 0.5, SHAPE.rice, 'sky');
        B.sfx();
        yield 30;
        yield* e.leave(side * 1.5, 1.2);
      });
      yield 16;
    }
    yield 120;
    // 大きな提灯：輪を何度も
    S.enemy('lantern', 0, 280, function* (e) {
      yield* e.moveTo(0, 140, 70);
      for (let k = 0; k < 8; k++) {
        B.ring(e.x, e.y, 20 + D * 6, 2.0 + (k % 2) * 0.6, k * 0.1, SHAPE.orb, k % 2 ? 'orange' : 'yellow');
        B.sfx();
        yield 24;
      }
      yield* e.leave(0, 1);
    });
    yield 300;
    yield* S.boss(testBoss, {
      before: [
        { speaker: 'name.inaho', key: 'dlg.test1', side: 'l' },
        { speaker: 'name.test', key: 'dlg.test2', side: 'r' },
      ],
    });
    yield* S.clear();
  },
};
