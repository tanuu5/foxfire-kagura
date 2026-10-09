// ※ このファイルと、4 人のキャラクター（いなほ・ぽこ・すず・つくよ）のデザインは MIT License の対象外です（LICENSE の「例外」を参照）。
//   The code in this file and the characters' designs are not covered by the MIT License (see the exception in LICENSE).
// ケモ耳の女の子の 3D モデル（4 人で共通の作り）。仕様（specs.js）で髪・耳・しっぽ・服・持ち物を切り替える。
// 単位はメートル（身長およそ 1.4 m、耳を入れて 1.5 m）。足もとが y = 0、正面が +Z。キャラの右手が -X。
//
// 部品は「群れ」（腰・胸・頭・左右の腕）ごとに 1 つのジオメトリにまとめ、色は頂点色、揺れは骨（deform.js）で曲げる。
// 1 体あたりの draw call はおよそ 11（輪郭線を含む）。
//
//   const g = new GirlModel(SPECS.inaho);
//   scene.add(g.root);
//   g.setPose('fly');  g.setFace({ eyes: 'happy', mouth: 'open' });
//   g.update(dt, { vx, vy })      // 毎フレーム（速さで髪・しっぽ・袖がなびく）
import * as THREE from 'three';
import { paint, rig, prep, merge, ellipsoid, lathe, tube, warp, tAlong, profile, shell } from './geom.js';
import { makeBones, charMaterial, charOutline } from './deform.js';
import { FaceTexture, FACE } from './face.js';

// 骨の番号（意味を固定する）
export const BONE = { hairBack: 1, sideL: 2, sideR: 3, ahoge: 4, tail1: 5, tail2: 6, sleeveL: 7, sleeveR: 8, skirt: 9, earL: 10, earR: 11, ribbon: 12, bow: 13, sash: 14, legs: 15 };

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 体の寸法（m）
const D = {
  hipY: 0.62,       // 腰の群れの中心
  waistY: 0.72,     // 胸の群れの付け根（腰から上が曲がる）
  shoulderY: 0.95,
  shoulderX: 0.118,
  neckY: 1.02,
  headY: 1.162,     // 頭の中心（あごが襟のすぐ上に来る高さ。上げると首が長く見える）
};

/** 上下左右に丸い箱（超楕円体）。n が大きいほど四角い。 */
function superEllipsoid(rx, ry, rz, n = 3, w = 20, h = 16) {
  const g = new THREE.SphereGeometry(1, w, h);
  const e = 2 / n;
  return warp(g, (v) => {
    const f = (a) => Math.sign(a) * Math.pow(Math.abs(a), e);
    v.set(f(v.x) * rx, f(v.y) * ry, f(v.z) * rz);
  });
}

/** 頭（あごが細い楕円体）。頭の中心が原点。 */
function headGeometry() {
  const g = new THREE.SphereGeometry(1, 40, 30);
  return warp(g, (v) => {
    const ux = v.x, uy = v.y, uz = v.z;
    let x = ux * 0.128, y = uy * 0.148, z = uz * 0.135;
    if (uy < 0) {
      const k = -uy;
      const front = Math.max(0, uz);
      x *= 1 - 0.42 * Math.pow(k, 1.5) * (0.55 + 0.45 * front);
      z *= 1 - 0.22 * k * k * (1 - front);
      y *= 1 - 0.08 * k;
      z += 0.014 * k * front * front; // あごを少し前へ
    }
    if (uz > 0.35) z -= 0.01 * (uz - 0.35); // 顔の前を少し平らに
    v.set(x, y, z);
  });
}

/** 顔のデカール：頭の前の面だけを少し外に出し、正面からの投影で UV を付ける。 */
function faceGeometry(head) {
  const src = head.index ? head.toNonIndexed() : head.clone();
  const p = src.attributes.position;
  const pos = [], uv = [], nor = [];
  const n = src.attributes.normal;
  for (let i = 0; i < p.count; i += 3) {
    let ok = true;
    for (let k = 0; k < 3; k++) if (p.getZ(i + k) < 0.03 || p.getY(i + k) > 0.11 || p.getY(i + k) < -0.16) ok = false;
    if (!ok) continue;
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      pos.push(x * 1.006, y * 1.006, z * 1.006 + 0.0006);
      nor.push(n.getX(i + k), n.getY(i + k), n.getZ(i + k));
      uv.push(0.5 + x / (FACE.half * 2), 0.5 + (y - FACE.cy) / (FACE.half * 2));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** 髪の房（平たい先細りの管）。pts は頭のローカル。width(t) は幅、根元から先へ aT を振る。 */
function strand(pts, width, { thick = 0.32, bone = 0, color, tip, seg = 18, up, arch = 0.25, tRange = [0, 1] } = {}) {
  const ups = up || V(0, 0, 1);
  const g = tube(pts, width, { flat: thick, up: ups, seg, rad: 8, arch });
  const along = tAlong(pts);
  prep(g);
  if (color) paint(g, color, tip ? (x, y, z) => mixColor(color, tip, Math.pow(along(x, y, z), 1.6)) : null);
  rig(g, bone, (x, y, z) => tRange[0] + (tRange[1] - tRange[0]) * along(x, y, z));
  return g;
}

const _ca = new THREE.Color(), _cb = new THREE.Color();
function mixColor(a, b, t) { return '#' + _ca.set(a).lerp(_cb.set(b), Math.max(0, Math.min(1, t))).getHexString(); }

/** 頭の上の髪のかぶせ（前は生え際、横はこめかみ、後ろはうなじまで）。 */
function hairCap(spec) {
  const H = spec.hair;
  const g = new THREE.BufferGeometry();
  const W = 48, R = 22;
  const pos = [];
  const pt = (phi, t) => {
    // phi = 0 が正面（+Z）。下の縁の角度：前 0.36π、横 0.56π、後ろ 0.74π
    const back = (1 - Math.cos(phi)) / 2;
    const side = Math.abs(Math.sin(phi));
    const tmax = Math.PI * (0.36 + 0.2 * side * (1 - back) + 0.38 * back * (H.capBack ?? 1));
    const th = t * tmax;
    const r = 1.075 + 0.02 * Math.sin(phi * 3) * t;
    const x = Math.sin(th) * Math.sin(phi) * 0.128 * r;
    const y = Math.cos(th) * 0.148 * r + 0.006;
    const z = Math.sin(th) * Math.cos(phi) * 0.135 * r;
    return [x, y, z];
  };
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < R; j++) {
      const a0 = (i / W) * Math.PI * 2, a1 = ((i + 1) / W) * Math.PI * 2;
      const t0 = j / R, t1 = (j + 1) / R;
      const p00 = pt(a0, t0), p10 = pt(a1, t0), p01 = pt(a0, t1), p11 = pt(a1, t1);
      pos.push(...p00, ...p01, ...p10, ...p10, ...p01, ...p11);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const c = shell(g, (v) => v.multiplyScalar(0.965));
  prep(c);
  // 根元は少し濃く、天使の輪（明るい帯）を入れる。
  // 輪は毛先の色寄りにし（白を混ぜると暗い髪で灰色のまだらになる）、上下と横の境目はぼかす
  const ring = H.ring || mixColor(H.color, H.tip || '#ffffff', 0.55);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  paint(c, H.color, (x, y, z) => {
    const base = mixColor(H.root || H.color, H.color, (0.15 - y) * 4);
    const w = clamp01(1 - Math.abs(y - 0.088) / 0.02) * clamp01((z + 0.01) / 0.07);
    return w > 0 ? mixColor(base, ring, w * 0.85) : base;
  });
  return c;
}

/** 前髪・横髪・後ろ髪・アホ毛。 */
function hairStrands(spec) {
  const H = spec.hair;
  const out = [];
  const col = H.color, tip = H.tip || H.color;
  // 前髪：頭の上から額へ流れ、眉〜目の上で毛先がとがる。長さに変化をつけ、毛先は少し内側へ
  const nb = H.bangs?.n ?? 7;
  const baseLen = H.bangs?.len ?? 0.11;
  const LEN = [0.9, 1.06, 0.82, 1.1, 0.86, 1.04, 0.92, 1.08, 0.84, 1.0, 0.95];
  for (let i = 0; i < nb; i++) {
    const u = (i / (nb - 1)) * 2 - 1; // -1〜1
    const a = u * 1.0;
    const sx = Math.sin(a), cz = Math.cos(a);
    const len = baseLen * LEN[i % LEN.length] * (1 - 0.12 * Math.abs(u));
    const inward = (H.bangs?.part ? Math.sign(u) * 0.012 : -u * 0.008);
    const p0 = V(sx * 0.07, 0.155, cz * 0.07 + 0.02);
    const p1 = V(sx * 0.12, 0.118, cz * 0.13);
    const ym = 0.11 - len * 0.5, ye = 0.11 - len;
    const p2 = V(sx * 0.136 + inward * 0.4, ym, cz * 0.148);
    const p3 = V(sx * 0.13 + inward, ye, cz * 0.146 + 0.006);
    const w = (H.bangs?.w ?? 0.026) * (1 - 0.15 * Math.abs(u));
    out.push(strand([p0, p1, p2, p3], (t) => w * (t < 0.55 ? 1 : 1 - Math.pow((t - 0.55) / 0.45, 1.4)) + 0.0008, { color: col, tip, up: V(sx, 0.35, cz).normalize(), thick: 0.28, arch: 0.45, seg: 20 }));
  }
  // 細い房を間に（毛先の変化）
  for (const u of H.bangs?.thin ?? [-0.55, 0.15, 0.62]) {
    const a = u, sx = Math.sin(a), cz = Math.cos(a);
    const len = baseLen * 1.08;
    const pts = [V(sx * 0.08, 0.15, cz * 0.08 + 0.02), V(sx * 0.125, 0.112, cz * 0.14), V(sx * 0.138, 0.11 - len * 0.55, cz * 0.15), V(sx * 0.132 - u * 0.01, 0.11 - len, cz * 0.15)];
    out.push(strand(pts, (t) => 0.011 * (1 - Math.pow(t, 1.5)) + 0.0006, { color: col, tip, up: V(sx, 0.35, cz).normalize(), thick: 0.3, arch: 0.3, seg: 16 }));
  }
  // 横髪（顔の両わき）
  if (H.side !== false) {
    for (const s of [-1, 1]) {
      const len = H.sideLen ?? 0.26;
      const bone = s > 0 ? BONE.sideL : BONE.sideR;
      const p = [V(s * 0.118, 0.07, 0.06), V(s * 0.14, -0.02, 0.07), V(s * 0.142, -0.02 - len * 0.5, 0.06), V(s * 0.13, -0.02 - len, 0.05)];
      out.push(strand(p, (t) => (H.sideW ?? 0.03) * (1 - Math.pow(t, 2.5)) + 0.002, { color: col, tip, bone, up: V(s, 0, 0.6).normalize(), thick: 0.35, arch: 0.3 }));
      // その後ろにもう 1 房
      const p2 = [V(s * 0.126, 0.04, -0.01), V(s * 0.15, -0.05, 0.0), V(s * 0.148, -0.05 - len * 0.45, -0.01), V(s * 0.135, -0.04 - len * 0.85, -0.02)];
      out.push(strand(p2, (t) => 0.034 * (1 - Math.pow(t, 2.5)) + 0.002, { color: col, tip, bone, up: V(s, 0, 0.2).normalize(), thick: 0.35, arch: 0.3 }));
    }
  }
  // 後ろ髪
  const back = H.back || 'long';
  if (back !== 'none') {
    const len = back === 'short' ? 0.16 : back === 'mid' ? 0.36 : H.backLen ?? 0.62;
    const n = back === 'short' ? 9 : 11;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1;
      const a = Math.PI + u * 1.25;                 // 後ろの弧
      const sx = Math.sin(a), cz = Math.cos(a);
      const p0 = V(sx * 0.125, 0.06, cz * 0.13);
      const p1 = V(sx * 0.15, -0.06, cz * 0.155);
      const tie = H.tie;                             // 結ぶ位置（後ろ髪が集まる）
      let pts;
      if (tie && back === 'long') {
        const ty = -0.06 - len * 0.55;
        const p2 = V(sx * 0.06, ty, -0.17 + (1 - Math.abs(u)) * 0.01);
        const p3 = V(sx * 0.07 + u * 0.01, -0.06 - len * 0.82, -0.17);
        const p4 = V(sx * 0.05 + u * 0.03, -0.06 - len, -0.15);
        pts = [p0, p1, p2, p3, p4];
      } else {
        const spread = back === 'short' ? 1.05 : 1.12;
        const p2 = V(sx * 0.15 * spread, -0.06 - len * 0.55, cz * 0.15 * spread);
        const p3 = V(sx * 0.13 * spread, -0.06 - len, cz * 0.13 * spread + (back === 'short' ? 0.0 : -0.01));
        pts = [p0, p1, p2, p3];
      }
      const w = (H.backW ?? 0.05) * (1 - 0.25 * Math.abs(u));
      const wfn = tie && back === 'long'
        ? (t) => w * (t < 0.5 ? 1 - t * 0.9 : 0.55 + (t - 0.5) * 0.7) * (1 - Math.pow(t, 6)) + 0.002
        : (t) => w * (1 - Math.pow(t, 2.6)) + 0.002;
      out.push(strand(pts, wfn, { color: col, tip, bone: BONE.hairBack, up: V(sx, 0, cz).normalize(), thick: 0.32, arch: 0.25, seg: 22 }));
    }
    // 姫カット（つくよ）：横の髪を顎の高さでそろえる
    if (H.hime) {
      for (const s of [-1, 1]) {
        const p = [V(s * 0.12, 0.05, 0.04), V(s * 0.148, -0.03, 0.05), V(s * 0.15, -0.1, 0.045)];
        out.push(strand(p, (t) => 0.036 * (1 - Math.pow(t, 8)) + 0.004, { color: col, tip: col, bone: 0, up: V(s, 0, 0.4).normalize(), thick: 0.45, arch: 0.2 }));
      }
    }
  }
  // アホ毛
  if (H.ahoge) {
    const p = [V(0.0, 0.158, 0.02), V(0.02, 0.21, 0.03), V(0.045, 0.23, 0.0), V(0.04, 0.205, -0.03)];
    out.push(strand(p, (t) => 0.012 * (1 - Math.pow(t, 1.6)) + 0.001, { color: col, tip, bone: BONE.ahoge, up: V(1, 0, 0), thick: 0.4, arch: 0 }));
  }
  return out;
}

/** 結び目のリボン（後ろ髪）。 */
function hairTie(spec) {
  const H = spec.hair;
  if (!H.tie || (H.back || 'long') !== 'long') return [];
  const len = H.backLen ?? 0.62;
  const y = -0.06 - len * 0.55, z = -0.175;
  const out = [];
  const [c1, c2] = H.tie;
  // 結び目の帯
  const band = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 14, 1, true);
  band.rotateX(0.08);
  band.translate(0, y, z);
  out.push(rig(paint(prep(band), c1), BONE.hairBack, () => 0.55));
  // 輪（左右）と垂れ
  for (const s of [-1, 1]) {
    const loop = tube([V(0, y, z - 0.01), V(s * 0.05, y + 0.03, z - 0.02), V(s * 0.075, y + 0.0, z - 0.02), V(s * 0.04, y - 0.02, z - 0.015), V(0, y, z - 0.01)], () => 0.012, { flat: 0.35, up: V(0, 0, 1), seg: 16, rad: 6 });
    out.push(rig(paint(prep(loop), s < 0 ? c1 : c2), BONE.hairBack, () => 0.55));
    const tail = tube([V(s * 0.01, y - 0.01, z - 0.012), V(s * 0.03, y - 0.06, z - 0.02), V(s * 0.035, y - 0.11, z - 0.01)], (t) => 0.011 * (1 - t * 0.4), { flat: 0.3, up: V(0, 0, 1), seg: 10, rad: 6 });
    out.push(rig(paint(prep(tail), s < 0 ? c2 : c1), BONE.hairBack, () => 0.62));
  }
  return out;
}

/** ケモ耳。type：fox / tanuki / cat / rabbit。頭のローカル。 */
function ears(spec) {
  const E = spec.ears;
  const out = [];
  for (const s of [-1, 1]) {
    const bone = s > 0 ? BONE.earL : BONE.earR;
    let outer, inner, base;
    if (E.type === 'rabbit') {
      // 長い耳（片方は先が折れる）
      base = V(s * 0.055, 0.135, -0.01);
      const bend = (E.flop && s > 0) ? 1 : 0;
      const pts = [base, base.clone().add(V(s * 0.02, 0.12, -0.01)), base.clone().add(V(s * 0.045, 0.24, -0.02)), base.clone().add(V(s * (0.06 + bend * 0.07), 0.3 - bend * 0.03, -0.03 + bend * 0.02))];
      outer = tube(pts, (t) => 0.034 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) + 0.004, { flat: 0.42, up: V(0, 0, 1), seg: 16, rad: 12 });
      const pin = pts.map((p) => p.clone().add(V(0, 0.005, 0.012)));
      inner = tube(pin, (t) => 0.021 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.9)) + 0.002, { flat: 0.3, up: V(0, 0, 1), seg: 14, rad: 8 });
    } else {
      const tall = E.type === 'fox' ? 0.165 : E.type === 'cat' ? 0.11 : 0.085;
      const wide = E.type === 'fox' ? 0.066 : E.type === 'cat' ? 0.054 : 0.06;
      base = E.type === 'tanuki' ? V(s * 0.092, 0.13, -0.01) : V(s * 0.085, 0.125, -0.005);
      const tilt = (E.type === 'tanuki' ? 0.55 : E.type === 'cat' ? 0.38 : 0.3) * s;
      // 根元は頭の中まで sink だけ埋める（頭の丸みで付け根の下に隙間ができ、耳が浮いて見えないように）
      const sink = 0.04;
      const mk = (w, h, d) => {
        const g = new THREE.ConeGeometry(1, 1, 18, 8, true);
        g.translate(0, 0.5, 0);
        warp(g, (v) => {
          const a = Math.atan2(v.z, v.x);
          const y = -sink + v.y * (h + sink);
          const t = Math.max(0, y / h); // 頭の表面から先へ 0〜1
          // 根元は丸く、先はとがる（たぬきは丸い耳）
          const rr = E.type === 'tanuki' ? Math.sqrt(Math.max(0, 1 - t * t)) * 1.05 : 1;
          const f = (1 - t) * rr;
          v.set(Math.cos(a) * w * f, y, Math.sin(a) * d * f - 0.01 * t * t); // 先を少し後ろへ
        });
        return g;
      };
      outer = mk(wide, tall, wide * 0.5);
      inner = mk(wide * 0.68, tall * 0.8, wide * 0.18);
      inner.translate(0, 0.006, wide * 0.3);
      for (const g of [outer, inner]) { g.rotateZ(-tilt); g.rotateX(-0.12); g.translate(base.x, base.y, base.z); }
    }
    prep(outer);
    prep(inner);
    // 外側の色：先が暗い（狐の黒い耳先など）
    const tipY = base.y + (E.type === 'rabbit' ? 0.25 : E.type === 'fox' ? 0.1 : 0.06);
    paint(outer, E.color, E.tip ? (x, y) => (y > tipY ? E.tip : E.color) : null);
    paint(inner, E.inner);
    const tf = (x, y) => Math.max(0, (y - base.y) / (E.type === 'rabbit' ? 0.3 : 0.12));
    rig(outer, bone, tf);
    rig(inner, bone, tf);
    out.push(outer, inner);
  }
  return out;
}

/** しっぽ。腰のローカル（腰の中心が原点）。 */
function tails(spec) {
  const T = spec.tail;
  const out = [];
  const one = (bone, side, k = 1) => {
    let pts, rad, bulge;
    const type = T.type === 'cat2' ? 'cat' : T.type;
    if (type === 'fox') {
      pts = [V(0, 0.02, -0.07), V(side * 0.02, -0.04, -0.17), V(side * 0.05, -0.12, -0.3), V(side * 0.07, -0.13, -0.44), V(side * 0.06, -0.05, -0.55)];
      rad = (t) => profile([[0, 0.025], [0.2, 0.075], [0.55, 0.115], [0.8, 0.09], [0.95, 0.04], [1, 0.004]], t);
      bulge = (t, a) => 1 + 0.07 * Math.sin(a * 7 + t * 18) * Math.min(1, t * 3);
    } else if (type === 'tanuki') {
      pts = [V(0, 0.0, -0.07), V(0.04, -0.06, -0.16), V(0.13, -0.12, -0.24), V(0.22, -0.1, -0.28), V(0.28, -0.02, -0.26)];
      rad = (t) => profile([[0, 0.032], [0.22, 0.095], [0.6, 0.125], [0.88, 0.1], [1, 0.012]], t);
      bulge = (t, a) => 1 + 0.06 * Math.sin(a * 6 + t * 14) * Math.min(1, t * 3);
    } else if (type === 'cat') {
      // 細長く、先が上に巻く（2 本）
      pts = [V(0, 0.01, -0.07), V(side * 0.06, -0.03, -0.15), V(side * 0.16, 0.0, -0.2), V(side * 0.24, 0.12, -0.2), V(side * 0.25, 0.27, -0.17), V(side * 0.2, 0.35, -0.13)];
      rad = (t) => profile([[0, 0.018], [0.15, 0.022], [0.85, 0.02], [1, 0.006]], t) * k;
      bulge = null;
    } else {
      // うさぎ：丸いぽんぽん
      const g = new THREE.IcosahedronGeometry(0.055, 2);
      warp(g, (v) => { const n = v.clone().normalize(); v.multiplyScalar(1 + 0.12 * Math.sin(n.x * 9) * Math.sin(n.y * 7) * Math.sin(n.z * 8)); });
      g.translate(0, 0.0, -0.1);
      prep(g);
      paint(g, T.color);
      rig(g, bone, () => 0.5);
      return g;
    }
    const g = tube(pts, rad, { flat: 1, up: V(0, 1, 0), seg: 28, rad: 14, bulge });
    const along = tAlong(pts);
    prep(g);
    const tipFrom = type === 'cat' ? 0.86 : type === 'tanuki' ? 0.88 : 0.78;
    paint(g, T.color, (x, y, z) => {
      const t = along(x, y, z);
      if (T.tip && t > tipFrom) return T.tip;
      if (T.stripes && Math.floor(t * 7) % 2 === 1 && t > 0.15 && t < tipFrom) return T.stripes;
      return T.color;
    });
    rig(g, bone, along);
    return g;
  };
  if (T.type === 'cat2') {
    out.push(one(BONE.tail1, -1, 1));
    out.push(one(BONE.tail2, 1, 1));
  } else out.push(one(BONE.tail1, 0));
  // 猫又の 2 本：type を cat として描く
  return out;
}

/** 胴（上着）と襟。胸の群れのローカル（腰の上 = 原点）。 */
function torso(spec) {
  const O = spec.outfit;
  const out = [];
  const body = lathe([[0.072, -0.12], [0.09, -0.05], [0.092, 0.03], [0.1, 0.1], [0.112, 0.17], [0.118, 0.215], [0.1, 0.245], [0.06, 0.27], [0.036, 0.29]], 28);
  body.scale(1, 1, 0.74);
  out.push(paint(prep(body), O.top));
  // 襟：上前（キャラの左 = +X 側から右下へ）と下前、首の後ろ
  const collar = (pts, color, w = 0.016) => out.push(paint(prep(tube(pts, () => w, { flat: 0.28, up: V(0, 0, 1), seg: 18, rad: 6, closeEnds: true })), color));
  const zf = (y) => 0.074 * 0.98 + (y > 0.2 ? -0.01 : 0);
  const inner = O.collar2 || O.top;
  collar([V(-0.042, 0.272, 0.0), V(-0.036, 0.24, 0.05), V(-0.006, 0.17, zf(0.17) + 0.01), V(0.035, 0.1, zf(0.1))], inner, 0.012);
  collar([V(0.042, 0.272, 0.0), V(0.034, 0.24, 0.052), V(0.002, 0.17, zf(0.17) + 0.014), V(-0.04, 0.08, zf(0.08) + 0.006)], O.collar || O.top, 0.016);
  collar([V(-0.042, 0.272, 0.0), V(-0.03, 0.29, -0.035), V(0.0, 0.295, -0.045), V(0.03, 0.29, -0.035), V(0.042, 0.272, 0.0)], O.collar || O.top, 0.016);
  // 胸の飾り（鈴など）
  if (spec.props?.bell) {
    const b = new THREE.SphereGeometry(0.018, 14, 10);
    b.translate(0.0, 0.2, 0.085);
    out.push(paint(prep(b), spec.props.bell));
    const cord = new THREE.TorusGeometry(0.05, 0.004, 6, 24, Math.PI);
    cord.rotateX(Math.PI / 2 + 0.6);
    cord.rotateZ(Math.PI);
    cord.translate(0, 0.25, 0.04);
    out.push(paint(prep(cord), spec.props.bellCord || '#c8323a'));
  }
  // 帯（着物の人）
  if (O.obi) {
    const obi = lathe([[0.108, -0.085], [0.112, -0.05], [0.112, 0.0], [0.108, 0.035]], 32);
    obi.scale(1, 1, 0.82);
    out.push(paint(prep(obi), O.obi));
    const cord = lathe([[0.1135, -0.024], [0.1135, -0.01]], 32);
    cord.scale(1, 1, 0.83);
    out.push(paint(prep(cord), O.obiCord || '#ffd36a'));
    // 後ろの大きなリボン結び
    if (O.bow) {
      for (const s of [-1, 1]) {
        const loop = superEllipsoid(0.07, 0.045, 0.02, 3);
        loop.rotateZ(s * 0.35);
        loop.translate(s * 0.065, -0.02, -0.105);
        out.push(rig(paint(prep(loop), O.bow), BONE.bow, () => 0.4));
        const tail = superEllipsoid(0.03, 0.08, 0.008, 3);
        tail.rotateZ(s * 0.25);
        tail.translate(s * 0.035, -0.11, -0.108);
        out.push(rig(paint(prep(tail), O.bow), BONE.bow, (x, y) => Math.min(1, Math.max(0, (-y - 0.02) / 0.16))));
      }
      const knot = superEllipsoid(0.03, 0.035, 0.022, 3);
      knot.translate(0, -0.02, -0.11);
      out.push(rig(paint(prep(knot), O.bow), BONE.bow, () => 0.3));
    }
  }
  return out;
}

/** 腕と袖（腕の群れのローカル：肩が原点、腕は -Y にたれる）。s = +1 がキャラの左。 */
function arm(spec, s) {
  const O = spec.outfit, out = [];
  const bone = s > 0 ? BONE.sleeveL : BONE.sleeveR;
  const skin = spec.skin;
  // 腕（袖の中。手首から先だけ見える）
  const a = tube([V(0, 0, 0), V(0, -0.13, 0.02), V(0, -0.25, 0.07)], (t) => 0.028 - t * 0.008, { seg: 8, rad: 8 });
  out.push(paint(prep(a), O.top));
  // 手
  const hand = ellipsoid(0.022, 0.032, 0.017, 12, 10);
  hand.translate(0, -0.29, 0.082);
  out.push(paint(prep(hand), skin));
  const thumb = ellipsoid(0.009, 0.018, 0.009, 8, 6);
  thumb.rotateZ(s * 0.6);
  thumb.translate(s * -0.017, -0.28, 0.09);
  out.push(paint(prep(thumb), skin));
  // 袖
  const style = O.sleeve || 'wide';
  if (style === 'wide') {
    // 袂：腕から下がる大きな平たい袋。手は前の袖口から出る
    const sl = superEllipsoid(0.036, 0.19, 0.094, 4.2, 26, 20);
    sl.translate(0, -0.175, -0.014);
    warp(sl, (v) => { const k = Math.max(0, -v.y - 0.05) / 0.3; v.x *= 1 + 0.18 * k; v.z -= 0.012 * k * k; });
    const trim = O.sleeveTrim;
    out.push(rig(paint(prep(sl), O.sleeveColor || O.top, trim ? (x, y, z) => (y < -0.345 ? trim : null) : null), bone, (x, y) => Math.max(0, Math.min(1, (-y - 0.02) / 0.34))));
    // 袖口の内側（手が出るところ）
    const cuff = ellipsoid(0.03, 0.022, 0.012, 12, 8);
    cuff.translate(0, -0.28, 0.074);
    out.push(rig(paint(prep(cuff), O.cuff || O.collar2 || '#e8c8c8'), bone, () => 0.75));
    // 袖の紐（赤い房）
    if (O.sleeveCord) {
      const cord = tube([V(s * 0.03, -0.01, -0.09), V(s * 0.038, -0.14, -0.104), V(s * 0.036, -0.3, -0.1)], () => 0.0045, { seg: 10, rad: 5 });
      out.push(rig(paint(prep(cord), O.sleeveCord), bone, (x, y) => Math.max(0, Math.min(1, -y / 0.34))));
      const tassel = ellipsoid(0.008, 0.02, 0.008, 8, 6);
      tassel.translate(s * 0.036, -0.32, -0.1);
      out.push(rig(paint(prep(tassel), O.sleeveCord), bone, () => 0.95));
    }
  } else {
    const sl = tube([V(0, 0.01, 0), V(0, -0.12, 0.008), V(0, -0.24, 0.02)], (t) => 0.036 + t * 0.03, { seg: 10, rad: 12 });
    out.push(rig(paint(prep(sl), O.sleeveColor || O.top), bone, (x, y) => Math.max(0, Math.min(1, -y / 0.26))));
  }
  return out;
}

/** 腰から下：袴（巫女）または着物のすそ、脚、足もと、しっぽ。腰のローカル。 */
function lower(spec) {
  const O = spec.outfit, out = [];
  const skirtT = (x, y) => Math.max(0, Math.min(1, (0.1 - y) / 0.42));
  if (O.type === 'miko') {
    // 緋袴：ひだのある広がった筒
    const pts = [];
    const top = 0.14, bot = O.hem ?? -0.3;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push([0.1 + 0.11 * Math.pow(t, 1.3), top - (top - bot) * t]);
    }
    const hk0 = lathe(pts.reverse(), 96);
    warp(hk0, (v) => {
      const a = Math.atan2(v.x, v.z);
      const k = Math.max(0, (top - v.y) / (top - bot));
      const pleat = 1 + 0.04 * k * Math.sin(a * 16);
      v.x *= pleat; v.z *= pleat * 0.86;
    });
    const hk = shell(hk0, (v) => { v.x *= 0.95; v.z *= 0.95; });
    const dark = mixColor(O.bottom, '#5a0a14', 0.28);
    out.push(rig(paint(prep(hk), O.bottom, (x, y, z) => (Math.sin(Math.atan2(x, z) * 16) < -0.55 && y < top - 0.04 ? dark : null)), BONE.skirt, skirtT));
    // 腰板（後ろ）と前の紐
    const kp = superEllipsoid(0.055, 0.04, 0.01, 4);
    kp.translate(0, 0.135, -0.088);
    out.push(paint(prep(kp), O.koshiita || O.bottom));
    const himo = lathe([[0.104, 0.12], [0.104, 0.135]], 32);
    himo.scale(1, 1, 0.86);
    out.push(paint(prep(himo), O.himo || O.bottom));
    for (const s of [-1, 1]) {
      const bowL = superEllipsoid(0.03, 0.016, 0.01, 3);
      bowL.rotateZ(s * 0.3);
      bowL.translate(s * 0.026, 0.13, 0.094);
      out.push(rig(paint(prep(bowL), O.himo || O.bottom), BONE.skirt, () => 0.1));
      const end = superEllipsoid(0.01, 0.05, 0.005, 3);
      end.rotateZ(s * 0.15);
      end.translate(s * 0.014, 0.075, 0.098);
      out.push(rig(paint(prep(end), O.himo || O.bottom), BONE.skirt, () => 0.3));
    }
  } else {
    // 着物のすそ（長さは hem）
    const top = 0.14, bot = O.hem ?? -0.2;
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push([0.098 + (O.flare ?? 0.07) * Math.pow(t, 1.5), top - (top - bot) * t]);
    }
    const sk0 = lathe(pts.reverse(), 48);
    sk0.scale(1, 1, 0.86);
    const sk = shell(sk0, (v) => { v.x *= 0.95; v.z *= 0.95; });
    // 前の打ち合わせ（重なりの線）
    out.push(rig(paint(prep(sk), O.bottom || O.top, O.hemTrim ? (x, y) => (y < bot + 0.025 ? O.hemTrim : null) : null), BONE.skirt, skirtT));
    const seam = tube([V(0.02, top - 0.01, 0.094), V(-0.01, (top + bot) / 2, 0.11), V(-0.04, bot + 0.01, 0.1 + (O.flare ?? 0.07) * 0.8)], () => 0.005, { seg: 10, rad: 5 });
    out.push(rig(paint(prep(seam), O.seam || O.collar || '#ffffff'), BONE.skirt, skirtT));
  }
  // 脚（はかま・すその下から出る）と足もと
  for (const s of [-1, 1]) {
    const x = s * 0.055;
    const leg = tube([V(x, 0.02, 0), V(x * 1.02, -0.25, 0.005), V(x * 1.04, -0.53, 0.0)], (t) => profile([[0, 0.044], [0.45, 0.04], [0.62, 0.034], [0.8, 0.036], [1, 0.024]], t), { seg: 14, rad: 12 });
    const sockTop = O.sock ? -0.25 : -0.5;
    out.push(rig(paint(prep(leg), spec.skin, O.sock ? (px, py) => (py < sockTop ? O.sock : null) : null), BONE.legs, (px, py) => Math.max(0, Math.min(1, -py / 0.56))));
    const foot = superEllipsoid(0.026, 0.02, 0.05, 3);
    foot.translate(x * 1.04, -0.565, 0.018);
    out.push(rig(paint(prep(foot), O.sock || spec.skin), BONE.legs, () => 1));
    if (O.sandal) {
      const sole = superEllipsoid(0.03, 0.008, 0.058, 4);
      sole.translate(x * 1.04, -0.588, 0.018);
      out.push(rig(paint(prep(sole), O.sandal[0]), BONE.legs, () => 1));
      const strap = new THREE.TorusGeometry(0.022, 0.004, 5, 12, Math.PI);
      strap.rotateY(Math.PI / 2);
      strap.translate(x * 1.04, -0.58, 0.03);
      out.push(rig(paint(prep(strap), O.sandal[1]), BONE.legs, () => 1));
    }
  }
  return out;
}

/** 持ち物（右手）：神楽鈴・杵など。腕のローカル（右腕）。 */
function handProp(spec) {
  const P = spec.props || {};
  const out = [];
  if (P.kagura) {
    // 神楽鈴：手（腕のローカル (0, -0.29, 0.082)）から前（+Z）へ柄がのび、先に 3 段の鈴。五色の布は手もとから下がる
    const hx = 0, hy = -0.29, hz = 0.082;
    const handle = new THREE.CylinderGeometry(0.007, 0.008, 0.17, 8);
    handle.rotateX(Math.PI / 2);
    handle.translate(hx, hy, hz + 0.045);
    out.push(paint(prep(handle), '#7a2a1e'));
    const guard = new THREE.TorusGeometry(0.019, 0.004, 6, 16);
    guard.translate(hx, hy, hz + 0.11);
    out.push(paint(prep(guard), '#e8b84a'));
    const tiers = [[0.13, 7, 0.03], [0.16, 5, 0.022], [0.185, 3, 0.013]];
    for (const [z, n, r] of tiers) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const b = new THREE.SphereGeometry(0.0085, 8, 6);
        b.translate(hx + Math.cos(a) * r, hy + Math.sin(a) * r, hz + z);
        out.push(paint(prep(b), '#ffd25a'));
      }
    }
    const top = new THREE.SphereGeometry(0.01, 8, 6);
    top.translate(hx, hy, hz + 0.205);
    out.push(paint(prep(top), '#ffd25a'));
    const cols = ['#3b6cff', '#ff4a4a', '#ffd23b', '#ffffff', '#7a3bd0'];
    cols.forEach((c, k) => {
      const ox = (k - 2) * 0.007;
      const z0 = hz - 0.04;
      const rib = tube([V(hx + ox, hy, z0), V(hx + ox * 1.6, hy - 0.09, z0 - 0.07), V(hx + ox * 2.2, hy - 0.18, z0 - 0.13)], (t) => 0.0065 * (1 - t * 0.3), { flat: 0.2, up: V(0, 0, 1), seg: 10, rad: 5 });
      out.push(rig(paint(prep(rib), c), BONE.ribbon, (x, y) => Math.max(0, Math.min(1, (hy - y) / 0.18))));
    });
  }
  if (P.kine) {
    // 杵（月のうさぎ）
    const handle = new THREE.CylinderGeometry(0.01, 0.011, 0.36, 8);
    handle.rotateX(Math.PI / 2);
    handle.translate(0, -0.29, 0.1);
    out.push(paint(prep(handle), '#b98a5a'));
    const head = new THREE.CylinderGeometry(0.04, 0.04, 0.13, 14);
    head.rotateZ(Math.PI / 2);
    head.translate(0, -0.29, 0.27);
    out.push(paint(prep(head), '#d8b07a'));
  }
  if (P.tokkuri) {
    const t = lathe([[0.001, -0.06], [0.03, -0.055], [0.036, -0.02], [0.02, 0.03], [0.011, 0.05], [0.013, 0.065], [0.001, 0.066]], 14);
    t.translate(0, -0.33, 0.04);
    out.push(paint(prep(t), '#f2ecdc', (x, y) => (y > -0.3 ? '#3a5a8a' : null)));
  }
  return out;
}

/** 頭の飾り（葉っぱ・三日月・花など）。頭のローカル。 */
function headProps(spec) {
  const P = spec.props || {};
  const out = [];
  if (P.leaf) {
    const leaf = tube([V(-0.02, 0.15, 0.0), V(0.0, 0.18, 0.01), V(0.03, 0.2, 0.0), V(0.05, 0.19, -0.02)], (t) => 0.035 * Math.sin(Math.PI * Math.min(1, t * 1.05)) + 0.002, { flat: 0.15, up: V(0, 1, 0.2).normalize(), seg: 12, rad: 8 });
    out.push(rig(paint(prep(leaf), '#5cc84a', (x, y, z) => (Math.abs(z - 0.0) < 0.004 ? '#2f8a3a' : null)), BONE.ahoge, (x) => Math.max(0, (x + 0.02) / 0.07)));
  }
  if (P.crescent) {
    const c = new THREE.TorusGeometry(0.035, 0.009, 8, 24, Math.PI * 1.2);
    c.rotateZ(-0.4);
    c.translate(0.07, 0.13, 0.06);
    out.push(paint(prep(c), '#ffd76a'));
  }
  if (P.flower) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const p = ellipsoid(0.012, 0.007, 0.004, 8, 6);
      p.rotateZ(a);
      p.translate(-0.095 + Math.cos(a) * 0.012, 0.1 + Math.sin(a) * 0.012, 0.075);
      out.push(paint(prep(p), P.flower));
    }
  }
  return out;
}

/** 背中の小物（笠・羽衣の帯）。胸の群れのローカル。 */
function backProps(spec) {
  const P = spec.props || {};
  const out = [];
  if (P.hat) {
    const h = new THREE.ConeGeometry(0.16, 0.06, 24, 1, true);
    h.rotateX(-Math.PI / 2 + 0.35);
    h.translate(0.04, 0.14, -0.13);
    out.push(paint(prep(h), '#d9b56a'));
    const h2 = new THREE.ConeGeometry(0.16, 0.06, 24, 1, true);
    h2.rotateX(Math.PI / 2 + 0.35);
    h2.rotateY(Math.PI);
    h2.translate(0.04, 0.14, -0.135);
    out.push(paint(prep(h2), '#c49a50'));
  }
  if (P.sash) {
    // 羽衣：背中の後ろを肩の高さで大きく回り、両ひじにかかって、先は外へ流れて下がる（薄い帯）
    const pts = [];
    for (let i = 0; i <= 18; i++) {
      const u = i / 18;
      const a = Math.PI * u;
      pts.push(V(Math.cos(a) * 0.3, 0.2 + Math.sin(a) * 0.2 + Math.sin(u * Math.PI * 3) * 0.015, -0.12 - Math.sin(a) * 0.05));
    }
    const sh = tube(pts, () => 0.032, { flat: 0.08, up: V(0, 0, 1), seg: 44, rad: 6, arch: 0.6 });
    out.push(rig(paint(prep(sh), P.sash), BONE.sash, (x) => Math.abs(x) / 0.3));
    for (const s of [-1, 1]) {
      const tail = tube([V(s * 0.3, 0.2, -0.12), V(s * 0.34, 0.06, -0.1), V(s * 0.4, -0.12, -0.09), V(s * 0.38, -0.3, -0.08), V(s * 0.44, -0.48, -0.06)], (t) => 0.032 * (1 - t * 0.35), { flat: 0.08, up: V(0, 0, 1), seg: 28, rad: 6, arch: 0.5 });
      out.push(rig(paint(prep(tail), P.sash), BONE.sash, (x, y) => Math.min(1, Math.max(0, (0.2 - y) / 0.68))));
    }
  }
  return out;
}

export class GirlModel {
  constructor(spec, { outline = 0.55, faceSize } = {}) {
    this.spec = spec;
    this.bones = makeBones();
    this.mat = charMaterial(this.bones, { rim: spec.rim ?? 0.5, rimColor: spec.rimColor ?? 0xffe8d0 });
    this.outlineMat = charOutline(this.bones, { color: spec.line ?? 0x2b1d22, width: outline });
    this.face = new FaceTexture(spec.face);
    this.faceMat = new THREE.MeshToonMaterial({ map: this.face.texture, transparent: true, alphaTest: 0.02, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, gradientMap: null });
    this.faceMat.name = 'face';

    const root = (this.root = new THREE.Group());
    root.name = spec.id || 'girl';
    // 群れ
    const hips = (this.hips = new THREE.Group()); hips.name = 'hips'; hips.position.y = D.hipY; root.add(hips);
    const chest = (this.chest = new THREE.Group()); chest.name = 'chest'; chest.position.y = D.waistY - D.hipY; hips.add(chest);
    const head = (this.head = new THREE.Group()); head.name = 'head'; head.position.y = D.headY - D.waistY; chest.add(head);
    this.armL = new THREE.Group(); this.armL.name = 'armL'; this.armL.position.set(D.shoulderX, D.shoulderY - D.waistY, 0); chest.add(this.armL);
    this.armR = new THREE.Group(); this.armR.name = 'armR'; this.armR.position.set(-D.shoulderX, D.shoulderY - D.waistY, 0); chest.add(this.armR);

    const add = (group, geos, name) => {
      const g = merge(geos.flat());
      if (!g) return null;
      const m = new THREE.Mesh(g, this.mat);
      m.name = name;
      group.add(m);
      const o = new THREE.Mesh(g, this.outlineMat);
      o.name = name + '-outline';
      o.raycast = () => {};
      group.add(o);
      return m;
    };
    // 頭
    const hg = headGeometry();
    const neck = new THREE.CylinderGeometry(0.031, 0.035, 0.12, 12);
    neck.translate(0, -0.15, -0.005);
    add(head, [paint(prep(hg.clone()), spec.skin), paint(prep(neck), spec.skin), hairCap(spec), ...hairStrands(spec), ...hairTie(spec), ...ears(spec), ...headProps(spec)], 'headMesh');
    const fm = new THREE.Mesh(faceGeometry(hg), this.faceMat);
    fm.name = 'face';
    fm.renderOrder = 1;
    head.add(fm);
    this.faceMesh = fm;
    // 胸
    add(chest, [...torso(spec), ...backProps(spec)], 'chestMesh');
    // 腕
    add(this.armL, arm(spec, 1), 'armLMesh');
    add(this.armR, [...arm(spec, -1), ...handProp(spec)], 'armRMesh');
    // 腰から下としっぽ
    add(hips, [...lower(spec), ...tails(spec)], 'hipsMesh');

    // 骨の中心（それぞれの群れのローカル）
    const P = this.bones.uPivot.value;
    P[BONE.hairBack].set(0, 0.04, -0.1);
    P[BONE.sideL].set(0.12, 0.05, 0.06);
    P[BONE.sideR].set(-0.12, 0.05, 0.06);
    P[BONE.ahoge].set(0, 0.16, 0.02);
    P[BONE.tail1].set(0, 0.02, -0.07);
    P[BONE.tail2].set(0, 0.02, -0.07);
    P[BONE.sleeveL].set(0, 0, 0);
    P[BONE.sleeveR].set(0, 0, 0);
    P[BONE.skirt].set(0, 0.12, 0);
    P[BONE.earL].set(0.085, 0.125, -0.005);
    P[BONE.earR].set(-0.085, 0.125, -0.005);
    P[BONE.ribbon].set(0, -0.29, 0.04);
    P[BONE.bow].set(0, -0.01, -0.1);
    P[BONE.sash].set(0, 0.2, -0.12);
    P[BONE.legs].set(0, 0.0, 0);
    if (spec.ears.type === 'rabbit') { P[BONE.earL].set(0.055, 0.135, -0.01); P[BONE.earR].set(-0.055, 0.135, -0.01); }

    // 動きの状態
    this.pose = 'stand';
    this.t = Math.random() * 10;
    this.blinkT = 2 + Math.random() * 2;
    this.blinking = 0;
    this.faceBase = { eyes: 'open', mouth: 'smile', brows: 'normal', blush: 0.45 };
    this.talking = false;
    this.spring = {};
    this.prevPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.firstUpdate = true;
    this.setFace(spec.faceDefault || {});
  }

  /** 表情（基本）。まばたきと口パクは update が重ねる。 */
  setFace(o) { Object.assign(this.faceBase, o); this.face.set({ ...this.faceBase }); }

  setPose(p) { this.pose = p; }
  setTalking(on) { this.talking = !!on; }

  /** 全体の明るさ（1 がふつう。会話で話していない側は 0.55 くらい）。 */
  setDim(v) {
    this.mat.userData.u.uDim.value = v;
    this.faceMat.color.setScalar(v);
  }

  /** 当たったときの白い点滅（0〜1）。 */
  setFlash(v) {
    this.mat.userData.u.uFlash.value = v;
  }

  /** 骨のばね：目標 target に、固さ k・減衰 c で近づく値。 */
  sp(name, target, dt, k = 60, c = 9) {
    const s = (this.spring[name] ||= { x: target, v: 0 });
    const a = (target - s.x) * k - s.v * c;
    s.v += a * dt;
    s.x += s.v * dt;
    if (!Number.isFinite(s.x)) { s.x = target; s.v = 0; }
    return s.x;
  }

  /**
   * 毎フレーム。o = { vx, vy（画面の上での速さ、ドット/コマ）, focus（0〜1） }。
   * 姿勢（pose）：stand（立ち）/ fly（自機：背中を見せて飛ぶ）/ float（ボス：浮かぶ）/ cast（片手を上げる）/ declare（両手を広げる）
   *               / hurt（ひるむ）/ dazed（倒れてふらふら）/ portrait（会話の立ち絵）
   */
  update(dt, o = {}) {
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const t = this.t;
    const vx = o.vx || 0, vy = o.vy || 0;
    const pose = this.pose;
    const R = this.bones.uRot.value, W = this.bones.uWave.value;
    const fly = pose === 'fly';
    const breathe = Math.sin(t * 2.2);
    // 体の傾き
    const lean = this.sp('lean', -vx * 0.06, dt, 40, 10);
    this.root.rotation.z = fly ? lean : lean * 0.5;
    this.hips.position.y = D.hipY + (pose === 'stand' || pose === 'portrait' ? breathe * 0.004 : Math.sin(t * 2.6) * 0.012);
    this.chest.rotation.x = (fly ? 0.08 : 0.02) + breathe * 0.012;
    this.head.rotation.x = fly ? -0.12 : pose === 'dazed' ? 0.25 + Math.sin(t * 3) * 0.08 : Math.sin(t * 1.3) * 0.03;
    this.head.rotation.z = pose === 'dazed' ? Math.sin(t * 2.4) * 0.18 : Math.sin(t * 0.9) * 0.04 - lean * 0.4;
    this.head.rotation.y = pose === 'portrait' ? Math.sin(t * 0.7) * 0.05 : 0;
    // 腕
    let aL = [0.1, 0, 0.12], aR = [0.1, 0, -0.12];
    // 飛ぶとき：腕を少し広げ、袖の広い面が後ろ（カメラ）から見えるようにひねる
    if (fly) { aL = [0.3, 0.9, 0.62 + Math.sin(t * 3) * 0.04]; aR = [0.3, -0.9, -0.62 - Math.sin(t * 3) * 0.04]; }
    if (pose === 'float') { aL = [0.2, 0, 0.42]; aR = [0.2, 0, -0.42]; }
    if (pose === 'cast') { aL = [0.2, 0, 0.4]; aR = [-2.3, 0.3, -0.5]; }
    if (pose === 'declare') { aL = [-0.4, 0, 1.3]; aR = [-0.4, 0, -1.3]; }
    if (pose === 'hurt') { aL = [0.6, 0, 0.9]; aR = [0.6, 0, -0.9]; }
    if (pose === 'dazed') { aL = [0.1, 0, 0.3 + Math.sin(t * 2) * 0.1]; aR = [0.1, 0, -0.3 - Math.sin(t * 2) * 0.1]; }
    if (pose === 'stand' && this.spec.props?.kagura) aR = [-0.75, 0.2, -0.32];
    if (o.focus > 0 && fly) { aL[2] *= 1 - 0.6 * o.focus; aR[2] *= 1 - 0.6 * o.focus; aL[0] -= 0.4 * o.focus; aR[0] -= 0.4 * o.focus; }
    for (const [g, a, n] of [[this.armL, aL, 'aL'], [this.armR, aR, 'aR']]) {
      g.rotation.x = this.sp(n + 'x', a[0], dt, 50, 11);
      g.rotation.y = this.sp(n + 'y', a[1], dt, 50, 11);
      g.rotation.z = this.sp(n + 'z', a[2], dt, 50, 11);
    }
    // なびき：飛ぶ速さ（上へ）と横の動きで、髪・袖・すそ・しっぽが後ろへ流れる
    const wind = fly ? 0.55 + Math.max(0, vy) * 0.08 : pose === 'float' || pose === 'cast' || pose === 'declare' ? 0.18 : 0.04;
    const side = this.sp('side', -vx * 0.12, dt, 30, 7);
    const fl = (a, s) => Math.sin(t * s) * a;
    R[BONE.hairBack].set(this.sp('hb', wind * 0.9, dt, 25, 6) + fl(0.04, 3.1), 0, side * 0.6 + fl(0.03, 2.3));
    W[BONE.hairBack].set(0.07 * wind + 0.02, 0, 0.04 * wind, t * 5);
    for (const [b, s] of [[BONE.sideL, 1], [BONE.sideR, -1]]) {
      R[b].set(this.sp('sd' + s, wind * 0.5, dt, 30, 7) + fl(0.03, 3.4 + s * 0.3), 0, side * 0.4 + s * wind * 0.12);
      W[b].set(0.05 * wind, 0, 0.03, t * 6 + s);
    }
    const ahoge = this.sp('ah', -vx * 0.04 + (fly ? 0.15 : 0), dt, 80, 4);
    R[BONE.ahoge].set(0.2 * wind, 0, ahoge + fl(0.06, 4));
    // 耳：ときどきぴくっと動く
    const twitch = (Math.sin(t * 0.7) > 0.97 ? Math.sin(t * 40) * 0.15 : 0);
    const earBack = pose === 'hurt' ? 0.5 : fly ? 0.25 * wind : 0;
    R[BONE.earL].set(earBack, 0, this.spec.ears.type === 'rabbit' ? fl(0.12, 2.1) + 0.1 : -twitch);
    R[BONE.earR].set(earBack, 0, this.spec.ears.type === 'rabbit' ? fl(0.12, 2.3) - 0.1 : twitch);
    // しっぽ：ゆらゆら（飛ぶときは後ろへ流す）
    const tailUp = fly ? 0.15 + wind * 0.4 : 0.35;
    R[BONE.tail1].set(this.sp('t1', tailUp, dt, 20, 5), fl(fly ? 0.55 : 0.35, 2.2) + side * 1.2, 0);
    W[BONE.tail1].set(0, 0.25, 0, t * 4);
    R[BONE.tail2].set(this.sp('t2', tailUp * 0.9, dt, 20, 5), fl(-0.3, 2.6) + side * 1.2, 0);
    W[BONE.tail2].set(0, 0.25, 0, t * 4.5 + 1);
    // 袖
    for (const [b, s] of [[BONE.sleeveL, 1], [BONE.sleeveR, -1]]) {
      R[b].set(this.sp('sl' + s, wind * 0.9, dt, 25, 6) + fl(0.05, 3 + s * 0.4), 0, -s * wind * 0.25 + side * 0.3);
      W[b].set(0.12 * wind, 0, 0.05 * wind, t * 7 + s);
    }
    // すそ・袴
    R[BONE.skirt].set(this.sp('sk', wind * 0.55, dt, 25, 6), 0, side * 0.25);
    W[BONE.skirt].set(0.05 * wind, 0, 0.03 * wind, t * 8);
    R[BONE.legs].set(fly ? 0.28 + wind * 0.1 : pose === 'float' ? 0.12 : 0, 0, side * 0.1);
    W[BONE.legs].set(fly ? 0.03 : 0.0, 0, 0, t * 3);
    R[BONE.ribbon].set(wind * 0.8 + fl(0.15, 3.3), 0, fl(0.2, 2.1));
    W[BONE.ribbon].set(0.2, 0, 0.1, t * 6);
    R[BONE.bow].set(wind * 0.6, 0, side * 0.3);
    W[BONE.bow].set(0.06, 0, 0.04, t * 6);
    R[BONE.sash].set(wind * 0.4, 0, side * 0.3);
    W[BONE.sash].set(0.08, 0.02, 0.06, t * 2.4);

    // まばたき・口パク
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinking = 0.12; this.blinkT = 2.5 + Math.random() * 3; }
    let eyes = this.faceBase.eyes;
    if (this.blinking > 0) { this.blinking -= dt; if (eyes === 'open' || eyes === 'angry' || eyes === 'sad' || eyes === 'half') eyes = 'closed'; }
    let mouth = this.faceBase.mouth;
    if (this.talking) mouth = Math.sin(t * 22) > 0 ? 'talk' : mouth === 'talk' ? 'smile' : mouth;
    this.face.set({ eyes, mouth, brows: this.faceBase.brows, blush: this.faceBase.blush });
  }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh && o.geometry && !o.name.endsWith('-outline')) o.geometry.dispose(); });
    this.mat.dispose(); this.outlineMat.dispose(); this.faceMat.dispose(); this.face.dispose();
  }
}
