// タイトルの背景：千本鳥居の参道の入口。月のない夜（中秋なのに月が昇らない）。
// 手前に石畳の参道と石灯籠、赤い前掛けの狐像が一対、しめ縄の大鳥居。その奥の石段から、鳥居のトンネルが山を上っていく。
// 両わきに杉の太い幹、山の稜線の上は深い青の星空と天の川。青い狐火と蛍がただよい、カメラはゆっくり揺れる。
//
// 文字とメニューは画面の左、主人公は右に立つ。this.anchor（足もとの位置・倍率・向き）に身長 1.45 m のモデルを置くと、
// 横長の画面では右半分に画面の高さの約 56% で写る（縦長の画面では右上に約 40%）。カメラの位置はこの点から毎フレーム解く。
// この世界の 1 単位は 1 m（anchor.scale = 1）。yaw はモデルの正面（+Z）をカメラへ向ける回転（rotation.y）。
// cleared(true) で満月を出す（クリアのあと）。開発用：URL に ?anchor を付けると立ち位置に半透明の人形が出る。
import * as THREE from 'three';
import { makeAtmo, litMat } from '../kit/atmo.js';
import { noiseTexture, rng } from '../kit/noise.js';
import { makeSkyDome } from '../kit/skydome.js';
import { toriiGeo, stoneLanternGeo, foxStatueGeo, cedarGeo, emitShu, PAL } from '../kit/props.js';
import { part, merge, mat4, jitter, xform } from '../kit/geo.js';
import { makeSwarm, makeGlows } from '../kit/particles.js';
import { barkTex, flagstoneTex, canvasTex } from '../kit/tex.js';
import { frameAnchor } from '../kit/flight.js';

const softplus = (x, k) => Math.max(x, 0) + Math.log1p(Math.exp(-Math.abs(x) * k)) / k;
const smin = (a, b, k) => { const m = Math.min(a, b); return m - k * Math.log(Math.exp(-(a - m) / k) + Math.exp(-(b - m) / k)); };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 鳥居のトンネルの中心線（山を上りながら、大鳥居の枠の中で左右に縫うように曲がる）。 */
const tunnelX = (z) => 6.5 * Math.sin((z + 24) * 0.05) * sm(-24, -40, z);
/** 地面の高さ（m）。参道は平らで、z < −22 から山を上る。左右へ行くと稜線が下がる。 */
function groundH(x, z) {
  const dx = Math.abs(x - tunnelX(z));
  let h = smin(0.3 * softplus(-22 - z, 0.8), 40 - 0.0022 * x * x, 6);
  h += 0.12 * softplus(dx - 4.5, 0.6) * (z > -22 ? 1 : 0.3);
  h += Math.sin(x * 0.61 + z * 0.37) * Math.sin(z * 0.53 - x * 0.23) * 0.45 * sm(2.6, 7, dx);
  return h;
}
const PATH_W = 1.7;       // 参道の半分の幅
const TORII_Z = -19;      // 大鳥居
const ANCHOR = new THREE.Vector3(0.85, 0.02, -1.6);
const H = 1.45;           // 主人公の身長（m）

export default class TitleWorld {
  constructor(world) {
    this.world = world;
    const g = (this.group = new THREE.Group());
    g.name = 'titleWorld';
    world.scene.add(g);
    const q = world.renderer?.quality === 'low' ? 0 : world.renderer?.quality === 'medium' ? 1 : 2;
    this.disposables = [];
    const keep = (x) => (this.disposables.push(x), x);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();

    this.noise = keep(noiseTexture(256, 3));
    this.atmo = makeAtmo({
      fog: 0x131d36, fogSun: 0x1c2a4e, sunDir: [0, 0.25, -1], density: 0.0062, far: 420,
      hBase: 0, hFall: 0.2, hAmount: 0.03, noise: this.noise, rim: 0x14203a,
    });
    const atmo = this.atmo;

    // 空（月はクリアのあとだけ）
    this.sky = makeSkyDome({
      zenith: 0x030718, mid: 0x0c1840, horizon: 0x2a3d68, ground: 0x0a0e18,
      stars: 1.2, milky: 1.0, milkyN: [0.7, 0.3, 0.65], noise: this.noise,
      moonDir: [0.064, 0.399, -0.915], moonSize: 0.058, moonColor: 0xf6ecd2, moonGlow: 0.7, moon: 0,
      glowColor: 0x22355c, glowDir: [0, 0, -1], glow: 0.4, radius: 800,
    });
    g.add(this.sky.mesh);

    // 明かり：弱い空の光と星明かり、灯籠の暖かい点光、狐火の青い点光
    this.hemi = new THREE.HemisphereLight(0x5a6ea8, 0x16121c, 1.0);
    this.star = new THREE.DirectionalLight(0x8ea4e0, 0.5);
    this.star.position.set(-4, 10, -6);
    g.add(this.hemi, this.star, this.star.target);
    this.points = [];
    const pl = (color, I, d, x, y, z, fox = false) => {
      const L = new THREE.PointLight(color, I, d, 2);
      L.position.set(x, y, z);
      g.add(L);
      this.points.push({ L, I, fox });
    };
    pl(0xffa04a, 7.5, 14, -2.7, 1.7, -8);
    pl(0xffa04a, 7.5, 14, 2.7, 1.7, -12.5);
    pl(0xff9a44, 12, 24, 0, 2.6, TORII_Z + 3);
    pl(0xffb478, 5.5, 12, -1.9, 2.1, 1.2);
    pl(0xff9040, 14, 26, tunnelX(-34), groundH(tunnelX(-34), -34) + 2.2, -34);
    pl(0xff9040, 18, 32, tunnelX(-58), groundH(tunnelX(-58), -58) + 2.2, -58);
    pl(0xff9040, 22, 36, tunnelX(-88), groundH(tunnelX(-88), -88) + 2.4, -88);
    pl(0x5aa8ff, 5.0, 9, 2.2, 1.4, -1.1, true);

    // 材質
    const litE = keep(litMat(atmo, { emit: true, rim: true, detail: [0.9, 0.5] }));
    const lit = keep(litMat(atmo, { emit: true, detail: [0.6, 0.35] }));
    const foliage = keep(litMat(atmo, { sway: 0.01 }));

    // 地面（静かな場面なので CPU で高さと色を作る）
    g.add(this.makeGround(atmo, keep));

    // 大鳥居（しめ縄・額つき）と額の字
    const bigTorii = toriiGeo({ h: 1.3, seg: 20, kseg: 24, plaque: true, shimenawa: true });
    xform(bigTorii, { s: [6.2, 6.2, 6.2] });
    const tm = new THREE.Mesh(keep(bigTorii), litE);
    tm.position.set(0, 0, TORII_Z);
    tm.name = 'bigTorii';
    g.add(tm);
    const plaqueTex = keep(canvasTex(128, 160, (c, w, h) => {
      c.fillStyle = '#16121a';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#d8b462';
      c.font = '700 54px "Shippori Mincho B1", "Hiragino Mincho ProN", serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('稲', w / 2, h * 0.3);
      c.fillText('荷', w / 2, h * 0.7);
    }));
    const plaque = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.2 * 6.2 * 0.84, 0.15 * 1.3 * 6.2 * 0.86)),
      keep(new THREE.MeshBasicMaterial({ map: plaqueTex, color: 0x8a8070 })));
    plaque.position.set(0, 0.79 * 1.3 * 6.2, TORII_Z + 0.058 * 6.2 * 0.7 + 0.035 * 6.2 * 0.5 + 0.01);
    plaque.name = 'plaque';
    g.add(plaque);

    // 石段（大鳥居の奥から山へ）
    const steps = [];
    for (let i = 0; i < 10; i++) {
      const z = TORII_Z - 1.6 - i * 0.48;
      const y = groundH(0, z - 0.24) + 0.1;
      const k = 0.78 + ((i * 37) % 7) * 0.035;
      steps.push(part(new THREE.BoxGeometry(3.4, 1.2, 0.5), new THREE.Color(PAL.stone).multiplyScalar(k), { p: [0, y - 0.6, z] }));
    }
    const stepsM = new THREE.Mesh(keep(merge(steps)), lit);
    stepsM.name = 'steps';
    g.add(stepsM);

    // 鳥居のトンネル（山を上る。中の灯りで朱がほんのり光る）
    const smallTorii = keep(toriiGeo({ h: 1.42, seg: q ? 8 : 6, kseg: 6, daiwa: false }));
    emitShu(smallTorii, 0.6);
    const glows = (this.glows = keep(makeGlows(atmo, { capacity: 96, gain: 0.85, flicker: 0.1 })));
    let gi = 0;
    // 弧の長さで等間隔に並べる
    const nT = q ? 230 : 150, gap = q ? 0.6 : 0.92;
    const tun = new THREE.InstancedMesh(smallTorii, keep(litMat(atmo, { emit: true })), nT);
    let z = -25.4;
    for (let i = 0; i < nT; i++) {
      const x = tunnelX(z), y = groundH(x, z) - 0.05;
      const dxdz = (tunnelX(z + 0.1) - tunnelX(z - 0.1)) / 0.2;
      tun.setMatrixAt(i, mat4(m, x, y, z, Math.atan2(dxdz, 1), 1.85));
      const lamp = Math.pow(Math.max(0, Math.cos(i * 0.42)), 4);
      tun.setColorAt(i, col.setScalar(0.7 + 0.5 * lamp));
      if (i % 5 === 2 && gi < 70) glows.set(gi++, x, y + 0.9, z, 1.8, 0xff9040);
      z -= gap / Math.sqrt(1 + dxdz * dxdz);
    }
    tun.name = 'toriiTunnel';
    g.add(tun);

    // 石灯籠（参道の両側と、鳥居の奥）
    const lanternGeo = keep(stoneLanternGeo({ posts: true, emit: 1.35, light: 0xffc27a }));
    const lpos = [[-2.7, -8], [2.7, -8], [-2.7, -12.5], [2.7, -12.5], [-2.8, -16.8], [2.8, -16.8], [-2.4, TORII_Z - 3.8], [2.4, TORII_Z - 3.8]];
    const lan = new THREE.InstancedMesh(lanternGeo, litE, lpos.length);
    lpos.forEach(([x, z], i) => {
      const y = groundH(x, z);
      lan.setMatrixAt(i, mat4(m, x, y, z, (x < 0 ? 0.5 : -0.5) + i * 0.3, 1.0));
      glows.set(gi++, x, y + 1.64, z, 1.3, 0xffa850);
    });
    lan.name = 'stoneLanterns';
    g.add(lan);

    // 狐像（左は鍵、右は宝珠をくわえる）。参道のほうを向く
    const fz = -10.5, fx = 4.4;
    const foxL = foxStatueGeo({ jewel: false });
    xform(foxL, { p: [-fx, groundH(-fx, fz), fz], r: [0, 0.55, 0], s: [1.15, 1.15, 1.15] });
    const foxR = foxStatueGeo({ jewel: true, mirror: true });
    xform(foxR, { p: [fx, groundH(fx, fz), fz], r: [0, -0.55, 0], s: [1.15, 1.15, 1.15] });
    const foxM = new THREE.Mesh(keep(merge([foxL, foxR])), litE);
    foxM.name = 'foxStatues';
    g.add(foxM);

    // 杉：近くの太い幹（木肌の画像）と、山の森
    this.makeForest(atmo, foliage, keep, q);

    // 下草（笹のかたまり）
    const bushGeo = keep(makeBushGeo());
    const nB = q ? 160 : 90;
    const bush = new THREE.InstancedMesh(bushGeo, foliage, nB);
    const R = rng(77);
    for (let i = 0; i < nB; i++) {
      const side = R() < 0.5 ? -1 : 1;
      const z = 6 - R() * 60;
      const x = tunnelX(z) + side * (PATH_W + 1.1 + R() * R() * 16);
      const s = 0.5 + R() * 0.9;
      bush.setMatrixAt(i, mat4(m, x, groundH(x, z) - 0.05, z, R() * 6, s * 1.3, s * 0.7, s * 1.3));
      bush.setColorAt(i, col.setRGB(0.75 + R() * 0.3, 0.85 + R() * 0.3, 0.75 + R() * 0.2));
    }
    bush.name = 'bushes';
    g.add(bush);

    // 狐火（青い炎）と蛍
    this.wisps = keep(makeSwarm(atmo, {
      count: q ? 20 : 14, box: [15, 3.4, 24], off: [0.4, 2.0, -9], vel: [0, 0.1, -0.05], size: [0.24, 0.46],
      colA: 0x3f9cff, colB: 0x7fd8ff, wander: 1.2, blink: 0, shape: 1, gain: 1.25, seed: 5,
    }));
    this.fireflies = keep(makeSwarm(atmo, {
      count: q ? 90 : 50, box: [30, 2.6, 40], off: [0, 1.1, -13], vel: [0.05, 0.04, 0], size: [0.09, 0.15],
      colA: 0xd8ff70, colB: 0xa8ff8a, wander: 1.6, blink: 1, shape: 0, gain: 2.2, seed: 9,
    }));
    g.add(this.wisps.mesh, this.fireflies.mesh, glows.mesh);
    for (let i = gi; i < glows.capacity; i++) glows.hide(i);
    glows.commit();

    // 立ち位置（モデルを置く場所）
    this.anchor = { pos: ANCHOR.clone(), scale: 1, yaw: 0 };
    this.mid = ANCHOR.clone().add(new THREE.Vector3(0, H / 2, 0));
    this.moonK = 0;
    this.moonTarget = 0;
    this.t = 0;
    this.guideMesh = null;
    if (new URLSearchParams(location.search).has('anchor')) this.guide(true);
  }

  makeGround(atmo, keep) {
    // 中ほど（参道・トンネル）と手前は細かく、遠く・左右は粗い格子
    const nx = 120, nz = 140;
    const pos = [], col = [], path = [], idx = [];
    const c = new THREE.Color();
    const moss = new THREE.Color(0x1c281b), soil = new THREE.Color(0x29231d), grav = new THREE.Color(0x67615a), needle = new THREE.Color(0x33271f);
    for (let j = 0; j <= nz; j++) {
      const v = j / nz;
      const z = 14 - (v * 0.3 + v * v * 0.7) * 230;
      for (let i = 0; i <= nx; i++) {
        const xx = (i / nx - 0.5) * 2;
        const x = Math.sign(xx) * Math.pow(Math.abs(xx), 1.7) * 190 + tunnelX(z) * (1 - Math.abs(xx));
        const y = groundH(x, z);
        pos.push(x, y, z);
        const dx = Math.abs(x - tunnelX(z));
        const n1 = Math.sin(x * 1.7 + z * 0.9) * Math.sin(z * 1.3 - x * 0.7);
        c.copy(moss).lerp(soil, 0.5 + 0.5 * n1).lerp(needle, sm(-20, -40, z) * 0.5);
        c.lerp(grav, (1 - sm(PATH_W, PATH_W + 0.8, dx)) * 0.85);
        col.push(c.r, c.g, c.b);
        path.push(z > TORII_Z - 1.2 ? 1 - sm(PATH_W - 0.15, PATH_W + 0.05, dx) : 0);
      }
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aPath', new THREE.Float32BufferAttribute(path, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const stoneTex = keep(flagstoneTex(256, 4));
    const mat = keep(litMat(atmo, { detail: [0.35, 0.6] }));
    const own = mat.userData.u;
    own.uStone = { value: stoneTex };
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh) => {
      prev(sh);
      sh.uniforms.uStone = own.uStone;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPath;\nvarying float vPath;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPath = aPath;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uStone;\nvarying float vPath;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            // 石畳（参道）。夜露で少し濡れたむら
            vec3 st = texture2D(uStone, vWPos.xz / 2.6).rgb;
            float wet = texture2D(uNoise, vWPos.xz * 0.05).g;
            st *= 0.5 + 0.3 * wet;
            diffuseColor.rgb = mix(diffuseColor.rgb, st, smoothstep(0.3, 0.7, vPath));
          }`);
    };
    mat.customProgramCacheKey = () => 'titleGround';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'ground';
    return mesh;
  }

  makeForest(atmo, foliage, keep, q) {
    const g = this.group;
    const m = new THREE.Matrix4();
    const R = rng(1234);
    // 近くの太い幹（両わきで画面を縁どる）
    const near = [[-4.8, -6, 0.62], [5.3, -7.2, 0.6], [-6.8, -13.5, 0.75], [7.4, -14.5, 0.72], [-9.5, -21, 0.7], [10.5, -23, 0.66],
      [-12.5, -6, 0.8], [13, -8, 0.75], [-7.5, -30, 0.55], [8.5, -33, 0.55], [-16, -15, 0.7], [16.5, -17, 0.7]];
    const trunks = [];
    for (const [x, z, r] of near) {
      const y = groundH(x, z);
      const tg = new THREE.CylinderGeometry(r * 0.8, r * 1.1, 36, 14, 1, true);
      tg.translate(x, y + 18 - 0.3, z);
      trunks.push(tg);
      const base = new THREE.CylinderGeometry(r * 1.1, r * 1.6, 1.0, 14, 1, true);
      base.translate(x, y + 0.2, z);
      trunks.push(base);
    }
    const bark = keep(barkTex(128, 256, 8, [80, 56, 44]));
    bark.repeat.set(2, 7);
    const tm = new THREE.Mesh(keep(mergeUV(trunks)), keep(litMat(atmo, { map: bark, vertexColors: false, rim: true })));
    tm.name = 'trunks';
    g.add(tm);
    // 近くの木の葉（高いところ）
    const top = keep(cedarGeo({ seg: 10, tiers: 8, droop: 0.35, dark: 0x0a1612, light: 0x1a3024, trunk: false }));
    const nm = new THREE.InstancedMesh(top, foliage, near.length);
    near.forEach(([x, z, r], i) => { const h = 32 + r * 10; nm.setMatrixAt(i, mat4(m, x, groundH(x, z) - 0.4, z, R() * 6, h * 0.5, h, h * 0.5)); });
    nm.name = 'nearCedars';
    g.add(nm);
    // 山の杉（トンネルのまわりは空ける）
    const cg = keep(cedarGeo({ seg: q ? 8 : 6, tiers: q ? 7 : 5, droop: 0.35, dark: 0x0b1712, light: 0x1c3426 }));
    const list = [];
    const n = q ? 520 : 300;
    let tries = 0;
    while (list.length < n && tries++ < 8000) {
      const lower = list.length < n * 0.12;
      const z = lower ? 6 - R() * 28 : -22 - Math.pow(R(), 0.9) * 175;
      const x = (R() - 0.5) * 2 * (lower ? 45 : 30 + (-z) * 0.85);
      const dx = Math.abs(x - tunnelX(z));
      if (dx < (z > -22 ? 8 : 5.5 + (-22 - z) * 0.22 + R() * 4)) continue;
      if (lower && Math.abs(x) < 11) continue;
      const h = lower ? 22 + R() * 14 : 9 + R() * 7 + (-z) * 0.02;
      list.push([x, z, h]);
    }
    const cm = new THREE.InstancedMesh(cg, foliage, list.length);
    const col = new THREE.Color();
    list.forEach(([x, z, h], i) => {
      cm.setMatrixAt(i, mat4(m, x, groundH(x, z) - 0.4, z, R() * 6, h * 0.55, h, h * 0.55, (R() - 0.5) * 0.05, (R() - 0.5) * 0.05));
      cm.setColorAt(i, col.setRGB(0.8 + R() * 0.3, 0.85 + R() * 0.3, 0.85 + R() * 0.25));
    });
    cm.name = 'cedars';
    g.add(cm);
  }

  enter() {
    const w = this.world;
    w.scene.background = new THREE.Color(0x05070c);
    // 縦長ではカメラの真下近くの石畳まで写るので、近くで切れないようにする（出るときに戻す）
    w.camera.near = 0.25;
    w.setFov(38);
    w.renderer.setLook?.({ exposure: 1.0, bloomStrength: 0.5, bloomRadius: 0.55, bloomThreshold: 0.9, vignette: 0.42, saturation: 1.06, contrast: 1.04,
      lift: [0.008, 0.01, 0.02], gain: [1.0, 0.99, 1.0] });
    w.field?.setMood?.({ hemiSky: 0xb8c8ff, hemiGround: 0x3a2a3a, hemi: 1.1, key: 0xffd2a0, keyI: 1.4, rim: 0x7ab8ff, rimI: 0.9 });
    this.update(0, { t: 0, speed: 0.6 });
  }

  /** クリアのあと：満月を出す。 */
  cleared(on = true) { this.moonTarget = on ? 1 : 0; }

  /** 開発用：立ち位置に半透明の人形（身長 1.45 m）を出す。 */
  guide(on = true) {
    if (on && !this.guideMesh) {
      const geo = new THREE.CapsuleGeometry(0.2, H - 0.4, 6, 12);
      geo.translate(0, H / 2, 0);
      this.guideMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff60a0, transparent: true, opacity: 0.45, depthWrite: false }));
      this.guideMesh.position.copy(this.anchor.pos);
      this.group.add(this.guideMesh);
    } else if (!on && this.guideMesh) {
      this.guideMesh.removeFromParent();
      this.guideMesh.geometry.dispose();
      this.guideMesh.material.dispose();
      this.guideMesh = null;
    }
  }

  update(dt, ctx) {
    const w = this.world;
    const t = (this.t += dt);
    // 月（クリアのあと）
    this.moonK += (this.moonTarget - this.moonK) * Math.min(1, dt * 0.8);
    const mk = this.moonK;
    const su = this.sky.uniforms;
    su.uMoonOn.value = mk;
    su.uStars.value = 1.2 - mk * 0.4;
    su.uTime.value = t;
    this.hemi.intensity = 1.0 + mk * 0.45;
    this.star.intensity = 0.5 + mk * 0.8;
    this.star.color.setRGB(0.55 + mk * 0.3, 0.64 + mk * 0.24, 0.88 + mk * 0.05);
    this.star.position.set(-4 + mk * 4.6, 10 - mk * 6, -6 - mk * 6);
    // 灯りのゆらぎ
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const f = p.fox ? 0.8 + 0.2 * Math.sin(t * 2.3) * Math.sin(t * 1.3 + 1) : 0.9 + 0.1 * Math.sin(t * 7 + i * 3) * Math.sin(t * 3.1 + i);
      p.L.intensity = p.I * f;
    }
    // カメラ：立ち位置から解く（横長：右半分に大きく、縦長：上半分に）。
    // 縦長で見上げると、カメラが地面の高さまで下がって石畳が見えなくなり、いなほが宙に浮き、奥の石段が暗い四角に見える。
    // なので縦長はほぼ水平に構え、足もとの石畳と鳥居の額が両方入る大きさにする
    const cam = w.camera;
    const tall = w.layout?.mode === 'tall';
    const sy = Math.sin(t * 0.11) * 0.012 + Math.sin(t * 0.047) * 0.008, sp = Math.sin(t * 0.09 + 1) * 0.006, sr = Math.sin(t * 0.07) * 0.004;
    const pitch = (tall ? -0.02 : 0.13) + sp, yaw = sy;
    const f = tall ? { x: 0.32, y: 0.36, h: 0.34 } : { x: 0.36, y: -0.1, h: 0.56 };
    frameAnchor(cam, w.rig.pos, this.mid, H, f.x, f.y, f.h, pitch, yaw, sr);
    w.rig.pos.y += Math.sin(t * 0.13) * 0.03;
    w.rig.yaw = yaw;
    w.rig.pitch = pitch;
    w.rig.roll = sr;
    if (this.freeCam) { const c = this.freeCam; w.rig.pos.set(...c.pos); w.rig.yaw = c.yaw ?? 0; w.rig.pitch = c.pitch ?? 0; w.rig.roll = 0; } // 開発用
    // 向き：モデルの正面（+Z）をカメラへ
    const p = this.anchor.pos;
    this.anchor.yaw = Math.atan2(w.rig.pos.x - p.x, w.rig.pos.z - p.z);
    // 漂うもの
    const vh = viewH(w);
    this.sky.follow(w.rig.pos);
    this.atmo.uWTime.value = t;
    this.wisps.update(t, ZERO, vh);
    this.fireflies.update(t, ZERO, vh);
    this.glows.update(t, vh);
  }

  dispose() {
    this.world.camera.near = 1;
    this.world.camera.updateProjectionMatrix();
    this.guide(false);
    this.group.removeFromParent();
    this.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    this.sky.dispose();
    for (const d of this.disposables) d.dispose?.();
  }
}

/** UV を残してまとめる（木肌の画像を使う幹）。 */
function mergeUV(list) {
  const parts = list.map((x) => (x.index ? x.toNonIndexed() : x));
  const total = parts.reduce((s, p) => s + p.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    uv.set(p.attributes.uv.array, o * 2);
    o += p.attributes.position.count;
  }
  for (const p of list) p.dispose();
  for (const p of parts) p.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

function makeBushGeo() {
  const P = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    const p = part(new THREE.IcosahedronGeometry(0.45, 0), new THREE.Color(0x1d3322).multiplyScalar(0.8 + k * 0.08), { p: [Math.cos(a) * 0.35, 0.25 + (k % 2) * 0.12, Math.sin(a) * 0.35], s: [1, 0.7, 1] });
    jitter(p, 0.08, k + 2);
    P.push(p);
  }
  const g = merge(P);
  g.computeVertexNormals();
  return g;
}

function viewH(w) {
  const r = w.renderer?.renderer;
  return r ? r.getDrawingBufferSize(_v2).y : 720;
}

const ZERO = new THREE.Vector3();
const _v2 = new THREE.Vector2();
