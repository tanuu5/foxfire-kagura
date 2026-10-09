// 和の小物の形（コードで組む）。どれも足もとが原点、上が +Y、正面が +Z。色は頂点の色、灯りは aEmit。
// 大きさは「だいたいメートル」で作り、置くときに倍率を掛ける（ステージごとに見やすい大きさにする）。
//
//   toriiGeo        鳥居（稲荷の明神鳥居：朱の柱・黒い笠木と根巻・台輪）。柱の間が 1
//   stoneLanternGeo 石灯籠（春日形。火袋が光る）
//   foxStatueGeo    狐像（台座つき・赤い前掛け）
//   hokoraGeo       祠
//   cedarGeo        杉（高さ 1）       mapleGeo  紅葉（高さ 1。葉の色はインスタンスの色で）
//   bambooGeo       竹の幹（高さ 1）    floatLanternGeo  灯籠流しの灯籠
//   archBridgeGeo   反り橋              stepsGeo  石段
//   hipRoofGeo      反りのある寄棟の屋根  hallGeo  社殿     pagodaGeo  五重塔
//   rockIslandGeo   浮き島の岩
import * as THREE from 'three';
import { part, merge, bendY, shadeY, jitter, paintFn } from './geo.js';

const C = (hex) => new THREE.Color(hex);
const TAU = Math.PI * 2;

/** 朱の部分（赤が強く緑が弱い頂点）を少し光らせる。灯りに照らされた鳥居の感じ。 */
export function emitShu(geo, k) {
  const c = geo.attributes.color, e = geo.attributes.aEmit;
  for (let i = 0; i < c.count; i++) if (c.getX(i) > 0.3 && c.getY(i) < 0.12) e.setX(i, k);
  e.needsUpdate = true;
  return geo;
}

export const PAL = {
  shu: 0xc8381e,      // 朱
  shuDark: 0x8e2416,
  kuro: 0x241816,     // 黒（笠木・根巻）
  stone: 0x8c877c,
  stoneDark: 0x5e5a52,
  wood: 0x4a3226,
  woodDark: 0x2c1e18,
  paper: 0xffd7a0,
  light: 0xffb45e,
  gold: 0xc8a050,
  copper: 0x2f5e55,   // 緑青の屋根
  bark: 0x3a2a22,
  wall: 0xb8b0a2,
};

/** 鳥居。o = { h（高さ。柱の間を 1 として）, seg, plaque（額）, red, black, daiwa } */
export function toriiGeo(o = {}) {
  const h = o.h ?? 1.3, seg = o.seg ?? 8, ks = o.kseg ?? 10;
  const red = o.red ?? PAL.shu, black = o.black ?? PAL.kuro;
  const r = o.r ?? 0.058;
  const P = [];
  for (const s of [-1, 1]) {
    P.push(part(new THREE.CylinderGeometry(r * 0.9, r, h * 0.86, seg, 1, true), red, { p: [s * 0.5, h * 0.43, 0], r: [0, 0, s * 0.022] }));
    P.push(part(new THREE.CylinderGeometry(r * 1.2, r * 1.26, h * 0.08, seg, 1, true), black, { p: [s * 0.51, h * 0.04, 0] }));
    if (o.daiwa !== false) P.push(part(new THREE.CylinderGeometry(r * 1.28, r * 1.28, h * 0.035, seg), red, { p: [s * 0.49, h * 0.848, 0] }));
  }
  // 笠木（両端が反り上がる）と島木
  const kL = 1.56, kas = new THREE.BoxGeometry(kL, h * 0.072, r * 2.7, ks, 1, 1);
  bendY(kas, (x) => Math.pow(Math.abs(x) / (kL / 2), 2.6) * h * 0.065);
  P.push(part(kas, black, { p: [0, h * 0.935, 0] }));
  const sL = 1.4, shi = new THREE.BoxGeometry(sL, h * 0.055, r * 2.2, ks, 1, 1);
  bendY(shi, (x) => Math.pow(Math.abs(x) / (sL / 2), 2.6) * h * 0.04);
  P.push(part(shi, red, { p: [0, h * 0.872, 0] }));
  // 貫と額束
  P.push(part(new THREE.BoxGeometry(1.24, h * 0.05, r * 1.3), red, { p: [0, h * 0.7, 0] }));
  P.push(part(new THREE.BoxGeometry(0.085, h * 0.13, r * 1.1), red, { p: [0, h * 0.79, 0] }));
  if (o.plaque) {
    P.push(part(new THREE.BoxGeometry(0.2, h * 0.15, r * 0.5), o.plaqueColor ?? 0x1a1620, { p: [0, h * 0.79, r * 0.7] }));
    P.push(part(new THREE.BoxGeometry(0.23, h * 0.018, r * 0.55), PAL.gold, { p: [0, h * 0.87, r * 0.7] }));
    P.push(part(new THREE.BoxGeometry(0.23, h * 0.018, r * 0.55), PAL.gold, { p: [0, h * 0.71, r * 0.7] }));
  }
  if (o.shimenawa) {
    // しめ縄（貫の少し上にたるむ太い縄）と紙垂
    const rope = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.5, h * 0.66, 0.0), new THREE.Vector3(-0.25, h * 0.6, 0.06), new THREE.Vector3(0, h * 0.585, 0.07),
      new THREE.Vector3(0.25, h * 0.6, 0.06), new THREE.Vector3(0.5, h * 0.66, 0.0)]), 16, 0.028, 6, false);
    P.push(part(rope, 0x8a7a50));
    // 紙垂（白い紙のジグザグ）
    for (const x of [-0.27, 0, 0.27]) {
      const yy = h * 0.585 - (x === 0 ? 0.02 : 0.012);
      for (let k = 0; k < 4; k++) {
        const ox = (k % 2 ? 1 : -1) * 0.009;
        P.push(part(new THREE.BoxGeometry(0.03, 0.036, 0.003), 0xece6d8, { p: [x + ox, yy - 0.03 - k * 0.034, 0.072], r: [0, 0, (k % 2 ? 0.5 : -0.5)], emit: 0.25 }));
      }
    }
  }
  return merge(P);
}

/** 石灯籠（高さ約 2.15）。posts：火袋の柱を入れるか（近くで見るときだけ）。 */
export function stoneLanternGeo(o = {}) {
  const seg = o.seg ?? 6, st = o.stone ?? PAL.stone, emit = o.emit ?? 1.6, li = o.light ?? PAL.paper;
  const P = [];
  P.push(part(new THREE.CylinderGeometry(0.4, 0.48, 0.22, seg), st, { p: [0, 0.11, 0] }));
  P.push(part(new THREE.CylinderGeometry(0.28, 0.34, 0.12, seg), st, { p: [0, 0.28, 0] }));
  P.push(part(new THREE.CylinderGeometry(0.12, 0.15, 0.96, 8, 1, true), st, { p: [0, 0.82, 0] }));
  P.push(part(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 8), st, { p: [0, 0.82, 0] }));
  P.push(part(new THREE.CylinderGeometry(0.34, 0.2, 0.17, seg), st, { p: [0, 1.36, 0] }));
  P.push(part(new THREE.CylinderGeometry(0.26, 0.26, 0.05, seg), st, { p: [0, 1.47, 0] }));
  P.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.3, seg, 1, true), li, { p: [0, 1.64, 0], emit }));
  if (o.posts) {
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * TAU;
      P.push(part(new THREE.BoxGeometry(0.055, 0.3, 0.055), st, { p: [Math.sin(a) * 0.215, 1.64, Math.cos(a) * 0.215], r: [0, a, 0] }));
    }
  }
  P.push(part(new THREE.CylinderGeometry(0.5, 0.52, 0.05, seg), st, { p: [0, 1.81, 0] }));
  P.push(part(new THREE.CylinderGeometry(0.05, 0.5, 0.3, seg), st, { p: [0, 1.98, 0] }));
  P.push(part(new THREE.SphereGeometry(0.085, 6, 4), st, { p: [0, 2.16, 0] }));
  P.push(part(new THREE.ConeGeometry(0.04, 0.09, 6), st, { p: [0, 2.27, 0] }));
  const g = merge(P);
  // 根元を暗く・苔を少し
  paintFn(g, (x, y, z, c) => { const k = 0.6 + 0.4 * Math.min(1, y / 1.2); c.multiplyScalar(k); if (y < 0.35) c.lerp(C(0x3a4a2e), 0.35); });
  return g;
}

/** 狐像（台座つき、高さ約 2.1）。正面 +Z。mirror：左右を入れ替えた向き（しっぽの巻き）。 */
export function foxStatueGeo(o = {}) {
  const st = o.stone ?? 0x9d978a, bib = o.bib ?? 0xb52a1e, seg = o.seg ?? 12;
  const P = [];
  let y0 = 0;
  if (o.pedestal !== false) {
    P.push(part(new THREE.BoxGeometry(0.95, 0.2, 0.85), PAL.stoneDark, { p: [0, 0.1, 0] }));
    P.push(part(new THREE.BoxGeometry(0.74, 0.86, 0.64), 0x7c776c, { p: [0, 0.63, 0] }));
    P.push(part(new THREE.BoxGeometry(0.9, 0.12, 0.8), PAL.stoneDark, { p: [0, 1.12, 0] }));
    y0 = 1.18;
  }
  const s = o.mirror ? -1 : 1;
  P.push(part(new THREE.SphereGeometry(0.25, seg, 8), st, { p: [0, y0 + 0.19, -0.06], s: [1.0, 0.78, 1.18] }));            // 腰
  P.push(part(new THREE.SphereGeometry(0.19, seg, 8), st, { p: [0, y0 + 0.5, 0.03], s: [0.86, 1.5, 0.84], r: [0.22, 0, 0] })); // 胴
  for (const k of [-1, 1]) {
    P.push(part(new THREE.CylinderGeometry(0.042, 0.052, 0.42, 6), st, { p: [k * 0.085, y0 + 0.22, 0.15], r: [0.08, 0, 0] }));  // 前足
    P.push(part(new THREE.SphereGeometry(0.058, 6, 4), st, { p: [k * 0.085, y0 + 0.03, 0.19], s: [1, 0.6, 1.35] }));
  }
  P.push(part(new THREE.SphereGeometry(0.135, seg, 8), st, { p: [0, y0 + 0.86, 0.09], s: [1, 0.95, 1.05] }));                 // 頭
  P.push(part(new THREE.ConeGeometry(0.072, 0.25, 8), st, { p: [0, y0 + 0.81, 0.27], r: [Math.PI / 2 + 0.18, 0, 0] }));        // 鼻先
  P.push(part(new THREE.SphereGeometry(0.022, 5, 4), 0x2a2622, { p: [0, y0 + 0.785, 0.39] }));                               // 鼻
  for (const k of [-1, 1]) P.push(part(new THREE.ConeGeometry(0.052, 0.17, 4), st, { p: [k * 0.072, y0 + 1.0, 0.06], r: [0.12, 0, -k * 0.22] })); // 耳
  // しっぽ：後ろから上へ大きく巻き上がる（先は白っぽく）
  const tail = [[0.0, 0.16, -0.3, 0.1], [0.05, 0.36, -0.42, 0.125], [0.07, 0.58, -0.42, 0.13], [0.05, 0.78, -0.33, 0.11], [0.02, 0.92, -0.2, 0.08]];
  tail.forEach(([x, y, z, r], i) => P.push(part(new THREE.SphereGeometry(r, 8, 6), i === 4 ? 0xc9c4b8 : st, { p: [x * s, y0 + y, z] })));
  // 赤い前掛け（首の前にかけた半分の円すい）
  P.push(part(new THREE.CylinderGeometry(0.11, 0.23, 0.3, 12, 1, true, -Math.PI * 0.55, Math.PI * 1.1), bib, { p: [0, y0 + 0.6, 0.05], r: [0.18, 0, 0] }));
  // くわえた宝珠（片方）または巻物の鍵
  if (o.jewel) P.push(part(new THREE.SphereGeometry(0.055, 8, 6), 0xd8c070, { p: [0, y0 + 0.76, 0.38], emit: 0.15 }));
  else P.push(part(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6), 0xb8a060, { p: [0, y0 + 0.77, 0.34], r: [0, 0, Math.PI / 2] }));
  const g = merge(P);
  paintFn(g, (x, y, z, c) => { if (y < y0 + 0.05) return; const k = 0.85 + 0.15 * Math.min(1, (y - y0) / 1.0); c.multiplyScalar(k); });
  return g;
}

/** 祠（高さ約 1.6）。小さな灯り（emit）つき。 */
export function hokoraGeo(o = {}) {
  const wood = o.wood ?? 0x5a2c20, red = o.red ?? PAL.shu, st = o.stone ?? PAL.stone, roof = o.roof ?? 0x2e2a2c;
  const P = [];
  P.push(part(new THREE.BoxGeometry(1.3, 0.34, 1.1), st, { p: [0, 0.17, 0] }));
  P.push(part(new THREE.BoxGeometry(0.82, 0.66, 0.62), wood, { p: [0, 0.67, 0] }));
  for (const k of [-1, 1]) P.push(part(new THREE.BoxGeometry(0.07, 0.72, 0.07), red, { p: [k * 0.41, 0.7, 0.32] }));
  P.push(part(new THREE.BoxGeometry(0.5, 0.42, 0.02), 0x1a1210, { p: [0, 0.62, 0.315] }));                 // 扉
  P.push(part(new THREE.BoxGeometry(0.1, 0.08, 0.04), PAL.paper, { p: [0, 0.4, 0.42], emit: 2.0 }));     // 小さな灯り
  for (const k of [-1, 1]) P.push(part(new THREE.BoxGeometry(1.08, 0.05, 0.62), roof, { p: [0, 1.17, k * 0.24], r: [k * 0.55, 0, 0] }));
  P.push(part(new THREE.BoxGeometry(1.12, 0.06, 0.08), roof, { p: [0, 1.32, 0] }));
  for (const k of [-1, 1]) P.push(part(new THREE.BoxGeometry(0.05, 0.16, 0.05), PAL.gold, { p: [k * 0.5, 1.38, 0], r: [0, 0, k * 0.5] })); // 千木
  return merge(P);
}

/**
 * 杉（高さ 1、細長い円すいを重ねる）。droop：段の下の縁を星形にして枝先を垂らす（横からも上からも杉らしく見える）。
 * o = { seg（偶数）, tiers, droop, dark, light, trunk（false で幹なし）, r0 }
 */
export function cedarGeo(o = {}) {
  const seg = o.seg ?? 8, tiers = o.tiers ?? 4, droop = o.droop ?? 0;
  const dark = C(o.dark ?? 0x14291d), light = C(o.light ?? 0x2c4e34);
  const P = o.trunk === false ? [] : [part(new THREE.CylinderGeometry(0.016, 0.03, 0.42, 5, 1, true), o.trunk ?? PAL.bark, { p: [0, 0.21, 0] })];
  for (let i = 0; i < tiers; i++) {
    const t = i / Math.max(1, tiers - 1);
    const r = (o.r0 ?? 0.17) * Math.pow(1 - t * 0.86, 0.85) + 0.015;
    const h = 0.34 * (1 - t * 0.3) * Math.pow(4 / tiers, 0.55);
    const y = 0.26 + t * 0.62;
    const cone = new THREE.ConeGeometry(r, h, seg, 1, true);
    if (droop) {
      const pos = cone.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        if (pos.getY(k) > -h / 2 + 1e-4) continue;
        const a = Math.atan2(pos.getX(k), pos.getZ(k));
        const odd = Math.round((a / (Math.PI * 2)) * seg + seg) % 2;
        const sc = odd ? 1.16 : 0.8;
        pos.setXYZ(k, pos.getX(k) * sc, pos.getY(k) - (odd ? droop * h : 0), pos.getZ(k) * sc);
      }
      cone.computeVertexNormals();
    }
    const col = dark.clone().lerp(light, 0.25 + t * 0.75);
    const g = part(cone, col, { p: [0, y + h / 2, 0], r: [0, i * 0.7, 0] });
    jitter(g, 0.01, i + 3, [1, 0.5, 1]);
    P.push(g);
  }
  const g = merge(P);
  shadeY(g, 0.2, 1.0, 0.55, 1.1);
  return g;
}

/** 紅葉（高さ 1）。葉は白っぽく作り、色はインスタンスの色で付ける。 */
export function mapleGeo(o = {}) {
  const P = [part(new THREE.CylinderGeometry(0.025, 0.04, 0.5, 5, 1, true), 0x3a2a24, { p: [0, 0.25, 0] })];
  const blobs = [[0, 0.64, 0, 0.24], [0.22, 0.54, 0.08, 0.18], [-0.2, 0.56, -0.06, 0.2], [0.05, 0.5, -0.22, 0.17], [-0.06, 0.84, 0.05, 0.16],
    [0.14, 0.76, 0.16, 0.15], [-0.16, 0.72, 0.18, 0.15], [0.2, 0.7, -0.14, 0.14]];
  blobs.forEach(([x, y, z, r], i) => {
    const g = part(new THREE.IcosahedronGeometry(r, o.detail ?? 0), 0xffffff, { p: [x, y, z], s: [1, 0.8, 1] });
    jitter(g, r * 0.12, i + 9);
    // 丸い法線（角ばった岩に見えないように）
    const pos = g.attributes.position, nor = g.attributes.normal;
    for (let k = 0; k < pos.count; k++) {
      const nx = pos.getX(k) - x, ny = (pos.getY(k) - y) / 0.8, nz = pos.getZ(k) - z;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.setXYZ(k, nx / l, ny / l, nz / l);
    }
    P.push(g);
  });
  const g = merge(P);
  shadeY(g, 0.3, 1.0, 0.45, 1.05);
  return g;
}

/** 竹の幹（高さ 1、根元が原点）。節の色は材質で付ける。 */
export function bambooGeo(o = {}) {
  const g = part(new THREE.CylinderGeometry(0.0085, 0.011, 1, o.seg ?? 5, o.hseg ?? 1, true), 0xffffff, { p: [0, 0.5, 0] });
  shadeY(g, 0, 1, 0.55, 1.0);
  return g;
}

/** 灯籠流しの灯籠（幅約 1、高さ約 1）。六角の紙の胴が淡く光り、下に暗い木の台。 */
export function floatLanternGeo(o = {}) {
  const paper = o.paper ?? 0xf2d6a6, wood = o.wood ?? 0x22160f, emit = o.emit ?? 0.55;
  const P = [];
  P.push(part(new THREE.CylinderGeometry(0.56, 0.6, 0.12, 6), wood, { p: [0, 0.06, 0] }));
  P.push(part(new THREE.CylinderGeometry(0.36, 0.42, 0.74, 6, 1, true), paper, { p: [0, 0.49, 0], emit }));
  // 六角の角の細い桟と、上の縁
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    P.push(part(new THREE.BoxGeometry(0.04, 0.76, 0.04), wood, { p: [Math.sin(a) * 0.39, 0.49, Math.cos(a) * 0.39], r: [0, a, 0] }));
  }
  P.push(part(new THREE.CylinderGeometry(0.39, 0.39, 0.05, 6, 1, true), wood, { p: [0, 0.86, 0] }));
  return merge(P);
}

/** 反り橋（長さ 1 を x 方向に渡す。幅 w、高さ rise）。 */
export function archBridgeGeo(o = {}) {
  const w = o.w ?? 0.16, rise = o.rise ?? 0.1, n = o.n ?? 14;
  const deck = o.deck ?? 0x5a4234, rail = o.rail ?? PAL.shu;
  const P = [];
  const yAt = (x) => rise * (1 - Math.pow(2 * x, 2));
  for (let i = 0; i < n; i++) {
    const x0 = -0.5 + i / n, x1 = -0.5 + (i + 1) / n, xm = (x0 + x1) / 2;
    const y0 = yAt(x0), y1 = yAt(x1);
    const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
    P.push(part(new THREE.BoxGeometry(len * 1.02, 0.014, w), deck, { p: [xm, (y0 + y1) / 2, 0], r: [0, 0, ang] }));
    for (const k of [-1, 1]) P.push(part(new THREE.BoxGeometry(len * 1.02, 0.008, 0.01), rail, { p: [xm, (y0 + y1) / 2 + 0.05, k * w * 0.5], r: [0, 0, ang] }));
  }
  for (let i = 0; i <= n; i += 2) {
    const x = -0.5 + i / n;
    for (const k of [-1, 1]) P.push(part(new THREE.BoxGeometry(0.012, 0.06, 0.012), rail, { p: [x, yAt(x) + 0.03, k * w * 0.5] }));
  }
  for (const x of [-0.5, 0.5]) for (const k of [-1, 1]) P.push(part(new THREE.SphereGeometry(0.012, 6, 4), PAL.gold, { p: [x, yAt(x) + 0.07, k * w * 0.5] }));
  // 橋脚
  for (const x of [-0.3, 0, 0.3]) for (const k of [-1, 1]) P.push(part(new THREE.CylinderGeometry(0.008, 0.009, 0.3, 5, 1, true), 0x3a2a22, { p: [x, yAt(x) - 0.15, k * w * 0.4] }));
  return merge(P);
}

/** 石段（n 段。奥 −Z へ上る。幅 1、1 段の高さ h、奥行き d）。 */
export function stepsGeo(o = {}) {
  const n = o.n ?? 8, h = o.h ?? 0.16, d = o.d ?? 0.34;
  const P = [];
  for (let i = 0; i < n; i++) {
    const k = 0.85 + ((i * 37) % 7) * 0.03;
    const c = C(o.stone ?? PAL.stone).multiplyScalar(k);
    P.push(part(new THREE.BoxGeometry(1, h * (i + 1), d), c, { p: [0, (h * (i + 1)) / 2, -i * d] }));
  }
  return merge(P);
}

/**
 * 反りのある屋根（寄棟。入母屋っぽく見えるよう、棟を長めに）。軒の幅 w × 奥行き d、高さ h。
 * ridge：棟の長さ（w に対する割合）、sag：屋根面のたわみ、lift：軒の隅の反り上がり、thick：軒の厚み。
 */
export function hipRoofGeo(o = {}) {
  const w = o.w ?? 1, d = o.d ?? 0.7, h = o.h ?? 0.35, R = (o.ridge ?? 0.5) * w * 0.5;
  const sag = o.sag ?? 0.06, lift = o.lift ?? 0.06, seg = o.seg ?? 6, thick = o.thick ?? 0.03;
  const col = o.color ?? PAL.copper;
  const W = w / 2, D = d / 2;
  const P = [];
  const lifted = (x, z) => lift * Math.pow(Math.max(Math.abs(x) / W, Math.abs(z) / D), 4);
  // 1 つの面：軒の線 a0→a1 と棟の線 b0→b1 の間をたわませて張る
  const face = (a0, a1, b0, b1) => {
    const pos = [];
    const pt = (u, v) => {
      const ax = a0[0] + (a1[0] - a0[0]) * u, az = a0[2] + (a1[2] - a0[2]) * u;
      const ay = lifted(ax, az);
      const bx = b0[0] + (b1[0] - b0[0]) * u, bz = b0[2] + (b1[2] - b0[2]) * u;
      const x = ax + (bx - ax) * v, z = az + (bz - az) * v;
      const y = ay + (h - ay) * v - sag * Math.sin(Math.PI * v) * (1 - Math.abs(2 * u - 1) * 0.3);
      return [x, y, z];
    };
    for (let i = 0; i < seg; i++) for (let j = 0; j < seg; j++) {
      const p00 = pt(i / seg, j / seg), p10 = pt((i + 1) / seg, j / seg), p01 = pt(i / seg, (j + 1) / seg), p11 = pt((i + 1) / seg, (j + 1) / seg);
      pos.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return part(g, col);
  };
  P.push(face([-W, 0, D], [W, 0, D], [-R, h, 0], [R, h, 0]));     // 前
  P.push(face([W, 0, -D], [-W, 0, -D], [R, h, 0], [-R, h, 0]));   // 後ろ
  P.push(face([W, 0, D], [W, 0, -D], [R, h, 0], [R, h, 0]));      // 右
  P.push(face([-W, 0, -D], [-W, 0, D], [-R, h, 0], [-R, h, 0]));  // 左
  // 軒の厚み（下の面を暗く）
  if (thick > 0) {
    const under = new THREE.BoxGeometry(w * 0.96, thick, d * 0.96);
    P.push(part(under, o.under ?? 0x1c1612, { p: [0, -thick / 2 + 0.005, 0] }));
  }
  // 棟
  P.push(part(new THREE.BoxGeometry(R * 2 + 0.04, 0.035, 0.05), o.ridgeColor ?? 0x1a1a1c, { p: [0, h + 0.012, 0] }));
  const g = merge(P);
  return g;
}

/** 社殿（幅 1）。基壇・朱の柱・白壁・反りのある屋根・千木と鰹木。lamps：軒の提灯を光らせる。 */
export function hallGeo(o = {}) {
  const w = 1, d = o.d ?? 0.72, bodyH = o.bodyH ?? 0.3;
  const red = o.red ?? PAL.shu, wall = o.wall ?? PAL.wall, roof = o.roof ?? PAL.copper;
  const P = [];
  P.push(part(new THREE.BoxGeometry(w * 1.12, 0.07, d * 1.16), PAL.stoneDark, { p: [0, 0.035, 0] }));
  P.push(part(new THREE.BoxGeometry(w * 1.02, 0.04, d * 1.04), 0x3a2a22, { p: [0, 0.09, 0] }));
  const y0 = 0.11;
  P.push(part(new THREE.BoxGeometry(w * 0.86, bodyH, d * 0.8), wall, { p: [0, y0 + bodyH / 2, 0] }));
  const nx = o.cols ?? 5, nz = 3;
  for (let i = 0; i < nx; i++) for (const k of [-1, 1]) {
    const x = -0.45 + (0.9 * i) / (nx - 1);
    P.push(part(new THREE.CylinderGeometry(0.018, 0.018, bodyH, 6, 1, true), red, { p: [x, y0 + bodyH / 2, k * d * 0.42] }));
  }
  for (let j = 1; j < nz - 1 + 1; j++) for (const k of [-1, 1]) P.push(part(new THREE.CylinderGeometry(0.018, 0.018, bodyH, 6, 1, true), red, { p: [k * 0.45, y0 + bodyH / 2, -d * 0.42 + (d * 0.84 * j) / (nz - 1)] }));
  // 正面の格子戸（暗い）と梁
  P.push(part(new THREE.BoxGeometry(w * 0.8, bodyH * 0.7, 0.01), 0x2a1a14, { p: [0, y0 + bodyH * 0.4, d * 0.405] }));
  for (const k of [-1, 1]) P.push(part(new THREE.BoxGeometry(w * 0.94, 0.03, 0.03), red, { p: [0, y0 + bodyH - 0.02, k * d * 0.43] }));
  // 屋根
  const roofG = hipRoofGeo({ w: w * 1.32, d: d * 1.45, h: o.roofH ?? 0.34, ridge: o.ridge ?? 0.62, color: roof, lift: 0.07, sag: 0.05, seg: o.roofSeg ?? 6 });
  roofG.translate(0, y0 + bodyH + 0.01, 0);
  P.push(roofG);
  const ry = y0 + bodyH + 0.01 + (o.roofH ?? 0.34);
  if (o.chigi !== false) {
    // 鰹木（棟の上の丸太）と千木（両端の交差した板）
    const R = (o.ridge ?? 0.62) * w * 1.32 * 0.5;
    for (let i = 0; i < 5; i++) P.push(part(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 6), PAL.gold, { p: [-R * 0.7 + (R * 1.4 * i) / 4, ry + 0.04, 0], r: [Math.PI / 2, 0, 0] }));
    for (const x of [-R, R]) for (const k of [-1, 1]) P.push(part(new THREE.BoxGeometry(0.012, 0.16, 0.035), 0x1a1a1c, { p: [x, ry + 0.06, k * 0.025], r: [k * 0.5, 0, 0] }));
  }
  if (o.lamps) {
    for (let i = 0; i < 4; i++) P.push(part(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 8), PAL.paper, { p: [-0.33 + i * 0.22, y0 + bodyH - 0.06, d * 0.5], emit: 2.0 }));
  }
  return merge(P);
}

/** 五重塔（幅 1、高さ約 4.2）。 */
export function pagodaGeo(o = {}) {
  const red = o.red ?? PAL.shu, roof = o.roof ?? 0x2c2a2e, wall = o.wall ?? PAL.wall;
  const P = [part(new THREE.BoxGeometry(1.25, 0.12, 1.25), PAL.stoneDark, { p: [0, 0.06, 0] })];
  let y = 0.12;
  for (let i = 0; i < 5; i++) {
    const s = 1 - i * 0.1, bh = 0.42 - i * 0.02;
    P.push(part(new THREE.BoxGeometry(0.72 * s, bh, 0.72 * s), i === 0 ? wall : red, { p: [0, y + bh / 2, 0] }));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(part(new THREE.BoxGeometry(0.05, bh, 0.05), red, { p: [x * 0.36 * s, y + bh / 2, z * 0.36 * s] }));
    const r = hipRoofGeo({ w: 1.25 * s, d: 1.25 * s, h: 0.2, ridge: 0.0, sag: 0.03, lift: 0.08, seg: 4, color: roof, thick: 0.03 });
    r.translate(0, y + bh, 0);
    P.push(r);
    y += bh + 0.16;
  }
  // 相輪
  P.push(part(new THREE.CylinderGeometry(0.03, 0.04, 1.0, 6, 1, true), PAL.gold, { p: [0, y + 0.45, 0] }));
  for (let k = 0; k < 7; k++) P.push(part(new THREE.CylinderGeometry(0.08 - k * 0.006, 0.08 - k * 0.006, 0.025, 8), PAL.gold, { p: [0, y + 0.15 + k * 0.1, 0] }));
  P.push(part(new THREE.SphereGeometry(0.05, 8, 6), PAL.gold, { p: [0, y + 1.0, 0], emit: 0.3 }));
  return merge(P);
}

/** 浮き島の岩（上が平らで、下が尖る）。半径 1、上面が y=0。seed で形を変える。 */
export function rockIslandGeo(o = {}) {
  const seed = o.seed ?? 1, depth = o.depth ?? 1.6;
  const top = new THREE.CylinderGeometry(1, 0.9, 0.18, 14, 1, false);
  const body = new THREE.ConeGeometry(0.92, depth, 14, 5, true);
  body.rotateX(Math.PI);
  body.translate(0, -0.09 - depth / 2, 0);
  const gTop = part(top, o.grass ?? 0x2a3a2c, { p: [0, -0.09, 0] });
  const gBody = part(body, o.rock ?? 0x3a3640);
  jitter(gBody, 0.12, seed, [1, 0.5, 1]);
  jitter(gTop, 0.03, seed + 5, [1, 0.3, 1]);
  const g = merge([gTop, gBody]);
  g.computeVertexNormals();
  paintFn(g, (x, y, z, c) => {
    if (y < -0.2) { const k = Math.max(0.35, 1 + y / (depth * 1.4)); c.multiplyScalar(k); }
  });
  return g;
}
