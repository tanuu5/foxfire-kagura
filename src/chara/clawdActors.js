// ※ Clawd（Anthropic の Claude Code のマスコットの、非公式の二次創作）。このファイルは MIT License の対象外です（LICENSE の「例外」を参照）。
//   Not covered by the MIT License (see LICENSE).
// フィールドに置く Clawd：ボス（大きい・表情つき）と、道中・スペルの子分（小さい）。ClawdModel をフィールドのドット単位に合わせて包む。
//   Game の models.make から 'clawd:boss' / 'clawd:mini' で作る。update(dt, e) は Enemy / Boss の値（x, flash, pose, dazed）を見る。
import * as THREE from 'three';
import { ClawdModel } from './ClawdModel.js';

function wrap(model, scale, tiltX) {
  const root = new THREE.Group();
  root.name = model.root.name + '-actor';
  const tilt = new THREE.Group();
  tilt.scale.setScalar(scale);
  tilt.rotation.x = tiltX;          // 少し上から見下ろす（箱の上の面が見えて、立体に見える）
  tilt.add(model.root);
  root.add(tilt);
  let lastX = null, vx = 0;
  return {
    root,
    clawd: model,
    update(dt, e) {
      if (lastX === null) lastX = e.x;
      const v = (e.x - lastX) / Math.max(dt, 1e-3) / 60;
      lastX = e.x;
      vx += ((Number.isFinite(v) ? v : 0) - vx) * 0.25;
      if (e.pose) model.setPose(e.pose);
      else if (e.dazed) model.setPose('dazed');
      else model.setPose('float');
      // 撃たれ続けるあいだはずっと光るので、ごく弱く（白との混ぜ合わせはリニアなので、少しでも白っぽく抜けて見える）
      model.setFlash(e.flash > 0 ? 0.05 : 0);
      model.update(dt, { vx });
      // ゆっくり左右に向きを変えて、箱の横の面を見せる
      tilt.rotation.y = Math.sin(model.t * 0.7) * 0.22 - vx * 0.03;
    },
    dispose() { model.dispose(); },
  };
}

/** ボスの Clawd（横幅およそ 80 ドット）。 */
export function makeClawdBossModel(scale = 0.62) {
  return wrap(new ClawdModel({ outline: 0.6 }), scale, 0.32);
}

/** 子分の Clawd（横幅およそ 30 ドット）。def.r で大きさを変える。 */
export function makeClawdMiniModel(def = {}) {
  const k = (def.r ?? 12) / 12;
  return wrap(new ClawdModel({ mini: true, outline: 0.45, color: def.tint ?? 0xd08a6c }), 0.24 * k, 0.36);
}
