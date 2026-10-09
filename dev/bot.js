// 開発用：弾をよける自動のプレイヤー（難易度の確かめ用。公開版では読み込まない）。
//   const m = await import('/dev/bot.js'); m.install(__dev.game);   // 以後、ゲーム中は自動で動く
//   __dev.game.botLog   被弾・ボムの記録 [{ frame, what, stage, phase }]
// やり方：毎コマ、9 方向 × 通常／低速の動きを数コマ先まで試し、弾（まっすぐ進むと見なす）との余裕がいちばん大きいものを選ぶ。
// よけきれないと見たらボムを使う。ボスの真下あたり（下のほう）にいたがる。
import { HALF_W, HALF_H, PLAYER } from '../src/game/config.js';

const DIRS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];
const TS = [2, 4, 7, 11, 16];

export function install(G, { bombs = true } = {}) {
  G.bot = true;
  G.botLog = [];
  G.botStats = { deaths: 0, bombs: 0 };
  const P = G.player;
  const origHit = P.hit.bind(P);
  P.hit = () => {
    if (P.vulnerable) {
      G.botStats.deaths++;
      G.botLog.push({ frame: G.frame, what: 'death', stage: G.stageNo, phase: G.boss?.alive ? G.boss.phaseIndex : -1, name: G.boss?.phase?.name || '' });
    }
    origHit();
    P.lives = Math.max(P.lives, 5); // 記録を取るため、ゲームオーバーにしない
  };
  G.botInput = (inp) => {
    const B = G.bullets;
    const px = P.x, py = P.y;
    let best = null, bestScore = -1e9, bestClear = -1e9;
    const boss = G.boss?.alive ? G.boss : null;
    const homeX = boss ? Math.max(-120, Math.min(120, boss.x)) : 0;
    const homeY = -HALF_H + 70;
    for (const focus of [false, true]) {
      const sp = focus ? PLAYER.focusSpeed : PLAYER.speed;
      for (const [dx, dy] of DIRS) {
        let clear = 1e9;
        for (const t of TS) {
          const x = Math.max(-HALF_W + PLAYER.margin, Math.min(HALF_W - PLAYER.margin, px + dx * sp * t));
          const y = Math.max(-HALF_H + PLAYER.margin + 6, Math.min(HALF_H - PLAYER.margin - 10, py + dy * sp * t));
          const w = 1 + (16 - t) * 0.06;
          for (let i = 0; i < B.top; i++) {
            if (!B.alive[i] || B.flags[i] & 8) continue;
            const a = B.angle[i], s = B.speed[i];
            const bx = B.x[i] + Math.cos(a) * s * t, by = B.y[i] + Math.sin(a) * s * t;
            const ddx = bx - x, ddy = by - y;
            if (ddx > 60 || ddx < -60 || ddy > 60 || ddy < -60) continue;
            const d = (Math.sqrt(ddx * ddx + ddy * ddy) - B.hitR[i] - PLAYER.hitR) * w;
            if (d < clear) clear = d;
          }
          for (const L of G.lasers.list) {
            if (!L.alive || L.t + t < L.warn) continue;
            const ux = Math.cos(L.a), uy = Math.sin(L.a);
            const qx = x - L.x, qy = y - L.y;
            const al = Math.max(0, Math.min(L.len, qx * ux + qy * uy));
            const d = (Math.hypot(qx - ux * al, qy - uy * al) - L.width * 0.4 - PLAYER.hitR) * w;
            if (d < clear) clear = d;
          }
          for (const e of G.enemies) {
            if (!e.alive || e.z < -5) continue;
            const d = (Math.hypot(e.x - x, e.y - y) - e.bodyR - PLAYER.hitR - 6) * w;
            if (d < clear) clear = d;
          }
        }
        const fx = px + dx * sp * 8, fy = py + dy * sp * 8;
        const home = -Math.hypot(fx - homeX, (fy - homeY) * 1.5) * 0.05;
        const score = Math.min(clear, 30) + home + (focus ? 0.5 : 0);
        if (score > bestScore) { bestScore = score; best = [dx, dy, focus]; bestClear = clear; }
      }
    }
    if (best) { inp.mx = best[0]; inp.my = best[1]; inp.focus = best[2]; }
    inp.shot = true;
    inp.confirm = (G.frame % 20) === 0; // 会話を進める
    inp.skip = true;
    if (bombs && bestClear < 0.5 && P.bombs > 0 && P.vulnerable && P.bombT <= 0) {
      inp.bomb = true;
      G.botStats.bombs++;
      G.botLog.push({ frame: G.frame, what: 'bomb', stage: G.stageNo, phase: boss ? boss.phaseIndex : -1, name: boss?.phase?.name || '' });
    }
  };
  return 'bot on';
}
