// 水面（川・池）：カメラについて動く大きな平面。流れる波紋、空の映り込み（星のきらめき）、岸の暗がり。
// 灯りの映り込みは別に、灯りの真下から手前へのびる光の帯（makeStreaks。加算）で描く（安い作り物）。
//
// ステージが渡す GLSL：float shoreDist(vec2 p)  岸までの距離（水の中は正、陸はふつう負）。flowAt(p) は流れの速さ倍率。
import * as THREE from 'three';
import { FOG_GLSL } from './atmo.js';

/** o = { w, d, y, deep, sky, glint, flow:[x,z], glsl（shoreDist と flowAt を定義）, uniforms, ahead } */
export function makeWater(atmo, o) {
  const geo = new THREE.PlaneGeometry(o.w, o.d, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    ...atmo,
    uDeep: { value: new THREE.Color(o.deep ?? 0x050b16) },
    uSky: { value: new THREE.Color(o.sky ?? 0x1a2a4a) },
    uWarm: { value: new THREE.Color(o.warm ?? 0x000000) },   // 灯りの多いところの水のほんのりした暖かさ
    uGlint: { value: o.glint ?? 0.6 },
    uFlow: { value: new THREE.Vector2(...(o.flow || [0, 0.06])) },
    uTime: { value: 0 },
    uWaterNoise: { value: atmo.uNoise.value },
    ...(o.uniforms || {}),
  };
  const mat = new THREE.ShaderMaterial({
    name: 'water',
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep, uSky, uWarm;
      uniform float uGlint, uTime;
      uniform vec2 uFlow;
      uniform sampler2D uWaterNoise;
      varying vec3 vWPos;
      ${FOG_GLSL}
      ${o.glsl}
      void main() {
        vec2 p = vWPos.xz;
        float sd = shoreDist(p);
        float fl = flowAt(p);
        vec2 drift = uFlow * uTime * fl;
        float n1 = texture2D(uWaterNoise, p * 0.012 - drift * 0.5).g;
        float n2 = texture2D(uWaterNoise, p * 0.031 - drift * 1.3 + vec2(0.37, 0.11)).b;
        float n3 = texture2D(uWaterNoise, p * 0.08 - drift * 2.2 + vec2(0.71, 0.53)).a;
        vec3 N = normalize(vec3((n1 - 0.5) * 0.5 + (n3 - 0.5) * 0.25, 1.0, (n2 - 0.5) * 0.5 + (n3 - 0.5) * 0.25));
        vec3 V = normalize(cameraPosition - vWPos);
        float fres = pow(max(1.0 - max(dot(N, V), 0.0), 0.0), 3.0);
        vec3 col = mix(uDeep, uSky, 0.12 + 0.75 * fres);
        // 波の筋（流れに沿う細い明るみ）
        col += uSky * smoothstep(0.62, 0.8, n2 * 0.6 + n3 * 0.4) * 0.12;
        // 星のきらめき
        float g = texture2D(uWaterNoise, p * 0.13 + vec2(uTime * 0.013, -uTime * 0.02)).a;
        float g2 = texture2D(uWaterNoise, p * 0.071 - vec2(uTime * 0.011, uTime * 0.017)).b;
        col += vec3(0.75, 0.82, 1.0) * smoothstep(0.86, 0.9, g * g2 * 1.25) * uGlint;
        col += uWarm;
        // 岸ぎわは暗く（岸の影）
        col *= 0.45 + 0.55 * smoothstep(0.0, 9.0, sd);
        col = applyAtmo(col, vWPos);
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = o.name || 'water';
  mesh.frustumCulled = false;
  mesh.position.y = o.y ?? 0;
  mesh.renderOrder = -5;
  const ahead = o.ahead ?? o.d * 0.35;
  return {
    mesh, uniforms,
    follow(cam) { mesh.position.x = Math.round(cam.x / 20) * 20; mesh.position.z = Math.round((cam.z - ahead) / 20) * 20; },
    update(t) { uniforms.uTime.value = t; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

/**
 * 水に映る灯りの帯（灯りの真下から、カメラのほうへのびる）。capacity 本。set(i, x, y, z, 強さ) で置き、commit()。
 * o = { len, width, color, y（水面の高さ） }
 */
export function makeStreaks(atmo, o = {}) {
  const n = o.capacity ?? 128;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  aPos.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', aPos);
  geo.instanceCount = n;
  const uniforms = {
    ...atmo,
    uLen: { value: o.len ?? 16 },
    uWidth: { value: o.width ?? 3.5 },
    uColor: { value: new THREE.Color(o.color ?? 0xff9a40) },
    uTime: { value: 0 },
    uGain: { value: o.gain ?? 1 },
    uWaterY: { value: o.y ?? 0.05 },
    uStreakNoise: { value: atmo.uNoise.value },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'streaks',
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aPos;   // xyz：灯りの位置、w：強さ
      uniform float uLen, uWidth, uWaterY;
      varying vec2 vUv;
      varying float vK;
      varying vec3 vWPos;
      void main() {
        vec3 base = vec3(aPos.x, uWaterY, aPos.z);
        vec2 toCam = cameraPosition.xz - base.xz;
        vec2 dir = toCam / max(length(toCam), 1e-3);
        vec2 side = vec2(-dir.y, dir.x);
        float w = uWidth * (1.0 + position.y * 0.6);
        vec2 xz = base.xz + side * position.x * w + dir * (position.y - 0.12) * uLen;
        vec3 wp = vec3(xz.x, uWaterY, xz.y);
        vUv = position.xy;
        vK = aPos.w;
        vWPos = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime, uGain;
      uniform sampler2D uStreakNoise;
      varying vec2 vUv;
      varying float vK;
      varying vec3 vWPos;
      ${FOG_GLSL}
      void main() {
        float across = exp(-vUv.x * vUv.x * 9.0);
        float along = pow(max(1.0 - vUv.y, 0.0), 1.6) * smoothstep(0.0, 0.1, vUv.y);
        // 灯りの真下の丸いにじみ
        float hy = (vUv.y - 0.12) * 2.6;
        along = max(along * 0.85, exp(-(vUv.x * vUv.x + hy * hy) * 7.0) * 0.6);
        // 波で途切れる
        float rip = texture2D(uStreakNoise, vec2(vWPos.x * 0.05, vWPos.z * 0.23 - uTime * 0.12)).b;
        float br = smoothstep(0.3, 0.7, rip) * 0.8 + 0.2;
        float a = across * along * br * vK * uGain;
        gl_FragColor = vec4(uColor * a * (1.0 - atmoAmount(vWPos)), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = o.name || 'streaks';
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return {
    mesh, uniforms, capacity: n,
    set(i, x, y, z, k) { aPos.setXYZW(i, x, y, z, k); },
    commit() { aPos.needsUpdate = true; },
    update(t) { uniforms.uTime.value = t; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
