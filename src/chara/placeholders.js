// 仮のモデル（本物のモデルができるまでの置き場所）。フィールドのドット単位で作る。
import * as THREE from 'three';

const mats = {};
const mat = (c, o = {}) => (mats[c + JSON.stringify(o)] ||= new THREE.MeshToonMaterial({ color: c, ...o }));

/** 仮の自機：赤白の巫女っぽい形と狐の耳・しっぽ。 */
export function makePlaceholderGirl() {
  const root = new THREE.Group();
  root.name = 'girl';
  const body = new THREE.Group();
  root.add(body);
  const add = (geo, m, x, y, z, name) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.name = name; body.add(o); return o; };
  add(new THREE.CylinderGeometry(4, 9, 14, 12), mat(0xd8333c), 0, -7, 0, 'hakama');
  add(new THREE.CylinderGeometry(4.5, 5.5, 9, 12), mat(0xfbf7f0), 0, 3, 0, 'top');
  add(new THREE.SphereGeometry(6.5, 16, 12), mat(0xe8b45c), 0, 13, 0, 'head');
  for (const s of [-1, 1]) {
    const ear = add(new THREE.ConeGeometry(2.6, 6, 8), mat(0xe8b45c), 3.8 * s, 19, -0.5, s < 0 ? 'earL' : 'earR');
    ear.rotation.z = -0.35 * s;
    add(new THREE.BoxGeometry(4, 7, 3), mat(0xfbf7f0), 7 * s, 1, 0, s < 0 ? 'sleeveL' : 'sleeveR');
  }
  const tail = add(new THREE.SphereGeometry(5, 12, 10), mat(0xe8b45c), 0, -6, -6, 'tail');
  tail.scale.set(0.9, 1.6, 0.9);
  tail.rotation.x = -0.6;
  body.rotation.y = Math.PI; // 背中をカメラに向ける
  let t = 0;
  return {
    root,
    update(dt, s) {
      t += dt;
      body.rotation.z = -(s?.vx || 0) * 0.05;
      body.position.y = Math.sin(t * 3) * 1.2;
      tail.rotation.z = Math.sin(t * 4) * 0.3;
    },
    setBlink(on) { root.visible = root.visible && !on; },
  };
}

/** 仮の敵：光る玉（色は定義の color）。 */
export function makePlaceholderEnemy(kind, def) {
  const root = new THREE.Group();
  root.name = 'enemy-' + kind;
  const col = new THREE.Color(def.colorHex || 0xffaa66);
  const core = new THREE.Mesh(new THREE.SphereGeometry(def.r * 0.7, 14, 10), new THREE.MeshToonMaterial({ color: col, emissive: col.clone().multiplyScalar(0.4) }));
  root.add(core);
  const eyes = new THREE.Mesh(new THREE.SphereGeometry(def.r * 0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0x221122 }));
  eyes.position.set(0, def.r * 0.1, def.r * 0.62);
  root.add(eyes);
  let t = Math.random() * 10;
  return {
    root,
    update(dt, e) {
      t += dt;
      core.scale.setScalar(1 + Math.sin(t * 6) * 0.05);
      core.material.emissiveIntensity = e.flash > 0 ? 3 : 1;
    },
  };
}
