// 3D の破片：敵を倒したとき、紙片のような小さな板が回りながら手前・奥へ飛び散る（奥行きを感じさせる）。
// InstancedMesh 1 つ（draw call 1）。当たり判定はない。フィールドの座標（ドット）で動く。
import * as THREE from 'three';
import { PALETTE } from './atlas.js';

const N = 400;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export class Debris {
  constructor(scene) {
    // ひし形の薄い板（裏も見える）
    const g = new THREE.BufferGeometry();
    const v = [0, 1, 0, 0.6, 0, 0, 0, -1, 0, -0.6, 0, 0];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, emissive: 0x555555 });
    this.mesh = new THREE.InstancedMesh(g, mat, N);
    this.mesh.name = 'debris';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    scene.add(this.mesh);
    this.list = [];
    this.color = new THREE.Color();
  }

  /** (x, y) から n 個。color はパレットの名前。big で大きく遠くまで。 */
  burst(x, y, color = 'orange', n = 8, big = false) {
    const c = PALETTE[color] || PALETTE.white;
    for (let k = 0; k < n && this.list.length < N; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.2 + Math.random() * 2.6) * (big ? 1.6 : 1);
      this.list.push({
        x, y, z: (Math.random() - 0.3) * 10,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.8, vz: (Math.random() * 2 - 0.6) * (big ? 9 : 5),
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
        wx: (Math.random() - 0.5) * 0.4, wy: (Math.random() - 0.5) * 0.4, wz: (Math.random() - 0.5) * 0.3,
        s: (big ? 6.5 : 4.6) * (0.6 + Math.random() * 0.7), life: 50 + Math.random() * 40, t: 0,
        r: c.r * 0.8 + 0.2, g: c.g * 0.8 + 0.2, b: c.b * 0.8 + 0.2,
      });
    }
  }

  update() {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const d = L[i];
      d.t++;
      d.vx *= 0.97; d.vy = d.vy * 0.97 - 0.06; d.vz *= 0.985;
      d.x += d.vx; d.y += d.vy; d.z += d.vz;
      d.rx += d.wx; d.ry += d.wy; d.rz += d.wz;
      if (d.t > d.life) { L[i] = L[L.length - 1]; L.pop(); }
    }
  }

  render() {
    const L = this.list, m = this.mesh;
    for (let i = 0; i < L.length; i++) {
      const d = L[i];
      const k = 1 - Math.max(0, d.t - d.life + 15) / 15;
      _p.set(d.x, d.y, d.z);
      _q.setFromEuler(_e.set(d.rx, d.ry, d.rz));
      _s.setScalar(d.s * Math.max(0.01, k));
      _m.compose(_p, _q, _s);
      m.setMatrixAt(i, _m);
      m.setColorAt(i, this.color.setRGB(d.r, d.g, d.b));
    }
    m.count = L.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  clear() { this.list.length = 0; this.mesh.count = 0; }
}
