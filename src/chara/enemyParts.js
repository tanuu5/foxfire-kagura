// 道中の敵（妖怪）のモデルを組み立てる道具。単位は「その敵の当たりの半径 r を 1」とした大きさ（モデル側で r 倍する）。
//
// 1 体を少ない draw call で描くため、形は部品ごとに作ってから 1 つにまとめる。
//   本体：Kit.add() で部品（three の形に置き方・色）を足し、done() で 1 つの形と輪郭線用の形（hull）にする。
//         色は頂点色（RGBA）。A は「光る強さ」の逆（1 - glow）で、bodyMaterial() が自分で光る色として足す。
//   輪郭線：toon.js の輪郭線の材質を hull に。hull は法線をなめらかにまとめた形なので、角で線が割れない。
//   顔：faceAtlas() で canvas に表情を 4 コマ（ふつう・まばたき・痛い・とくべつ）描き、
//       decalGeometry() で本体の正面に投影した曲がった板（シール）に貼る。照明を受けない（アニメの顔のように平らに見える）。
//   光：fxGeometry() の板（加算・いつもカメラを向く）。後ろの光・火の粉・人魂・きらめき・ふちの炎をシェーダーで動かす。
// 形とテクスチャはモジュールの中で使い回し、材質だけを 1 体ごとに作る（当たったときの白い点滅・表情・時間のため）。
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from './toon.js';

export const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t); };

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _n = new THREE.Vector3();
const _l = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _col = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

// ---------------------------------------------------------------- 色（sRGB の 16 進のまま混ぜる。絵の具に近い混ざり方）
export function mix(a, b, t) {
  const ch = (x, s) => (x >> s) & 255;
  const f = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (f(16) << 16) | (f(8) << 8) | f(0);
}
export const lighten = (c, t) => mix(c, 0xffffff, t);
export const darken = (c, t) => mix(c, 0x000000, t);
/** CSS の色（canvas 用）。a は不透明度。 */
export function css(hex, a = 1) {
  return `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;
}

// ---------------------------------------------------------------- 形の道具
/** 重なった点（同じ添字・面積 0）の三角形を捨てる（極の三角形など）。 */
function dropDegenerate(g) {
  const idx = g.index.array, p = g.attributes.position;
  const out = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (a === b || b === c || a === c) continue;
    _a.fromBufferAttribute(p, a); _b.fromBufferAttribute(p, b); _c.fromBufferAttribute(p, c);
    _b.sub(_a); _c.sub(_a);
    if (_b.cross(_c).lengthSq() < 1e-14) continue;
    out.push(a, b, c);
  }
  g.setIndex(out);
}

/** 閉じた形の面が外を向くようにそろえる（符号つきの体積で判定）。 */
export function orient(g) {
  const p = g.attributes.position, idx = g.index.array;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < p.count; i++) { cx += p.getX(i); cy += p.getY(i); cz += p.getZ(i); }
  _w.set(cx, cy, cz).multiplyScalar(1 / Math.max(1, p.count));
  let vol = 0;
  for (let i = 0; i < idx.length; i += 3) {
    _a.fromBufferAttribute(p, idx[i]).sub(_w);
    _b.fromBufferAttribute(p, idx[i + 1]).sub(_w);
    _c.fromBufferAttribute(p, idx[i + 2]).sub(_w);
    vol += _a.dot(_b.cross(_c));
  }
  if (vol < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.index.needsUpdate = true;
  }
  return g;
}

/** 非インデックスの形の三角形の向きを裏返す（鏡に映した部品用）。 */
function flip(g) {
  for (const k of ['position', 'normal']) {
    const a = g.attributes[k]?.array;
    if (!a) continue;
    for (let i = 0; i < a.length; i += 9) for (let j = 0; j < 3; j++) { const t = a[i + 3 + j]; a[i + 3 + j] = a[i + 6 + j]; a[i + 6 + j] = t; }
  }
}

function placeMatrix(o) {
  if (!o.at && !o.rot && o.scale == null) return null;
  _e.set(o.rot?.[0] || 0, o.rot?.[1] || 0, o.rot?.[2] || 0, o.order || 'XYZ');
  _q.setFromEuler(_e);
  const s = o.scale ?? 1;
  if (Array.isArray(s)) _s.set(s[0], s[1], s[2]); else _s.set(s, s, s);
  _p.set(o.at?.[0] || 0, o.at?.[1] || 0, o.at?.[2] || 0);
  return _m.compose(_p, _q, _s);
}

/**
 * 部品を 1 つ作る（非インデックス、position / normal ＋ color（RGBA））。
 * o：at [x,y,z]、rot [x,y,z]（オイラー）、scale（数か [x,y,z]）、deform(v)（置く前の形を曲げる）、
 *    color（16 進）、glow（光る 0〜1）、fn(p, n, l, out)（場所ごとに out.color / out.glow を決める。p は置いた後、l は置く前）、
 *    flat（三角形ごとに 1 色：模様の境目をくっきり）、smooth（false で元の法線のまま：角のある箱など）
 */
function build(src, o, colored) {
  let g = src.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.morphAttributes = {};
  g.clearGroups();
  const smooth = colored ? o.smooth !== false : true;   // 輪郭線の形はいつもなめらか（角で線が割れないように）
  if (smooth) { g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4); }
  if (o.deform) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); o.deform(_v); p.setXYZ(i, _v.x, _v.y, _v.z); }
  }
  if (g.index) dropDegenerate(g);
  if (smooth || o.deform || !g.attributes.normal) g.computeVertexNormals();
  if (g.index) g = g.toNonIndexed();
  const local = colored && o.fn ? g.attributes.position.array.slice() : null;
  const m = placeMatrix(o);
  if (m) { g.applyMatrix4(m); if (m.determinant() < 0) flip(g); }
  if (colored) paint(g, o, local);
  return g;
}

function paint(g, o, local) {
  const p = g.attributes.position, nr = g.attributes.normal, n = p.count;
  const arr = new Float32Array(n * 4);
  const out = { color: 0xffffff, glow: 0 };
  const step = o.flat ? 3 : 1;
  for (let i = 0; i < n; i += step) {
    out.color = o.color ?? 0xffffff;
    out.glow = o.glow ?? 0;
    if (o.fn) {
      if (step === 3) {
        _v.set(0, 0, 0); _n.set(0, 0, 0); _l.set(0, 0, 0);
        for (let j = 0; j < 3; j++) {
          _v.x += p.getX(i + j) / 3; _v.y += p.getY(i + j) / 3; _v.z += p.getZ(i + j) / 3;
          _n.x += nr.getX(i + j); _n.y += nr.getY(i + j); _n.z += nr.getZ(i + j);
          if (local) { _l.x += local[(i + j) * 3] / 3; _l.y += local[(i + j) * 3 + 1] / 3; _l.z += local[(i + j) * 3 + 2] / 3; }
        }
        if (_n.lengthSq() > 1e-12) _n.normalize();
        if (!local) _l.copy(_v);
      } else {
        _v.fromBufferAttribute(p, i);
        _n.fromBufferAttribute(nr, i);
        if (local) _l.fromArray(local, i * 3); else _l.copy(_v);
      }
      o.fn(_v, _n, _l, out);
    }
    _col.set(out.color);
    const ga = 1 - clamp01(out.glow);
    for (let j = 0; j < step; j++) {
      const k = (i + j) * 4;
      arr[k] = _col.r; arr[k + 1] = _col.g; arr[k + 2] = _col.b; arr[k + 3] = ga;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 4));
}

function mergeAll(list) {
  const g = mergeGeometries(list, false);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/**
 * 部品を集めて 1 つの形にする道具。
 *   const k = new Kit();
 *   k.add(new THREE.SphereGeometry(0.7, 14, 10), { color: 0xffffff, at: [0, 0.1, 0], hullGeo: new THREE.SphereGeometry(0.7, 10, 7) });
 *   const { geo, hull, face } = k.done();
 * add の o：build の説明に加えて hull（false で輪郭線を付けない）、hullGeo（輪郭線は粗い形で）、body（false で輪郭線だけ）、
 *           face（true なら顔のシールを投影する面にもする）
 */
export class Kit {
  constructor() { this.body = []; this.hull = []; this.face = []; }
  add(src, o = {}) {
    if (o.body !== false) this.body.push(build(src, o, true));
    if (o.hull !== false) this.hull.push(build(o.hullGeo || src, o, false));
    if (o.face) this.face.push(build(src, o, false));
    return this;
  }
  done() {
    return {
      geo: mergeAll(this.body),
      hull: this.hull.length ? mergeAll(this.hull) : null,
      face: this.face.length ? mergeAll(this.face) : null,
    };
  }
}

/** 輪切りを重ねた形。fn(t, a, out) で t（0〜1：長さの向き）・a（0〜2π：まわり）の点を out に入れる。両端を 1 点に絞れば閉じた形。 */
export function loft(rings, segs, fn) {
  const pos = new Float32Array((rings + 1) * (segs + 1) * 3);
  let k = 0;
  for (let i = 0; i <= rings; i++) {
    for (let j = 0; j <= segs; j++) {
      _v.set(0, 0, 0);
      fn(i / rings, (j / segs) * TAU, _v);
      pos[k++] = _v.x; pos[k++] = _v.y; pos[k++] = _v.z;
    }
  }
  const idx = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + segs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return orient(mergeVertices(g, 1e-5));
}

/** 回転体。pts = [[半径, 高さ], …]（下から上へ）。 */
export function lathe(pts, segs) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), segs);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return orient(mergeVertices(g, 1e-5));
}

/** [[t, 値], …] をなめらかにつないだ値。 */
export function curve(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, v1] = pts[i];
    if (t <= t1) {
      const [t0, v0] = pts[i - 1];
      const u = (t - t0) / Math.max(1e-6, t1 - t0);
      return v0 + (v1 - v0) * u * u * (3 - 2 * u);
    }
  }
  return pts[pts.length - 1][1];
}

// ---------------------------------------------------------------- 顔のシール
/**
 * 顔の板：(cx, cy) を中心に 1 辺 2·hs の正方形を、target（形）の正面に投影して曲げたもの。uv は正面からの平行投影。
 * surface(x, y) を渡せば投影の代わりにその z を使う。lift は面から浮かせる量（単位は r）。
 */
export function decalGeometry(target, { cx = 0, cy = 0, hs = 0.5, n = 5, lift = 0.03, surface = null } = {}) {
  const mesh = target ? new THREE.Mesh(target, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })) : null;
  const rc = new THREE.Raycaster();
  const N = n + 1;
  const zs = new Array(N * N).fill(null);
  const ns = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = cx + ((i / n) * 2 - 1) * hs, y = cy + ((j / n) * 2 - 1) * hs;
      const nn = new THREE.Vector3(0, 0, 1);
      if (surface) zs[j * N + i] = surface(x, y);
      else {
        rc.set(_v.set(x, y, 50), _w.set(0, 0, -1));
        const h = rc.intersectObject(mesh, false)[0];
        if (h) {
          zs[j * N + i] = h.point.z;
          if (h.face) { nn.copy(h.face.normal); if (nn.z < 0) nn.negate(); }
        }
      }
      ns.push(nn);
    }
  }
  // 形に当たらなかった点（シルエットの外）は、いちばん近い点の z を使う（そこは透明なので見えない）
  for (let k = 0; k < zs.length; k++) {
    if (zs[k] !== null) continue;
    let best = null, bd = Infinity;
    for (let m = 0; m < zs.length; m++) {
      if (zs[m] === null) continue;
      const d = ((k % N) - (m % N)) ** 2 + (Math.floor(k / N) - Math.floor(m / N)) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    zs[k] = best === null ? 0 : zs[best];
    if (best !== null) ns[k].copy(ns[best]);
  }
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const x = cx + ((i / n) * 2 - 1) * hs, y = cy + ((j / n) * 2 - 1) * hs;
      // 浮かせる向きは「面の法線」と「手前」の間（横へずれて絵がゆがまないように）
      _n.copy(ns[k]).add(_w.set(0, 0, 1)).normalize();
      pos.push(x + _n.x * lift, y + _n.y * lift, zs[k] + _n.z * lift);
      uv.push(i / n, j / n);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  mesh?.material.dispose();
  return g;
}

/**
 * 表情 4 コマのテクスチャ（2 × 2）。draw(ctx, frame) は 1 コマを [-1, 1] の座標（y は下向き）で描く。
 * 返す frames[i] は同じ画像を共有するテクスチャ（コマの位置だけ違う）。材質の map を差し替えて表情を変える。
 * コマの外側 1 割ほどは透明に残すこと（縮小したときに隣のコマがにじまないように）。
 */
export function faceAtlas(draw, size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * 2;
  const c = cv.getContext('2d');
  for (let f = 0; f < 4; f++) {
    c.save();
    const ox = (f % 2) * size, oy = (f >> 1) * size;
    c.beginPath(); c.rect(ox, oy, size, size); c.clip();
    c.translate(ox + size / 2, oy + size / 2);
    c.scale(size / 2, size / 2);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    draw(c, f);
    c.restore();
  }
  const base = new THREE.CanvasTexture(cv);
  base.colorSpace = THREE.SRGBColorSpace;
  base.anisotropy = 4;
  const frames = [0, 1, 2, 3].map((f) => {
    const t = base.clone();
    t.repeat.set(0.5, 0.5);
    t.offset.set((f % 2) * 0.5, f < 2 ? 0.5 : 0);
    return t;
  });
  return { canvas: cv, base, frames };
}

/** 顔の材質（照明を受けない。bright を 1 より大きくすると明るい色が光って見える）。1 体ごとに作る（表情を変えるため）。 */
export function faceMaterial(map, bright = 1) {
  const m = new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  m.color.setScalar(bright);
  m.name = 'enemy-face';
  return m;
}

// ---------------------------------------------------------------- 本体の材質
/**
 * 本体の材質：toon.js のトゥーン（陰 3 段＋ふちの光＋点滅）に、頂点色と「光る強さ」（頂点の A）を足したもの。
 * 1 体ごとに作る（点滅と光の強さを 1 体ずつ変えるため）。userData.glow.value で全体の光り方を変えられる。
 */
export function bodyMaterial({ rim = 0.5, rimColor = 0xfff2e0, glow = 1 } = {}) {
  const m = toon(0xffffff, { shared: false, rim, rimColor });
  m.vertexColors = true;
  m.name = 'enemy-body';
  m.userData.glow = { value: glow };
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base(sh, r);
    sh.uniforms.uGlow = m.userData.glow;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        #ifdef USE_COLOR_ALPHA
          totalEmissiveRadiance += vColor.rgb * clamp(1.0 - vColor.a, 0.0, 1.0) * max(uGlow, 0.0);
        #endif`);
  };
  m.customProgramCacheKey = () => 'toonRimEnemy';
  return m;
}

// ---------------------------------------------------------------- 光の板（加算）
/** 光の板の形（fragment で描く絵）。 */
export const FX = { glow: 0, flame: 1, sparkle: 2, dot: 3 };
/** 光の板の動き。halo：脈打つ（a 振れ幅・b 速さ・c ちらつき）、ember：昇って消える（a 高さ・b 速さ・c 横ゆれ）、
 *  wisp：まわりをゆらゆら（a 半径・b 速さ）、twinkle：ときどき光る（b 速さ）、rimFlame：中心から外を向いてゆらめく（a 上向きのかたより・b 速さ） */
export const FXM = { halo: 0, ember: 1, wisp: 2, twinkle: 3, rimFlame: 4 };

/**
 * 光の板をまとめた形。list = [{ at, size, type, mode, phase, a, b, c, hot（芯の色の混ざり 0〜1）, alpha, stretch（縦の伸び）, spin（uSpin で回す） }]
 * 位置は単位（r = 1）。板の大きさも同じ単位（半分の幅）。
 */
export function fxGeometry(list) {
  const n = list.length;
  const P = new Float32Array(n * 12), C = new Float32Array(n * 8);
  const A = new Float32Array(n * 16), B = new Float32Array(n * 16), D = new Float32Array(n * 16);
  const idx = new Uint16Array(n * 6);
  const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
  let R = 0;
  list.forEach((s, i) => {
    const at = s.at || [0, 0, 0];
    const size = s.size ?? 1, st = s.stretch ?? 1;
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      P[v * 3] = at[0]; P[v * 3 + 1] = at[1]; P[v * 3 + 2] = at[2];
      C[v * 2] = corners[k * 2]; C[v * 2 + 1] = corners[k * 2 + 1];
      A[v * 4] = size; A[v * 4 + 1] = s.type ?? 0; A[v * 4 + 2] = s.phase ?? 0; A[v * 4 + 3] = s.mode ?? 0;
      B[v * 4] = s.a ?? 0; B[v * 4 + 1] = s.b ?? 0; B[v * 4 + 2] = s.c ?? 0; B[v * 4 + 3] = s.hot ?? 0;
      D[v * 4] = s.alpha ?? 1; D[v * 4 + 1] = st; D[v * 4 + 2] = s.spin ? 1 : 0;
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    R = Math.max(R, Math.hypot(at[0], at[1], at[2]) + size * st * 1.6 + Math.abs(s.a ?? 0) * 1.5);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('corner', new THREE.BufferAttribute(C, 2));
  g.setAttribute('fxA', new THREE.BufferAttribute(A, 4));
  g.setAttribute('fxB', new THREE.BufferAttribute(B, 4));
  g.setAttribute('fxC', new THREE.BufferAttribute(D, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R);
  return g;
}

const FX_VS = /* glsl */ `
  attribute vec2 corner;
  attribute vec4 fxA;   // 大きさ, 形, 位相, 動き
  attribute vec4 fxB;   // a, b, c, 芯の色
  attribute vec4 fxC;   // 濃さ, 縦の伸び
  uniform float uTime;
  uniform float uLean;
  uniform float uSpin;
  varying vec2 vP;
  varying float vType;
  varying float vAlpha;
  varying float vHot;
  void main() {
    float size = fxA.x;
    float ph = fxA.z;
    float mode = fxA.w;
    float t = uTime;
    vec3 c = position;
    float alpha = fxC.x;
    float rot = 0.0;
    vec2 st = vec2(1.0, max(fxC.y, 0.05));
    if (fxC.z > 0.5) {                    // 回るもの（車輪のふち）：物体の中心のまわりに uSpin だけ回す
      float cs = cos(uSpin), sn = sin(uSpin);
      c.xy = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y);
    }
    if (mode < 0.5) {                     // 後ろの光：ゆっくり脈打つ
      size *= 1.0 + fxB.x * sin(t * fxB.y + ph * 6.2832);
      alpha *= 1.0 - fxB.z * (0.5 + 0.5 * sin(t * 17.0 + ph * 31.0));
    } else if (mode < 1.5) {              // 火の粉：昇って消える
      float k = fract(t * fxB.y + ph);
      c.y += k * fxB.x;
      c.x += sin(t * 2.7 + ph * 17.0) * fxB.z * k;
      alpha *= smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.45, 1.0, k));
      size *= 1.0 - 0.55 * k;
    } else if (mode < 2.5) {              // 人魂：まわりをゆらゆら
      float ang = t * fxB.y + ph * 6.2832;
      c.x += cos(ang) * fxB.x;
      c.y += sin(ang * 1.7) * fxB.x * 0.6;
      size *= 1.0 + 0.12 * sin(t * 11.0 + ph * 29.0);
      st.y *= 1.0 + 0.15 * sin(t * 13.0 + ph * 7.0);
      rot = -uLean * 0.5 - cos(ang) * 0.25;
    } else if (mode < 3.5) {              // きらめき
      float s = sin(t * fxB.y + ph * 6.2832);
      float k = pow(max(s, 0.0), 4.0);
      alpha *= k;
      size *= 0.35 + 0.65 * k;
      rot = t * 0.7 + ph * 6.2832;
    } else {                              // ふちの炎：ゆらめく
      float f = 0.5 * sin(t * fxB.y + ph * 40.0) + 0.5 * sin(t * fxB.y * 1.83 + ph * 13.0);
      size *= 1.0 + 0.16 * f;
      st.y *= 1.0 + 0.25 * f;
    }
    vec4 mv = modelViewMatrix * vec4(c, 1.0);
    float sc = max(length(modelViewMatrix[0].xyz), 1e-6);   // 物体の大きさ（r 倍）
    if (mode > 3.5) {
      // 物体の中心から外へ向ける（＋ a だけ上へかたよせる）
      vec4 o = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vec2 d = mv.xy - o.xy;
      float dl = length(d);
      d = dl > 1e-4 ? d / dl : vec2(0.0, 1.0);
      d += vec2(-uLean * 0.6, fxB.x);
      if (dot(d, d) < 1e-8) d = vec2(0.0, 1.0);     // atan(0, 0) をさける
      rot = atan(d.y, d.x) - 1.5708;
    }
    vec2 q = corner * st;
    float cr = cos(rot), sr = sin(rot);
    q = vec2(cr * q.x - sr * q.y, sr * q.x + cr * q.y);
    mv.xy += q * size * sc;
    gl_Position = projectionMatrix * mv;
    vP = corner;
    vType = fxA.y;
    vAlpha = alpha;
    vHot = fxB.w;
  }`;

const FX_FS = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uIntensity;
  varying vec2 vP;
  varying float vType;
  varying float vAlpha;
  varying float vHot;
  void main() {
    vec2 p = vP;
    float r = length(p);
    float a = 0.0;
    float hot = 0.0;
    if (vType < 0.5) {                    // まるい光
      a = pow(max(1.0 - r, 0.0), 2.0);
      hot = pow(max(1.0 - r * 1.8, 0.0), 2.0);
    } else if (vType < 1.5) {             // 炎（下が丸く、上がとがる）
      float y = p.y;
      float w = 0.62 * sqrt(max(0.0, (1.0 - y) / 1.35));
      float d = y < -0.35 ? length(vec2(p.x, y + 0.35)) / 0.62 : abs(p.x) / max(w, 1e-3);
      a = (1.0 - smoothstep(0.45, 1.0, d)) * (1.0 - smoothstep(0.7, 1.0, y));
      hot = (1.0 - smoothstep(0.0, 0.75, d)) * (1.0 - smoothstep(-0.3, 0.55, y));
    } else if (vType < 2.5) {             // きらめき（4 本の光）
      float cx = exp(-abs(p.x) * 16.0) * max(1.0 - abs(p.y), 0.0);
      float cy = exp(-abs(p.y) * 16.0) * max(1.0 - abs(p.x), 0.0);
      a = clamp(cx + cy + pow(max(1.0 - r * 3.0, 0.0), 2.0), 0.0, 1.0);
      hot = pow(max(1.0 - r * 2.2, 0.0), 2.0);
    } else {                              // 点
      a = pow(max(1.0 - r, 0.0), 1.5);
      hot = pow(max(1.0 - r * 1.6, 0.0), 2.0);
    }
    hot = clamp(hot + vHot, 0.0, 1.0);
    vec3 col = mix(uColor, uHot, hot) * (a * max(vAlpha, 0.0) * uIntensity);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** 光の板の材質（加算）。1 体ごとに作る（uTime・uLean を 1 体ずつ進めるため）。 */
export function fxMaterial({ color = 0xffffff, hot = 0xffffff, intensity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    name: 'enemy-fx',
    uniforms: {
      uTime: { value: 0 },
      uLean: { value: 0 },
      uSpin: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uHot: { value: new THREE.Color(hot) },
      uIntensity: { value: intensity },
    },
    vertexShader: FX_VS,
    fragmentShader: FX_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ---------------------------------------------------------------- 顔を描く道具（canvas、座標は [-1, 1]、y は下向き）
export const draw = {
  ellipse(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(rx, 1e-4), Math.max(ry, 1e-4), rot, 0, TAU); },
  fillEllipse(c, x, y, rx, ry, color, rot = 0) { draw.ellipse(c, x, y, rx, ry, rot); c.fillStyle = color; c.fill(); },
  line(c, pts, w, color) {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.lineWidth = w; c.strokeStyle = color; c.stroke();
  },
  /** 2 次ベジェの線（x0,y0 → 制御点 → x1,y1）。 */
  curve(c, x0, y0, cx, cy, x1, y1, w, color) {
    c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1);
    c.lineWidth = w; c.strokeStyle = color; c.stroke();
  },
  poly(c, pts, color) {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath(); c.fillStyle = color; c.fill();
  },
  /** ほお（ぼかした楕円）。 */
  blush(c, x, y, rx, ry, color = 0xff7aa0, a = 0.55) {
    c.save();
    c.translate(x, y); c.scale(rx, ry);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, css(color, a)); g.addColorStop(0.6, css(color, a * 0.7)); g.addColorStop(1, css(color, 0));
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill();
    c.restore();
  },
  /** アニメの目（縦長の楕円＋下の色＋ハイライト 2 つ）。 */
  eye(c, x, y, rx, ry, { dark = 0x1c1a33, iris = 0x4a5bd0, hl = 0xffffff, look = 0, ring = null } = {}) {
    if (ring != null) draw.fillEllipse(c, x, y, rx * 1.18, ry * 1.12, css(ring));
    draw.fillEllipse(c, x, y, rx, ry, css(dark));
    c.save();
    draw.ellipse(c, x, y, rx, ry); c.clip();
    const g = c.createLinearGradient(0, y - ry * 0.1, 0, y + ry);
    g.addColorStop(0, css(iris, 0)); g.addColorStop(1, css(iris, 0.95));
    c.fillStyle = g; c.fillRect(x - rx, y - ry, rx * 2, ry * 2);
    c.restore();
    draw.fillEllipse(c, x - rx * 0.32 + look * rx * 0.3, y - ry * 0.4, rx * 0.42, ry * 0.3, css(hl), -0.4);
    draw.fillEllipse(c, x + rx * 0.35 + look * rx * 0.2, y + ry * 0.42, rx * 0.2, ry * 0.13, css(hl, 0.9));
  },
  /** 閉じた目（にっこり ‿ なら smile = 1、への字 ⌒ なら -1）。 */
  closed(c, x, y, w, smile = 1, lw = 0.07, color = 0x1c1a33) {
    draw.curve(c, x - w, y - smile * w * 0.2, x, y + smile * w * 0.75, x + w, y - smile * w * 0.2, lw, css(color));
  },
  /** ぎゅっとつむった目（> と <）。dir = 1 なら「>」、-1 なら「<」。 */
  squeeze(c, x, y, w, dir, lw = 0.07, color = 0x1c1a33) {
    draw.line(c, [[x - w * dir, y - w * 0.8], [x + w * dir * 0.9, y], [x - w * dir, y + w * 0.8]], lw, css(color));
  },
  /** ねこの口「ω」。 */
  catMouth(c, x, y, w, lw, color) {
    c.beginPath();
    c.moveTo(x - w, y - w * 0.35);
    c.quadraticCurveTo(x - w * 0.5, y + w * 0.75, x, y);
    c.quadraticCurveTo(x + w * 0.5, y + w * 0.75, x + w, y - w * 0.35);
    c.lineWidth = lw; c.strokeStyle = css(color); c.stroke();
  },
};
