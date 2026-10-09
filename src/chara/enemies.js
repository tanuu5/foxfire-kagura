// 道中の敵（妖怪）の 3D モデル：鬼火・たぬきの葉っぱ・提灯お化け・唐傘お化け・化け猫・月の兎の兵隊・星・輪入道。
//
//   import { makeEnemyModel } from '../chara/enemies.js';
//   const m = makeEnemyModel(def.model, def);   // def は Enemies.js の KIND の 1 つ（r・color を見る）
//   scene.add(m.root);                          // 原点が敵の中心（弾が出るところ）。+Z がカメラ、+Y が上
//   m.update(dt, enemy);                        // 描く前に毎回：enemy の flash・facing・hp・maxHp を見る
//   m.dispose();                                // 消すとき（1 体ごとの材質だけを捨てる。形とテクスチャは使い回す）
//
// 大きさは r（当たりの半径）の約 2.2 倍。形は「r = 1」で作り、1 体ごとに r 倍する。
// 1 体の draw call は 6 以下（本体・輪郭線・顔・光の板・動く部品とその輪郭線）、三角形は 1500 以下。
// 形・顔のテクスチャは「種類 × 色」ごとに 1 回だけ作って使い回す。材質は 1 体ごと（当たったときの白い点滅・表情・時間）。
// 毎フレームの update では new をしない。
import * as THREE from 'three';
import { PALETTE } from '../game/atlas.js';
import { clamp, damp, ease } from '../core/math.js';
import { outlineMaterial, setFlash } from './toon.js';
import {
  Kit, loft, lathe, decalGeometry, faceAtlas, faceMaterial, bodyMaterial, fxGeometry, fxMaterial,
  FX, FXM, mix, lighten, darken, sstep, TAU,
} from './enemyParts.js';
import { faceDrawer } from './enemyFaces.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** 曲線に沿った帯（舌・しっぽ）：points を通る曲線に沿って、幅 w(t)・厚み th(t) の断面を並べる。 */
function ribbon(points, rings, segs, w, th) {
  const path = new THREE.CatmullRomCurve3(points);
  const side = new THREE.Vector3(), up = new THREE.Vector3(), tan = new THREE.Vector3(), c = new THREE.Vector3();
  return loft(rings, segs, (t, a, out) => {
    path.getPointAt(t, c);
    path.getTangentAt(t, tan);
    side.set(1, 0, 0).addScaledVector(tan, -tan.x);
    if (side.lengthSq() < 1e-6) side.set(0, 0, 1);
    side.normalize();
    up.crossVectors(tan, side).normalize();
    out.copy(c).addScaledVector(side, Math.cos(a) * w(t)).addScaledVector(up, Math.sin(a) * th(t));
  });
}

/** 先が丸く閉じる幅（根元 0 → 先 1）。 */
const taperTip = (w0, tip = 0.72) => (t) => w0 * Math.sqrt(sstep(0, 0.1, t)) * (t > tip ? Math.sqrt(Math.max(0, 1 - ((t - tip) / (1 - tip)) ** 2)) : 1);

// ================================================================ 種類ごとの作り
const SPEC = {};

// ---------------------------------------------------------------- 鬼火・狐火：しずく形の炎に、ふたつの目
SPEC.wisp = {
  color: 'sky',
  rim: 0.55,
  outlineWidth: 0.75,
  face: { cx: 0, cy: -0.12, hs: 0.62 },
  palette: (c) => ({
    main: c, core: lighten(c, 0.55), hot: lighten(c, 0.85), deep: darken(c, 0.42), edge: darken(c, 0.3),
    ink: mix(c, 0x0c0a1e, 0.86), iris: lighten(c, 0.3), outline: darken(c, 0.66), rim: lighten(c, 0.7),
  }),
  build(p) {
    const prof = [[0, -0.95], [0.3, -0.9], [0.52, -0.78], [0.68, -0.6], [0.78, -0.38], [0.82, -0.14], [0.77, 0.1], [0.63, 0.34], [0.45, 0.56], [0.28, 0.78], [0.15, 0.98], [0.06, 1.16], [0, 1.3]];
    const coarse = [[0, -0.95], [0.4, -0.86], [0.68, -0.6], [0.82, -0.2], [0.74, 0.16], [0.52, 0.48], [0.28, 0.78], [0.11, 1.07], [0, 1.3]];
    const curl = (v) => { const k = sstep(0.1, 1.3, v.y); v.x += 0.36 * k * k; };
    // 炎の色：正面のまん中ほど明るい芯、ふちはこい色、上へ行くほど深い色
    const flame = (q, n, out, tip) => {
      const inner = sstep(0.55, 0.98, n.z) * (1 - sstep(-0.35, 0.4, q.y));
      out.color = mix(mix(p.edge, p.main, sstep(0.0, 0.5, n.z)), p.core, inner);
      out.color = mix(out.color, p.hot, sstep(0.85, 1.0, n.z) * (1 - sstep(-0.6, 0.0, q.y)) * 0.5);
      out.color = mix(out.color, p.deep, sstep(tip, tip + 0.8, q.y) * 0.85);
      out.glow = 0.25;
    };
    const k = new Kit();
    k.add(lathe(prof, 14), { deform: curl, hullGeo: lathe(coarse, 12), face: true, fn: (q, n, l, out) => flame(q, n, out, 0.3) });
    // わきの小さな炎（左右で高さと大きさを変えて、炎らしい形に）
    const lick = [[0, -0.3], [0.15, -0.25], [0.22, -0.12], [0.2, 0.05], [0.12, 0.22], [0.04, 0.36], [0, 0.44]];
    const lickC = [[0, -0.3], [0.21, -0.15], [0.17, 0.12], [0.06, 0.32], [0, 0.44]];
    for (const [s, x, y, rz, sc] of [[-1, -0.74, 0.3, 0.42, 1.15], [1, 0.74, 0.0, -0.62, 0.9]]) {
      const bend = (v) => { v.x -= s * 0.12 * sstep(-0.1, 0.4, v.y) ** 2; };
      k.add(lathe(lick, 7), {
        deform: bend, at: [x, y, -0.08], rot: [0, 0, rz], scale: [sc, sc * 1.1, sc * 0.8], hullGeo: lathe(lickC, 6),
        fn: (q, n, l, out) => flame(q, n, out, y + 0.1),
      });
    }
    return {
      body: k.done(),
      fx: [
        { at: [0, 0.05, -0.1], size: 1.6, type: FX.glow, mode: FXM.halo, a: 0.07, b: 3.1, c: 0.25, alpha: 0.85 },
        { at: [0.2, 0.95, 0.05], size: 0.12, type: FX.dot, mode: FXM.ember, a: 0.95, b: 0.85, c: 0.3, phase: 0.0, hot: 0.45 },
        { at: [-0.12, 0.75, 0.1], size: 0.1, type: FX.dot, mode: FXM.ember, a: 0.85, b: 0.7, c: 0.3, phase: 0.37, hot: 0.45 },
        { at: [0.42, 0.6, 0.1], size: 0.09, type: FX.dot, mode: FXM.ember, a: 0.75, b: 0.95, c: 0.25, phase: 0.71, hot: 0.45 },
      ],
      fxOpts: { color: p.main, hot: p.hot, intensity: 0.65 },
    };
  },
  init(o) { o.body.matrixAutoUpdate = false; },
  update(o, s) {
    const t = s.t, ph = s.ph * TAU;
    const fl = Math.sin(t * 7.3 + ph) * 0.07 + Math.sin(t * 12.9 + ph * 2) * 0.04;
    const k = fl - s.lean * 0.32;                       // 先は動きと反対へなびく
    const sy = 1 + Math.sin(t * 9.1 + ph) * 0.05 + Math.sin(t * 15.7) * 0.025;
    const sx = 1 / Math.sqrt(sy);
    const bob = Math.sin(t * 2.4 + ph) * 0.07;
    const y0 = -0.9;                                    // 根元を止めて、伸び縮み・せん断
    o.body.matrix.set(sx, k * sy, 0, -k * sy * y0, 0, sy, 0, y0 * (1 - sy) + bob, 0, 0, sx, 0, 0, 0, 0, 1);
    o.body.matrixWorldNeedsUpdate = true;
    o.pose.rotation.z = -s.lean * 0.12;
    o.fx.position.y = bob;
  },
};

// ---------------------------------------------------------------- たぬきの葉っぱ：大きな葉に、まるい耳とずるそうな顔
const leafW = (t) => 1.55 * Math.pow(Math.max(t, 0), 0.8) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(t, 0), 2.6)));
const LEAF = { y0: -1.12, len: 2.12 };
const leafPoint = (t, a, out) => {
  const y = LEAF.y0 + LEAF.len * t;
  const w = leafW(t);
  const th = 0.13 * Math.pow(w / 0.9, 0.6);
  const x = w * Math.cos(a);
  let z = th * Math.sin(a);
  z += -0.3 * (x / 0.9) ** 2;       // 左右のふちが後ろへ反る
  z += -0.3 * (1 - t) ** 3;         // 先も後ろへ
  out.set(x, y, z);
};
SPEC.leaf = {
  color: 'green',
  rim: 0.45,
  outlineWidth: 0.75,
  // 顔のシールは葉の正面全体（葉脈も描く）。顔は (0, 0.08) を中心に
  face: { cx: 0, cy: -0.06, hs: 1.08, n: 8, res: 512 },
  palette: (c0) => {
    const c = mix(c0, 0x7ccc3a, 0.3);
    // 正面から見た葉の形（シールの座標 [-1, 1]、y は下向き）：葉脈をはみ出させないための切り抜き
    const outline = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; outline.push([leafW(t) / 1.08, -(LEAF.y0 + LEAF.len * t + 0.06) / 1.08]); }
    for (let i = 24; i >= 0; i--) { const t = i / 24; outline.push([-leafW(t) / 1.08, -(LEAF.y0 + LEAF.len * t + 0.06) / 1.08]); }
    return {
      main: c, light: lighten(c, 0.3), dark: darken(c, 0.42), back: mix(c, 0xd6eea0, 0.45), vein: lighten(c, 0.55),
      ear: 0x7a4e30, earTip: 0x3a2618, earIn: 0xe0bf94, stem: 0x7c6a2c,
      mask: 0x3e2a20, pupil: 0x1e140e, ink: 0x2a1a12, muzzle: 0xf4e6c4,
      outline: 0x1c2a14, rim: 0xecffc8,
      leafOutline: outline, faceAt: [0, -(0.08 + 0.06) / 1.08], faceScale: 0.6 / 1.08,
    };
  },
  build(p) {
    const k = new Kit();
    k.add(loft(12, 14, leafPoint), {
      hullGeo: loft(9, 10, leafPoint), face: true,
      fn: (q, n, l, out) => {
        const t = clamp((q.y - LEAF.y0) / LEAF.len, 0, 1);
        const e = Math.abs(q.x) / Math.max(leafW(t), 0.05);
        if (n.z > -0.15) {
          out.color = mix(p.light, p.main, sstep(0.0, 0.75, e));
          out.color = mix(out.color, p.dark, sstep(0.78, 1.0, e) * 0.65);
        } else out.color = Math.abs(q.x) < 0.05 ? p.vein : p.back;
      },
    });
    for (const s of [-1, 1]) {
      // たぬきの耳：まるくて、ふちが黒く、内側はうすい茶色の毛
      k.add(new THREE.SphereGeometry(0.26, 10, 7), {
        at: [s * 0.64, 0.78, -0.06], rot: [0, 0, -s * 0.55], scale: [1, 0.92, 0.55],
        hullGeo: new THREE.SphereGeometry(0.26, 8, 5),
        fn: (q, n, l, out) => { out.color = mix(p.ear, p.earTip, sstep(0.08, 0.22, l.y)); },
      });
      k.add(new THREE.SphereGeometry(0.15, 8, 5), { at: [s * 0.62, 0.73, 0.06], rot: [0, 0, -s * 0.55], scale: [1, 0.8, 0.4], color: p.earIn, hull: false });
    }
    const stem = [V(0, 0.9, -0.03), V(0.02, 1.08, -0.05), V(0.12, 1.24, -0.06), V(0.26, 1.28, -0.05), V(0.34, 1.2, -0.03)];
    k.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stem), 7, 0.055, 5, false), {
      color: p.stem, hullGeo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stem), 5, 0.055, 4, false),
    });
    return { body: k.done() };
  },
  state: (rnd) => ({ twirl: -1, twirlIn: 2 + rnd() * 3 }),
  update(o, s, dt) {
    const t = s.t, ph = s.ph * TAU;
    let spin = 0;
    if (s.twirl >= 0) {
      s.twirl += dt / 0.8;
      if (s.twirl >= 1) { s.twirl = -1; s.twirlIn = 3.5 + s.rnd() * 4; }
      else spin = TAU * ease.inOutCubic(s.twirl);
    } else if ((s.twirlIn -= dt) <= 0) s.twirl = 0;
    o.pose.rotation.set(Math.sin(t * 2.3 + ph) * 0.14, Math.sin(t * 1.7 + ph) * 0.22 + spin, Math.sin(t * 1.6 + ph) * 0.2 - s.lean * 0.35);
    o.pose.position.y = Math.sin(t * 3.2 + ph) * 0.05;
    s.special = s.twirl >= 0;            // くるりと回るあいだはウインク
  },
};

// ---------------------------------------------------------------- 提灯お化け：赤い提灯に、大きなひとつ目と長い舌
const lanternR = (y) => 0.8 * Math.sqrt(Math.max(0, 1 - (y / 1.08) ** 2));
SPEC.lantern = {
  color: 'orange',
  rim: 0.4,
  outlineWidth: 0.95,
  face: { cx: 0, cy: -0.02, hs: 0.7 },
  palette: (c) => {
    const paper = mix(c, 0xe0281f, 0.72);
    return {
      main: c, paper, bulge: mix(paper, 0xffc46a, 0.4), groove: darken(paper, 0.45), band: darken(paper, 0.25),
      lacquer: 0x2a1a1e, metal: 0x4a4044, tongue: 0xff5a7c, tongueDark: 0xd8324e,
      ink: 0x2a1014, mouth: 0x3a0a16, throat: 0x8a1830,
      outline: 0x2a1014, rim: 0xffe2b8,
    };
  },
  build(p) {
    const prof = [[0, -0.82]];
    for (let i = 0; i <= 16; i++) { const y = -0.82 + i * 0.1025; prof.push([lanternR(y) + (i % 2 ? 0.018 : -0.026), y]); }
    prof.push([0, 0.82]);
    const smooth = [[0, -0.82]];
    for (let i = 0; i <= 8; i++) { const y = -0.82 + i * 0.205; smooth.push([lanternR(y), y]); }
    smooth.push([0, 0.82]);
    const k = new Kit();
    k.add(lathe(prof, 12), {
      hullGeo: lathe(smooth, 10), face: true,
      fn: (q, n, l, out) => {
        const ph = (((q.y + 0.82) / 0.205) % 1 + 1) % 1;    // 0 = 骨、0.5 = 紙のふくらみ
        const b = Math.sin(Math.PI * ph);
        const band = sstep(0.6, 0.76, Math.abs(q.y));
        out.color = mix(mix(p.groove, p.bulge, b), p.band, band * 0.75);
        out.glow = (0.25 + 0.5 * b) * (1 - band * 0.6);
      },
    });
    for (const s of [-1, 1]) {
      k.add(new THREE.CylinderGeometry(s > 0 ? 0.46 : 0.53, s > 0 ? 0.53 : 0.46, 0.15, 12), {
        at: [0, s * 0.875, 0], smooth: false, color: p.lacquer, hullGeo: new THREE.CylinderGeometry(s > 0 ? 0.46 : 0.53, s > 0 ? 0.53 : 0.46, 0.15, 10),
      });
    }
    k.add(new THREE.TorusGeometry(0.11, 0.032, 4, 8, Math.PI), { at: [0, 0.95, 0], color: p.metal, hullGeo: new THREE.TorusGeometry(0.11, 0.032, 3, 6, Math.PI) });
    // 舌（動く部品）：口の中から下へ垂れて、先が少し巻く
    const tongue = (rings, segs) => ribbon([V(0, 0.04, -0.06), V(0, -0.08, 0.07), V(0.01, -0.34, 0.13), V(0.05, -0.6, 0.12), V(0.14, -0.78, 0.09), V(0.25, -0.8, 0.02)], rings, segs, taperTip(0.15, 0.7), taperTip(0.055, 0.7));
    const tk = new Kit();
    tk.add(tongue(10, 8), {
      hullGeo: tongue(8, 6),
      fn: (q, n, l, out) => { out.color = mix(p.tongueDark, p.tongue, sstep(0.0, -0.4, l.y)); },
    });
    return {
      body: k.done(),
      part: { ...tk.done(), at: [0, -0.43, 0.68], parent: 'body', name: 'tongue' },
      fx: [{ at: [0, 0, -0.1], size: 1.95, type: FX.glow, mode: FXM.halo, a: 0.05, b: 2.3, c: 0.3, alpha: 0.8 }],
      fxOpts: { color: p.main, hot: 0xffe0a0, intensity: 0.55 },
    };
  },
  update(o, s, dt, e) {
    const t = s.t, ph = s.ph * TAU, L = 1.3;          // L：つるした点（上）までの長さ
    const th = Math.sin(t * 1.7 + ph) * 0.08 - s.lean * 0.2;
    o.pose.rotation.z = th;
    o.pose.position.set(L * Math.sin(th), L - L * Math.cos(th) + Math.sin(t * 2.1 + ph) * 0.04, 0);
    o.part.rotation.set(0.1 + Math.sin(t * 3.1 + ph) * 0.12, 0, Math.sin(t * 4.6 + ph) * 0.22 + s.lean * 0.3);
    o.mat.userData.glow.value = 1 + Math.sin(t * 13 + ph) * 0.08 + Math.sin(t * 23.7) * 0.06;   // ろうそくのゆらぎ
    s.special = e.maxHp > 0 && e.hp / e.maxHp < 0.3;    // 弱るとあせる
  },
};

// ---------------------------------------------------------------- 唐傘お化け：紫の番傘に、ひとつ目と舌、一本足と下駄
SPEC.umbrella = {
  color: 'purple',
  rim: 0.45,
  outlineWidth: 0.85,
  face: { cx: 0, cy: 0.28, hs: 0.48 },
  palette: (c0) => {
    const c = lighten(c0, 0.12);
    return {
    main: c, band: lighten(c, 0.78), inner: darken(c, 0.5), hem: darken(c, 0.18), finial: 0x2a1830, lid: c,
    skin: 0xffe2c8, tabi: 0xffffff, wood: 0xcf9a62, tooth: 0x8a5a34, strap: 0xe8303c,
    tongue: 0xff5a7c, tongueDark: 0xd8324e,
    ink: darken(c, 0.82), irisA: lighten(c, 0.35), irisB: darken(c, 0.55), mouth: 0x3a0a20,
    outline: darken(c, 0.78), rim: lighten(c, 0.6),
    };
  },
  build(p) {
    const prof = [[0, 0.55], [0.5, 0.18], [0.9, -0.1], [0.97, -0.08], [0.92, 0.02], [0.72, 0.26], [0.53, 0.48], [0.4, 0.62], [0.2, 0.86], [0.06, 1.0], [0.085, 1.07], [0, 1.15]];
    const coarse = [[0, 0.55], [0.9, -0.1], [0.97, -0.08], [0.92, 0.02], [0.53, 0.48], [0.2, 0.86], [0.06, 1.0], [0, 1.15]];
    const pleat = (v) => {
      const th = Math.atan2(v.x, v.z);                     // 正面（+Z）が 0
      const f = 0.5 - 0.5 * Math.cos(9 * th);             // 骨と骨の間で 1
      const r = 1 - 0.07 * f * sstep(0.45, -0.1, v.y);    // 紙が骨の間でたわむ（ふちほど強く）
      v.x *= r; v.z *= r;
      v.y += 0.06 * f * sstep(0.12, -0.1, v.y);           // ふちが骨の間で持ち上がる
    };
    const k = new Kit();
    k.add(lathe(prof, 18), {
      deform: pleat, hullGeo: lathe(coarse, 18), face: true, flat: true,
      fn: (q, n, l, out) => {
        if (n.y < -0.25 && q.y < 0.56) out.color = p.inner;          // 内側
        else if (q.y > 0.99) out.color = p.finial;                     // てっぺんの飾り
        else if (q.y > 0.47 && q.y < 0.63) out.color = p.band;         // 蛇の目の白い輪
        else out.color = q.y < -0.02 ? p.hem : p.main;
      },
    });
    // 一本足（白い足袋）
    k.add(new THREE.CapsuleGeometry(0.085, 0.62, 2, 8), {
      at: [0, -0.48, 0], hullGeo: new THREE.CapsuleGeometry(0.085, 0.62, 2, 6),
      fn: (q, n, l, out) => { out.color = q.y < -0.74 ? p.tabi : p.skin; },
    });
    // 下駄（斜めに向けて、歯が見えるように）
    const ry = 0.6, gy = -0.97;
    const off = (dx, dy, dz) => [dx * Math.cos(ry) + dz * Math.sin(ry), dy, -dx * Math.sin(ry) + dz * Math.cos(ry)];
    k.add(new THREE.BoxGeometry(0.46, 0.07, 0.19), { at: off(0, gy, 0.02), rot: [0, ry, 0], smooth: false, color: p.wood, hullGeo: new THREE.BoxGeometry(0.46, 0.07, 0.19) });
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.055, 0.11, 0.17), { at: off(s * 0.13, gy - 0.085, 0.02), rot: [0, ry, 0], smooth: false, color: p.tooth, hull: false });
    k.add(new THREE.TorusGeometry(0.075, 0.022, 4, 8, Math.PI), { at: off(0.02, gy + 0.03, 0.02), rot: [0, ry - Math.PI / 2, 0], color: p.strap, hull: false });
    // 舌（動く部品）
    const tongue = (rings, segs) => ribbon([V(0, 0.04, -0.06), V(0, -0.07, 0.06), V(0.02, -0.25, 0.1), V(0.06, -0.4, 0.08), V(0.13, -0.48, 0.02), V(0.2, -0.45, -0.03)], rings, segs, taperTip(0.12, 0.7), taperTip(0.045, 0.7));
    const tk = new Kit();
    tk.add(tongue(10, 8), { hullGeo: tongue(8, 6), fn: (q, n, l, out) => { out.color = mix(p.tongueDark, p.tongue, sstep(0.0, -0.35, l.y)); } });
    return { body: k.done(), part: { ...tk.done(), at: [0, -0.02, 0.86], parent: 'body', name: 'tongue' } };
  },
  update(o, s) {
    const t = s.t, ph = s.ph;
    const P = 0.85;                                      // 1 回の跳ねの長さ（秒）
    const u = (t / P + ph) % 1;
    const air = 4 * u * (1 - u);                         // 0：着地 → 1：いちばん高い
    const land = 1 - sstep(0, 0.18, Math.min(u, 1 - u)); // 着地の前後で 1
    const sy = 1 - 0.13 * land + 0.05 * air, sx = 1 / Math.sqrt(sy);
    o.pose.scale.set(sx, sy, sx);
    o.pose.position.y = air * 0.2 - 0.06 - 1.0 * (1 - sy); // 足もと（y = -1）を止めてつぶれる
    o.pose.rotation.z = -s.lean * 0.3 + Math.sin(t * 1.3) * 0.05;
    o.part.rotation.set(0.1 + air * 0.25, 0, Math.sin(t * 5.2 + ph * 6) * 0.25 + s.lean * 0.4);
  },
};

// ---------------------------------------------------------------- 化け猫の霊：黒い猫の頭に光る目、首輪と鈴、人魂のしっぽ
SPEC.cat = {
  color: 'violet',
  rim: 0.95,
  outlineWidth: 0.85,
  face: { cx: 0, cy: 0.1, hs: 0.62, bright: 1.35 },
  palette: (c) => ({
    main: c, fur: 0x2c2340, muzzle: 0x4a3c62, earIn: mix(c, 0xff8fc8, 0.45), collar: 0xe8303c, bell: 0xffcc40,
    tail: mix(0x2c2340, c, 0.55), tailTip: lighten(c, 0.35), whisker: 0xdcc4ff,
    outline: mix(c, 0x1a0a28, 0.62), rim: c,
  }),
  build(p) {
    const k = new Kit();
    k.add(new THREE.SphereGeometry(0.7, 14, 10), {
      at: [0, 0.18, 0], scale: [1.12, 0.94, 0.96], face: true, hullGeo: new THREE.SphereGeometry(0.7, 10, 7),
      fn: (q, n, l, out) => {
        const m = sstep(0.45, 0.8, n.z) * sstep(0.34, 0.2, Math.abs(q.x)) * sstep(-0.34, -0.2, q.y) * sstep(0.12, 0.0, q.y);
        out.color = mix(p.fur, p.muzzle, m);
      },
    });
    for (const s of [-1, 1]) {
      k.add(new THREE.ConeGeometry(0.29, 0.56, 6), { at: [s * 0.44, 0.84, -0.06], rot: [-0.15, 0, -s * 0.38], scale: [1, 1, 0.6], color: p.fur, hullGeo: new THREE.ConeGeometry(0.29, 0.56, 5) });
      k.add(new THREE.ConeGeometry(0.17, 0.36, 5), { at: [s * 0.43, 0.8, 0.02], rot: [-0.15, 0, -s * 0.38], scale: [1, 1, 0.5], color: p.earIn, glow: 0.35, hull: false });
      // ほおの毛（とがった房）
      for (const [y, a, len] of [[0.04, 0.3, 0.32], [-0.14, 0.85, 0.26]]) {
        k.add(new THREE.ConeGeometry(0.1, len, 4), {
          at: [s * (0.72 + Math.cos(a) * len * 0.45), y - Math.sin(a) * len * 0.45, 0.0], rot: [0, 0, -s * (Math.PI / 2 + a)], scale: [1, 1, 0.7], color: p.fur,
        });
      }
    }
    k.add(new THREE.TorusGeometry(0.34, 0.065, 4, 14), { at: [0, -0.4, 0.02], rot: [Math.PI / 2 - 0.3, 0, 0], color: p.collar, hullGeo: new THREE.TorusGeometry(0.34, 0.065, 3, 12) });
    k.add(new THREE.SphereGeometry(0.12, 8, 6), { at: [0, -0.52, 0.34], color: p.bell, glow: 0.3, hullGeo: new THREE.SphereGeometry(0.12, 6, 4) });
    // 人魂のしっぽ（動く部品）：首の下から垂れて、先が巻き上がる
    const rad = (t) => 0.3 * Math.sqrt(sstep(0, 0.06, t)) * Math.pow(1 - t, 0.8);
    const tail = (rings, segs) => ribbon([V(0, 0.06, 0), V(0, -0.22, -0.02), V(0.1, -0.48, -0.04), V(0.3, -0.62, -0.02), V(0.48, -0.55, 0.0), V(0.55, -0.38, 0.02)], rings, segs, rad, rad);
    const tk = new Kit();
    tk.add(tail(11, 8), {
      hullGeo: tail(8, 6),
      fn: (q, n, l, out) => {
        const tt = clamp(sstep(0.0, 0.5, l.x) * 0.65 + sstep(0.0, -0.6, l.y) * 0.35, 0, 1);
        out.color = tt < 0.6 ? mix(p.fur, p.tail, tt / 0.6) : mix(p.tail, p.tailTip, (tt - 0.6) / 0.4);
        out.glow = tt * 0.85;
      },
    });
    return {
      body: k.done(),
      part: { ...tk.done(), at: [0, -0.42, -0.04], parent: 'pose', name: 'tail' },
      fx: [
        { at: [0, 0.12, -0.1], size: 1.6, type: FX.glow, mode: FXM.halo, a: 0.05, b: 2.2, c: 0.15, alpha: 0.8 },
        { at: [-1.02, 0.42, 0.15], size: 0.22, stretch: 1.45, type: FX.flame, mode: FXM.wisp, a: 0.07, b: 1.6, phase: 0.1, hot: 0.1 },
        { at: [1.0, 0.64, 0.15], size: 0.2, stretch: 1.45, type: FX.flame, mode: FXM.wisp, a: 0.07, b: 1.9, phase: 0.6, hot: 0.1 },
      ],
      fxOpts: { color: p.main, hot: 0xfff0ff, intensity: 0.7 },
    };
  },
  update(o, s, dt, e) {
    const t = s.t, ph = s.ph * TAU;
    o.pose.position.y = Math.sin(t * 1.8 + ph) * 0.07;
    o.pose.rotation.z = Math.sin(t * 1.1 + ph) * 0.07 - s.lean * 0.2;
    o.part.rotation.set(0, Math.sin(t * 1.9 + ph) * 0.3, Math.sin(t * 2.6 + ph) * 0.28 + s.lean * 0.45);
    s.special = e.maxHp > 0 && e.hp / e.maxHp < 0.3;     // 弱るとシャーッと怒る
  },
};

// ---------------------------------------------------------------- 月の兎の兵隊：白くてまるい兎、赤いはちまき、小さな杵
const earLen = 0.95;
const earW = (t) => 0.135 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.6) + 0.04 * (1 - t);
const earBend = (bend) => (t) => bend * sstep(0.4, 1, t) ** 2 * 0.35;
const earGeo = (bend, rings, segs) => loft(rings, segs, (t, a, out) => {
  const w = earW(t);
  out.set(earBend(bend)(t) + w * Math.cos(a), earLen * t - bend * sstep(0.5, 1, t) ** 2 * 0.1, w * 0.42 * Math.sin(a));
});
SPEC.rabbit = {
  color: 'pink',
  rim: 0.5,
  outlineWidth: 0.8,
  face: { cx: 0, cy: -0.2, hs: 0.55 },
  palette: (c) => ({
    main: c, fur: 0xfdf8f4, furGlow: 0.12, earIn: mix(c, 0xffb0c8, 0.3), band: 0xe8303c, mark: 0xffe27a,
    handle: 0xd8aa70, mallet: 0xc68a52, malletEnd: 0x7a4a2a,
    ink: 0x4a0a1a, iris: 0xff4a6a, brow: 0x6a4a52, blush: c, mouthLine: 0x8a4a5a, mouthIn: 0x7a1a2a,
    outline: 0x40263a, rim: mix(c, 0xffffff, 0.45),
  }),
  build(p) {
    const k = new Kit();
    k.add(new THREE.SphereGeometry(0.66, 14, 10), { at: [0, -0.22, 0], scale: [1.06, 0.96, 0.96], face: true, color: p.fur, glow: p.furGlow, hullGeo: new THREE.SphereGeometry(0.66, 9, 7) });
    for (const [s, bend] of [[-1, 0], [1, 0.8]]) {
      const at = [s * 0.24, 0.3, -0.06], rot = [-0.12, 0, s > 0 ? -0.32 : 0.2];
      k.add(earGeo(bend, 7, 7), { at, rot, color: p.fur, glow: p.furGlow, hullGeo: earGeo(bend, 5, 6) });
      // 耳の内側（桃色）：少し細い耳を手前に重ねる
      const inner = loft(5, 5, (t, a, out) => {
        const u = 0.1 + 0.8 * t;                          // 耳の根元 1 割〜先 1 割のあいだ
        const w = earW(u) * 0.58 * sstep(0.0, 0.15, t) * sstep(1.0, 0.85, t);
        out.set(earBend(bend)(u) + w * Math.cos(a), earLen * u - bend * sstep(0.5, 1, u) ** 2 * 0.1, earW(u) * 0.3 + 0.008 + w * 0.25 * Math.sin(a));
      });
      k.add(inner, { at, rot, color: p.earIn, hull: false });
    }
    // はちまき（額に月のしるし、後ろで結ぶ）
    k.add(new THREE.TorusGeometry(0.575, 0.07, 3, 16), { at: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0], scale: [1.07, 0.97, 1], color: p.band, hull: false });
    k.add(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 8), { at: [0, 0.1, 0.615], rot: [Math.PI / 2, 0, 0], color: p.mark, glow: 0.4, hull: false, smooth: false });
    k.add(new THREE.SphereGeometry(0.08, 6, 4), { at: [0.36, 0.1, -0.46], color: p.band, hull: false });
    k.add(new THREE.BoxGeometry(0.05, 0.3, 0.13), { at: [0.5, 0.0, -0.4], rot: [0.3, 0.4, -0.9], color: p.band, hull: false, smooth: false });
    k.add(new THREE.BoxGeometry(0.05, 0.26, 0.12), { at: [0.55, -0.1, -0.3], rot: [-0.2, 0.3, -1.5], color: p.band, hull: false, smooth: false });
    // 足・しっぽ・左手
    for (const s of [-1, 1]) k.add(new THREE.SphereGeometry(0.17, 6, 4), { at: [s * 0.27, -0.84, 0.18], scale: [1, 0.6, 1.3], color: p.fur, glow: p.furGlow, hullGeo: new THREE.SphereGeometry(0.17, 6, 4) });
    k.add(new THREE.SphereGeometry(0.15, 6, 4), { at: [0, -0.5, -0.62], color: p.fur, glow: p.furGlow, hull: false });
    k.add(new THREE.SphereGeometry(0.13, 6, 5), { at: [-0.66, -0.36, 0.2], scale: [1, 0.85, 1], color: p.fur, glow: p.furGlow, hullGeo: new THREE.SphereGeometry(0.13, 5, 4) });
    // 杵（動く部品）：右手で持つ。原点が手
    const m = new Kit();
    m.add(new THREE.CylinderGeometry(0.038, 0.045, 0.78, 6), { at: [0, 0.36, 0], color: p.handle, hullGeo: new THREE.CylinderGeometry(0.038, 0.045, 0.78, 5) });
    m.add(new THREE.CylinderGeometry(0.17, 0.17, 0.46, 10), {
      at: [0, 0.8, 0], rot: [0, 0, Math.PI / 2], flat: true, smooth: false, hullGeo: new THREE.CylinderGeometry(0.17, 0.17, 0.46, 8),
      fn: (q, n, l, out) => { out.color = Math.abs(l.y) > 0.2 ? p.malletEnd : p.mallet; },
    });
    m.add(new THREE.SphereGeometry(0.12, 7, 5), { at: [0, 0, 0.04], color: p.fur, glow: p.furGlow, hullGeo: new THREE.SphereGeometry(0.12, 5, 4) });
    return { body: k.done(), part: { ...m.done(), at: [0.6, -0.38, 0.26], parent: 'pose', name: 'mallet' } };
  },
  update(o, s) {
    const t = s.t, ph = s.ph;
    const P = 0.55;
    const u = (t / P + ph) % 1;
    const air = Math.sin(Math.PI * u);
    const land = 1 - sstep(0, 0.2, Math.min(u, 1 - u));
    const sy = 1 - 0.08 * land + 0.03 * air, sx = 1 / Math.sqrt(sy);
    o.pose.scale.set(sx, sy, sx);
    o.pose.position.y = air * 0.09 - 0.95 * (1 - sy);
    o.pose.rotation.z = -s.lean * 0.25 + Math.sin(t * 2.1) * 0.05;
    // 杵：ゆっくり振り上げて、すばやく振り下ろす
    const C = 1.9;
    const k = (((t + ph * 3) % C) + C) % C / C;
    let a;
    if (k < 0.6) a = 0.05 + 0.55 * ease.outQuad(k / 0.6);          // 構え → 振り上げ
    else if (k < 0.7) a = 0.6 - 1.9 * ease.inQuad((k - 0.6) / 0.1); // 振り下ろし
    else a = -1.3 + 1.35 * ease.inOutQuad((k - 0.7) / 0.3);         // もとへ
    o.part.rotation.z = a;
    s.special = k > 0.58 && k < 0.8;                     // かけ声
  },
};

// ---------------------------------------------------------------- 星の精：ふっくらした金の星（顔はまっすぐのまま、星だけが回る）
const STAR = { Rt: 1.12, Rv: 0.56, Tf: 0.36, Tb: 0.2, dome: 0.06, tipRound: 0.18, valleyRound: 0.12 };
// 星の形（中心からの距離）：とがった星の先と谷を、それぞれ丸める
const hyp = (u, e) => Math.sqrt(u * u + e * e) - e;
const starGraw = (u) => 1 - hyp(u, STAR.tipRound) + hyp(1 - u, STAR.valleyRound) - (1 - u);
const starG = (u) => clamp((starGraw(u) - starGraw(1)) / Math.max(1e-6, starGraw(0) - starGraw(1)), 0, 1);
const starR = (th) => {
  const arm = TAU / 5;
  let f = ((th - Math.PI / 2) % arm + arm) % arm;      // 先からの角度（0〜72°）
  if (f > arm / 2) f = arm - f;
  return STAR.Rv + (STAR.Rt - STAR.Rv) * starG(f / (arm / 2));
};
const starH = (s) => Math.sqrt(Math.max(0, 1 - s ** 4));
const starDome = (rho) => STAR.dome * Math.max(0, 1 - (rho / 0.45) ** 2) ** 1.5;
function starGeometry(M, rings) {
  const pos = [], idx = [];
  const add = (x, y, z) => (pos.push(x, y, z), pos.length / 3 - 1);
  const ring = (s, back) => {
    const out = [];
    for (let j = 0; j < M; j++) {
      const th = Math.PI / 2 + (j / M) * TAU, R = starR(th) * s;
      const z = s >= 1 ? 0 : back ? -STAR.Tb * starH(s) : STAR.Tf * starH(s) + starDome(R);
      out.push(add(Math.cos(th) * R, Math.sin(th) * R, z));
    }
    return out;
  };
  const fc = add(0, 0, STAR.Tf + STAR.dome), bc = add(0, 0, -STAR.Tb);
  const front = [], back = [];
  for (const s of rings) { front.push(ring(s, false)); back.push(ring(s, true)); }
  const rim = ring(1, false);
  front.push(rim); back.push(rim);
  for (const [rs, c, dir] of [[front, fc, 1], [back, bc, -1]]) {
    for (let j = 0; j < M; j++) {
      const j1 = (j + 1) % M;
      if (dir > 0) idx.push(c, rs[0][j], rs[0][j1]); else idx.push(c, rs[0][j1], rs[0][j]);
      for (let k = 0; k + 1 < rs.length; k++) {
        const a = rs[k], b = rs[k + 1];
        if (dir > 0) idx.push(a[j], b[j], b[j1], a[j], b[j1], a[j1]);
        else idx.push(a[j], b[j1], b[j], a[j], a[j1], b[j1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
SPEC.starspirit = {
  color: 'gold',
  rim: 0.5,
  outlineWidth: 0.8,
  face: {
    cx: 0, cy: -0.04, hs: 0.5, parent: 'pose', n: 6,
    // 星が回っても顔が沈まないよう、その半径でいちばん高いところ（とがった先の向き）に合わせる
    surface: (x, y) => { const r = Math.hypot(x, y); return STAR.Tf * starH(Math.min(1, r / STAR.Rt)) + starDome(r); },
  },
  palette: (c) => ({
    main: c, center: lighten(c, 0.62), tip: mix(c, 0xff8a1a, 0.55), back: darken(c, 0.22),
    ink: 0x3a1a08, iris: 0xff9a20, mouth: 0x7a1a10,
    outline: 0x6a3410, rim: 0xfff4c0,
  }),
  build(p) {
    const k = new Kit();
    k.add(starGeometry(50, [0.42, 0.72, 0.9]), {
      hullGeo: starGeometry(50, [0.75]),
      fn: (q, n, l, out) => {
        const rho = Math.hypot(q.x, q.y);
        out.color = n.z > -0.25 ? mix(p.center, p.main, sstep(0.12, 0.62, rho)) : p.back;
        out.color = mix(out.color, p.tip, sstep(0.72, 1.08, rho));
        out.glow = 0.45 - 0.25 * sstep(0.1, 1.0, rho);
      },
    });
    return {
      body: k.done(),
      fx: [
        { at: [0, 0, -0.05], size: 1.75, type: FX.glow, mode: FXM.halo, a: 0.07, b: 2.0, c: 0.1, alpha: 0.75 },
        { at: [0.95, 0.78, 0.25], size: 0.3, type: FX.sparkle, mode: FXM.twinkle, b: 2.3, phase: 0.0 },
        { at: [-1.02, 0.32, 0.25], size: 0.24, type: FX.sparkle, mode: FXM.twinkle, b: 1.9, phase: 0.35 },
        { at: [-0.55, -0.98, 0.25], size: 0.26, type: FX.sparkle, mode: FXM.twinkle, b: 2.6, phase: 0.62 },
        { at: [0.78, -0.72, 0.25], size: 0.22, type: FX.sparkle, mode: FXM.twinkle, b: 2.1, phase: 0.85 },
      ],
      fxOpts: { color: p.main, hot: 0xffffff, intensity: 0.6 },
    };
  },
  state: () => ({ spin: 0, spinV: -0.7 }),
  update(o, s, dt) {
    const t = s.t, ph = s.ph * TAU;
    s.spinV = damp(s.spinV, -0.7 - 2.2 * s.lean, 3, dt);   // 右へ動くと時計回りに速く
    s.spin += s.spinV * dt;
    o.body.rotation.z = s.spin;
    o.pose.rotation.set(Math.sin(t * 1.3 + ph) * 0.12, Math.sin(t * 1.05 + ph) * 0.18 - s.lean * 0.3, 0);
    o.pose.position.y = Math.sin(t * 2.2 + ph) * 0.06;
    s.special = Math.sin(t * 0.9 + ph) > 0.93;           // ときどきウインク
  },
};

// ---------------------------------------------------------------- 輪入道：燃える牛車の車輪、まん中にこわい顔
SPEC.wheel = {
  color: 'red',
  rim: 0.4,
  outlineWidth: 1.0,
  face: { cx: 0, cy: -0.02, hs: 0.44 },
  palette: (c) => ({
    main: c, fire: mix(c, 0xff6a1a, 0.55), flameTip: mix(c, 0xff5a1a, 0.3), flameMid: mix(c, 0xff9a2a, 0.65), flameCore: 0xffe27a,
    wood: 0x5a3824, woodLight: 0x7c5236, spoke: 0x4a2c1c, skin: 0xffc49a, hub: 0x6a4430, nose: 0xf0907a,
    ink: 0x1a0c08,
    outline: 0x1e1210, rim: 0xffd0a0,
  }),
  build(p) {
    // 顔（動かない本体）
    const k = new Kit();
    k.add(new THREE.SphereGeometry(0.44, 12, 8), {
      at: [0, 0, 0.06], scale: [1, 0.96, 0.7], face: true, hullGeo: new THREE.SphereGeometry(0.44, 10, 6),
      fn: (q, n, l, out) => { out.color = mix(p.hub, p.skin, sstep(0.25, 0.5, n.z)); },
    });
    // 車輪（回る部品）
    const w = new Kit();
    w.add(new THREE.TorusGeometry(0.76, 0.1, 5, 22), {
      scale: [1, 1, 1.5], hullGeo: new THREE.TorusGeometry(0.76, 0.1, 4, 18),
      fn: (q, n, l, out) => { out.color = Math.hypot(q.x, q.y) > 0.8 ? p.woodLight : p.wood; },
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      w.add(new THREE.BoxGeometry(0.065, 0.42, 0.07), { at: [Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0], rot: [0, 0, a - Math.PI / 2], color: p.spoke, smooth: false, hull: false });
    }
    // かたい炎（ふちから外へ、回る向きと反対へなびく）
    const fprof = [[0, -0.2], [0.11, -0.17], [0.15, -0.08], [0.13, 0.04], [0.08, 0.16], [0.03, 0.27], [0, 0.34]];
    const fcoarse = [[0, -0.2], [0.14, -0.12], [0.12, 0.06], [0.05, 0.22], [0, 0.34]];
    const fcurl = (v) => { v.x += 0.09 * sstep(-0.05, 0.34, v.y) ** 2; };
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      w.add(lathe(fprof, 5), {
        deform: fcurl, at: [Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0], rot: [0, 0, a - Math.PI / 2 + 0.35], scale: [0.85, 0.85, 0.42],
        hullGeo: lathe(fcoarse, 5),
        fn: (q, n, l, out) => {
          const t = sstep(-0.2, 0.34, l.y);
          out.color = t < 0.4 ? mix(p.flameCore, p.flameMid, t / 0.4) : mix(p.flameMid, p.flameTip, (t - 0.4) / 0.6);
          out.glow = 0.85 - 0.3 * t;
        },
      });
    }
    const fx = [{ at: [0, 0, -0.05], size: 1.85, type: FX.glow, mode: FXM.halo, a: 0.05, b: 3.0, c: 0.25, alpha: 0.9 }];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      fx.push({ at: [Math.cos(a) * 0.93, Math.sin(a) * 0.93, 0.14], size: 0.2, stretch: 1.7, type: FX.flame, mode: FXM.rimFlame, a: 0.35, b: 9 + i * 0.7, phase: i * 0.13, spin: true });
    }
    for (let i = 0; i < 4; i++) fx.push({ at: [-0.5 + i * 0.33, 0.85, 0.1], size: 0.07, type: FX.dot, mode: FXM.ember, a: 0.7, b: 0.6 + i * 0.13, c: 0.25, phase: i * 0.29, hot: 0.6 });
    return {
      body: k.done(),
      part: { ...w.done(), at: [0, 0, 0], parent: 'pose', name: 'wheel' },
      fx,
      fxOpts: { color: p.fire, hot: 0xffd27a, intensity: 0.7 },
    };
  },
  state: () => ({ spin: 0, spinV: -1.2 }),
  update(o, s, dt, e) {
    const t = s.t, ph = s.ph * TAU;
    s.spinV = damp(s.spinV, -1.2 - 2.6 * s.lean, 3, dt);    // 右へ動くと時計回り（転がる向き）
    s.spin += s.spinV * dt;
    o.part.rotation.z = s.spin;
    o.fxMat.uniforms.uSpin.value = s.spin;
    o.body.position.y = Math.sin(t * 2.6 + ph) * 0.025;
    o.body.rotation.z = Math.sin(t * 1.3 + ph) * 0.05 - s.lean * 0.1;
    o.pose.rotation.set(0, -s.lean * 0.25, 0);
    o.pose.position.y = Math.sin(t * 1.6 + ph) * 0.05;
    s.special = e.maxHp > 0 && e.hp / e.maxHp < 0.35;    // 弱ると真っ赤になって怒る
  },
};

// ================================================================ 使い回すもの（種類 × 色ごと）
export const ENEMY_MODELS = Object.keys(SPEC);

const cache = new Map();

function colorOf(def, fallback) {
  const c = def?.color && PALETTE[def.color];
  if (c) return c.getHex();
  if (typeof def?.colorHex === 'number') return def.colorHex;
  return PALETTE[fallback]?.getHex() ?? 0xffaa66;
}

function shared(kind, hex) {
  const key = kind + ':' + hex;
  let R = cache.get(key);
  if (R) return R;
  const S = SPEC[kind];
  const p = S.palette(hex);
  const b = S.build(p);
  const F = S.face;
  const faceGeo = decalGeometry(b.body.face, { cx: F.cx, cy: F.cy, hs: F.hs, n: F.n ?? 5, lift: F.lift ?? 0.03, surface: F.surface || null });
  b.body.face?.dispose();
  const atlas = faceAtlas(faceDrawer(kind, p), F.res ?? 256);
  R = {
    p, body: b.body, part: b.part || null, faceGeo, frames: atlas.frames,
    fxGeo: b.fx ? fxGeometry(b.fx) : null, fxOpts: b.fxOpts || {},
    outline: outlineMaterial(p.outline, S.outlineWidth ?? 0.8),
  };
  cache.set(key, R);
  return R;
}

/** 先に作っておく（最初に出たときに止まらないように）。defs は KIND の値の配列など。 */
export function preloadEnemyModels(defs = []) {
  for (const d of defs) if (d?.model && SPEC[d.model]) shared(d.model, colorOf(d, SPEC[d.model].color));
}

/**
 * シェーダーを先に作らせる：種類ごとに 1 体を画面の外に置き、frustumCulled を切って 1 コマだけ描かせる。
 * 戻り値の関数を、描いたあと（次のフレーム）に呼んで片づける。
 *   const done = warmEnemyModels(field.scene, Object.values(KIND));  // …1 コマ描く…  done();
 */
export function warmEnemyModels(scene, defs = []) {
  const seen = new Set();
  const list = [];
  for (const d of defs) {
    if (!d?.model || !SPEC[d.model] || seen.has(d.model + ':' + d.color)) continue;
    seen.add(d.model + ':' + d.color);
    const m = makeEnemyModel(d.model, d, { seed: 1 });
    m.root.position.set(1e5, 1e5, 0);
    m.root.traverse((o) => { o.frustumCulled = false; });
    scene.add(m.root);
    list.push(m);
  }
  return () => { for (const m of list) { m.root.removeFromParent(); m.dispose(); } };
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IDLE = { flash: 0, facing: 0, hp: 1, maxHp: 1 };

// シェーダーの作り直しを防ぐ：材質を全部捨てると three.js はプログラムも捨てるので、敵がいなくなったあとの次の 1 体で
// シェーダーを作り直して止まる。描いたことのある材質を、種類（本体・顔・光の板）ごとに 1 つだけ捨てずに残す。
const keepers = {};
function release(key, m, drawn) {
  if (drawn && !keepers[key]) { keepers[key] = m; return; }
  m.dispose();
}

function addHull(mesh, geo, mat) {
  const o = new THREE.Mesh(geo, mat);
  o.name = mesh.name + '-outline';
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

/**
 * 敵のモデルを 1 体作る。kind はモデル名（wisp / leaf / lantern / umbrella / cat / rabbit / starspirit / wheel）、
 * def は KIND の定義（r：大きさ、color：PALETTE の色名）。opts.seed を渡すと動きの位相が毎回同じになる（確認台・撮影用）。
 * 返すもの：{ root, update(dt, enemy), dispose() }
 */
export function makeEnemyModel(kind, def = {}, opts = {}) {
  const name = SPEC[kind] ? kind : 'wisp';
  const S = SPEC[name];
  const R = shared(name, colorOf(def, S.color));
  const r = def.r ?? 12;
  const rnd = opts.seed != null ? mulberry(opts.seed) : Math.random;

  const root = new THREE.Group();
  root.name = 'enemy-' + name;
  const unit = new THREE.Group();       // r 倍（ここから下は r = 1 の大きさ）
  unit.name = 'unit';
  unit.scale.setScalar(r);
  root.add(unit);
  const pose = new THREE.Group();       // 揺れ・傾き・跳ね
  pose.name = 'pose';
  unit.add(pose);

  const mat = bodyMaterial({ rim: S.rim ?? 0.5, rimColor: R.p.rim });
  const body = new THREE.Mesh(R.body.geo, mat);
  body.name = 'body';
  let drawn = false;                    // 1 回でも描かれたか（材質にシェーダーが付いたか）
  body.onBeforeRender = () => { drawn = true; };
  pose.add(body);
  if (R.body.hull) addHull(body, R.body.hull, R.outline);

  let part = null;
  if (R.part) {
    part = new THREE.Mesh(R.part.geo, mat);   // 本体と同じ材質（いっしょに点滅する）
    part.name = R.part.name;
    part.position.fromArray(R.part.at);
    (R.part.parent === 'body' ? body : pose).add(part);
    if (R.part.hull) addHull(part, R.part.hull, R.outline);
  }

  const faceMat = faceMaterial(R.frames[0], S.face.bright ?? 1);
  const face = new THREE.Mesh(R.faceGeo, faceMat);
  face.name = 'face';
  face.renderOrder = 1;
  (S.face.parent === 'pose' ? pose : body).add(face);

  let fx = null, fxMat = null;
  if (R.fxGeo) {
    fxMat = fxMaterial(R.fxOpts);
    fx = new THREE.Mesh(R.fxGeo, fxMat);
    fx.name = 'fx';
    fx.raycast = () => {};
    pose.add(fx);
  }

  const o = { root, unit, pose, body, part, face, fx, mat, faceMat, fxMat };
  const s = { t: rnd() * 60, ph: rnd(), lean: 0, blinkIn: 0.8 + rnd() * 2.5, blinkT: 0, frame: 0, special: false, rnd, ...(S.state?.(rnd) || {}) };
  S.init?.(o, s);

  function update(dt = 0, e = IDLE) {
    dt = Math.min(Math.max(+dt || 0, 0), 0.1);
    const E = e || IDLE;
    s.t += dt;
    s.lean = damp(s.lean, clamp((E.facing || 0) / 3, -1, 1), 8, dt);
    // まばたき
    if (s.blinkT > 0) s.blinkT -= dt;
    else if ((s.blinkIn -= dt) <= 0) { s.blinkT = 0.12; s.blinkIn = 1.8 + s.rnd() * 3.2; }
    S.update(o, s, dt, E);
    if (fxMat) { fxMat.uniforms.uTime.value = s.t; fxMat.uniforms.uLean.value = s.lean; }
    // 当たったら白く光って、痛い顔
    const hit = (E.flash || 0) > 0;
    setFlash(mat, hit ? 0.35 + 0.5 * Math.min(1, E.flash / 3) : 0);
    const f = hit ? 2 : s.special ? 3 : s.blinkT > 0 ? 1 : 0;
    if (f !== s.frame) { s.frame = f; faceMat.map = R.frames[f]; }
  }
  update(0, IDLE);

  return {
    root,
    update,
    dispose() {
      release('body', mat, drawn);
      release('face', faceMat, drawn);
      if (fxMat) release('fx', fxMat, drawn);
    },
  };
}
