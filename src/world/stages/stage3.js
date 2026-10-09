// 3 面「雲海の上、月の社」：夜の雲海のはるか上を飛ぶ。足もとの雲はゆっくり流れ、薄い雲の層が近いほど速く過ぎる。
// 雲の上に浮かぶ岩の島（社・五重塔・鳥居と祠）、雲に立つ鳥居の列、宙に浮かぶ提灯。面が進むにつれて、
// 地平（進む先）に銀色の光が育っていく（月が昇ろうとしている）。
// event('boss')：速さを落として止まり、カメラを起こす。雲の地平の向こうに巨大な満月が姿を見せ、その前に月の社の影が浮かぶ
//               （弾が見えるよう、月は暗めの色と薄い雲のベールで抑える）。
// event('moonrise')：（エンディング）月が昇りきって明るく輝き、雲海を銀色に染める。カメラはゆっくり月を見上げる。
import * as THREE from 'three';
import { makeAtmo, litMat, lerpColor, smooth } from '../kit/atmo.js';
import { noiseTexture, rng } from '../kit/noise.js';
import { makeSkyDome } from '../kit/skydome.js';
import { toriiGeo, stoneLanternGeo, hokoraGeo, cedarGeo, hallGeo, pagodaGeo, rockIslandGeo, emitShu } from '../kit/props.js';
import { part, merge, mat4, xform } from '../kit/geo.js';
import { makeSwarm, makeGlows } from '../kit/particles.js';
import { makeCloudSea, makeWisps } from '../kit/clouds.js';
import { Flight, ChunkRing } from '../kit/flight.js';
import { Pool } from '../kit/pool.js';

const pathX = (z) => 60 * Math.sin(z * 0.0021 + 0.4) + 25 * Math.sin(z * 0.0057 + 1.1);
const CH = 220;
const NCH = 6;
const MOON_EL = 0.07;     // ボス戦の月の高さ（ラジアン）
const MOON_R = 0.3;       // 月の見かけの半径（ラジアン）

const C = (h) => new THREE.Color(h);
const COL = {
  // 面の始め → ボス（銀の光が育つ） → 月の出
  fog: [C(0x0c1228), C(0x141c38), C(0x3a4a70)],
  fogSun: [C(0x26305a), C(0x3a4672), C(0x8a98c0)],
  top: [C(0x46527e), C(0x4c5a88), C(0xa8b4d8)],
  low: [C(0x080b18), C(0x0a0e1c), C(0x1e2848)],
  lit: [C(0x5a6a9a), C(0x8a9ac8), C(0xdde4f4)],
  hemiSky: [C(0x3a4a80), C(0x45558a), C(0x9aaad0)],
  hemiGround: [C(0x141a36), C(0x1a2240), C(0x4a5478)],
  moon: [C(0x84867f), C(0x8c8c84), C(0xd8d6c8)],
  glow: [C(0x5a6a9a), C(0x8090c0), C(0xc8d0e8)],
};

export default class Stage3World {
  constructor(world) {
    this.world = world;
    const g = (this.group = new THREE.Group());
    g.name = 'stage3World';
    world.scene.add(g);
    const q = (this.q = world.renderer?.quality === 'low' ? 0 : world.renderer?.quality === 'medium' ? 1 : 2);
    this.disposables = [];
    const keep = (x) => (this.disposables.push(x), x);

    this.noise = keep(noiseTexture(256, 41));
    const atmo = (this.atmo = makeAtmo({
      fog: 0x0c1228, fogSun: 0x26305a, sunDir: [0, 0.08, -1], density: 0.0011, far: 6500, sunPow: 4,
      hBase: 0, hFall: 0.03, hAmount: 0.0035, noise: this.noise, rim: 0x1a2440,
    }));
    this.sky = makeSkyDome({
      zenith: 0x02040e, mid: 0x070d24, horizon: 0x141c38, ground: 0x0c1228, stars: 1.2, milky: 0.9, milkyN: [0.3, 0.6, 0.74], noise: this.noise,
      moonDir: [0, Math.sin(MOON_EL), -1], moonSize: MOON_R, moonColor: 0x8a8676, moonGlow: 0.35, moon: 0,
      glowColor: 0x5a6a9a, glowDir: [0, 0, -1], glow: 0.05, radius: 8000,
    });
    g.add(this.sky.mesh);

    this.hemi = new THREE.HemisphereLight(0x3a4a80, 0x141a36, 1.2);
    this.moonLight = new THREE.DirectionalLight(0x8a9ac8, 0.35);
    this.moonLight.position.set(0, 0.25, -1);
    g.add(this.hemi, this.moonLight, this.moonLight.target);

    // 雲海と、高さの違う薄い雲の層
    this.clouds = keep(makeCloudSea(atmo, { y: 0, amp: 32, scale: 0.0016, band: [0.36, 0.78], top: 0x4e5c8e, low: 0x080b18, lit: 0x6a7aaa, n: q ? 150 : 110, cheap: q === 0 }));
    g.add(this.clouds.mesh);
    this.wisps = [
      keep(makeWisps(atmo, { y: 62, size: 2600, opacity: 0.4, scale: 0.0022, drift: [0.008, 0.01], color: 0x5e6c9a, near: [40, 120], cut: 0.52 })),
      keep(makeWisps(atmo, { y: 135, size: 1800, opacity: 0.3, scale: 0.0032, drift: [0.012, 0.016], color: 0x7c88b4, near: [50, 160], cut: 0.6, ahead: 360 })),
    ];
    if (q === 0) this.wisps.pop();
    for (const w of this.wisps) g.add(w.mesh);

    // 島・鳥居・提灯
    const lit = (this.matLit = keep(litMat(atmo, { emit: true, rim: true })));
    const S = NCH;
    this.pools = {
      shrine: new Pool(keep(this.islandShrine()), lit, 1, S, 'islandShrine'),
      pagoda: new Pool(keep(this.islandPagoda()), lit, 1, S, 'islandPagoda'),
      torii: new Pool(keep(this.islandTorii()), lit, 1, S, 'islandTorii'),
      rocks: new Pool(keep(this.islandRocks()), lit, 2, S, 'islandRocks'),
      skyTorii: new Pool(keep(emitShu(toriiGeo({ h: 1.3, seg: 6, kseg: 6, daiwa: false }), 0.35)), lit, 9, S, 'skyTorii'),
      chochin: new Pool(keep(this.chochinGeo()), lit, 12, S, 'chochin'),
    };
    this.poolList = Object.values(this.pools);
    for (const p of this.poolList) { g.add(p.mesh); this.disposables.push(p); }
    this.glowPer = 22;
    this.glows = keep(makeGlows(atmo, { capacity: this.glowPer * S, gain: 0.75, flicker: 0.12, pull: 4 }));
    g.add(this.glows.mesh);

    // 月明かりの粒（ゆっくり昇る）
    this.motes = keep(makeSwarm(atmo, {
      count: q === 2 ? 90 : q === 1 ? 64 : 40, box: [340, 220, 420], off: [0, -100, -180], vel: [0.5, 1.6, 0.3], size: [0.5, 0.9],
      colA: 0x9ab8ff, colB: 0xd8e4ff, wander: 6, blink: 0, shape: 0, gain: 0.55, seed: 8,
    }));
    g.add(this.motes.mesh);

    // 月の社（ボスのときだけ。遠くで月の前に影として浮かぶ）
    this.palace = this.makePalace(keep);
    this.palace.visible = false;
    g.add(this.palace);

    this.flight = new Flight({ speed: 55, alt: 220, pitch: -0.92, fov: 50, pathX, groundY: () => 0, follow: 0.85, yawK: 0.25, rollK: 0.2, z0: 0 });
    this.ring = new ChunkRing({ len: CH, count: NCH, behind: 1, build: (s, k, z0, z1) => this.buildChunk(s, k, z0, z1) });
    this.t = 0;
    this.boss = null;     // ボスの演出（始まった時刻）
    this.rise = null;     // 月の出（始まった時刻）
    this.m = new THREE.Matrix4();
    this.col = new THREE.Color();
    this.mixA = 0;
    this.mixR = 0;
  }

  // ---------------------------------------------------------------- 形
  islandShrine() {
    const P = [];
    const rock = rockIslandGeo({ seed: 1, depth: 1.5, grass: 0x3a4a44, rock: 0x403e4c }); xform(rock, { s: [34, 34, 34] }); P.push(rock);
    const hall = hallGeo({ d: 0.7, roof: 0x2c2a36, lamps: true, chigi: true }); xform(hall, { p: [0, -0.6, -6], s: [28, 28, 28] }); P.push(hall);
    for (const s of [-1, 1]) { const l = stoneLanternGeo({ emit: 1.3 }); xform(l, { p: [s * 11, -0.4, 13], s: [3.4, 3.4, 3.4] }); P.push(l); }
    const pine = cedarGeo({ seg: 8, tiers: 4, droop: 0.3, dark: 0x0e1c1a, light: 0x1e3430 }); xform(pine, { p: [22, -0.5, 8], s: [10, 20, 10] }); P.push(pine);
    const t = emitShu(toriiGeo({ h: 1.3, seg: 8, kseg: 8 }), 0.3); xform(t, { p: [0, -0.4, 24], s: [9, 9, 9] }); P.push(t);
    return merge(P);
  }
  islandPagoda() {
    const P = [];
    const rock = rockIslandGeo({ seed: 2, depth: 1.7, grass: 0x3a4a44, rock: 0x403e4c }); xform(rock, { s: [24, 24, 24] }); P.push(rock);
    const pg = pagodaGeo({ roof: 0x2a2832 }); xform(pg, { p: [0, -0.5, 0], s: [11, 11, 11] }); P.push(pg);
    for (const s of [-1, 1]) { const l = stoneLanternGeo({ emit: 1.3 }); xform(l, { p: [s * 10, -0.4, 13], s: [3, 3, 3] }); P.push(l); }
    return merge(P);
  }
  islandTorii() {
    const P = [];
    const rock = rockIslandGeo({ seed: 3, depth: 1.6, grass: 0x3a4a44, rock: 0x403e4c }); xform(rock, { s: [18, 18, 18] }); P.push(rock);
    const t = emitShu(toriiGeo({ h: 1.3, seg: 8, kseg: 8, plaque: true }), 0.3); xform(t, { p: [0, -0.3, 6], s: [14, 14, 14] }); P.push(t);
    const hk = hokoraGeo(); xform(hk, { p: [0, -0.3, -7], s: [5, 5, 5] }); P.push(hk);
    for (const s of [-1, 1]) { const l = stoneLanternGeo({ emit: 1.3 }); xform(l, { p: [s * 7, -0.3, -1], s: [2.6, 2.6, 2.6] }); P.push(l); }
    return merge(P);
  }
  islandRocks() {
    const P = [];
    for (const [x, y, z, r, s] of [[0, 0, 0, 9, 4], [18, 10, -8, 6, 5], [-14, -6, 10, 5, 6]]) {
      const rock = rockIslandGeo({ seed: s, depth: 1.8, grass: 0x3a4a44, rock: 0x403e4c }); xform(rock, { p: [x, y, z], s: [r, r, r] }); P.push(rock);
    }
    return merge(P);
  }
  chochinGeo() {
    const P = [];
    P.push(part(new THREE.SphereGeometry(0.5, 10, 8), 0xff9a5a, { s: [1, 1.3, 1], emit: 1.1 }));
    for (const y of [-0.62, 0.62]) P.push(part(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10), 0x1a1210, { p: [0, y, 0] }));
    return merge(P);
  }

  makePalace(keep) {
    const g = new THREE.Group();
    g.name = 'moonPalace';
    const P = [];
    const lg = [];
    const rock = rockIslandGeo({ seed: 5, depth: 1.1, grass: 0x1c2228, rock: 0x2a2834 }); xform(rock, { s: [170, 170, 170] }); P.push(rock);
    const hall = hallGeo({ d: 0.7, bodyH: 0.34, roofH: 0.42, ridge: 0.5, roof: 0x22222c, chigi: true, lamps: true }); xform(hall, { p: [0, -1, -20], s: [120, 120, 120] }); P.push(hall);
    for (const s of [-1, 1]) {
      const pg = pagodaGeo({ roof: 0x22222c }); xform(pg, { p: [s * 100, -1, 10], s: [30, 30, 30] }); P.push(pg);
    }
    const t = emitShu(toriiGeo({ h: 1.3, seg: 10, kseg: 10, plaque: true }), 0.4); xform(t, { p: [0, -1, 120], s: [52, 52, 52] }); P.push(t);
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
      const z = 100 - i * 22;
      const l = stoneLanternGeo({ emit: 1.4 }); xform(l, { p: [s * 34, -1, z], s: [6, 6, 6] }); P.push(l);
      lg.push([s * 34, 6 * 1.64, z]);
    }
    const mesh = new THREE.Mesh(keep(merge(P)), this.matLit);
    mesh.name = 'palace';
    g.add(mesh);
    this.palaceGlows = keep(makeGlows(this.atmo, { capacity: lg.length, gain: 1.2, flicker: 0.1, pull: 10 }));
    lg.forEach(([x, y, z], i) => this.palaceGlows.set(i, x, y, z, 26, 0xffb060, i * 0.7));
    this.palaceGlows.commit();
    g.add(this.palaceGlows.mesh);
    return g;
  }

  // ---------------------------------------------------------------- 区画
  buildChunk(slot, k, z0, z1) {
    const P = this.pools;
    for (const p of this.poolList) p.begin(slot);
    const R = rng(k * 4241 + 9);
    const m = this.m;
    const G = this.glows;
    let gi = slot * this.glowPer;
    const gEnd = gi + this.glowPer;
    const glow = (x, y, z, s, c) => { if (gi < gEnd) G.set(gi++, x, y, z, s, c, R()); };
    const zr = () => z0 - 20 - R() * (CH - 40);
    const side = () => (R() < 0.5 ? -1 : 1);
    const lanternGlows = (x, y, z, sc, ry, list) => {
      const c = Math.cos(ry), s = Math.sin(ry);
      for (const [lx, ly, lz] of list) glow(x + (lx * c + lz * s) * sc, y + ly * sc, z + (-lx * s + lz * c) * sc, 9, 0xffa850);
    };
    // 島（どれも道の左右にずらして置く。高さもいろいろ）
    if (R() < 0.75) {
      const z = zr(), x = pathX(z) + side() * (60 + R() * 170), y = 60 + R() * 70, ry = R() * 0.8 - 0.4, s = 0.85 + R() * 0.35;
      P.shrine.add(mat4(m, x, y, z, ry, s));
      lanternGlows(x, y, z, s, ry, [[-11, 5.2, 13], [11, 5.2, 13], [-6, 9, 8.5], [6, 9, 8.5]]);
    }
    if (R() < 0.6) {
      const z = zr(), x = pathX(z) + side() * (70 + R() * 180), y = 40 + R() * 80, ry = R() * 6, s = 0.85 + R() * 0.35;
      P.pagoda.add(mat4(m, x, y, z, ry, s));
      lanternGlows(x, y, z, s, ry, [[-10, 4.6, 13], [10, 4.6, 13], [0, 50, 0]]);
    }
    if (R() < 0.7) {
      const z = zr(), x = pathX(z) + side() * (40 + R() * 200), y = 70 + R() * 90, ry = R() * 0.8 - 0.4, s = 0.8 + R() * 0.4;
      P.torii.add(mat4(m, x, y, z, ry, s));
      lanternGlows(x, y, z, s, ry, [[-7, 4, -1], [7, 4, -1]]);
    }
    for (let i = 0; i < 2; i++) if (R() < 0.6) {
      const z = zr(), x = pathX(z) + side() * (30 + R() * 260), y = 50 + R() * 120;
      P.rocks.add(mat4(m, x, y, z, R() * 6, 0.7 + R() * 0.8));
    }
    // 雲に立つ鳥居の列（ときどき）
    if (R() < 0.55) {
      const x0 = pathX(z0) + side() * (85 + R() * 150);
      const n = 4 + Math.floor(R() * 5);
      const sc = 21 + R() * 7;
      for (let i = 0; i < n; i++) {
        const z = z0 - 15 - i * (CH - 30) / n;
        P.skyTorii.add(mat4(m, x0 + Math.sin(i * 0.7) * 8, 6, z, Math.atan2(-0.06 * Math.cos(i * 0.7), 1), sc));
      }
    }
    // 宙に浮かぶ提灯
    const nC = 6 + Math.floor(R() * 7);
    for (let i = 0; i < nC; i++) {
      const z = z0 - R() * CH, x = pathX(z) + (R() - 0.5) * 2 * 260, y = 40 + R() * 150;
      if (P.chochin.add(mat4(m, x, y, z, R() * 6, 5))) glow(x, y, z, 11, 0xff9a50);
    }
    for (const p of this.poolList) p.end();
    while (gi < gEnd) G.hide(gi++);
    this.glowDirty = true;
  }

  enter() {
    const w = this.world;
    w.scene.background = new THREE.Color(0x02040c);
    w.setFov(50);
    w.renderer.setLook?.({ exposure: 1.0, bloomStrength: 0.5, bloomRadius: 0.55, bloomThreshold: 0.92, vignette: 0.3, saturation: 1.04, contrast: 1.03,
      lift: [0.006, 0.01, 0.022], gain: [1.0, 1.0, 1.02] });
    w.field?.setMood?.({ hemiSky: 0xb8c8f0, hemiGround: 0x3a3a5a, hemi: 1.2, key: 0xe8ecff, keyI: 1.5, rim: 0x9ab0ff, rimI: 0.9 });
    this.update(0, { t: 0, speed: 1 });
  }

  event(name) {
    if (name === 'boss' && !this.boss) this.goBoss();
    if (name === 'moonrise' && !this.rise) {
      if (!this.boss) this.goBoss();
      this.rise = { t: this.t, pitch0: this.flight.pitch };
    }
  }

  goBoss() {
    const f = this.flight;
    const lz = f.lookZ();
    const hz = lz - 420;               // 止まる場所（カメラの位置）
    const hx = pathX(hz);
    this.boss = { t: this.t, x: hx, z: hz };
    this.palace.position.set(hx, 150, hz - 1250);
    this.palace.visible = true;
    f.goTo({ x: hx, y: 235, z: hz, pitch: -0.22, yaw: 0, fov: 50 }, 12);
  }

  update(dt, ctx) {
    const w = this.world;
    this.t += dt;
    const t = ctx.t ?? this.t;
    if (ctx.boss && !this.boss && t < 2) this.goBoss();
    // 月の出：カメラをゆっくり起こして月を見上げる
    if (this.rise) {
      const k = smooth(0, 16, this.t - this.rise.t);
      this.flight.pitch = this.rise.pitch0 + (0.12 - this.rise.pitch0) * smooth(2, 18, this.t - this.rise.t);
      if (this.flight.trip) this.flight.trip.dest.pitch = this.flight.pitch;
      this.riseK = k;
    }
    this.flight.update(dt, ctx, w.rig);
    const cam = w.rig.pos;
    this.ring.update(cam.z);
    for (const p of this.poolList) p.flush();
    if (this.glowDirty) { this.glows.commit(); this.glowDirty = false; }

    // 色：面の進み（銀の光が育つ）→ ボス → 月の出
    const prog = smooth(5, 240, t);
    const bossK = this.boss ? smooth(0, 10, this.t - this.boss.t) : 0;
    const riseK = this.riseK || 0;
    const a = (this.mixA = Math.max(prog * 0.75, bossK));            // 0〜1：始め → ボス
    this.mixR = riseK;
    const A = this.atmo;
    this.mix3('fog', A.uFogColor.value);
    this.mix3('fogSun', A.uFogSun.value);
    const cu = this.clouds.uniforms;
    this.mix3('top', cu.uTop.value);
    this.mix3('low', cu.uLow.value);
    this.mix3('lit', cu.uLit.value);
    cu.uLitAmt.value = 0.26 + a * 0.16 + riseK * 1.05;
    for (const wp of this.wisps) { wp.uniforms.uLit.value.copy(cu.uLit.value); wp.uniforms.uLitAmt.value = cu.uLitAmt.value * 0.8; }
    this.mix3('hemiSky', this.hemi.color);
    this.mix3('hemiGround', this.hemi.groundColor);
    this.hemi.intensity = 1.2 + riseK * 0.6;
    this.moonLight.intensity = 0.3 + a * 0.4 + riseK * 1.8;
    this.mix3('glow', this.moonLight.color);
    // 空と月
    const su = this.sky.uniforms;
    const el = MOON_EL + riseK * 0.28;
    su.uMoonDir.value.set(0, Math.sin(el), -Math.cos(el));
    cu.uLightDir.value.set(0, Math.max(0.12, Math.sin(el)), -1).normalize();
    this.moonLight.position.set(0, Math.max(0.15, Math.sin(el)), -1);
    A.uSunDir.value.copy(su.uMoonDir.value);
    su.uMoonOn.value = Math.max(bossK, riseK);
    this.mix3('moon', su.uMoonCol.value);
    su.uMoonVeil.value = 0.35 * (1 - riseK);
    su.uMoonGlow.value = 0.3 + riseK * 0.6;
    su.uRays.value = riseK * 0.22;
    su.uGlowAmt.value = 0.05 + a * 0.45 + riseK * 0.5;
    this.mix3('glow', su.uGlowCol.value);
    A.uFogGlow.value.copy(su.uGlowCol.value).multiplyScalar(su.uGlowAmt.value);
    su.uHorizon.value.copy(A.uFogColor.value);
    su.uGround.value.copy(A.uFogColor.value);
    su.uStars.value = 1.2 - riseK * 0.6;
    su.uTime.value = t;
    A.uFogFar.value = 6500;
    // 漂うもの
    const vh = this.viewH();
    this.glows.update(t, vh);
    this.palaceGlows.update(t, vh);
    this.motes.update(t, cam, vh);
    this.motes.uniforms.uGain.value = 0.55 + riseK * 0.8;
    this.clouds.update(t);
    this.clouds.follow(cam);
    for (const wp of this.wisps) { wp.update(t); wp.follow(cam); }
    this.sky.follow(cam);
    A.uWTime.value = t;
  }

  /** 色：始め → ボス（mixA）、そこから月の出（mixR）。 */
  mix3(key, out) {
    const L = COL[key];
    lerpColor(out, L[0], L[1], this.mixA);
    if (this.mixR > 0) lerpColor(out, out, L[2], this.mixR);
    return out;
  }

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

const _v2 = new THREE.Vector2();
