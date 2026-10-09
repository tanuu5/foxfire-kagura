// 雲海：カメラについて動く大きな格子（手前は細かく、地平線まで粗く広がる）。頂点をノイズで持ち上げて雲のこぶにし、
// 上からの空の光（青）と、地平の光（月の出の銀）を回りこむように当てる。こぶの縁は光の側で銀色に光る。
// 遠くはこぶを平らにして、霧の色に溶かす（空の地平の色と合わせて継ぎ目を消す）。
//
//   makeCloudSea(atmo, { y, amp, top, low, lit })   雲の海（1 回の描画）
//   makeWisps(atmo, { y, size, opacity, ... })      薄い雲の層（半透明。高さを変えて重ねると近いものほど速く流れる）
import * as THREE from 'three';
import { FOG_GLSL } from './atmo.js';

const CLOUD_FN = /* glsl */ `
uniform sampler2D uCN;
uniform vec2 uDrift;
uniform float uCTime, uCScale;
float cloudH(vec2 p) {
  vec2 q = p * uCScale + uDrift * uCTime;
  float a = texture2D(uCN, q).r;
  float b = texture2D(uCN, q * 2.7 + vec2(0.37, 0.11)).g;
  return a * 0.66 + b * 0.34;
}
`;

/** o = { y, amp（こぶの高さ）, top, low, lit, scale, drift:[x,z], n（格子の数）, reach（端までの距離） } */
export function makeCloudSea(atmo, o = {}) {
  const n = o.n ?? 150, reach = o.reach ?? 7000, near = o.near ?? 900;
  // 真ん中は細かく、外へ行くほど粗い格子（地平線まで届く）
  const pos = [], idx = [];
  const map = (u) => Math.sign(u) * (Math.abs(u) * near + Math.pow(Math.abs(u), 4) * (reach - near));
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push(map(i / n * 2 - 1), 0, map(j / n * 2 - 1));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const uniforms = {
    ...atmo,
    uCN: { value: atmo.uNoise.value },
    uDrift: { value: new THREE.Vector2(...(o.drift || [0.004, 0.006])) },
    uCTime: { value: 0 },
    uCScale: { value: o.scale ?? 0.0019 },
    uAmp: { value: o.amp ?? 38 },
    uTop: { value: new THREE.Color(o.top ?? 0x2e3a60) },
    uLow: { value: new THREE.Color(o.low ?? 0x0c1230) },
    uLit: { value: new THREE.Color(o.lit ?? 0x6a7aaa) },
    uLitAmt: { value: o.litAmt ?? 0.3 },
    uLightDir: { value: new THREE.Vector3(0, 0.15, -1).normalize() },
    uGlow: { value: new THREE.Color(0x000000) },   // 灯りなどで足す光
    uBand: { value: new THREE.Vector2(...(o.band || [0.2, 0.9])) },   // 高さ → 明るさの幅（狭いほどくっきり）
  };
  const mat = new THREE.ShaderMaterial({
    name: 'cloudSea',
    uniforms,
    defines: o.cheap ? { CLOUD_CHEAP: '' } : {},
    vertexShader: /* glsl */ `
      ${CLOUD_FN}
      uniform float uAmp;
      varying vec3 vWPos;
      varying vec3 vN;
      varying float vH;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float dc = length(wp.xz - cameraPosition.xz);
        float amp = uAmp * (1.0 - smoothstep(900.0, 2400.0, dc));
        float h = cloudH(wp.xz);
        float e = 7.0;
        float hx = cloudH(wp.xz + vec2(e, 0.0)) - cloudH(wp.xz - vec2(e, 0.0));
        float hz = cloudH(wp.xz + vec2(0.0, e)) - cloudH(wp.xz - vec2(0.0, e));
        // こぶの形：低いところは平らに、高いところは丸く
        float hh = smoothstep(0.28, 0.85, h);
        float dh = 6.0 * hh * (1.0 - hh) / 0.57;   // smoothstep の傾き（おおよそ）
        vN = normalize(vec3(-hx * amp * dh, 2.0 * e, -hz * amp * dh));
        wp.y += hh * amp;
        vH = h;
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${CLOUD_FN}
      uniform vec3 uTop, uLow, uLit, uLightDir, uGlow;
      uniform float uLitAmt, uAmp;
      uniform vec2 uBand;
      varying vec3 vWPos;
      varying vec3 vN;
      varying float vH;
      ${FOG_GLSL}
      void main() {
        // 高さと向きは画素ごとに求める（遠くの粗い格子でも模様がくずれない）。低画質では頂点の値を使う
        #ifdef CLOUD_CHEAP
          float h = vH;
          vec3 Np = normalize(vN);
        #else
          float h = cloudH(vWPos.xz);
          float e = 9.0;
          float hx = cloudH(vWPos.xz + vec2(e, 0.0)) - h;
          float hz = cloudH(vWPos.xz + vec2(0.0, e)) - h;
          float amp = uAmp * 1.6;
          vec3 Np = normalize(vec3(-hx * amp, e, -hz * amp));
        #endif
        vec2 q = vWPos.xz * 0.006 + uDrift * uCTime * 2.0;
        float d1 = texture2D(uCN, q).b;
        vec3 N = normalize(Np + vec3(d1 - 0.5, 0.0, 0.5 - d1) * 0.12);
        float hh = smoothstep(uBand.x, uBand.y, h);
        // 谷は深い紺、こぶの頂はやわらかく明るい（明るさは高さで決め、向きの影響は弱く）
        vec3 base = mix(uLow, uTop, hh * hh * (3.0 - 2.0 * hh)) * (0.88 + 0.2 * d1);
        float wrap = clamp((dot(N, uLightDir) + 0.6) / 1.6, 0.0, 1.0);
        vec3 col = base * (0.75 + 0.25 * N.y) + uLit * uLitAmt * wrap * (0.25 + 0.75 * hh);
        // 光の側の縁が銀色に光る（雲の縁の透け）
        vec3 V = normalize(cameraPosition - vWPos);
        float rim = pow(max(1.0 - max(dot(N, V), 0.0), 0.0), 3.0);
        float back = max(dot(-V, uLightDir), 0.0);
        col += uLit * uLitAmt * rim * (0.25 + 0.75 * back) * 0.8;
        col += uGlow * hh;
        col = applyAtmo(col, vWPos);
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = o.name || 'cloudSea';
  mesh.frustumCulled = false;
  mesh.position.y = o.y ?? 0;
  mesh.renderOrder = -10;
  return {
    mesh, uniforms,
    // 真ん中のます目の大きさでずらす（近くの頂点が世界の決まった場所に乗るので、こぶが揺れない）
    follow(cam) { const st = (2 * near) / n; mesh.position.x = Math.round(cam.x / st) * st; mesh.position.z = Math.round(cam.z / st) * st; },
    update(t) { uniforms.uCTime.value = t; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

/** 薄い雲の層。o = { y, size, opacity, scale, drift, color, near:[a,b]（近いと薄く） } */
export function makeWisps(atmo, o = {}) {
  const geo = new THREE.PlaneGeometry(o.size ?? 2400, o.size ?? 2400, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    ...atmo,
    uCN: { value: atmo.uNoise.value },
    uDrift: { value: new THREE.Vector2(...(o.drift || [0.01, 0.012])) },
    uCTime: { value: 0 },
    uCScale: { value: o.scale ?? 0.0026 },
    uColor: { value: new THREE.Color(o.color ?? 0x3a4670) },
    uLit: { value: new THREE.Color(o.lit ?? 0x6a7aaa) },
    uLitAmt: { value: 0.3 },
    uOpacity: { value: o.opacity ?? 0.4 },
    uNearW: { value: new THREE.Vector2(...(o.near || [40, 140])) },
    uCut: { value: o.cut ?? 0.52 },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'wisps',
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vWPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${CLOUD_FN}
      uniform vec3 uColor, uLit;
      uniform float uLitAmt, uOpacity, uCut;
      uniform vec2 uNearW;
      varying vec3 vWPos;
      ${FOG_GLSL}
      void main() {
        vec2 q = vWPos.xz * uCScale + uDrift * uCTime;
        float n = texture2D(uCN, q).g * 0.55 + texture2D(uCN, q * 2.9 + vec2(0.3, 0.7)).b * 0.3 + texture2D(uCN, q * 7.0).a * 0.15;
        float a = smoothstep(uCut, uCut + 0.3, n);
        float dc = length(vWPos - cameraPosition);
        a *= smoothstep(uNearW.x, uNearW.y, dc);
        vec3 c = uColor * (0.7 + 0.5 * n) + uLit * uLitAmt * n;
        float f = atmoAmount(vWPos);
        c = mix(c, atmoColor(vWPos), f);
        gl_FragColor = vec4(c, a * uOpacity * (1.0 - f * 0.5));
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = o.name || 'wisps';
  mesh.frustumCulled = false;
  mesh.position.y = o.y ?? 60;
  mesh.renderOrder = o.renderOrder ?? 4;
  return {
    mesh, uniforms,
    follow(cam) { mesh.position.x = Math.round(cam.x / 40) * 40; mesh.position.z = Math.round((cam.z - (o.ahead ?? 500)) / 40) * 40; },
    update(t) { uniforms.uCTime.value = t; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
