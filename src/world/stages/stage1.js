// 1 面「夕暮れの千本鳥居」：夕日の山の斜面を、上から見下ろして飛ぶ。
// 杉の森を縫うように朱の鳥居のトンネル（ところどころ二筋に分かれる）が続き、道ぞいに石灯籠、ときどき祠と狐像、紅葉。
// 谷には夕日の靄がたまり、カメラの近くをもみじの葉が舞う（近いものほど速く流れる）。
// 4 分ほどかけて、夕焼けから宵（ブルーアワー）へ移り、灯籠の灯りが目立ってくる。
// event('boss')：山頂の社の境内（石畳・拝殿・本殿・大鳥居・御神木）へ、加速してから減速して着き、その上に浮かぶ。
//
// 長さの単位は「だいたい 0.5 m」。道は pathX(z)（左右のうねり）と pathY(z)（上り下り）で決まり、
// 地面の高さは JS（terrain）と GLSL（groundH）の同じ式で出す。区画（160）ごとに物を作り直して前へ回す。
import * as THREE from 'three';
import { makeAtmo, litMat, lerpColor, smooth } from '../kit/atmo.js';
import { noiseTexture, rng } from '../kit/noise.js';
import { makeSkyDome } from '../kit/skydome.js';
import { toriiGeo, stoneLanternGeo, foxStatueGeo, hokoraGeo, cedarGeo, mapleGeo, hallGeo, emitShu, PAL } from '../kit/props.js';
import { part, merge, mat4, xform } from '../kit/geo.js';
import { makeDrift, makeGlows } from '../kit/particles.js';
import { mapleLeafTex } from '../kit/tex.js';
import { makeGround } from '../kit/ground.js';
import { makeMist } from '../kit/mist.js';
import { Flight, ChunkRing } from '../kit/flight.js';
import { Pool, noise1 } from '../kit/pool.js';

// ---------------------------------------------------------------- 道と地形（JS と GLSL で同じ式）
const pathX = (z) => 55 * Math.sin(z * 0.0042 + 1.3) + 22 * Math.sin(z * 0.0111 + 0.4) + 7 * Math.sin(z * 0.027 + 2.0);
const pathY = (z) => 16 * Math.sin(z * 0.0023 + 0.7) + 6 * Math.sin(z * 0.0071 + 2.1);
const hills = (x, z) => 14 * Math.sin(x * 0.013 + z * 0.009) * Math.sin(z * 0.011 - x * 0.006) + 6 * Math.sin(x * 0.031 - z * 0.024) + 2.5 * Math.sin(x * 0.07 + z * 0.05);

const H_GLSL = /* glsl */ `
uniform vec4 uArena;      // 境内：x, 高さ, z, 半径
uniform float uArenaOn;
float pathX(float z) { return 55.0 * sin(z * 0.0042 + 1.3) + 22.0 * sin(z * 0.0111 + 0.4) + 7.0 * sin(z * 0.027 + 2.0); }
float pathY(float z) { return 16.0 * sin(z * 0.0023 + 0.7) + 6.0 * sin(z * 0.0071 + 2.1); }
float hills(vec2 p) { return 14.0 * sin(p.x * 0.013 + p.y * 0.009) * sin(p.y * 0.011 - p.x * 0.006) + 6.0 * sin(p.x * 0.031 - p.y * 0.024) + 2.5 * sin(p.x * 0.07 + p.y * 0.05); }
float groundH(vec2 p) {
  float dx = p.x - pathX(p.y);
  float py = pathY(p.y);
  float h = py - 0.24 * dx + hills(p) * smoothstep(10.0, 45.0, abs(dx));
  h = mix(h, py, exp(-(dx * dx) / 338.0));
  if (uArenaOn > 0.5) h = mix(h, uArena.y, 1.0 - smoothstep(uArena.w, uArena.w + 45.0, length(p - uArena.xz)));
  return h;
}
`;

const C_GLSL = /* glsl */ `
uniform vec3 uLamp;     // 道を照らす灯りの色（強さ込み）
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 groundCol(vec3 wp, vec3 n) {
  float dx = wp.x - pathX(wp.z);
  float n1 = texture2D(uNoise, wp.xz * 0.0035).r;
  float n2 = texture2D(uNoise, wp.xz * 0.017).g;
  float n3 = texture2D(uNoise, wp.xz * 0.07).b;
  vec3 c = mix(vec3(0.095, 0.082, 0.062), vec3(0.06, 0.1, 0.06), smoothstep(0.35, 0.7, n1));
  c = mix(c, vec3(0.15, 0.1, 0.07), smoothstep(0.55, 0.8, n2) * 0.5);
  c *= 0.7 + 0.55 * n3;
  // 急な斜面は岩肌
  c = mix(c, vec3(0.10, 0.092, 0.085) * (0.7 + 0.6 * n2), smoothstep(0.8, 0.6, n.y));
  // 道（玉砂利と敷石）
  float endRoad = uArenaOn > 0.5 ? smoothstep(uArena.z - 60.0, uArena.z - 30.0, wp.z) : 1.0;
  float grav = (1.0 - smoothstep(9.0, 13.5, abs(dx))) * endRoad;
  float road = (1.0 - smoothstep(6.5, 8.0, abs(dx))) * endRoad;
  c = mix(c, vec3(0.17, 0.155, 0.13) * (0.75 + 0.4 * n3), grav * 0.85);
  float joint = smoothstep(0.08, 0.0, abs(fract(wp.z / 3.2) - 0.5) - 0.42);
  c = mix(c, vec3(0.27, 0.245, 0.21) * (0.72 + 0.45 * n3) * (1.0 - joint * 0.35), road);
  // 境内の石畳（中心は uArena.xz。境内は z が −130〜+110）
  if (uArenaOn > 0.5) {
    vec2 q = wp.xz - uArena.xz;
    float inA = (1.0 - smoothstep(72.0, 76.0, abs(q.x))) * (1.0 - smoothstep(118.0, 122.0, abs(q.y)));
    vec2 cell = q / vec2(8.0, 6.0);
    cell.x += floor(cell.y) * 0.5;
    vec2 f = abs(fract(cell) - 0.5);
    float gap = smoothstep(0.44, 0.49, max(f.x, f.y));
    float tone = 0.8 + 0.3 * hash21(floor(cell));
    vec3 pave = vec3(0.22, 0.205, 0.18) * tone * (0.75 + 0.35 * n3) * (1.0 - gap * 0.3);
    c = mix(c, pave, inA);
  }
  return c;
}
vec3 groundGlow(vec3 wp, vec3 n, vec3 alb) {
  float dx = wp.x - pathX(wp.z);
  float endRoad = uArenaOn > 0.5 ? smoothstep(uArena.z - 60.0, uArena.z - 30.0, wp.z) : 1.0;
  float cz = cos(3.14159 * wp.z / 30.0);
  float lamp = 0.3 + 0.7 * pow(cz * cz, 4.0);   // 30 ごとの灯籠のまわり
  float g = exp(-dx * dx / 160.0) * endRoad * lamp;
  if (uArenaOn > 0.5) {
    // 境内：参道の灯籠と神楽殿のまわりの灯りのたまり（中心は uArena.xz、灯籠は境内の z = 96, 78, 60）
    vec2 q = wp.xz - uArena.xz;
    float pool = 0.0;
    for (int i = 0; i < 3; i++) {
      float lz = 96.0 - float(i) * 18.0;
      float ax = abs(q.x) - 17.0, az = q.y - lz;
      pool += exp(-(ax * ax + az * az) / 90.0);
    }
    float sz = q.y - 18.0;
    pool += 0.8 * exp(-(q.x * q.x / 900.0 + sz * sz / 600.0));
    g += (pool * 2.2 + 0.35) * (1.0 - smoothstep(110.0, 125.0, abs(q.y))) * (1.0 - smoothstep(70.0, 78.0, abs(q.x)));
  }
  return alb * uLamp * g;
}
`;

function terrain(x, z, A) {
  const dx = x - pathX(z), py = pathY(z);
  let h = py - 0.24 * dx + hills(x, z) * smooth(10, 45, Math.abs(dx));
  h += (py - h) * Math.exp(-(dx * dx) / 338);
  if (A) { const r = Math.hypot(x - A.x, z - (A.z - 10)); h += (A.y - h) * (1 - smooth(A.r, A.r + 45, r)); }
  return h;
}

const CH = 160;          // 区画の長さ
const NCH = 6;           // 区画の数
const TUNNEL_W = 10;     // 鳥居の幅（柱の間）
const ARENA_LZ = [86, 68, 50];   // 境内の参道の灯籠（境内の中心からの z）

// 時刻の色（夕焼け → 宵）
const C = (h) => new THREE.Color(h);
const DUSK = {
  fog: [C(0x4a4258), C(0x283258)], fogSun: [C(0xa8705a), C(0x48406a)],
  hemiSky: [C(0x7a84a8), C(0x5c70b4)], hemiGround: [C(0x2a2026), C(0x1a1e30)],
  sun: [C(0xff9a5a), C(0x6a3448)], rim: [C(0x4a2c1c), C(0x22305a)],
  lamp: [C(0x1e1408), C(0x9a5a20)], mist: [C(0xa08890), C(0x4a5a7a)],
  leafAmb: [C(0x2e2430), C(0x1a1e2e)], leafSun: [C(0x9a6048), C(0x403a50)],
};

export default class Stage1World {
  constructor(world) {
    this.world = world;
    const g = (this.group = new THREE.Group());
    g.name = 'stage1World';
    world.scene.add(g);
    const q = (this.q = world.renderer?.quality === 'low' ? 0 : world.renderer?.quality === 'medium' ? 1 : 2);
    this.disposables = [];
    const keep = (x) => (this.disposables.push(x), x);

    this.noise = keep(noiseTexture(256, 11));
    const atmo = (this.atmo = makeAtmo({
      fog: 0x4a4258, fogSun: 0xa8705a, sunDir: [0.12, 0.08, -1], density: 0.0017, far: 900, sunPow: 3,
      hBase: -30, hFall: 0.045, hAmount: 0.004, noise: this.noise, rim: 0x5a2a1a,
    }));

    this.sky = makeSkyDome({ zenith: 0x1a2050, mid: 0x6a4a7a, horizon: 0xff9a62, ground: 0x2a1c2a, sunDir: [0.12, 0.08, -1], sunColor: 0xffc080, sunGlow: 1, stars: 0.3, noise: this.noise });
    g.add(this.sky.mesh);

    this.hemi = new THREE.HemisphereLight(0x7a84a8, 0x2a2026, 1.3);
    this.sun = new THREE.DirectionalLight(0xff8a4a, 2.4);
    this.sun.position.set(0.12, 0.16, -1);
    g.add(this.hemi, this.sun, this.sun.target);

    // 地面
    this.ground = keep(makeGround(atmo, {
      w: 1100, d: 760, nx: q ? 140 : 90, nz: q ? 100 : 64, ahead: 250, eps: 3, key: 's1',
      glsl: H_GLSL, colorGLSL: C_GLSL,
      uniforms: { uArena: { value: new THREE.Vector4(0, 0, 0, 100) }, uArenaOn: { value: 0 }, uLamp: { value: new THREE.Color(0x2a1206) } },
    }));
    g.add(this.ground.mesh);

    // 谷の靄
    this.mist = keep(makeMist(atmo, {
      size: [1400, 1100], y: -26, color: 0xc08a8a, opacity: 0.42, scale: 0.0035, wind: [0.006, 0.002], thick: 14, near: [20, 60],
      heightGLSL: H_GLSL + 'float mistGround(vec2 p) { return groundH(p); }',
    }));
    this.mist.uniforms.uArena = this.ground.uniforms.uArena;
    this.mist.uniforms.uArenaOn = this.ground.uniforms.uArenaOn;
    g.add(this.mist.mesh);

    // 材質と形
    const lit = keep(litMat(atmo, { emit: true, rim: true }));
    const foliage = keep(litMat(atmo, { sway: 0.012, rim: true }));
    this.matLit = lit;
    const toriiG = keep(emitShu(toriiGeo({ h: 1.3, seg: q ? 6 : 5, kseg: q ? 5 : 4, daiwa: false }), 0.32));
    const cedarG = keep(cedarGeo({ seg: q ? 8 : 6, tiers: 4, droop: 0.3, dark: 0x2a4834, light: 0x6c8c64 }));
    const lanternG = keep(stoneLanternGeo({ emit: 1.4, light: 0xffc27a }));
    const mapleG = keep(mapleGeo());
    const hokoraG = keep(hokoraGeo());
    const foxG = keep(foxStatueGeo({ seg: 6 }));

    // 区画ごとの入れ物
    const S = NCH;
    this.pools = {
      torii: new Pool(toriiG, lit, q ? 66 : 50, S, 'torii'),
      cedar: new Pool(cedarG, foliage, q === 2 ? 380 : q === 1 ? 290 : 170, S, 'cedars'),
      lantern: new Pool(lanternG, lit, 20, S, 'lanterns'),
      maple: new Pool(mapleG, foliage, 18, S, 'maples'),
      hokora: new Pool(hokoraG, lit, 2, S, 'hokora'),
      fox: new Pool(foxG, lit, 4, S, 'foxes'),
    };
    this.poolList = Object.values(this.pools);
    for (const p of this.poolList) { g.add(p.mesh); this.disposables.push(p); }
    this.glows = keep(makeGlows(atmo, { capacity: 30 * S, gain: 0.7, flicker: 0.12, pull: 9 }));
    this.glowPer = 30;
    g.add(this.glows.mesh);

    // もみじの葉（カメラのまわりを舞う。近いので速く流れて奥行きが出る）
    this.leaves = keep(makeDrift(atmo, {
      count: q === 2 ? 260 : q === 1 ? 180 : 110, map: keep(mapleLeafTex(128)),
      box: [320, 150, 380], off: [0, -78, -150], vel: [5, -5, 7], size: [1.9, 3.0], wander: 6, spin: 1.3, opacity: 0.8,
      colA: 0x9a3a2a, colB: 0xa8642e, amb: 0x2e2430, sun: 0x9a6048, near: [18, 50], seed: 17,
    }));
    g.add(this.leaves.mesh);

    // 山頂の境内（先に作って隠しておく）
    this.arena = this.makeArena(keep, q);
    this.arena.visible = false;
    g.add(this.arena);
    this.A = null;

    this.flight = new Flight({ speed: 46, alt: 150, pitch: -1.0, fov: 50, pathX, groundY: (x, z) => pathY(z), follow: 0.82, yawK: 0.3, rollK: 0.2, z0: 0 });
    this.ring = new ChunkRing({ len: CH, count: NCH, behind: 1, build: (s, k, z0, z1) => this.buildChunk(s, k, z0, z1) });
    this.t = 0;
    this.dusk = 0;
    this.m = new THREE.Matrix4();
    this.col = new THREE.Color();
  }

  // ---------------------------------------------------------------- 区画
  buildChunk(slot, k, z0, z1) {
    const P = this.pools, q = this.q, A = this.A;
    for (const p of this.poolList) p.begin(slot);
    const R = rng(k * 7919 + 13);
    const m = this.m, col = this.col;
    const G = this.glows;
    let gi = slot * this.glowPer;
    const gEnd = gi + this.glowPer;
    const glow = (x, y, z, s, c) => { if (gi < gEnd) G.set(gi++, x, y, z, s, c, R()); };
    const roadEnd = A ? A.z + A.len : -Infinity;   // これより奥（−z）には道を作らない
    const inArena = (x, z) => A && Math.abs(x - A.x) < 84 && z < A.z + 116 && z > A.z - 142;
    const slope = (z) => (pathX(z - 1) - pathX(z + 1)) / 2;

    // 鳥居：z の格子に並べる（区画をまたいでも途切れない）
    const SP = q ? 5.0 : 6.6;
    for (let n = Math.ceil(-z0 / SP); n * SP < -z1; n++) {
      const z = -n * SP;
      if (z < roadEnd) break;
      const on = noise1(z * 0.0062, 1) > 0.36;
      if (!on) continue;
      const twin = noise1(z * 0.0041, 7) > 0.66;
      const x = pathX(z), y = pathY(z), d = slope(z);
      const yaw = Math.atan2(-d, 1);
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      if (twin) {
        for (const s of SIDES) P.torii.add(mat4(m, x + s * 7 * cs, y - 0.3, z - s * 7 * sn, yaw, TUNNEL_W * 0.8), col.setScalar(0.9 + R() * 0.15));
      } else {
        P.torii.add(mat4(m, x, y - 0.3, z, yaw, TUNNEL_W), col.setScalar(0.9 + R() * 0.15));
      }
    }
    // 石灯籠：道の両わきに一定の間隔で
    const LS = 30;
    for (let n = Math.ceil(-z0 / LS); n * LS < -z1; n++) {
      const z = -n * LS;
      if (z < roadEnd) break;
      const x = pathX(z), y = pathY(z), d = slope(z);
      const yaw = Math.atan2(-d, 1), cs = Math.cos(yaw), sn = Math.sin(yaw);
      const twin = noise1(z * 0.0041, 7) > 0.66;
      const off = twin ? 18 : 11.5;
      for (const s of SIDES) {
        const lx = x + s * off * cs, lz = z - s * off * sn;
        if (P.lantern.add(mat4(m, lx, y - 0.2, lz, yaw, 4.4))) glow(lx, y + 1.64 * 4.4, lz, 9, 0xffa850);
      }
    }
    // 祠と狐像（ときどき）、その前に小さな鳥居の奉納
    if (R() < 0.62) {
      const z = z0 - 20 - R() * (CH - 40);
      if (z > roadEnd && !inArena(pathX(z), z)) {
        const side = R() < 0.5 ? -1 : 1;
        const x = pathX(z) + side * (26 + R() * 8);
        const y = terrain(x, z, A);
        const face = side < 0 ? Math.PI / 2 : -Math.PI / 2;   // 道のほうを向く
        P.hokora.add(mat4(m, x, y - 0.3, z, face, 6.5));
        const tx = -side;   // 道へ向かう向き（x）
        for (const s of SIDES) P.fox.add(mat4(m, x + tx * 9, y - 0.2, z + s * 5, face, 3.6));
        for (let i = 0; i < 4; i++) { const ox = x + tx * (13 + i * 2.4); P.torii.add(mat4(m, ox, terrain(ox, z, A) - 0.2, z, face, 3.4), col.setScalar(0.85)); }
        glow(x + tx * 3.4, y + 2.6, z, 7, 0xffb070);
        P.lantern.add(mat4(m, x + tx * 8, y - 0.2, z + 9, 0, 3.4));
        glow(x + tx * 8, y + 1.64 * 3.4, z + 9, 7, 0xffa850);
      }
    }
    // 紅葉：鮮やかなものは画面の端（フィールドの外）へ。道の近くには小さく暗いものをまれに
    const nM = 6 + Math.floor(R() * 9);
    for (let i = 0; i < nM; i++) {
      const z = z0 - R() * CH;
      const side = R() < 0.5 ? -1 : 1;
      const nearPath = R() < 0.18;
      const x = pathX(z) + side * (nearPath ? 16 + R() * 20 : 85 + R() * 150);
      if (inArena(x, z) || (z < roadEnd && Math.abs(x - pathX(z)) < 15)) continue;
      const h = nearPath ? 14 + R() * 6 : 22 + R() * 12;
      const k = nearPath ? 0.38 + R() * 0.15 : 0.6 + R() * 0.3;
      P.maple.add(mat4(m, x, terrain(x, z, A) - 1, z, R() * 6, h * 0.9, h * 0.75, h * 0.9), col.set(MAPLE[Math.floor(R() * MAPLE.length)]).multiplyScalar(k));
    }
    // 杉：ゆがめた格子に置く（道と境内は空ける）
    const cell = q === 2 ? 17 : q === 1 ? 19.5 : 25;
    const xc = pathX((z0 + z1) / 2);
    for (let j = 0; j < CH / cell; j++) for (let i = -Math.ceil(430 / cell); i <= Math.ceil(430 / cell); i++) {
      if (R() > 0.82) continue;
      const z = z0 - (j + R()) * cell;
      const x = xc + (i + R() - 0.5) * cell;
      const dx = Math.abs(x - pathX(z));
      if ((z > roadEnd && dx < 14) || inArena(x, z)) continue;
      if (noise1(x * 0.011 + z * 0.0013, 3) > 0.8) continue;   // 小さな草地
      const h = 27 + R() * 19;
      const tint = 0.85 + R() * 0.32;
      P.cedar.add(mat4(m, x, terrain(x, z, A) - 1.5, z, R() * 6, h * 0.58, h, h * 0.58, (R() - 0.5) * 0.06, (R() - 0.5) * 0.06), col.setRGB(tint * (0.95 + R() * 0.1), tint, tint * (0.95 + R() * 0.1)));
    }
    for (const p of this.poolList) p.end();
    while (gi < gEnd) G.hide(gi++);
    this.glowDirty = true;
  }

  // ---------------------------------------------------------------- 山頂の境内
  // 境内の中心（0, 0, 0）。入口の大鳥居が +Z（手前）、奥へ 神楽殿 → 拝殿 → 本殿。カメラは神楽殿の少し奥を見る
  makeArena(keep, q) {
    const g = new THREE.Group();
    g.name = 'arena';
    const P = [];
    const lg = [];   // 灯りの位置 [x, y, z, 大きさ]
    const add = (geo, o) => { xform(geo, o); P.push(geo); };
    // 大鳥居（入口）と参道の石灯籠
    add(toriiGeo({ h: 1.3, seg: 12, kseg: 12, plaque: true }), { p: [0, 0, 100], s: [24, 24, 24] });
    for (const z of ARENA_LZ) for (const s of [-1, 1]) {
      add(stoneLanternGeo({ emit: 1.4, light: 0xffc27a }), { p: [s * 17, 0, z], s: [4.6, 4.6, 4.6], r: [0, s * 0.3, 0] });
      lg.push([s * 17, 1.64 * 4.6, z, 10]);
    }
    // 神楽殿（舞台。四隅の柱に提灯）
    const stW = 34, stD = 26, stH = 4;
    P.push(part(new THREE.BoxGeometry(stW + 4, 1.2, stD + 4), PAL.stoneDark, { p: [0, 0.6, 8] }));
    P.push(part(new THREE.BoxGeometry(stW, stH, stD), 0x5a4030, { p: [0, 1.2 + stH / 2, 8], emit: 0.12 }));
    for (let i = 0; i < 9; i++) P.push(part(new THREE.BoxGeometry(stW - 0.4, 0.15, 0.25), 0x3a2a1e, { p: [0, 1.2 + stH + 0.05, 8 - stD / 2 + (i + 0.5) * (stD / 9)] }));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      P.push(part(new THREE.CylinderGeometry(0.9, 0.9, 14, 8), PAL.shu, { p: [x * (stW / 2 - 1), 1.2 + stH + 7, 8 + z * (stD / 2 - 1)] }));
      P.push(part(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 10), 0xffb070, { p: [x * (stW / 2 - 1), 1.2 + stH + 11, 8 + z * (stD / 2 - 1) + 1.6], emit: 0.8 }));
      lg.push([x * (stW / 2 - 1), 1.2 + stH + 11, 8 + z * (stD / 2 - 1) + 1.6, 6, 0xff8a30]);
    }
    for (const s of [-1, 1]) P.push(part(new THREE.BoxGeometry(0.6, 1.4, stD), PAL.shu, { p: [s * (stW / 2 - 0.3), 1.2 + stH + 1.6, 8] }));
    P.push(part(new THREE.BoxGeometry(stW, 1.4, 0.6), PAL.shu, { p: [0, 1.2 + stH + 1.6, 8 - stD / 2 + 0.3] }));
    // 狐像（拝殿の前）
    const fL = foxStatueGeo({ jewel: false, seg: 10 }); xform(fL, { p: [-16, 0, -18], s: [5.2, 5.2, 5.2], r: [0, 0.35, 0] }); P.push(fL);
    const fR = foxStatueGeo({ jewel: true, mirror: true, seg: 10 }); xform(fR, { p: [16, 0, -18], s: [5.2, 5.2, 5.2], r: [0, -0.35, 0] }); P.push(fR);
    // 拝殿と本殿
    add(hallGeo({ d: 0.62, bodyH: 0.26, roofH: 0.3, ridge: 0.72, lamps: true, roof: 0x2c2624, chigi: false, cols: 6 }), { p: [0, 0, -42], s: [46, 46, 46] });
    for (let i = 0; i < 4; i++) lg.push([(-0.33 + i * 0.22) * 46, (0.11 + 0.26 - 0.06) * 46, -42 + 0.31 * 46, 6]);
    const plat = new THREE.BoxGeometry(70, 4, 56);
    P.push(part(plat, PAL.stoneDark, { p: [0, 2, -98] }));
    add(hallGeo({ d: 0.78, bodyH: 0.32, roofH: 0.38, ridge: 0.55, roof: PAL.copper, chigi: true, cols: 5 }), { p: [0, 4, -98], s: [54, 54, 54] });
    // 本殿を囲む朱の玉垣
    const fx = 40, fz0 = -68, fz1 = -130;
    for (let x = -fx; x <= fx; x += 6) for (const z of [fz0, fz1]) if (!(z === fz0 && Math.abs(x) < 9)) P.push(part(new THREE.BoxGeometry(1.1, 5, 1.1), PAL.shu, { p: [x, 2.5, z] }));
    for (let z = fz1 + 6; z < fz0; z += 6) for (const x of [-fx, fx]) P.push(part(new THREE.BoxGeometry(1.1, 5, 1.1), PAL.shu, { p: [x, 2.5, z] }));
    for (const s of [-1, 1]) P.push(part(new THREE.BoxGeometry(fx - 9, 0.8, 0.8), PAL.shu, { p: [s * (fx + 9) / 2, 4.2, fz0] }));
    P.push(part(new THREE.BoxGeometry(fx * 2, 0.8, 0.8), PAL.shu, { p: [0, 4.2, fz1] }));
    for (const x of [-fx, fx]) P.push(part(new THREE.BoxGeometry(0.8, 0.8, fz0 - fz1), PAL.shu, { p: [x, 4.2, (fz0 + fz1) / 2] }));
    // 末社（小さな祠と鳥居の列）
    for (const [x, z] of [[-54, -12], [-56, 30]]) {
      add(hokoraGeo(), { p: [x, 0, z], s: [7, 7, 7], r: [0, Math.PI / 2, 0] });
      lg.push([x + 3.2, 2.8, z, 6]);
      for (let i = 0; i < 5; i++) add(toriiGeo({ h: 1.3, seg: 6, kseg: 5, daiwa: false }), { p: [x + 10 + i * 3, 0, z], s: [4.4, 4.4, 4.4], r: [0, Math.PI / 2, 0] });
    }
    // 御神木（大きな杉としめ縄）
    add(cedarGeo({ seg: 10, tiers: 7, droop: 0.32, dark: 0x0e2016, light: 0x2a4a30 }), { p: [54, -1, -40], s: [44, 100, 44] });
    const rope = new THREE.TorusGeometry(1.7, 0.45, 6, 18);
    P.push(part(rope, 0xc8b890, { p: [54, 9, -40], r: [Math.PI / 2, 0, 0], emit: 0.15 }));
    const geo = keep(merge(P));
    const mesh = new THREE.Mesh(geo, this.matLit);
    mesh.name = 'arenaShrine';
    g.add(mesh);
    // 灯り
    this.arenaGlows = keep(makeGlows(this.atmo, { capacity: lg.length, gain: 0.75, flicker: 0.1, pull: 9 }));
    lg.forEach(([x, y, z, s, c], i) => this.arenaGlows.set(i, x, y, z, s, c ?? 0xffa850, i * 0.37));
    this.arenaGlows.commit();
    g.add(this.arenaGlows.mesh);
    return g;
  }

  enter() {
    const w = this.world;
    w.scene.background = new THREE.Color(0x1a1420);
    w.setFov(50);
    w.renderer.setLook?.({ exposure: 1.0, bloomStrength: 0.42, bloomRadius: 0.45, bloomThreshold: 0.92, vignette: 0.3, saturation: 1.06, contrast: 1.02,
      lift: [0.012, 0.008, 0.014], gain: [1.0, 0.98, 0.97] });
    w.field?.setMood?.({ hemiSky: 0xffe0c8, hemiGround: 0x4a3040, hemi: 1.2, key: 0xffd0a0, keyI: 1.6, rim: 0xb0a0ff, rimI: 0.8 });
    this.update(0, { t: 0, speed: 1 });
  }

  event(name) {
    if (name === 'boss' && !this.A) this.goBoss();
  }

  goBoss() {
    const f = this.flight;
    const lz = f.lookZ();
    const zC = lz - 780;
    const xC = pathX(zC + 110), yC = pathY(zC);
    this.A = { x: xC, y: yC, z: zC, r: 120, len: 100 };
    const u = this.ground.uniforms;
    u.uArena.value.set(xC, yC, zC - 10, 120);
    u.uArenaOn.value = 1;
    this.arena.position.set(xC, yC, zC);
    this.arena.visible = true;
    // まだ見えていない先の区画を作り直す（境内の場所を空け、道を終わらせる）
    const kc = Math.floor(-f.z / CH);
    this.ring.rebuildFrom(kc + 3);
    const alt = 165, pitch = -1.1;
    f.goTo({ x: xC, y: yC + alt, z: zC - 4 + alt / Math.tan(-pitch), pitch, yaw: 0, fov: 50 }, 13);
  }

  update(dt, ctx) {
    const w = this.world;
    this.t += dt;
    const t = ctx.t ?? this.t;
    // ボスの合図が無いまま最初からボス戦（確認用の preview）：すぐ境内へ
    if (ctx.boss && !this.A && t < 2) this.goBoss();
    this.flight.update(dt, ctx, w.rig);
    const cam = w.rig.pos;
    this.ring.update(cam.z);
    for (const p of this.poolList) p.flush();
    if (this.glowDirty) { this.glows.commit(); this.glowDirty = false; }
    // 夕焼け → 宵（4 分ほど）
    const k = (this.dusk = smooth(8, 235, t));
    const L = this.lerpDusk;
    const a = this.atmo;
    L('fog', a.uFogColor.value, k);
    L('fogSun', a.uFogSun.value, k);
    L('rim', a.uRim.value, k);
    L('hemiSky', this.hemi.color, k);
    L('hemiGround', this.hemi.groundColor, k);
    L('sun', this.sun.color, k);
    this.hemi.intensity = 2.0 - k * 0.15;
    this.sun.intensity = 2.4 * (1 - k * 0.92);
    const sunY = 0.16 - k * 0.2;
    this.sun.position.set(0.12, Math.max(0.02, sunY), -1);
    a.uSunDir.value.set(0.12, 0.08 - k * 0.1, -1).normalize();
    L('lamp', this.ground.uniforms.uLamp.value, k);
    L('mist', this.mist.uniforms.uColor.value, k);
    this.mist.uniforms.uOpacity.value = 0.42 - k * 0.1;
    this.matLit.userData.u.uEmitGain.value = 0.75 + k * 0.9;
    this.glows.uniforms.uGain.value = 0.45 + k * 0.6;
    this.arenaGlows.uniforms.uGain.value = 0.55 + k * 0.5;
    const su = this.sky.uniforms;
    su.uSunDir.value.copy(a.uSunDir.value);
    su.uSunGlow.value = 1 - k * 0.8;
    lerpColor(su.uHorizon.value, C_HOR0, C_HOR1, k);
    su.uStars.value = 0.2 + k * 0.8;
    su.uTime.value = t;
    // 漂うもの
    const lu = this.leaves.uniforms;
    L('leafAmb', lu.uAmb.value, k);
    L('leafSun', lu.uSunC.value, k);
    const vh = this.viewH();
    this.leaves.update(t, cam);
    this.glows.update(t, vh);
    this.arenaGlows.update(t, vh);
    this.mist.update(t);
    this.mist.mesh.position.set(Math.round(cam.x / 50) * 50, -26, Math.round((cam.z - 300) / 50) * 50);
    this.ground.follow(cam);
    this.sky.follow(cam);
    a.uWTime.value = t;
  }

  lerpDusk(key, out, k) { return lerpColor(out, DUSK[key][0], DUSK[key][1], k); }

  viewH() {
    const r = this.world.renderer?.renderer;
    return r ? r.getDrawingBufferSize(_v2).y : 720;
  }

  dispose() {
    this.group.removeFromParent();
    this.sky.dispose();
    for (const d of this.disposables) d.dispose?.();
  }
}

const C_HOR0 = new THREE.Color(0xff9a62), C_HOR1 = new THREE.Color(0x3a3a6a);
const SIDES = [-1, 1];
const MAPLE = [0x9a2418, 0x7a1a18, 0xb04a1a, 0xb87020, 0xa03a18];
const _v2 = new THREE.Vector2();
