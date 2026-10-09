// 低い靄（もや）：水平な大きな板に、ノイズの濃淡を流して描く。地面の高さ（GLSL の関数）を渡すと、
// 地面に近いところ・地面より下では薄くして、板と地面の交わる線を目立たせない。
import * as THREE from 'three';
import { FOG_GLSL } from './atmo.js';

/** o = { size:[w,d], y, color, opacity, scale, wind:[x,z], heightGLSL（float mistGround(vec2 p) を定義）, near:[a,b] } */
export function makeMist(atmo, o) {
  const geo = new THREE.PlaneGeometry(o.size[0], o.size[1], 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    ...atmo,
    uColor: { value: new THREE.Color(o.color ?? 0x8090b0) },
    uOpacity: { value: o.opacity ?? 0.3 },
    uScale: { value: o.scale ?? 0.02 },
    uWind: { value: new THREE.Vector2(...(o.wind || [0.01, 0.004])) },
    uTime: { value: 0 },
    uNear: { value: new THREE.Vector2(...(o.near || [2, 12])) },
    uThick: { value: o.thick ?? 1.5 },
    uMistNoise: { value: atmo.uNoise.value },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'mist',
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vWPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMistNoise;
      uniform vec3 uColor;
      uniform float uOpacity, uScale, uTime, uThick;
      uniform vec2 uWind, uNear;
      varying vec3 vWPos;
      ${FOG_GLSL}
      ${o.heightGLSL || 'float mistGround(vec2 p) { return -1e4; }'}
      void main() {
        vec2 p = vWPos.xz * uScale;
        float n = texture2D(uMistNoise, p + uWind * uTime).g * 0.6 + texture2D(uMistNoise, p * 2.3 - uWind * uTime * 1.4).b * 0.4;
        float a = smoothstep(0.32, 0.85, n);
        float gap = vWPos.y - mistGround(vWPos.xz);
        a *= smoothstep(0.0, uThick, gap);
        float dc = length(vWPos - cameraPosition);
        a *= smoothstep(uNear.x, uNear.y, dc);
        float f = atmoAmount(vWPos);
        vec3 c = mix(uColor, atmoColor(vWPos), f * 0.7);
        gl_FragColor = vec4(c, a * uOpacity * (1.0 - f * 0.6));
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = o.name || 'mist';
  mesh.position.y = o.y ?? 1;
  mesh.renderOrder = o.renderOrder ?? 4;
  mesh.frustumCulled = false;
  return {
    mesh, uniforms,
    update(t) { uniforms.uTime.value = t; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
