// フィールドに置くキャラクター（自機・ボス・会話の立ち絵）。GirlModel をフィールドのドット単位に合わせて包む。
//   自機：背中をカメラに向けて飛ぶ（pose 'fly'）。胸のあたりが当たり判定の位置にくる
//   ボス：カメラのほうを向いて浮かぶ（pose 'float'）。撃たれると白く光る
import * as THREE from 'three';
import { GirlModel } from './GirlModel.js';
import { SPECS } from './specs.js';

const CHEST = 0.86; // 足もとから胸までの高さ（m）

/** 自機（いなほ）。 */
export function makePlayerModel(scale = 36) {
  const girl = new GirlModel(SPECS.inaho, { outline: 0.5 });
  const root = new THREE.Group();
  root.name = 'player';
  const tilt = new THREE.Group();
  tilt.name = 'playerTilt';
  root.add(tilt);
  tilt.add(girl.root);
  tilt.scale.setScalar(scale);
  girl.root.position.y = -CHEST;
  girl.root.rotation.y = Math.PI;   // 背中をカメラへ
  tilt.rotation.x = 0.22;           // 少し上から見下ろすように（頭の上と肩が見える）
  girl.setPose('fly');
  girl.setFace({ eyes: 'open', mouth: 'smile' });
  let vy = 0;
  return {
    root,
    girl,
    update(dt, s) {
      vy = s.state === 'respawn' ? 3 : 2;
      girl.setPose(s.state === 'dying' ? 'hurt' : 'fly');
      girl.update(dt, { vx: -(s.vx || 0), vy, focus: s.focus || 0 });
      // 横に動くと体を傾け、少しそちらを向く
      tilt.rotation.z = THREE.MathUtils.lerp(tilt.rotation.z, -(s.vx || 0) * 0.05, 1 - Math.exp(-dt * 10));
      girl.root.rotation.y = Math.PI + THREE.MathUtils.lerp(girl.root.rotation.y - Math.PI, -(s.vx || 0) * 0.06, 1 - Math.exp(-dt * 8));
    },
    setBlink(on) { tilt.visible = !on; },
    dispose() { girl.dispose(); },
  };
}

/** ボス（とその中ボス）。id は SPECS のキー。 */
export function makeBossModel(id, scale = 40) {
  const girl = new GirlModel(SPECS[id], { outline: 0.5 });
  const root = new THREE.Group();
  root.name = 'boss-' + id;
  const tilt = new THREE.Group();
  tilt.name = 'bossTilt';
  root.add(tilt);
  tilt.add(girl.root);
  tilt.scale.setScalar(scale);
  girl.root.position.y = -CHEST;
  tilt.rotation.x = 0.12;
  girl.setPose('float');
  let lastX = 0, vx = 0;
  return {
    root,
    girl,
    /** e：Boss（x, flash, phase, dazed …）。pose は台本が girl.setPose で変えてよい（ボスの pose が優先）。 */
    update(dt, e) {
      vx = THREE.MathUtils.lerp(vx, (e.x - lastX) / Math.max(dt, 1e-3) / 60, 0.2);
      lastX = e.x;
      if (e.pose) girl.setPose(e.pose);
      else if (e.dazed) girl.setPose('dazed');
      else girl.setPose('float');
      girl.setFlash(e.flash > 0 ? 0.12 : 0);
      girl.update(dt, { vx: vx * 0.6, vy: 0 });
      tilt.rotation.z = THREE.MathUtils.lerp(tilt.rotation.z, -vx * 0.04, 1 - Math.exp(-dt * 8));
    },
    dispose() { girl.dispose(); },
  };
}
