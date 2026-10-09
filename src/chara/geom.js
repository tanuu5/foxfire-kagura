// キャラクターの形を作る道具（単位はメートル）。
// どの形にも、色（頂点色）と「揺れの骨」（aBone：骨の番号、aT：根元 0 → 先 1）を付けて、群れごとに 1 つにまとめる
// （draw call を減らすため。揺れは deform.js がシェーダーで曲げる）。
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _v = new THREE.Vector3();

/** [[t, 値], …] をなめらかにつないで t の値を返す。 */
export function profile(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, v1] = pts[i];
    const [t0, v0] = pts[i - 1];
    if (t <= t1) {
      const u = (t - t0) / Math.max(1e-6, t1 - t0);
      return v0 + (v1 - v0) * u * u * (3 - 2 * u);
    }
  }
  return pts[pts.length - 1][1];
}

/** 色（頂点色）を塗る。fn(x, y, z) → 色 を渡せば場所で塗り分けられる。 */
export function paint(geo, color, fn = null) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) {
    if (fn) { const c = fn(pos.getX(i), pos.getY(i), pos.getZ(i)); if (c !== undefined && c !== null) _c.set(c); else _c.set(color); }
    arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** 揺れの骨を付ける。bone = 0 は揺れない。tFn(x, y, z) → 0〜1（根元からの割合）。 */
export function rig(geo, bone = 0, tFn = null) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const b = new Float32Array(n).fill(bone);
  const t = new Float32Array(n);
  if (tFn) for (let i = 0; i < n; i++) t[i] = Math.max(0, Math.min(1, tFn(pos.getX(i), pos.getY(i), pos.getZ(i), i)));
  geo.setAttribute('aBone', new THREE.BufferAttribute(b, 1));
  geo.setAttribute('aT', new THREE.BufferAttribute(t, 1));
  return geo;
}

/** まとめる前に、属性をそろえる（index なし・position/normal/color/aBone/aT だけ）。 */
export function prep(geo, color = 0xffffff, bone = 0, tFn = null) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'aBone', 'aT', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) paint(g, color);
  if (!g.attributes.aBone) rig(g, bone, tFn);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

/** いくつもの形を 1 つに。 */
export function merge(list) {
  const gs = list.filter(Boolean).map((g) => prep(g));
  if (!gs.length) return null;
  const m = mergeGeometries(gs, false);
  return m;
}

/** 楕円体。 */
export function ellipsoid(rx, ry, rz, w = 24, h = 16) {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return g;
}

/** 回転体：pts = [[半径, 高さ], …]（下から上）。 */
export function lathe(pts, seg = 24, phiStart = 0, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), seg, phiStart, phiLength);
}

/**
 * 曲線に沿った太さの変わる管（尻尾・腕・髪の房）。
 * pts：通る点（Vector3 の配列、Catmull-Rom でなめらかに）、radius(t) → 半径、flat：断面のつぶれ（1 = 丸、0.3 = 平たい）、
 * up：断面の向きを決める「上」の向き（平たい房の面の向き）、seg：長さ方向の分割、rad：断面の分割、
 * bulge(t, a)：断面の角度 a でのふくらみ（毛の房のぎざぎざなど）、cap：両端を閉じる。
 */
export function tube(pts, radius, { flat = 1, up = new THREE.Vector3(0, 0, 1), seg = 24, rad = 10, bulge = null, arch = 0, closeEnds = true } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const frames = [];
  const P = [], T = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    P.push(curve.getPointAt(t));
    T.push(curve.getTangentAt(t).normalize());
  }
  // 断面の向き：up を接線に直交させた N、横 B
  const verts = [], norms = [];
  const ring = (i) => {
    const t = i / seg;
    const tan = T[i];
    const N = up.clone().sub(tan.clone().multiplyScalar(up.dot(tan)));
    if (N.lengthSq() < 1e-8) N.set(1, 0, 0).sub(tan.clone().multiplyScalar(tan.x));
    N.normalize();
    const B = new THREE.Vector3().crossVectors(tan, N).normalize();
    const r = Math.max(0, radius(t));
    const out = [];
    for (let k = 0; k < rad; k++) {
      const a = (k / rad) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const bb = bulge ? bulge(t, a) : 1;
      // 平たい房：B の向きに広く、N の向きに薄く。arch で面を外へ反らせる
      const x = ca * r * bb, y = sa * r * flat * bb + arch * r * (1 - ca * ca);
      const p = P[i].clone().addScaledVector(B, x).addScaledVector(N, y);
      const n = B.clone().multiplyScalar(ca * flat).addScaledVector(N, sa).normalize();
      out.push([p, n]);
    }
    return out;
  };
  const rings = [];
  for (let i = 0; i <= seg; i++) rings.push(ring(i));
  const pos = [], nor = [];
  const tri = (a, b, c) => { for (const [p, n] of [a, b, c]) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); } };
  for (let i = 0; i < seg; i++) {
    for (let k = 0; k < rad; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % rad], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % rad];
      tri(a, c, b); tri(b, c, d);
    }
  }
  if (closeEnds) {
    for (const [i, dir] of [[0, -1], [seg, 1]]) {
      const cen = P[i];
      const n = T[i].clone().multiplyScalar(dir);
      const cv = [cen, n];
      for (let k = 0; k < rad; k++) {
        const a = rings[i][k], b = rings[i][(k + 1) % rad];
        const A = [a[0], n], Bv = [b[0], n];
        if (dir < 0) tri(cv, Bv, A); else tri(cv, A, Bv);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.userData.curve = curve;
  return g;
}

/** 根元から先へのパラメータ（tube の点の並びの距離）を返す関数を作る：一番近い曲線上の点の t。粗い近似。 */
export function tAlong(pts) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const N = 40;
  const S = [];
  for (let i = 0; i <= N; i++) S.push(curve.getPointAt(i / N));
  return (x, y, z) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i <= N; i++) {
      const d = _v.set(x, y, z).distanceToSquared(S[i]);
      if (d < bd) { bd = d; best = i; }
    }
    return best / N;
  };
}

/**
 * 開いた面（髪のかぶせ・袴など）に内側の面を足して、厚みのある殻にする。
 * 輪郭線（裏返した殻）は閉じた形でないと、開いた口から黒い内側が見えてしまうため。
 * inset(v) → 内側の点（v を書き換える）。
 */
export function shell(geo, inset) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const p = g.attributes.position, n = g.attributes.normal;
  const cnt = p.count;
  const pos = new Float32Array(cnt * 6), nor = new Float32Array(cnt * 6);
  pos.set(p.array, 0); nor.set(n.array, 0);
  for (let i = 0; i < cnt; i += 3) {
    // 内側：向きを逆に（頂点の順番を入れ替え、法線を反転）
    for (let k = 0; k < 3; k++) {
      const src = i + (k === 0 ? 0 : k === 1 ? 2 : 1);
      _v.set(p.getX(src), p.getY(src), p.getZ(src));
      inset(_v);
      const d = (cnt + i + k) * 3;
      pos[d] = _v.x; pos[d + 1] = _v.y; pos[d + 2] = _v.z;
      nor[d] = -n.getX(src); nor[d + 1] = -n.getY(src); nor[d + 2] = -n.getZ(src);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/** 頂点の位置を fn で動かす（形を整える）。法線は計算し直す。 */
export function warp(geo, fn) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    _v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    fn(_v, i);
    pos.setXYZ(i, _v.x, _v.y, _v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** 法線をなめらかに（同じ位置の頂点の法線をそろえる）。輪郭線の殻が割れないように。 */
export function smooth(geo) {
  const g = mergeVertices(geo.index ? geo.toNonIndexed() : geo, 1e-5);
  g.computeVertexNormals();
  return g;
}

export { mergeGeometries };
