// 2 面「竹林と灯籠流しの川」：月のない夜。竹林の中を曲がりくねって流れる川の上を、上流へ向かって飛ぶ。
// 川には灯籠流しの灯籠がたくさん流れてきて、暗い水面に暖かい光の帯を落とす。竹は川に近いほど灯りに照らされる。
// 竹のあいだで蛍が明滅し、水面には低い靄。ときどき朱の反り橋と、川へ下りる石段と石灯籠。
// event('boss')：小さな滝の下の広い淵に着く。淵の岩の上に小さな祠と鳥居。灯籠は淵に集まり、ゆっくり輪になって回る。
//
// 川は riverX(z)（うねり）と riverW(z)（幅）で決まり、地面の高さは JS（terrain）と GLSL（groundH）の同じ式。
// 水は下流（+Z）へ流れる。カメラは上流（−Z）へ進むので、灯籠は手前へ流れてくる。
import * as THREE from 'three';
import { makeAtmo, litMat, smooth, clamp01, FOG_GLSL } from '../kit/atmo.js';
import { noiseTexture, rng } from '../kit/noise.js';
import { makeSkyDome } from '../kit/skydome.js';
import { bambooGeo, floatLanternGeo, archBridgeGeo, stepsGeo, stoneLanternGeo, hokoraGeo, toriiGeo, emitShu } from '../kit/props.js';
import { part, merge, mat4, xform, jitter } from '../kit/geo.js';
import { makeSwarm, makeGlows } from '../kit/particles.js';
import { bambooLeafTex } from '../kit/tex.js';
import { makeGround } from '../kit/ground.js';
import { makeWater, makeStreaks } from '../kit/water.js';
import { makeMist } from '../kit/mist.js';
import { Flight, ChunkRing } from '../kit/flight.js';
import { Pool } from '../kit/pool.js';

// ---------------------------------------------------------------- 川と地形（JS と GLSL で同じ式）
const riverX = (z) => 70 * Math.sin(z * 0.0036 + 0.5) + 30 * Math.sin(z * 0.0093 + 1.9) + 10 * Math.sin(z * 0.023 + 0.3);
const riverW = (z) => 54 + 10 * Math.sin(z * 0.0051 + 2.2);
const hills = (x, z) => 8 * Math.sin(x * 0.017 + z * 0.011) * Math.sin(z * 0.013 - x * 0.009) + 3 * Math.sin(x * 0.05 - z * 0.04);
const smin2 = (a, b, k) => { const h = clamp01(0.5 + (0.5 * (b - a)) / k); return b + (a - b) * h - k * h * (1 - h); };

const H_GLSL = /* glsl */ `
uniform vec4 uPool;     // 淵：x, z, 半径, 崖の高さ
uniform float uPoolOn;
float riverX(float z) { return 70.0 * sin(z * 0.0036 + 0.5) + 30.0 * sin(z * 0.0093 + 1.9) + 10.0 * sin(z * 0.023 + 0.3); }
float riverW(float z) { return 54.0 + 10.0 * sin(z * 0.0051 + 2.2); }
float hills(vec2 p) { return 8.0 * sin(p.x * 0.017 + p.y * 0.011) * sin(p.y * 0.013 - p.x * 0.009) + 3.0 * sin(p.x * 0.05 - p.y * 0.04); }
float smin2(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return b + (a - b) * h - k * h * (1.0 - h); }
// 水ぎわまでの距離（川・淵の中は負）
// 淵の岸（角度で半径を少し変えて、まるすぎないように）
float poolD(vec2 p) {
  vec2 q = p - uPool.xy;
  float a = atan(q.y, q.x + 1e-4);
  return length(q) - uPool.z * (1.0 + 0.1 * sin(3.0 * a + 1.0) + 0.06 * sin(5.0 * a + 2.0));
}
float riverD(vec2 p) {
  float d = abs(p.x - riverX(p.y)) - riverW(p.y) * 0.5;
  if (uPoolOn > 0.5) {
    d += 400.0 * smoothstep(uPool.y - uPool.z + 20.0, uPool.y - uPool.z - 40.0, p.y);
    d = smin2(d, poolD(p), 25.0);
  }
  return d;
}
float groundH(vec2 p) {
  float d = riverD(p);
  float h = -5.0 + 11.0 * smoothstep(-6.0, 10.0, d) + hills(p) * smoothstep(10.0, 60.0, d);
  if (uPoolOn > 0.5) {
    // 淵の奥の崖（滝の落ち口は少し低い）
    float dp = poolD(p);
    float back = smoothstep(uPool.y - uPool.z * 0.2, uPool.y - uPool.z * 0.85, p.y);
    float nx = (p.x - uPool.x) / 14.0;
    float notch = 1.0 - 0.22 * exp(-nx * nx);
    h += uPool.w * notch * smoothstep(-2.0, 22.0, dp) * back;
  }
  return h;
}
`;

function poolD(x, z, A) {
  const qx = x - A.x, qz = z - A.z, a = Math.atan2(qz, qx + 1e-4);
  return Math.hypot(qx, qz) - A.r * (1 + 0.1 * Math.sin(3 * a + 1) + 0.06 * Math.sin(5 * a + 2));
}
function riverD(x, z, A) {
  let d = Math.abs(x - riverX(z)) - riverW(z) * 0.5;
  if (A) {
    d += 400 * smooth(A.z - A.r + 20, A.z - A.r - 40, z);
    d = smin2(d, poolD(x, z, A), 25);
  }
  return d;
}
function terrain(x, z, A) {
  const d = riverD(x, z, A);
  let h = -5 + 11 * smooth(-6, 10, d) + hills(x, z) * smooth(10, 60, d);
  if (A) {
    const dp = poolD(x, z, A);
    const back = smooth(A.z - A.r * 0.2, A.z - A.r * 0.85, z);
    const nx = (x - A.x) / 14;
    h += A.cliff * (1 - 0.22 * Math.exp(-nx * nx)) * smooth(-2, 22, dp) * back;
  }
  return h;
}

// 川べりの灯りの GLSL（地面と竹の両方で使う）
const LIGHT_GLSL = /* glsl */ `
uniform vec3 uRiverLight;
vec3 riverLight(vec3 wp, vec3 wN) {
  float d = riverD(wp.xz);
  float side = wp.x > riverX(wp.z) ? 1.0 : -1.0;
  float face = 0.4 + 0.6 * max(-wN.x * side, 0.0);
  float near = exp(-max(d, 0.0) / 26.0);
  float low = 1.0 - smoothstep(8.0, 70.0, wp.y);
  return uRiverLight * near * face * (0.3 + 0.7 * low);
}
`;

const C_GLSL = /* glsl */ `
${LIGHT_GLSL}
vec3 groundCol(vec3 wp, vec3 n) {
  float d = riverD(wp.xz);
  float n1 = texture2D(uNoise, wp.xz * 0.006).r;
  float n2 = texture2D(uNoise, wp.xz * 0.03).g;
  float n3 = texture2D(uNoise, wp.xz * 0.09).b;
  // 竹の落ち葉の地面（くすんだ黄土）と苔
  vec3 c = mix(vec3(0.11, 0.095, 0.06), vec3(0.055, 0.08, 0.05), smoothstep(0.4, 0.7, n1));
  c *= 0.7 + 0.5 * n3;
  // 水ぎわの石と濡れた砂
  float shore = 1.0 - smoothstep(0.0, 9.0, d);
  c = mix(c, vec3(0.1, 0.1, 0.1) * (0.6 + 0.7 * n2), shore * 0.8);
  // 崖の岩肌
  c = mix(c, vec3(0.09, 0.09, 0.1) * (0.6 + 0.6 * n2), smoothstep(0.75, 0.5, n.y));
  return c;
}
vec3 groundGlow(vec3 wp, vec3 n, vec3 alb) { return alb * riverLight(wp, n); }
`;

const SHORE_GLSL = /* glsl */ `
${H_GLSL}
float shoreDist(vec2 p) { return -riverD(p); }
float flowAt(vec2 p) {
  if (uPoolOn < 0.5) return 1.0;
  return 0.2 + 0.8 * smoothstep(uPool.z * 0.4, uPool.z * 1.2, length(p - uPool.xy));
}
`;

const CH = 160;
const NCH = 6;

export default class Stage2World {
  constructor(world) {
    this.world = world;
    const g = (this.group = new THREE.Group());
    g.name = 'stage2World';
    world.scene.add(g);
    const q = (this.q = world.renderer?.quality === 'low' ? 0 : world.renderer?.quality === 'medium' ? 1 : 2);
    this.disposables = [];
    const keep = (x) => (this.disposables.push(x), x);

    this.noise = keep(noiseTexture(256, 23));
    const atmo = (this.atmo = makeAtmo({
      fog: 0x0e1628, fogSun: 0x1a2440, sunDir: [0, 0.2, -1], density: 0.0021, far: 900, sunPow: 2,
      hBase: 0, hFall: 0.06, hAmount: 0.006, noise: this.noise, rim: 0x101a30,
    }));
    this.sky = makeSkyDome({ zenith: 0x02040e, mid: 0x08102a, horizon: 0x16223e, ground: 0x04060c, stars: 1.1, milky: 0.8, noise: this.noise });
    g.add(this.sky.mesh);

    this.hemi = new THREE.HemisphereLight(0x3a4c82, 0x0c0e18, 1.45);
    this.star = new THREE.DirectionalLight(0x6a7ab0, 0.4);
    this.star.position.set(-0.3, 1, 0.2);
    g.add(this.hemi, this.star, this.star.target);

    const pool = { uPool: { value: new THREE.Vector4(0, 0, 110, 46) }, uPoolOn: { value: 0 } };
    this.poolU = pool;
    this.riverLightU = { value: new THREE.Color(0x6a3a14) };

    // 地面（川岸）
    this.ground = keep(makeGround(atmo, {
      w: 1100, d: 760, nx: q ? 130 : 84, nz: q ? 96 : 60, ahead: 250, eps: 3, key: 's2',
      glsl: H_GLSL, colorGLSL: C_GLSL, uniforms: { ...pool, uRiverLight: this.riverLightU },
    }));
    g.add(this.ground.mesh);

    // 水面と、灯りの映り込み
    this.water = keep(makeWater(atmo, {
      w: 1100, d: 760, deep: 0x08101e, sky: 0x24345e, glint: 0.55, flow: [0, 0.1], ahead: 250,
      glsl: SHORE_GLSL, uniforms: { ...pool, uWarm: { value: new THREE.Color(0x000000) } },
    }));
    g.add(this.water.mesh);
    this.streaks = keep(makeStreaks(atmo, { capacity: q === 2 ? 110 : q === 1 ? 84 : 60, len: 15, width: 6.5, color: 0xffb070, gain: 0.42 }));
    g.add(this.streaks.mesh);

    // 水の上の低い靄
    this.mist = keep(makeMist(atmo, {
      size: [1300, 1000], y: 5, color: 0x5a6a90, opacity: 0.3, scale: 0.006, wind: [0.004, -0.006], thick: 6, near: [30, 80],
      heightGLSL: H_GLSL + 'float mistGround(vec2 p) { return groundH(p); }',
    }));
    Object.assign(this.mist.uniforms, pool);
    g.add(this.mist.mesh);

    // 竹（幹は節の色と川の灯りを足した材質、葉は房の画像）
    const culmMat = keep(litMat(atmo, { sway: 0.006, name: 'bamboo' }));
    this.bambooPatch(culmMat, true);
    const leafMat = keep(litMat(atmo, { map: keep(bambooLeafTex(256, 5)), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: false, sway: 0.004, name: 'bambooLeaf' }));
    this.bambooPatch(leafMat, false);
    const leafGeo = new THREE.PlaneGeometry(1, 1);
    leafGeo.rotateX(-Math.PI / 2);
    keep(leafGeo);
    const lit = (this.matLit = keep(litMat(atmo, { emit: true, rim: true })));
    const S = NCH;
    this.pools = {
      culm: new Pool(keep(bambooGeo({ seg: q ? 6 : 5 })), culmMat, q === 2 ? 1250 : q === 1 ? 900 : 620, S, 'bamboo'),
      leaf: new Pool(leafGeo, leafMat, q === 2 ? 700 : q === 1 ? 520 : 360, S, 'bambooLeaves'),
      bridge: new Pool(keep(archBridgeGeo({ w: 0.16, rise: 0.1 })), lit, 1, S, 'bridges'),
      steps: new Pool(keep(stepsGeo({ n: 7 })), lit, 2, S, 'steps'),
      lantern: new Pool(keep(stoneLanternGeo({ emit: 1.3, light: 0xffc27a })), lit, 3, S, 'stoneLanterns'),
      rock: new Pool(keep(this.rockGeo()), lit, 22, S, 'rocks'),
    };
    this.poolList = Object.values(this.pools);
    for (const p of this.poolList) { g.add(p.mesh); this.disposables.push(p); }
    this.glowPer = 4;
    this.glows = keep(makeGlows(atmo, { capacity: this.glowPer * S, gain: 0.8, flicker: 0.12, pull: 7 }));
    g.add(this.glows.mesh);

    // 灯籠流しの灯籠
    const nL = (this.nL = q === 2 ? 110 : q === 1 ? 84 : 60);
    this.lanterns = new THREE.InstancedMesh(keep(floatLanternGeo({ emit: 0.55 })), lit, nL);
    this.lanterns.name = 'floatLanterns';
    this.lanterns.frustumCulled = false;
    this.lanterns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(this.lanterns);
    this.lanternGlows = keep(makeGlows(atmo, { capacity: nL, gain: 0.42, flicker: 0.12, pull: 3, core: 0.25 }));
    g.add(this.lanternGlows.mesh);
    const R = rng(99);
    this.L = [];
    for (let i = 0; i < nL; i++) this.L.push({ z: -R() * 760 + 140, u: (R() * 2 - 1) * 0.8, v: 3 + R() * 3, ph: R() * 100, spin: (R() - 0.5) * 0.3, orbit: false, r: 0, a: 0, w: 0, x: 0, y: 0 });

    // 蛍
    this.fireflies = keep(makeSwarm(atmo, {
      count: q === 2 ? 150 : q === 1 ? 110 : 70, box: [420, 70, 460], off: [0, -110, -170], vel: [0.6, 0.2, 0.4], size: [0.7, 1.15],
      colA: 0xb8ff60, colB: 0x8aff9a, wander: 7, blink: 1, shape: 0, gain: 1.0, seed: 4,
    }));
    g.add(this.fireflies.mesh);

    // 淵（ボスの場所）は先に作って隠しておく
    this.arena = this.makeArena(keep);
    this.arena.visible = false;
    g.add(this.arena);
    this.A = null;

    this.flight = new Flight({ speed: 40, alt: 145, pitch: -0.97, fov: 50, pathX: riverX, groundY: () => 0, follow: 0.85, yawK: 0.3, rollK: 0.2, z0: 0 });
    this.ring = new ChunkRing({ len: CH, count: NCH, behind: 1, build: (s, k, z0, z1) => this.buildChunk(s, k, z0, z1) });
    this.t = 0;
    this.m = new THREE.Matrix4();
    this.mc = new THREE.Matrix4();
    this.col = new THREE.Color();
  }

  /** 竹の材質に、節の色（幹だけ）と川の灯りを足す。 */
  bambooPatch(mat, culm) {
    const prev = mat.onBeforeCompile;
    const pool = this.poolU, rl = this.riverLightU;
    mat.onBeforeCompile = (sh) => {
      prev(sh);
      Object.assign(sh.uniforms, pool, { uRiverLight: rl });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vLy;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLy = position.y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', `${H_GLSL}\n${LIGHT_GLSL}\nvarying float vLy;\nvoid main() {`)
        .replace('#include <color_fragment>', culm ? `#include <color_fragment>
          {
            float fy = fract(vLy * 11.0);
            float ring = smoothstep(0.035, 0.0, abs(fy - 0.5) - 0.46);
            diffuseColor.rgb *= 1.0 - ring * 0.5;
            diffuseColor.rgb *= 0.85 + 0.3 * smoothstep(0.0, 1.0, fy);
          }` : '#include <color_fragment>')
        .replace('#include <opaque_fragment>', `{
            vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz + vec3(1e-5));
            outgoingLight += diffuseColor.rgb * riverLight(vWPos, wN);
          }
          #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'bamboo:' + (culm ? 'c' : 'l');
  }

  rockGeo() {
    const g = part(new THREE.IcosahedronGeometry(1, 0), 0x5a5a60);
    jitter(g, 0.18, 3);
    g.computeVertexNormals();
    return g;
  }

  // ---------------------------------------------------------------- 区画
  buildChunk(slot, k, z0, z1) {
    const P = this.pools, q = this.q, A = this.A;
    for (const p of this.poolList) p.begin(slot);
    const R = rng(k * 6007 + 5);
    const m = this.mc, col = this.col;
    const G = this.glows;
    let gi = slot * this.glowPer;
    const gEnd = gi + this.glowPer;
    const glow = (x, y, z, s, c) => { if (gi < gEnd) G.set(gi++, x, y, z, s, c, R()); };
    const riverEnd = A ? A.z - A.r + 10 : -Infinity;   // 淵より上流には川がない（崖）
    const nearArena = (x, z) => A && Math.hypot(x - A.x, z - A.z) < A.r + 26;
    const slope = (z) => (riverX(z - 1) - riverX(z + 1)) / 2;

    // 竹：株（3〜5 本）を、ゆがめた格子に置く
    const cell = q === 2 ? 17 : q === 1 ? 19.5 : 24;
    const xc = riverX((z0 + z1) / 2);
    for (let j = 0; j < CH / cell; j++) for (let i = -Math.ceil(420 / cell); i <= Math.ceil(420 / cell); i++) {
      if (R() > 0.78) continue;
      const cz = z0 - (j + R()) * cell;
      const cx = xc + (i + R() - 0.5) * cell;
      const d = riverD(cx, cz, A);
      if (d < 5 || nearArena(cx, cz)) continue;
      const side = cx > riverX(cz) ? 1 : -1;
      const n = 3 + Math.floor(R() * 3);
      const base = terrain(cx, cz, A);
      for (let c = 0; c < n; c++) {
        const a = R() * Math.PI * 2, r = R() * 3.6;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const h = A && cz < A.z - A.r * 0.5 ? 34 + R() * 16 : 52 + R() * 34;
        const lean = (0.03 + R() * 0.05) * (d < 60 ? 1 : 0.3);
        const tint = 0.75 + R() * 0.4;
        const ok = P.culm.add(mat4(m, x, base - 1, z, 0, h * 1.7, h, h * 1.7, (R() - 0.5) * 0.06, side * lean), col.setRGB(0.42 * tint, 0.62 * tint, 0.32 * tint));
        if (!ok) break;
        if (c < 2) {
          const ly = base + h * (0.72 + R() * 0.22);
          const s = 15 + R() * 9;
          P.leaf.add(mat4(m, x - side * lean * h * 0.8, ly, z, R() * 6, s, s, s, (R() - 0.5) * 0.7, (R() - 0.5) * 0.7), col.setRGB(0.32 * tint, 0.5 * tint, 0.24 * tint));
        }
      }
    }
    // 反り橋（ときどき）
    if (R() < 0.32) {
      const z = z0 - 30 - R() * (CH - 60);
      if (z > riverEnd + 40 && !nearArena(riverX(z), z)) {
        const x = riverX(z), w = riverW(z) + 28;
        P.bridge.add(mat4(m, x, 4.5, z, Math.atan2(-slope(z), 1), w));
      }
    }
    // 川へ下りる石段と石灯籠
    const nS = R() < 0.6 ? 1 + (R() < 0.3 ? 1 : 0) : 0;
    for (let i = 0; i < nS; i++) {
      const z = z0 - 20 - R() * (CH - 40);
      if (z < riverEnd + 30 || nearArena(riverX(z), z)) continue;
      const side = R() < 0.5 ? -1 : 1;
      const x = riverX(z) + side * (riverW(z) / 2 + 3);
      P.steps.add(mat4(m, x, -2.5, z, -side * Math.PI / 2, 14, 8.75, 6.5));
      const lx = x + side * 13, lz = z + 11;
      if (P.lantern.add(mat4(m, lx, terrain(lx, lz, A) - 0.3, lz, 0, 3.6))) glow(lx, terrain(lx, lz, A) + 1.64 * 3.6, lz, 8, 0xffa850);
    }
    // 岸の石
    for (let i = 0; i < 22; i++) {
      const z = z0 - R() * CH;
      if (z < riverEnd) continue;
      const side = R() < 0.5 ? -1 : 1;
      const x = riverX(z) + side * (riverW(z) / 2 + (R() - 0.35) * 8);
      if (nearArena(x, z)) continue;
      const s = 2 + R() * 4.5;
      P.rock.add(mat4(m, x, terrain(x, z, A) - s * 0.3, z, R() * 6, s * (1 + R() * 0.5), s * 0.6, s), col.setScalar(0.5 + R() * 0.4));
    }
    for (const p of this.poolList) p.end();
    while (gi < gEnd) G.hide(gi++);
    this.glowDirty = true;
  }

  // ---------------------------------------------------------------- 淵（滝・岩の上の祠）
  makeArena(keep) {
    const g = new THREE.Group();
    g.name = 'arena';
    const P = [];
    const lg = [];
    const add = (geo, o) => { xform(geo, o); P.push(geo); };
    // 岩の小島と祠・鳥居・石灯籠
    const rock = part(new THREE.IcosahedronGeometry(1, 1), 0x4a4a52);
    jitter(rock, 0.16, 7, [1, 0.6, 1]);
    rock.computeVertexNormals();
    xform(rock, { p: [40, -3, -34], s: [17, 9, 13] });
    P.push(rock);
    add(hokoraGeo(), { p: [43, 5.2, -37], s: [6.5, 6.5, 6.5], r: [0, -0.3, 0] });
    lg.push([43 - 1.8, 5.2 + 2.7, -37 + 3.1, 6]);
    add(emitShu(toriiGeo({ h: 1.3, seg: 8, kseg: 8 }), 0.45), { p: [38, 4.6, -26], s: [7.5, 7.5, 7.5], r: [0, -0.3, 0] });
    for (const [x, z] of [[31, -36], [50, -29]]) {
      add(stoneLanternGeo({ emit: 1.3, light: 0xffc27a }), { p: [x, 4.4, z], s: [3, 3, 3] });
      lg.push([x, 4.4 + 1.64 * 3, z, 7]);
    }
    // 淵に立つ大きな朱の鳥居
    add(emitShu(toriiGeo({ h: 1.3, seg: 10, kseg: 10, plaque: true }), 0.45), { p: [-40, -3, -50], s: [18, 18, 18], r: [0, 0.25, 0] });
    lg.push([-40, 2, -50, 16]);
    const geo = keep(merge(P));
    const mesh = new THREE.Mesh(geo, this.matLit);
    mesh.name = 'poolShrine';
    g.add(mesh);
    this.arenaGlows = keep(makeGlows(this.atmo, { capacity: lg.length + 8, gain: 0.8, flicker: 0.1, pull: 5 }));
    lg.forEach(([x, y, z, s], i) => this.arenaGlows.set(i, x, y, z, s, 0xffa850, i * 0.37));
    // 滝つぼのしぶき（青白い淡い光）
    for (let i = 0; i < 8; i++) this.arenaGlows.set(lg.length + i, -14 + i * 4, 3 + (i % 3) * 2, -104 + (i % 2) * 5, 14, 0x3a5a80, i);
    this.arenaGlows.commit();
    g.add(this.arenaGlows.mesh);
    // 滝（流れ落ちる筋の板）
    this.fallU = { uTime: { value: 0 }, uFallNoise: { value: this.noise } };
    const fallMat = keep(new THREE.ShaderMaterial({
      name: 'waterfall',
      uniforms: { ...this.atmo, ...this.fallU },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWPos;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform sampler2D uFallNoise;
        varying vec2 vUv;
        varying vec3 vWPos;
        ${FOG_GLSL}
        void main() {
          float s = texture2D(uFallNoise, vec2(vUv.x * 1.6, vUv.y * 0.5 + uTime * 0.45)).b;
          float s2 = texture2D(uFallNoise, vec2(vUv.x * 4.0 + 0.3, vUv.y * 1.1 + uTime * 0.8)).a;
          float streak = smoothstep(0.35, 0.8, s * 0.6 + s2 * 0.4);
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          vec3 c = mix(vec3(0.07, 0.11, 0.19), vec3(0.3, 0.38, 0.5), streak);
          float a = edge * (0.5 + 0.45 * streak) * smoothstep(0.0, 0.08, vUv.y);
          gl_FragColor = vec4(applyAtmo(c, vWPos), a);
        }`,
    }));
    const fall = new THREE.Mesh(keep(new THREE.PlaneGeometry(24, 46, 1, 1)), fallMat);
    fall.position.set(0, 21, -109);
    fall.rotation.x = -0.12;
    fall.name = 'waterfall';
    g.add(fall);
    return g;
  }

  enter() {
    const w = this.world;
    w.scene.background = new THREE.Color(0x03050a);
    w.setFov(50);
    w.renderer.setLook?.({ exposure: 1.0, bloomStrength: 0.5, bloomRadius: 0.5, bloomThreshold: 0.92, vignette: 0.32, saturation: 1.05, contrast: 1.03,
      lift: [0.006, 0.01, 0.02], gain: [1.0, 1.0, 1.0] });
    w.field?.setMood?.({ hemiSky: 0xa8b8e8, hemiGround: 0x3a2a30, hemi: 1.15, key: 0xffc890, keyI: 1.45, rim: 0x86a6ff, rimI: 0.9 });
    this.update(0, { t: 0, speed: 1 });
  }

  event(name) {
    if (name === 'boss' && !this.A) this.goBoss();
  }

  goBoss() {
    const f = this.flight;
    const zC = f.lookZ() - 760;
    const xC = riverX(zC + 140);
    this.A = { x: xC, z: zC, r: 110, cliff: 46 };
    this.poolU.uPool.value.set(xC, zC, 110, 46);
    this.poolU.uPoolOn.value = 1;
    this.arena.position.set(xC, 0, zC);
    this.arena.visible = true;
    const kc = Math.floor(-f.z / CH);
    this.ring.rebuildFrom(kc + 3);
    // 灯籠：見えないところにいるものから順に淵へ集まる
    const R = rng(7);
    // 淵のふちに沿って輪になる（真ん中は弾が見やすいよう空ける）
    this.L.forEach((L) => { L.r = 70 + R() * 26; L.a = R() * Math.PI * 2; L.w = 0.045 + R() * 0.035; });
    const alt = 160, pitch = -1.1;
    f.goTo({ x: xC, y: alt, z: zC - 18 + alt / Math.tan(-pitch), pitch, yaw: 0, fov: 50 }, 13);
  }

  updateLanterns(dt, t, cam) {
    const A = this.A, m = this.m;
    const ahead = cam.z - 520;
    for (let i = 0; i < this.nL; i++) {
      const L = this.L[i];
      if (L.orbit) {
        L.a += L.w * dt;
        const rr = L.r + Math.sin(t * 0.3 + L.ph) * 3;
        L.x = A.x + Math.cos(L.a) * rr;
        L.z = A.z + Math.sin(L.a) * rr * 0.85;
      } else {
        L.z += L.v * dt;
        // 後ろへ流れ去ったら、前（上流）から流し直す。淵ができたあとは淵の輪に入る
        if (L.z > cam.z + 130 || (A && L.z < A.z + A.r)) {
          if (A) { L.orbit = true; continue; }
          L.z = ahead - Math.random() * 260;
          L.u = (Math.random() * 2 - 1) * 0.8;
        }
        L.x = riverX(L.z) + L.u * riverW(L.z) * 0.42;
      }
      const y = 0.15 + Math.sin(t * 1.3 + L.ph) * 0.22;
      this.lanterns.setMatrixAt(i, mat4(m, L.x, y, L.z, L.ph + t * L.spin, 3.0, 3.0, 3.0, Math.sin(t * 0.9 + L.ph) * 0.05, Math.cos(t * 0.8 + L.ph) * 0.05));
      this.lanternGlows.set(i, L.x, y + 1.6, L.z, 11, 0xffc07a, L.ph);
      this.streaks.set(i, L.x, 0, L.z, 0.85 + 0.15 * Math.sin(t * 2.1 + L.ph));
    }
    this.lanterns.instanceMatrix.needsUpdate = true;
    this.lanternGlows.commit();
    this.streaks.commit();
  }

  update(dt, ctx) {
    const w = this.world;
    this.t += dt;
    const t = ctx.t ?? this.t;
    if (ctx.boss && !this.A && t < 2) this.goBoss();
    this.flight.update(dt, ctx, w.rig);
    const cam = w.rig.pos;
    this.ring.update(cam.z);
    for (const p of this.poolList) p.flush();
    if (this.glowDirty) { this.glows.commit(); this.glowDirty = false; }
    this.updateLanterns(dt, t, cam);
    // 灯りの強さ（ボスの淵では灯籠が集まるので明るく）
    const gather = this.A ? smooth(0, 14, this.flight.trip?.t ?? 0) : 0;
    this.riverLightU.value.setRGB(0.36, 0.19, 0.06);
    // 淵では映り込みの帯を短く（カメラの真下から放射状に並ぶとうるさいので）
    this.streaks.uniforms.uLen.value = 15 - gather * 7;
    this.streaks.uniforms.uGain.value = 0.42 - gather * 0.14;
    const vh = this.viewH();
    this.glows.update(t, vh);
    this.lanternGlows.update(t, vh);
    this.arenaGlows.update(t, vh);
    this.fireflies.update(t, cam, vh);
    this.streaks.update(t);
    this.water.update(t);
    this.mist.update(t);
    this.fallU.uTime.value = t;
    this.water.follow(cam);
    this.ground.follow(cam);
    this.mist.mesh.position.set(Math.round(cam.x / 50) * 50, 5, Math.round((cam.z - 300) / 50) * 50);
    this.sky.follow(cam);
    this.sky.uniforms.uTime.value = t;
    this.atmo.uWTime.value = t;
  }

  viewH() {
    const r = this.world.renderer?.renderer;
    return r ? r.getDrawingBufferSize(_v2).y : 720;
  }

  dispose() {
    this.group.removeFromParent();
    this.lanterns.dispose();
    this.sky.dispose();
    for (const d of this.disposables) d.dispose?.();
  }
}

const _v2 = new THREE.Vector2();
