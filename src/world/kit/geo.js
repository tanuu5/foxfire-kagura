// 形を組むための道具。部品（BufferGeometry）に色と発光（aEmit）を塗り、動かして、1 つにまとめる。
// まとめた形は position / normal / color / aEmit だけを持つ（インデックスなし）。1 つの材質（litMat）で描ける。
//
//   part(new THREE.BoxGeometry(1, 1, 1), 0xd23a1e, { p: [0, 1, 0], r: [0, 0.3, 0], s: [1, 2, 1], emit: 0 })
//   merge([a, b, c])       部品をまとめる（元の部品は捨てる）
//   shadeY(g, y0, y1, k0, k1)  高さで明るさを変える（根元を暗く＝陰の代わり）
//   bendY(g, fn)           x に応じて y をずらす（鳥居の笠木の反りなど）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** 部品：色を塗って置く。o = { p, r（オイラー XYZ）, s, emit, uv（UV を残す） } */
export function part(geo, color, o = {}) {
  let g = geo;
  if (g.index) { g = geo.toNonIndexed(); geo.dispose(); }
  if (!o.uv) g.deleteAttribute('uv');
  if (o.p || o.r || o.s) {
    _p.set(...(o.p || [0, 0, 0]));
    _s.set(...(o.s || [1, 1, 1]));
    _q.setFromEuler(_e.set(...(o.r || [0, 0, 0]), o.order || 'XYZ'));
    g.applyMatrix4(_m.compose(_p, _q, _s));
  }
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const em = new Float32Array(n);
  _c.set(color);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    em[i] = o.emit || 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aEmit', new THREE.BufferAttribute(em, 1));
  return g;
}

/** 部品をまとめる。 */
export function merge(parts) {
  const keep = ['position', 'normal', 'color', 'aEmit'];
  for (const g of parts) for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** 形全体を動かす（まとめたあとでも使える）。 */
export function xform(g, { p, r, s, order } = {}) {
  _p.set(...(p || [0, 0, 0]));
  _s.set(...(s || [1, 1, 1]));
  _q.setFromEuler(_e.set(...(r || [0, 0, 0]), order || 'XYZ'));
  g.applyMatrix4(_m.compose(_p, _q, _s));
  return g;
}

/** 高さ y0→y1 で明るさを k0→k1 に（頂点の色に掛ける）。 */
export function shadeY(g, y0, y1, k0, k1) {
  const pos = g.attributes.position, col = g.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)));
    const k = k0 + (k1 - k0) * t;
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
  return g;
}

/** 頂点ごとに色を決める（fn(x, y, z, color) が color を書きかえる）。 */
export function paintFn(g, fn) {
  const pos = g.attributes.position, col = g.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    _c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), _c);
    col.setXYZ(i, _c.r, _c.g, _c.b);
  }
  col.needsUpdate = true;
  return g;
}

/** x に応じて y をずらす（インデックスのある形に使い、あとで法線を計算し直す）。 */
export function bendY(g, fn) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + fn(pos.getX(i), pos.getZ(i)));
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** 位置から決まるずらし（同じ位置の頂点は同じだけ動くので、インデックスなしでも割れない）。 */
export function jitter(g, amount, seed = 1, axes = [1, 1, 1]) {
  const pos = g.attributes.position;
  const h = (x, y, z, k) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 13.13 + k * 41.3) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  for (let i = 0; i < pos.count; i++) {
    const x = +pos.getX(i).toFixed(4), y = +pos.getY(i).toFixed(4), z = +pos.getZ(i).toFixed(4);
    pos.setXYZ(i, x + h(x, y, z, 0) * amount * axes[0], y + h(x, y, z, 1) * amount * axes[1], z + h(x, y, z, 2) * amount * axes[2]);
  }
  pos.needsUpdate = true;
  return g;
}

/** 平らに見える法線に（低ポリの岩などで）。 */
export function flat(g) {
  if (g.index) g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

/** 平行な 4 点の帯（板）を作る：p0..p3 は [x,y,z]。両面ではない。 */
export function quad(p0, p1, p2, p3) {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([...p0, ...p1, ...p2, ...p0, ...p2, ...p3]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** 行列を作る（InstancedMesh 用）。 */
export function mat4(out, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  return out.compose(_p, _q, _s);
}

export const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
