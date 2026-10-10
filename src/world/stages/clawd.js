// おまけ「夜空のターミナル」：月が戻った中秋の夜。凪いだ夜の海の上を飛ぶ。どこかの“ターミナル”の気配が、夜に混ざっている。
//   海：藍〜黒の水面。テラコッタの細い光の格子が水面に重なって手前へ流れ、ときどき格子の上を光の粒（データ）が走る。
//       月の方向には、四角いドットでできた「月の道」（きらめく光の粒）が水面にのびる。
//   空中：テラコッタ・クリーム・少しの藍の小さなボクセルが、海から湧いて回りながら昇る。
//   両わき：半透明の「ターミナルの窓」（角の丸い黒い板。プロンプト・差分の行・点滅するカーソル）が奥から流れてくる。
//          行は 1 行ずつ打ち込まれては消える。文字は描かず、線の並びだけでコードらしく見せる。
//   海の上に浮かぶ、ドット（ボクセル）で組んだ鳥居。ときどき列になって並ぶ。笠木の端が崩れて、粒になって浮いている。
//   窓と鳥居は、見下ろすカメラのほうへ後ろに倒して置く（絵のように正面から見える）。カメラを起こすと、それに合わせて立てる。
// event('boss')：速さを落として止まり、カメラを起こす。水平線の上に「ドットでできた満月」が現れ、海の格子が地平まで続く。
//               （月は暗めのクリームで、弾が読めるように抑える）
// スペルカードの背景は共通の魔法陣（spellBg.js）に任せる。
import * as THREE from 'three';
import { makeAtmo, litMat, lerpColor, smooth, FOG_GLSL } from '../kit/atmo.js';
import { noiseTexture, rng } from '../kit/noise.js';
import { makeSkyDome } from '../kit/skydome.js';
import { makeWisps } from '../kit/clouds.js';
import { part, merge, mat4 } from '../kit/geo.js';
import { canvasTex } from '../kit/tex.js';
import { Flight, ChunkRing } from '../kit/flight.js';
import { Pool } from '../kit/pool.js';

const pathX = (z) => 50 * Math.sin(z * 0.0019 + 0.4) + 20 * Math.sin(z * 0.0051 + 1.3);
const CH = 240;
const NCH = 6;
const MOON_EL = 0.21;      // 月の高さ（ラジアン）
const MOON_AZ = 0.25;      // 月の方角（右へ。ボスの真後ろを避けて、フィールドの右上に）
const MOON_R = 0.075;      // 月の見かけの半径（ラジアン）
const MOON_D = 6000;       // 月の板を置く距離

// 色（マスコットのテラコッタとクリーム、夜の藍）
const TERRA = 0xd97757;
const TERRA2 = 0xc67d5f;
const CREAM = 0xf0eee6;
const AI = 0x3b4a8c;

const C = (h) => new THREE.Color(h);
const COL = {
  // 面の始め → ボス（月が出る）
  fog: [C(0x0a0f22), C(0x0e1430)],
  fogSun: [C(0x1a2040), C(0x2a2c4c)],
  glow: [C(0x222444), C(0x3a3044)],
  hemiSky: [C(0x3a4a80), C(0x4a5288)],
  moonLight: [C(0x9aa4c8), C(0xd8c8b0)],
};

export default class ClawdWorld {
  constructor(world) {
    this.world = world;
    const g = (this.group = new THREE.Group());
    g.name = 'clawdWorld';
    world.scene.add(g);
    const q = (this.q = world.renderer?.quality === 'low' ? 0 : world.renderer?.quality === 'medium' ? 1 : 2);
    this.disposables = [];
    const keep = (x) => (this.disposables.push(x), x);

    this.noise = keep(noiseTexture(256, 57));
    const atmo = (this.atmo = makeAtmo({
      fog: 0x0a0f22, fogSun: 0x1a2040, sunDir: [Math.sin(MOON_AZ), Math.sin(MOON_EL), -1], density: 0.00105, far: 6500, sunPow: 5,
      hBase: 0, hFall: 0.03, hAmount: 0.003, noise: this.noise, rim: 0x1a2038,
    }));
    this.moonDir = new THREE.Vector3(Math.sin(MOON_AZ) * Math.cos(MOON_EL), Math.sin(MOON_EL), -Math.cos(MOON_AZ) * Math.cos(MOON_EL)).normalize();

    // 空（月は自前のドットの月を描くので、空の月は消しておく）
    this.sky = makeSkyDome({
      zenith: 0x02030c, mid: 0x060a20, horizon: 0x0e1430, ground: 0x0a0f22, stars: 1.25, milky: 0.55, milkyN: [0.45, 0.55, 0.7], noise: this.noise,
      moon: 0, glowColor: 0x2a2440, glowDir: [0, 0, -1], glow: 0.12, radius: 8000,
    });
    g.add(this.sky.mesh);
    this.moon = makePixelMoon(this.noise);
    g.add(this.moon.mesh);

    this.hemi = new THREE.HemisphereLight(0x3a4a80, 0x141a36, 1.15);
    this.moonLight = new THREE.DirectionalLight(0x9aa4c8, 0.45);
    this.moonLight.position.copy(this.moonDir);
    g.add(this.hemi, this.moonLight, this.moonLight.target);

    // 海（格子と月の道）と、海の上の薄い靄
    this.sea = keep(makeSea(atmo, { moonDir: this.moonDir }));
    g.add(this.sea.mesh);
    this.wisps = keep(makeWisps(atmo, { y: 46, size: 2600, opacity: 0.26, scale: 0.0024, drift: [0.006, 0.012], color: 0x2e3866, near: [40, 120], cut: 0.55 }));
    g.add(this.wisps.mesh);

    // ターミナルの窓とドットの鳥居（区画ごとに置く）
    this.termTex = keep(termAtlas());
    this.termMat = keep(makeTermMat(atmo, this.termTex));
    const termGeo = keep(new THREE.PlaneGeometry(1, 0.75));
    const lit = keep(litMat(atmo, { emit: true, rim: true }));
    this.pools = {
      term: new Pool(termGeo, this.termMat, 3, NCH, 'terminals'),
      torii: new Pool(keep(voxelToriiGeo()), lit, 6, NCH, 'voxelTorii'),
    };
    this.pools.term.mesh.renderOrder = 5;
    this.poolList = Object.values(this.pools);
    for (const p of this.poolList) { g.add(p.mesh); this.disposables.push(p); }

    // 漂うボクセル
    this.voxels = keep(makeVoxels(atmo, {
      count: q === 2 ? 110 : q === 1 ? 80 : 50, box: [560, 240, 700], off: [0, -100, -260], vel: [0, 7, 4], size: [3, 7], near: [60, 150], seed: 12,
    }));
    g.add(this.voxels.mesh);

    this.flight = new Flight({ speed: 50, alt: 200, pitch: -0.9, fov: 50, pathX, groundY: () => 0, follow: 0.85, yawK: 0.25, rollK: 0.2, z0: 0 });
    this.tilt = this.builtTilt = -0.55;   // 窓と鳥居を後ろへ倒す角度（カメラのほうへ向ける。カメラを起こすと立てる）
    this.ring = new ChunkRing({ len: CH, count: NCH, behind: 1, build: (s, k, z0, z1) => this.buildChunk(s, k, z0, z1) });
    this.t = 0;
    this.boss = null;
    this.m = new THREE.Matrix4();
    this.col = new THREE.Color();
    this.mixA = 0;
  }

  // ---------------------------------------------------------------- 区画
  buildChunk(slot, k, z0) {
    const P = this.pools;
    for (const p of this.poolList) p.begin(slot);
    const R = rng(k * 7717 + 31);
    const m = this.m, c = this.col;
    // ターミナルの窓：左右に 2〜3 枚。少し後ろへ倒して、道のほうへ向ける
    const nW = R() < 0.45 ? 3 : 2;
    let side = R() < 0.5 ? -1 : 1;
    const used = [];
    for (let i = 0; i < nW; i++) {
      const z = z0 - ((i + 0.15 + R() * 0.7) / nW) * CH;
      const x = pathX(z) + side * (92 + R() * 150);
      const y = 24 + R() * 80;
      const s = 56 + R() * 30;
      // 色の入れ物に、画像の番号・時間のずれ・明るさを入れる
      P.term.add(mat4(m, x, y, z, -side * (0.2 + R() * 0.3), s, s, s, this.tilt * (0.9 + R() * 0.36), (R() - 0.5) * 0.06), c.setRGB(Math.floor(R() * 3.999), R(), 0.8 + R() * 0.2));
      used.push([side, z]);
      side = -side;
    }
    // ドットの鳥居：ときどき 1 つ、ときどき列で（窓と重ならないよう、窓の少ない側へ）
    const r = R();
    const freeSide = used.filter((u) => u[0] < 0).length <= used.filter((u) => u[0] > 0).length ? -1 : 1;
    if (r < 0.3) {
      const n = 4 + Math.floor(R() * 3);
      const lat = 165 + R() * 60;
      for (let i = 0; i < n; i++) {
        const z = z0 - 20 - i * 34;
        const x = pathX(z) + freeSide * lat;
        P.torii.add(mat4(m, x, 6 + i * 3, z, -freeSide * 0.25, 3.4, 3.4, 3.4, this.tilt));
      }
    } else if (r < 0.75) {
      const z = z0 - 30 - R() * (CH - 60);
      const x = pathX(z) + freeSide * (150 + R() * 100);
      const s = 3.6 + R() * 0.6;
      P.torii.add(mat4(m, x, 8 + R() * 20, z, -freeSide * (0.15 + R() * 0.25), s, s, s, this.tilt));
    }
    for (const p of this.poolList) p.end();
  }

  enter() {
    const w = this.world;
    w.scene.background = new THREE.Color(0x02030a);
    w.setFov(50);
    w.renderer.setLook?.({ exposure: 1.0, bloomStrength: 0.5, bloomRadius: 0.55, bloomThreshold: 0.92, vignette: 0.3, saturation: 1.02, contrast: 1.03,
      lift: [0.006, 0.008, 0.02], gain: [1.0, 1.0, 1.02] });
    w.field?.setMood?.({ hemiSky: 0xc8ccf0, hemiGround: 0x3a3048, hemi: 1.2, key: 0xf0eee6, keyI: 1.5, rim: 0xe0a080, rimI: 0.85 });
    this.update(0, { t: 0, speed: 1 });
  }

  event(name) {
    if (name === 'boss' && !this.boss) this.goBoss();
  }

  goBoss() {
    const f = this.flight;
    const hz = f.lookZ() - 320;
    const hx = pathX(hz) * 0.85;
    this.boss = { t: this.t, x: hx, z: hz };
    f.goTo({ x: hx, y: 120, z: hz, pitch: -0.13, yaw: 0, fov: 50 }, 12);
  }

  update(dt, ctx) {
    const w = this.world;
    this.t += dt;
    const t = ctx.t ?? this.t;
    if (ctx.boss && !this.boss && t < 2) this.goBoss();
    this.flight.update(dt, ctx, w.rig);
    const cam = w.rig.pos;
    this.tilt = -0.05 - 0.5 * Math.min(1, Math.max(0, (-this.flight.pitch - 0.13) / 0.77));
    this.ring.update(cam.z);
    if (Math.abs(this.tilt - this.builtTilt) > 0.008) { this.builtTilt = this.tilt; this.ring.rebuildFrom(-Infinity); }
    for (const p of this.poolList) p.flush();

    // 色：始め → ボス（月が出る）
    const prog = smooth(5, 240, t);
    const bossK = this.boss ? smooth(0, 10, this.t - this.boss.t) : 0;
    const a = (this.mixA = Math.max(prog * 0.4, bossK));
    const A = this.atmo;
    this.mix('fog', A.uFogColor.value);
    this.mix('fogSun', A.uFogSun.value);
    this.mix('hemiSky', this.hemi.color);
    this.mix('moonLight', this.moonLight.color);
    this.moonLight.intensity = 0.4 + bossK * 0.35;
    const su = this.sky.uniforms;
    this.mix('glow', su.uGlowCol.value);
    su.uGlowAmt.value = 0.12 + a * 0.22;
    A.uFogGlow.value.copy(su.uGlowCol.value).multiplyScalar(su.uGlowAmt.value);
    su.uHorizon.value.copy(A.uFogColor.value);
    su.uGround.value.copy(A.uFogColor.value);
    su.uTime.value = t;
    // 海：格子は少しずつ明るく、月の道は月が出ると強く
    const sea = this.sea.uniforms;
    sea.uTime.value = t;
    sea.uGridA.value = 0.22 + a * 0.06;
    sea.uRoad.value = 0.55 + prog * 0.15 + bossK * 0.35;
    // ドットの月
    this.moon.uniforms.uOn.value = bossK;
    this.moon.uniforms.uTime.value = t;
    this.moon.follow(cam, this.moonDir);
    // ターミナルの窓・ボクセル
    this.termMat.uniforms.uTime.value = t;
    this.voxels.uniforms.uOff.value.z = -260 - bossK * 260;
    this.voxels.uniforms.uOff.value.y = -110 + bossK * 20;
    this.voxels.update(t, cam);
    this.sea.follow(cam);
    this.wisps.update(t);
    this.wisps.follow(cam);
    this.sky.follow(cam);
    A.uWTime.value = t;
  }

  mix(key, out) { const L = COL[key]; return lerpColor(out, L[0], L[1], this.mixA); }

  dispose() {
    this.group.removeFromParent();
    this.sky.dispose();
    this.moon.dispose();
    for (const d of this.disposables) d.dispose?.();
  }
}

// ================================================================ 海（格子・月の道・星のきらめき）
function makeSea(atmo, o) {
  const size = 16000;
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    ...atmo,
    uSN: { value: atmo.uNoise.value },
    uDeep: { value: new THREE.Color(0x0a1024) },
    uSky: { value: new THREE.Color(0x2a3258) },
    uGridCol: { value: new THREE.Color(TERRA2) },
    uRoadCol: { value: new THREE.Color(0xe8dcc4) },
    uGlintCol: { value: new THREE.Color(0xa8b8e8) },
    uMoonDir: { value: o.moonDir },
    uTime: { value: 0 },
    uGridA: { value: 0.22 },    // 格子の明るさ
    uGridS: { value: 26 },      // 格子のます目の大きさ
    uGridW: { value: 0.3 },    // 線の太さの半分
    uGridFlow: { value: 9 },    // 格子そのものが手前へ流れる速さ
    uRoad: { value: 0.6 },      // 月の道の強さ
    uRoadW: { value: 0.1 },     // 月の道の幅（ラジアン）
    uPix: { value: 4 },         // 水面のドットの大きさ
  };
  const mat = new THREE.ShaderMaterial({
    name: 'clawdSea',
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSN;
      uniform vec3 uDeep, uSky, uGridCol, uRoadCol, uGlintCol, uMoonDir;
      uniform float uTime, uGridA, uGridS, uGridW, uGridFlow, uRoad, uRoadW, uPix;
      varying vec3 vWPos;
      ${FOG_GLSL}
      // 小さな整数（0〜255）の格子点ごとの乱数（世界の座標が大きくても崩れないよう、先に 256 で折り返す）
      float h21(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
      void main() {
        vec2 p = vWPos.xz;
        float dist = length(vWPos - cameraPosition);
        // うねり（3 つの大きさのノイズで水面の傾き）
        float n1 = texture2D(uSN, p * 0.0042 + vec2(uTime * 0.004, uTime * 0.006)).g;
        float n2 = texture2D(uSN, p * 0.011 + vec2(-uTime * 0.007, uTime * 0.01) + 0.37).b;
        float n3 = texture2D(uSN, p * 0.027 + vec2(uTime * 0.012, -uTime * 0.016) + 0.71).a;
        vec2 slope = vec2(n1 - 0.5, n2 - 0.5) * 0.7 + vec2(n3 - 0.5, n2 - n3) * 0.3;
        vec3 N = normalize(vec3(slope.x, 1.0, slope.y));
        vec3 V = normalize(cameraPosition - vWPos);
        float fres = pow(max(1.0 - max(dot(N, V), 0.0), 0.0), 3.0);
        vec3 col = mix(uDeep, uSky, 0.1 + 0.8 * fres);
        float swell = texture2D(uSN, p * 0.0011 + vec2(uTime * 0.0015, uTime * 0.002)).r;
        col *= 0.8 + 0.4 * swell;

        // 光の格子（うねりで少しゆがむ。遠くで細かくなりすぎたら消す）
        vec2 gp = p + vec2(sin(p.y * 0.021 + uTime * 0.5) + 0.5 * sin(p.y * 0.047 - uTime * 0.7), sin(p.x * 0.017 + uTime * 0.4) + 0.5 * sin(p.x * 0.043 + uTime * 0.6)) * 1.6;
        gp.y -= uTime * uGridFlow;
        vec2 gq = gp / uGridS;
        vec2 fw = fwidth(gq);
        vec2 gd = abs(fract(gq - 0.5) - 0.5);            // いちばん近い線までの距離（ます目の単位）
        vec2 lw = vec2(uGridW / uGridS);
        vec2 l = 1.0 - smoothstep(lw, lw + fw * 1.5, gd);
        // 4 ます目ごとの太い線
        vec2 gq4 = gq * 0.25;
        vec2 gd4 = abs(fract(gq4 - 0.5) - 0.5);
        vec2 fw4 = fwidth(gq4);
        vec2 l4 = 1.0 - smoothstep(lw * 0.25 * 1.6, lw * 0.25 * 1.6 + fw4 * 1.5, gd4);
        float lod = 1.0 - smoothstep(0.12, 0.42, max(fw.x, fw.y));
        float lod4 = 1.0 - smoothstep(0.12, 0.42, max(fw4.x, fw4.y));
        float line = max(max(l.x, l.y) * 0.5 * lod, max(l4.x, l4.y) * lod4);
        // 線のにじみ
        float halo = (exp(-gd.x * uGridS * 0.5) + exp(-gd.y * uGridS * 0.5)) * 0.06 * lod;
        // データの粒：奥へのびる線（x が一定の線）の上を手前へ走る
        float ix = mod(floor(gq.x + 0.5), 256.0);
        float hl = h21(vec2(ix, 7.0));
        float s = fract(gq.y * 0.125 + uTime * (0.18 + 0.2 * hl) + hl * 7.0);
        float packet = smoothstep(0.0, 0.03, s) * (1.0 - smoothstep(0.03, 0.16, s)) * step(hl, 0.45);
        float pk = packet * l.x * lod * 2.2;
        col += uGridCol * uGridA * (line + halo + pk);

        // 月の道とまばらな星のきらめき（水面の四角いドット）
        vec2 cell = floor(p / uPix);
        vec2 fc = fract(p / uPix);
        vec2 cc = (cell + 0.5) * uPix;
        vec2 toC = cc - cameraPosition.xz;
        vec2 dh = toC / max(length(toC), 1e-3);
        vec2 mh = uMoonDir.xz / max(length(uMoonDir.xz), 1e-4);
        float lat = dh.x * mh.y - dh.y * mh.x;
        float ahead = smoothstep(0.0, 0.4, dot(dh, mh));
        float road = exp(-lat * lat / max(uRoadW * uRoadW, 1e-4)) * ahead;
        float far = smoothstep(260.0, 700.0, dist) * 0.7 + smoothstep(700.0, 2000.0, dist) * 0.3;
        vec2 cm = mod(cell, 256.0);
        float r1 = h21(cm), r2 = h21(cm + 17.0), r3 = h21(cm + 71.0);
        float wave = textureLod(uSN, cc * 0.013 + vec2(uTime * 0.02, -uTime * 0.03), 0.0).g;
        float on = step(1.0 - (road * (0.12 + 0.4 * wave) + 0.01), r1);
        float tw = 0.35 + 0.65 * pow(max(sin(uTime * (0.5 + 1.1 * r2) + r3 * 6.2831), 0.0), 2.0);
        float sq = step(0.12, fc.x) * step(fc.x, 0.88) * step(0.12, fc.y) * step(fc.y, 0.88);
        vec2 fwp = fwidth(p / uPix);
        float plod = 1.0 - smoothstep(0.25, 0.6, max(fwp.x, fwp.y));
        vec3 gc = mix(uGlintCol * 0.5, uRoadCol, smoothstep(0.05, 0.4, road));
        col += gc * on * tw * sq * plod * (0.14 + road * uRoad * far * 0.55) * mix(1.0, far, smoothstep(0.05, 0.3, road));
        // 遠くでドットが細かくなったら、なめらかな光の帯にする（靄を通して見える光なので、霧のあとで足す）
        vec3 roadGlow = uRoadCol * road * uRoad * far * 0.12 * (1.0 - plod) * (0.6 + 0.4 * wave);

        float fa = atmoAmount(vWPos);
        col = mix(col, atmoColor(vWPos), fa);
        col += roadGlow * (1.0 - 0.6 * fa);
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sea';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return {
    mesh, uniforms,
    follow(cam) { mesh.position.x = Math.round(cam.x / 40) * 40; mesh.position.z = Math.round(cam.z / 40) * 40; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// ================================================================ ドットでできた満月
function makePixelMoon(noise) {
  const EXT = 2.2;     // 板の半分の幅（月の半径を 1 として）
  const uniforms = {
    uOn: { value: 0 },
    uTime: { value: 0 },
    uN: { value: 14 },                                 // 直径に並ぶドットの数
    uExt: { value: EXT },
    uCol: { value: new THREE.Color(0x6e6458) },        // 月の色（弾が読めるよう暗め）
    uGlowCol: { value: new THREE.Color(0x5e4a40) },    // にじみ（ほんのりテラコッタ）
    uNoise: { value: noise },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'pixelMoon',
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uOn, uTime, uN, uExt;
      uniform vec3 uCol, uGlowCol;
      uniform sampler2D uNoise;
      varying vec2 vUv;
      float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
      float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
      void main() {
        if (uOn < 0.002) discard;
        vec2 m = (vUv * 2.0 - 1.0) * uExt;          // 月の半径を 1 とする
        float k = uN * 0.5;
        vec2 cell = floor(m * k);
        vec2 f = fract(m * k);
        vec2 cc = (cell + 0.5) / k;                 // ドットの中心
        float r = length(cc);
        float disc = step(r, 1.0);
        // 月の面：縁の暗さと海（暗い模様）を 5 段の色に落とす
        float limb = sqrt(clamp(1.0 - r * r, 0.0, 1.0));
        vec2 mq = vec2(-cc.x, cc.y);
        float n = texture2D(uNoise, mq * 0.32 + vec2(0.13, 0.71)).g;
        float n2 = texture2D(uNoise, mq * 0.85 + vec2(0.5, 0.2)).b;
        float mar = smoothstep(0.5, 0.6, n);
        float lv = 0.6 + 0.4 * pow(max(limb, 0.0), 0.6) - mar * 0.24 + (n2 - 0.5) * 0.1;
        lv = floor(lv * 5.0 + 0.5) / 5.0;
        // 明るい縁どり（左上）と、右下の影の段
        float edge = step(0.86, r) * step(dot(cc, vec2(-0.7, 0.7)), 0.0);
        lv += 0.08 * step(0.86, r) * step(0.0, dot(cc, vec2(-0.7, 0.7)));
        lv -= 0.1 * edge;
        float gap = step(0.07, f.x) * step(f.x, 0.93) * step(0.07, f.y) * step(f.y, 0.93);
        vec3 mc = uCol * lv * mix(0.82, 1.0, gap);
        // ゆっくり通る走査線（ほんの少し明るく）
        float scan = smoothstep(0.0, 0.08, fract(cc.y * 0.25 - uTime * 0.05)) * (1.0 - smoothstep(0.08, 0.16, fract(cc.y * 0.25 - uTime * 0.05)));
        mc *= 1.0 + scan * 0.06;
        // にじみ：ディザのドットの輪と、なめらかな光
        float outR = max(r - 1.0, 0.0);
        float hd = exp(-outR * 5.5) * 0.85;
        float dots = step(bayer4(cell) + 0.04, hd) * gap * (1.0 - disc);
        float lr = max(length(m) - 1.0, 0.0);
        vec3 halo = uGlowCol * (dots * 0.16 + exp(-lr * 2.6) * 0.07 + exp(-lr * 0.8) * 0.025) * (1.0 - disc);
        float fadeEdge = 1.0 - smoothstep(uExt * 0.8, uExt, max(abs(m.x), abs(m.y)));
        vec3 col = (mc * disc + halo * fadeEdge) * uOn;
        gl_FragColor = vec4(max(col, vec3(0.0)), disc * uOn);
      }`,
  });
  const geo = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'pixelMoon';
  mesh.frustumCulled = false;
  mesh.renderOrder = -99;
  const R = MOON_D * Math.tan(MOON_R) * EXT;
  mesh.scale.set(R, R, 1);
  return {
    mesh, uniforms,
    follow(cam, dir) {
      mesh.visible = uniforms.uOn.value > 0.002;
      mesh.position.copy(cam).addScaledVector(dir, MOON_D);
      mesh.lookAt(cam);
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// ================================================================ 漂うボクセル（GPU で動かす）
function makeVoxels(atmo, o) {
  const n = o.count;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = box.index;
  geo.setAttribute('position', box.attributes.position);
  geo.setAttribute('normal', box.attributes.normal);
  geo.setAttribute('uv', box.attributes.uv);
  const R = rng(o.seed ?? 3);
  const a = new Float32Array(n * 4), b = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    a[i * 4] = R(); a[i * 4 + 1] = R(); a[i * 4 + 2] = R(); a[i * 4 + 3] = R();
    b[i * 4] = R();        // 色
    b[i * 4 + 1] = R();    // 大きさ
    b[i * 4 + 2] = R();    // 回る速さ
    b[i * 4 + 3] = R();    // 光るか
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(a, 4));
  geo.setAttribute('aSeed2', new THREE.InstancedBufferAttribute(b, 4));
  geo.instanceCount = n;
  const uniforms = {
    ...atmo,
    uCam: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(...o.box) },
    uOff: { value: new THREE.Vector3(...o.off) },
    uVel: { value: new THREE.Vector3(...o.vel) },
    uTime: { value: 0 },
    uWander: { value: o.wander ?? 5 },
    uSize: { value: new THREE.Vector2(...o.size) },
    uNear: { value: new THREE.Vector2(...o.near) },
    uColA: { value: new THREE.Color(TERRA) },
    uColA2: { value: new THREE.Color(TERRA2) },
    uColB: { value: new THREE.Color(CREAM) },
    uColC: { value: new THREE.Color(AI) },
    uSkyL: { value: new THREE.Color(0x6a72a0) },
    uGndL: { value: new THREE.Color(0x262838) },
    uMoonL: { value: new THREE.Color(0x8a90b0) },
    uLDir: { value: new THREE.Vector3(0.2, 0.6, -0.8).normalize() },
    uEmit: { value: 0.55 },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'voxels',
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed, aSeed2;
      uniform vec3 uCam, uBox, uOff, uVel;
      uniform float uTime, uWander;
      uniform vec2 uSize, uNear;
      varying vec3 vWPos, vN;
      varying vec2 vUv;
      varying float vPick, vGlow;
      vec3 rot(vec3 v, vec3 ax, float c, float s) { return v * c + cross(ax, v) * s + ax * dot(ax, v) * (1.0 - c); }
      void main() {
        vec3 p = aSeed.xyz * uBox + uVel * uTime * (0.6 + 0.8 * fract(aSeed.w * 7.31));
        float ph = aSeed.w * 6.2831;
        p += vec3(sin(uTime * 0.31 + ph), 0.0, cos(uTime * 0.27 + ph * 1.3)) * uWander;
        vec3 c = uCam + uOff;
        vec3 rel = mod(p - c + 0.5 * uBox, uBox) - 0.5 * uBox;
        vec3 e = abs(rel) / (0.5 * uBox);
        float fade = 1.0 - smoothstep(0.7, 1.0, max(max(e.x, e.y), e.z));
        vec3 ctr = c + rel;
        fade *= smoothstep(uNear.x, uNear.y, length(ctr - cameraPosition));
        // 海から湧く：水面の近くでは小さく
        fade *= smoothstep(-4.0, 22.0, ctr.y);
        // 大きさはドットらしく段で変える
        fade = floor(fade * 4.0 + 0.5) / 4.0;
        float sz = mix(uSize.x, uSize.y, aSeed2.y * aSeed2.y) * fade;
        vec3 ax0 = vec3(aSeed.y, aSeed.z, aSeed.x) - 0.5 + vec3(1e-3, 2e-3, 0.0);
        vec3 ax = ax0 / max(length(ax0), 1e-3);
        float ang = uTime * (0.25 + 0.7 * aSeed2.z) + aSeed.w * 20.0;
        float cs = cos(ang), sn = sin(ang);
        vec3 q = rot(position * sz, ax, cs, sn);
        vN = rot(normal, ax, cs, sn);
        vWPos = ctr + q;
        vUv = uv;
        vPick = aSeed2.x;
        vGlow = step(0.68, aSeed2.w);
        gl_Position = projectionMatrix * viewMatrix * vec4(vWPos, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColA, uColA2, uColB, uColC, uSkyL, uGndL, uMoonL, uLDir;
      uniform float uEmit;
      varying vec3 vWPos, vN;
      varying vec2 vUv;
      varying float vPick, vGlow;
      ${FOG_GLSL}
      void main() {
        vec3 alb = vPick < 0.36 ? uColA : (vPick < 0.62 ? uColA2 : (vPick < 0.88 ? uColB : uColC));
        vec3 N = normalize(vN + vec3(0.0, 1e-5, 0.0));
        vec3 amb = mix(uGndL, uSkyL, N.y * 0.5 + 0.5);
        float d = max(dot(N, uLDir), 0.0);
        // 面の縁を少し暗く（ドットのタイルらしく）
        vec2 eu = abs(vUv - 0.5) * 2.0;
        float rim = 1.0 - 0.3 * smoothstep(0.72, 0.9, max(eu.x, eu.y));
        vec3 col = alb * (amb + uMoonL * d) * rim;
        col += alb * vGlow * uEmit * (vPick < 0.62 ? 1.0 : 0.45) * rim;
        col = applyAtmo(col, vWPos);
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'voxels';
  mesh.frustumCulled = false;
  return {
    mesh, uniforms,
    update(t, cam) { uniforms.uTime.value = t; uniforms.uCam.value.copy(cam); },
    dispose() { geo.dispose(); box.dispose(); mat.dispose(); },
  };
}

// ================================================================ ドット（ボクセル）の鳥居
// 正面の絵（上から下へ）。R：朱、K：黒、r：崩れて浮いた朱の粒。ます目 1 つが 1 単位。足もとが原点、正面が +Z。
const TORII_ART = [
  '...........r...',
  '.............r.',
  '............r..',
  '.K.............',
  'KKKKKKKKKKKKKK.',
  '.RRRRRRRRRRRRR.',
  '...R...R...R...',
  '..RRRRRRRRRRR..',
  '...R.......R...',
  '...R.......R...',
  '...R.......R...',
  '...R.......R...',
  '...R.......R...',
  '...R.......R...',
  '...R.......R...',
  '...R.......R...',
  '...K.......K...',
];
function voxelToriiGeo() {
  const P = [];
  const R = rng(5);
  const H = TORII_ART.length, W = TORII_ART[0].length;
  const c = new THREE.Color();
  for (let j = 0; j < H; j++) {
    const y = H - 1 - j;
    for (let i = 0; i < W; i++) {
      const ch = TORII_ART[j][i];
      if (ch === '.') continue;
      const x = i - 7;
      const k = 0.88 + R() * 0.2;
      if (ch === 'K') {
        c.set(0x2a2228).multiplyScalar(k);
        // 笠木は奥行き 2 ます
        const deep = y >= H - 5;
        P.push(part(new THREE.BoxGeometry(0.92, 0.92, deep ? 1.92 : 0.92), c, { p: [x, y + 0.5, 0] }));
      } else if (ch === 'R') {
        c.set(0x9a3a28).multiplyScalar(k);
        P.push(part(new THREE.BoxGeometry(0.9, 0.9, 0.9), c, { p: [x, y + 0.5, 0], emit: 0.12 }));
      } else {
        c.set(TERRA).multiplyScalar(k);
        const s = 0.5 + R() * 0.25;
        P.push(part(new THREE.BoxGeometry(s, s, s), c, { p: [x + (R() - 0.5) * 0.4, y + 0.5, (R() - 0.5) * 0.8], r: [R() * 3, R() * 3, 0], emit: 0.5 }));
      }
    }
  }
  return merge(P);
}

// ================================================================ ターミナルの窓
// 画像は 2 × 2 の 4 種類（1 枚 512 × 384）。行の位置は下の値に合わせてシェーダーで打ち込みを見せる。
const TW = 512, TH = 384, ROW0 = 66, ROWH = 24, ROWS = 12, CUR_X = 50;
const TBG = '#0c0b11';

function termAtlas() {
  return canvasTex(TW * 2, TH * 2, (g) => {
    const R = rng(77);
    for (let v = 0; v < 4; v++) drawTerm(g, (v % 2) * TW, Math.floor(v / 2) * TH, v, R);
  }, { name: 'termAtlas' });
}

function drawTerm(g, ox, oy, variant, R) {
  const x0 = ox + 10, y0 = oy + 10, w = TW - 20, h = TH - 20, rad = 24;
  const rr = (x, y, ww, hh, r) => { g.beginPath(); g.roundRect(x, y, ww, hh, r); };
  // 板と枠
  rr(x0, y0, w, h, rad);
  g.fillStyle = TBG;
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = '#17151d';
  g.fillRect(x0, y0, w, 38);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  g.fillRect(x0, y0 + 38, w, 2);
  g.restore();
  rr(x0 + 1.5, y0 + 1.5, w - 3, h - 3, rad - 1.5);
  g.strokeStyle = 'rgba(217,119,87,0.5)';
  g.lineWidth = 3;
  g.stroke();
  // 上の帯：3 つの点と、題名の代わりの短い線
  [['#c67d5f', 0], ['#6e6a62', 1], ['#4a4858', 2]].forEach(([c, i]) => { g.fillStyle = c; g.beginPath(); g.arc(x0 + 24 + i * 20, y0 + 19, 6, 0, Math.PI * 2); g.fill(); });
  g.fillStyle = 'rgba(240,238,230,0.22)';
  rr(ox + TW / 2 - 60, y0 + 15, 120, 8, 4);
  g.fill();

  const CR = 'rgba(240,238,230,0.8)', GR = 'rgba(160,156,148,0.55)', TC = 'rgba(217,119,87,0.95)', IN = 'rgba(128,142,214,0.85)';
  const GN = 'rgba(122,200,130,0.9)', RD = 'rgba(226,112,100,0.9)';
  const tok = (x, y, ww, col) => { g.fillStyle = col; rr(x, y + 7, ww, 10, 3); g.fill(); return x + ww + 9; };
  const words = (x, y, n, cols, maxX = ox + TW - 40) => {
    for (let i = 0; i < n && x < maxX - 20; i++) x = tok(x, y, Math.min(14 + Math.floor(R() * 56), maxX - x), cols[Math.floor(R() * cols.length)]);
    return x;
  };
  const chevron = (x, y, col) => { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x + 8, y + 12); g.lineTo(x, y + 18); g.stroke(); };
  const band = (y, col) => { g.fillStyle = col; g.fillRect(x0 + 3, y, w - 6, ROWH); };
  const mark = (x, y, col, plus) => { g.fillStyle = col; g.fillRect(x, y + 11, 10, 3); if (plus) g.fillRect(x + 3.5, y + 7.5, 3, 10); };
  const L = ox + 26;
  const rows = {
    0: ['cmd', 'out', 'out', 'out', 'cmd', 'out', 'ok', 'blank', 'cmd', 'out', 'out', 'ok'],
    1: ['head', 'head', 'hunk', 'ctx', 'del', 'del', 'add', 'add', 'add', 'ctx', 'hunk', 'add'],
    2: ['code0', 'code1', 'code2', 'code2', 'code1', 'code0', 'blank', 'code0', 'code1', 'code2', 'code1', 'code0'],
    3: ['cmd', 'task1', 'task1', 'task1', 'task0', 'task0', 'blank', 'bar', 'blank', 'cmd', 'out', 'ok'],
  }[variant];
  rows.forEach((kind, i) => {
    const y = oy + ROW0 + i * ROWH;
    switch (kind) {
      case 'cmd': chevron(L, y, TC); words(L + 24, y, 2 + Math.floor(R() * 3), [CR, CR, IN]); break;
      case 'out': words(L + 24, y, 2 + Math.floor(R() * 5), [GR, GR, CR]); break;
      case 'ok': g.fillStyle = GN; g.fillRect(L + 24, y + 7, 10, 10); words(L + 42, y, 2 + Math.floor(R() * 2), [GR]); break;
      case 'head': words(L, y, 3, [GR, IN]); break;
      case 'hunk': words(L, y, 2, [IN]); break;
      case 'ctx': words(L + 24, y, 2 + Math.floor(R() * 4), [GR]); break;
      case 'del': band(y, 'rgba(200,70,70,0.16)'); mark(L + 2, y, RD, false); words(L + 24, y, 2 + Math.floor(R() * 4), [RD]); break;
      case 'add': band(y, 'rgba(70,150,90,0.16)'); mark(L + 2, y, GN, true); words(L + 24, y, 2 + Math.floor(R() * 4), [GN]); break;
      case 'code0': words(L + 24, y, 2 + Math.floor(R() * 3), [TC, CR, IN]); break;
      case 'code1': words(L + 48, y, 2 + Math.floor(R() * 3), [CR, GN, IN, TC]); break;
      case 'code2': words(L + 72, y, 1 + Math.floor(R() * 3), [CR, GR, GN]); break;
      case 'task1': g.fillStyle = TC; g.fillRect(L + 24, y + 6, 12, 12); words(L + 46, y, 2 + Math.floor(R() * 2), [GR]); break;
      case 'task0': g.strokeStyle = GR; g.lineWidth = 2; g.strokeRect(L + 25, y + 7, 10, 10); words(L + 46, y, 2 + Math.floor(R() * 2), [CR]); break;
      case 'bar': for (let k = 0; k < 18; k++) { g.fillStyle = k < 12 ? TC : 'rgba(110,106,98,0.5)'; g.fillRect(L + 24 + k * 14, y + 6, 11, 12); } break;
      default: break;
    }
  });
}

function makeTermMat(atmo, tex) {
  const uniforms = {
    ...atmo,
    uMap: { value: tex },
    uTime: { value: 0 },
    uBg: { value: new THREE.Color(TBG) },
    uCursor: { value: new THREE.Color(CREAM) },
    uGain: { value: 0.48 },
    uOpacity: { value: 0.74 },
    uNearW: { value: new THREE.Vector2(30, 90) },
  };
  return new THREE.ShaderMaterial({
    name: 'terminal',
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWPos, vData;
      void main() {
        vData = instanceColor;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        wp.y += sin(uTime * 0.45 + instanceColor.g * 6.2831) * 2.5;
        vUv = uv;
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uTime, uGain, uOpacity;
      uniform vec3 uBg, uCursor;
      uniform vec2 uNearW;
      varying vec2 vUv;
      varying vec3 vWPos, vData;
      ${FOG_GLSL}
      void main() {
        float cell = floor(vData.r + 0.5);
        vec2 off = vec2(mod(cell, 2.0), 1.0 - floor(cell * 0.5)) * 0.5;
        vec4 tx = texture2D(uMap, off + vUv * 0.5);
        if (tx.a < 0.01) discard;
        vec2 px = vec2(vUv.x * ${TW}.0, (1.0 - vUv.y) * ${TH}.0);
        // 1 行ずつ打ち込まれ、しばらく止まり、消えてまた始まる
        float P = mod(uTime * 1.3 + vData.g * 37.0, ${ROWS}.0 + 7.0);
        float typed = min(floor(P), ${ROWS}.0);
        float row = floor((px.y - ${ROW0}.0) / ${ROWH}.0);
        float body = step(0.0, row) * step(row, ${ROWS}.0 - 0.5) * step(14.0, px.x) * step(px.x, ${TW}.0 - 14.0);
        vec3 c = mix(tx.rgb, uBg, body * step(typed, row));
        // 次の行の頭で点滅するカーソル
        vec2 c0 = vec2(${CUR_X}.0, ${ROW0}.0 + typed * ${ROWH}.0 + 5.0);
        float cur = step(c0.x, px.x) * step(px.x, c0.x + 11.0) * step(c0.y, px.y) * step(px.y, c0.y + 15.0) * step(typed, ${ROWS}.0 - 0.5);
        float blink = step(fract(uTime * 1.6 + vData.g * 3.0), 0.55);
        c = mix(c, uCursor, cur * blink);
        // 走査線
        c *= 0.9 + 0.1 * sin(px.y * 1.5708);
        c *= uGain * vData.b;
        float a = tx.a * uOpacity;
        float dc = length(vWPos - cameraPosition);
        a *= smoothstep(uNearW.x, uNearW.y, dc);
        float f = atmoAmount(vWPos);
        c = mix(c, atmoColor(vWPos), f);
        a *= 1.0 - f * 0.7;
        gl_FragColor = vec4(max(c, vec3(0.0)), a);
      }`,
  });
}
