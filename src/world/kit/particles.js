// 空中に漂うもの（GPU で動かす。毎フレーム CPU で位置を書かない）。
//   makeDrift   舞う葉・花びら（板が 3 次元に回りながら流れる）。カメラのまわりの箱の中で折り返すので尽きない
//   makeSwarm   蛍・狐火・光の粒（点。ふわふわ動き、明滅する）。これも箱の中で折り返す
//   makeGlows   灯りのにじみ（決まった場所の点。灯籠・提灯）。set() で置き、commit() で送る
// どれも霧（atmo）の値を共有する。点の大きさは世界の長さで渡し、画面の解像度（uViewH）で px に直す。
import * as THREE from 'three';
import { FOG_GLSL } from './atmo.js';
import { rng } from './noise.js';

const WRAP = /* glsl */ `
uniform vec3 uCam, uBox, uOff, uVel;
uniform float uTime, uWander;
vec3 wrapPos(vec4 seed, out float fade) {
  vec3 p = seed.xyz * uBox + uVel * uTime * (0.75 + 0.5 * fract(seed.w * 7.31));
  float ph = seed.w * 6.2831;
  p += vec3(sin(uTime * 0.37 + ph) * 1.0 + sin(uTime * 0.91 + ph * 2.0) * 0.35,
            sin(uTime * 0.53 + ph * 1.7) * 0.5,
            cos(uTime * 0.41 + ph) * 1.0) * uWander;
  vec3 c = uCam + uOff;
  vec3 rel = mod(p - c + 0.5 * uBox, uBox) - 0.5 * uBox;
  vec3 e = abs(rel) / (0.5 * uBox);
  fade = 1.0 - smoothstep(0.72, 1.0, max(max(e.x, e.y), e.z));
  return c + rel;
}
`;

function seeds(n, seed) {
  const R = rng(seed);
  const a = new Float32Array(n * 4), b = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) { a[i] = R(); b[i] = R(); }
  return [a, b];
}

/**
 * 舞う葉。o = { count, map（葉の形の画像）, box:[x,y,z], off:[x,y,z]（箱の中心。カメラから）, vel:[x,y,z], size:[min,max],
 *               colA, colB, wander, spin, amb, sun, opacity, near（これより近いと消す）, seed }
 */
export function makeDrift(atmo, o) {
  const n = o.count;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const [a, b] = seeds(n, o.seed ?? 11);
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(a, 4));
  geo.setAttribute('aSeed2', new THREE.InstancedBufferAttribute(b, 4));
  geo.instanceCount = n;
  const uniforms = {
    ...atmo,
    uCam: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(...o.box) },
    uOff: { value: new THREE.Vector3(...(o.off || [0, 0, 0])) },
    uVel: { value: new THREE.Vector3(...(o.vel || [0, -2, 0])) },
    uTime: { value: 0 },
    uWander: { value: o.wander ?? 3 },
    uSize: { value: new THREE.Vector2(...(o.size || [1, 2])) },
    uSpin: { value: o.spin ?? 1 },
    uColA: { value: new THREE.Color(o.colA ?? 0xc0302a) },
    uColB: { value: new THREE.Color(o.colB ?? 0xe08a2a) },
    uAmb: { value: new THREE.Color(o.amb ?? 0x403040) },
    uSunC: { value: new THREE.Color(o.sun ?? 0xffa060) },
    uOpacity: { value: o.opacity ?? 1 },
    uNear: { value: new THREE.Vector2(...(o.near || [6, 20])) },
    uMap: { value: o.map },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'drift',
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${WRAP}
      attribute vec4 aSeed, aSeed2;
      uniform vec2 uSize, uNear;
      uniform float uSpin;
      uniform vec3 uSunDir;
      varying vec2 vUv;
      varying float vFade, vTint, vLit;
      varying vec3 vWPos;
      void main() {
        float fade;
        vec3 wp = wrapPos(aSeed, fade);
        float ang = uTime * uSpin * (0.6 + 1.6 * aSeed2.w) + aSeed.w * 20.0;
        vec3 ax0 = aSeed2.xyz - 0.5 + vec3(1e-3, 2e-3, 0.0);
        vec3 axis = ax0 / max(length(ax0), 1e-3);
        float cs = cos(ang), sn = sin(ang);
        vec3 q = vec3(position.xy, 0.0) * mix(uSize.x, uSize.y, aSeed2.y);
        q = q * cs + cross(axis, q) * sn + axis * dot(axis, q) * (1.0 - cs);
        vec3 nrm = vec3(0.0, 0.0, 1.0);
        nrm = nrm * cs + cross(axis, nrm) * sn + axis * dot(axis, nrm) * (1.0 - cs);
        wp += q;
        float dc = length(wp - cameraPosition);
        fade *= smoothstep(uNear.x, uNear.y, dc);
        vFade = fade;
        vTint = aSeed2.x;
        vLit = 0.35 + 0.65 * abs(dot(nrm, uSunDir));
        vUv = position.xy + 0.5;
        vWPos = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uColA, uColB, uAmb, uSunC;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vFade, vTint, vLit;
      varying vec3 vWPos;
      ${FOG_GLSL}
      void main() {
        vec4 tx = texture2D(uMap, vUv);
        float a = tx.a * vFade * uOpacity;
        if (a < 0.02) discard;
        vec3 alb = mix(uColA, uColB, vTint) * tx.rgb;
        vec3 c = alb * (uAmb + uSunC * vLit);
        c = applyAtmo(c, vWPos);
        gl_FragColor = vec4(c, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = o.name || 'drift';
  mesh.frustumCulled = false;
  mesh.renderOrder = o.renderOrder ?? 5;
  return {
    mesh, uniforms,
    update(t, cam) { uniforms.uTime.value = t; uniforms.uCam.value.copy(cam); },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

/**
 * 光の粒の群れ。o = { count, box, off, vel, size:[min,max]（世界の長さ）, colA, colB, wander,
 *                     blink（0：ゆらぐだけ 1：蛍のように明滅）, shape（0：丸い光 1：狐火の炎）, gain, seed }
 */
export function makeSwarm(atmo, o) {
  const n = o.count;
  const geo = new THREE.BufferGeometry();
  const [a, b] = seeds(n, o.seed ?? 21);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(a, 4));
  geo.setAttribute('aSeed2', new THREE.BufferAttribute(b, 4));
  const uniforms = {
    ...atmo,
    uCam: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(...o.box) },
    uOff: { value: new THREE.Vector3(...(o.off || [0, 0, 0])) },
    uVel: { value: new THREE.Vector3(...(o.vel || [0, 0, 0])) },
    uTime: { value: 0 },
    uWander: { value: o.wander ?? 4 },
    uSize: { value: new THREE.Vector2(...(o.size || [1, 2])) },
    uColA: { value: new THREE.Color(o.colA ?? 0xc8ff70) },
    uColB: { value: new THREE.Color(o.colB ?? 0x90ff90) },
    uBlink: { value: o.blink ?? 1 },
    uShape: { value: o.shape ?? 0 },
    uGain: { value: o.gain ?? 1 },
    uViewH: { value: 720 },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'swarm',
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${WRAP}
      ${FOG_GLSL}
      attribute vec4 aSeed, aSeed2;
      uniform vec2 uSize;
      uniform vec3 uColA, uColB;
      uniform float uBlink, uGain, uViewH;
      varying vec3 vCol;
      varying float vSeed;
      void main() {
        float fade;
        vec3 wp = wrapPos(aSeed, fade);
        float bl = uBlink > 0.5
          ? pow(max(sin(uTime * (0.7 + aSeed2.x * 1.3) + aSeed2.y * 40.0), 0.0), 5.0)
          : 0.82 + 0.18 * sin(uTime * (2.0 + aSeed2.x * 3.0) + aSeed2.y * 30.0);
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mv;
        float sz = mix(uSize.x, uSize.y, aSeed2.z);
        gl_PointSize = clamp(sz * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.5), 0.0, 160.0);
        float fogK = 1.0 - atmoAmount(wp);
        vCol = mix(uColA, uColB, aSeed2.w) * bl * fade * fogK * uGain;
        vSeed = aSeed.w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uShape, uTime;
      varying vec3 vCol;
      varying float vSeed;
      void main() {
        vec2 pc = gl_PointCoord * 2.0 - 1.0;
        float a;
        if (uShape < 0.5) {
          float r2 = dot(pc, pc);
          if (r2 > 1.0) discard;
          a = exp(-r2 * 6.0) * 0.5 + exp(-r2 * 40.0) * 1.1;
        } else {
          // 狐火：下が丸く、上へ細くゆらぐ炎
          vec2 q = vec2(pc.x, -pc.y);
          float c = -0.32;
          float up = max(q.y - c, 0.0);
          q.x += sin(q.y * 7.0 - uTime * 9.0 + vSeed * 30.0) * 0.07 * up;
          q.x *= 1.0 + up * 1.5;
          q.y = (q.y - c) * (q.y > c ? 0.55 : 1.0);
          float d = length(q) / 0.5;
          if (d > 1.6) discard;
          a = pow(max(1.0 - d / 1.6, 0.0), 1.6) * 0.55 + smoothstep(0.55, 0.0, d) * 0.9;
        }
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = o.name || 'swarm';
  pts.frustumCulled = false;
  pts.renderOrder = o.renderOrder ?? 6;
  return {
    mesh: pts, uniforms,
    update(t, cam, viewH) { uniforms.uTime.value = t; uniforms.uCam.value.copy(cam); if (viewH) uniforms.uViewH.value = viewH; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

/** 灯りのにじみ（場所の決まった光の点）。capacity 個まで。 */
export function makeGlows(atmo, o = {}) {
  const n = o.capacity ?? 256;
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  const col = new THREE.BufferAttribute(new Float32Array(n * 4), 4);
  const size = new THREE.BufferAttribute(new Float32Array(n), 1);
  pos.setUsage(THREE.DynamicDrawUsage);
  col.setUsage(THREE.DynamicDrawUsage);
  size.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setAttribute('aCol', col);
  geo.setAttribute('aSize', size);
  const uniforms = {
    ...atmo,
    uTime: { value: 0 },
    uViewH: { value: 720 },
    uGain: { value: o.gain ?? 1 },
    uFlicker: { value: o.flicker ?? 0.12 },
    uCore: { value: o.core ?? 1 },
    uPull: { value: o.pull ?? 0 },   // カメラのほうへ寄せる長さ（灯籠の笠に隠れないように）
  };
  const mat = new THREE.ShaderMaterial({
    name: 'glows',
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: o.depthTest ?? true,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${FOG_GLSL}
      attribute vec4 aCol;
      attribute float aSize;
      uniform float uTime, uViewH, uGain, uFlicker, uPull;
      varying vec3 vCol;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 toCam = cameraPosition - wp.xyz;
        wp.xyz += toCam / max(length(toCam), 1e-3) * uPull;
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        float fl = 1.0 - uFlicker + uFlicker * (0.6 * sin(uTime * 7.3 + aCol.a * 17.0) * sin(uTime * 3.1 + aCol.a * 5.0) + 0.4);
        gl_PointSize = clamp(aSize * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.5), 0.0, 220.0);
        vCol = aCol.rgb * fl * uGain * (1.0 - atmoAmount(wp.xyz));
      }`,
    fragmentShader: /* glsl */ `
      uniform float uCore;
      varying vec3 vCol;
      void main() {
        vec2 pc = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(pc, pc);
        if (r2 > 1.0) discard;
        float a = exp(-r2 * 4.5) * 0.42 + exp(-r2 * 28.0) * 0.65 * uCore;
        gl_FragColor = vec4(vCol * a * (1.0 - r2), 1.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = o.name || 'glows';
  pts.frustumCulled = false;
  pts.renderOrder = o.renderOrder ?? 7;
  geo.setDrawRange(0, n);
  const c = new THREE.Color();
  return {
    mesh: pts, uniforms, capacity: n,
    set(i, x, y, z, s, color, phase = Math.random()) {
      pos.setXYZ(i, x, y, z);
      c.set(color);
      col.setXYZW(i, c.r, c.g, c.b, phase);
      size.setX(i, s);
    },
    hide(i) { size.setX(i, 0); pos.setXYZ(i, 0, -1e4, 0); },
    commit() { pos.needsUpdate = true; col.needsUpdate = true; size.needsUpdate = true; },
    update(t, viewH) { uniforms.uTime.value = t; if (viewH) uniforms.uViewH.value = viewH; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
