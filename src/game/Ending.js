// エンディング：月が昇り、4 人がそろってお月見。語りの文を順に出し、最後にスタッフの表示。
// ステージ 3 の台本から yield* ending(S) で呼ぶ。決定（ショット）で語りを早められる。
import * as THREE from 'three';
import { t } from '../core/i18n.js';
import { GirlModel } from '../chara/GirlModel.js';
import { SPECS } from '../chara/specs.js';

const CAST = [
  { id: 'poko', x: -132, face: { eyes: 'happy', mouth: 'grin', blush: 0.7 }, yaw: 0.35 },
  { id: 'inaho', x: -46, face: { eyes: 'happy', mouth: 'open', blush: 0.7 }, yaw: 0.15 },
  { id: 'tsukuyo', x: 44, face: { eyes: 'open', mouth: 'smile', blush: 0.8 }, yaw: -0.15 },
  { id: 'suzu', x: 128, face: { eyes: 'half', mouth: 'cat', blush: 0.5 }, yaw: -0.35 },
];

export function* ending(S) {
  const G = S.G;
  G.audio.music('ending');
  G.cancelBullets(false);
  G.items.collectAll();
  G.dialogueOpen = true; // ショットを止める
  G.world.event('moonrise');
  yield 120;
  // 自機は月のほうへ飛んでいく
  const p = G.player;
  for (let i = 0; i < 90; i++) { p.y += 2.4; yield 1; }
  p.model.root.visible = false;
  p.state = 'dead'; p.timer = 1e9; // 画面から消す（復帰しない）
  // 語り
  const lines = ['end.1', 'end.2', 'end.3', 'end.4', 'end.5'];
  const cast = [];
  for (let k = 0; k < lines.length; k++) {
    if (k === 1) {
      // 4 人を並べる
      for (const c of CAST) {
        const g = new GirlModel(SPECS[c.id], { outline: 1.0 });
        g.setPose('stand');
        g.setFace(c.face);
        const holder = new THREE.Group();
        holder.add(g.root);
        holder.scale.setScalar(100);
        holder.position.set(c.x, -320, 60);
        g.root.rotation.y = c.yaw;
        G.field.scene.add(holder);
        cast.push({ g, holder, c, t: 0 });
      }
      G.endingCast = cast;
    }
    G.hud.center('', '');
    G.hud.dialogue({ speaker: '', text: t(lines[k]), side: 'l' });
    for (let f = 0; f < 300; f++) {
      for (const m of cast) {
        m.t++;
        const k2 = Math.min(1, m.t / 70);
        m.holder.position.y = -320 + (1 - Math.pow(1 - k2, 3)) * 95;
        m.g.update(1 / 60, {});
      }
      if (f > 40 && G.inp.confirm) break;
      yield 1;
    }
  }
  G.hud.dialogue(null);
  // スタッフ
  const credits = ['credit.1', 'credit.2', 'credit.3'];
  for (const key of credits) {
    G.hud.center(t('credit.title'), t(key), 'credit');
    for (let f = 0; f < 200; f++) {
      for (const m of cast) m.g.update(1 / 60, {});
      if (f > 40 && G.inp.confirm) break;
      yield 1;
    }
  }
  G.fadeTarget = 1;
  for (let f = 0; f < 60; f++) { for (const m of cast) m.g.update(1 / 60, {}); yield 1; }
  for (const m of cast) { m.holder.removeFromParent(); m.g.dispose(); }
  G.endingCast = null;
  G.hud.center('');
  G.dialogueOpen = false;
  G.finish(true);
}
