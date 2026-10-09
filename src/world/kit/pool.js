// InstancedMesh を区画ごとに分けて使う入れ物。区画 slot は [slot*per, slot*per + per) の番号を持つ。
// begin(slot) → add(...) を何回か → end()（余りは大きさ 0 で隠す）。flush() でその範囲だけ GPU に送る。
import * as THREE from 'three';
import { ZERO_MATRIX } from './geo.js';

const WHITE = new THREE.Color(1, 1, 1);

export class Pool {
  constructor(geo, mat, per, slots, name) {
    this.per = per;
    this.slots = slots;
    const mesh = (this.mesh = new THREE.InstancedMesh(geo, mat, per * slots));
    mesh.name = name || 'pool';
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < per * slots; i++) { mesh.setMatrixAt(i, ZERO_MATRIX); mesh.setColorAt(i, WHITE); }
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.slot = 0;
    this.n = 0;
    this.dirty = [];
  }
  begin(slot) { this.slot = slot; this.n = 0; }
  /** 置く。いっぱいなら false。 */
  add(m, color = WHITE) {
    if (this.n >= this.per) return false;
    const i = this.slot * this.per + this.n++;
    this.mesh.setMatrixAt(i, m);
    this.mesh.setColorAt(i, color);
    return true;
  }
  end() {
    for (let i = this.n; i < this.per; i++) this.mesh.setMatrixAt(this.slot * this.per + i, ZERO_MATRIX);
    if (!this.dirty.includes(this.slot)) this.dirty.push(this.slot);
  }
  flush() {
    if (!this.dirty.length) return;
    // 範囲は描画のときに three が送って消す（ここで消すと、描かずに何コマも進めたときに送り漏れる）
    const im = this.mesh.instanceMatrix, ic = this.mesh.instanceColor;
    for (const s of this.dirty) {
      im.addUpdateRange(s * this.per * 16, this.per * 16);
      ic.addUpdateRange(s * this.per * 3, this.per * 3);
    }
    im.needsUpdate = true;
    ic.needsUpdate = true;
    this.dirty.length = 0;
  }
  dispose() { this.mesh.dispose(); }
}

/** なめらかな 1 次元のノイズ（0〜1）。道の区切り（鳥居の続くところ・途切れるところ）に使う。 */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return h(i) + (h(i + 1) - h(i)) * u;
}
