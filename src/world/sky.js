// 空：大きな球の内側に、上・地平・下の 3 色のグラデーションと、太陽（月）のにじみを描く。カメラについて動く。
import * as THREE from 'three';

export function makeSky({ top = 0x1d2a5a, horizon = 0xf08a5a, bottom = 0x2a1c2a, sunDir = [0, 0.15, -1], sunColor = 0xffd9a0, sunSize = 0.03, sunGlow = 0.35, radius = 8000, stars = 0 } = {}) {
  const uniforms = {
    uTop: { value: new THREE.Color(top) },
    uHorizon: { value: new THREE.Color(horizon) },
    uBottom: { value: new THREE.Color(bottom) },
    uSunDir: { value: new THREE.Vector3(...sunDir).normalize() },
    uSunColor: { value: new THREE.Color(sunColor) },
    uSunSize: { value: sunSize },
    uSunGlow: { value: sunGlow },
    uStars: { value: stars },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'sky',
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // いちばん奥に
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uBottom, uSunColor, uSunDir;
      uniform float uSunSize, uSunGlow, uStars, uTime;
      varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        vec3 d = normalize(vDir + vec3(1e-6));
        float h = d.y;
        vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.4));
        float s = max(dot(d, normalize(uSunDir + vec3(1e-6))), 0.0);
        col += uSunColor * (pow(s, 6.0) * uSunGlow + smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.6, s) * 1.6);
        if (uStars > 0.0 && h > 0.0) {
          vec3 q = floor(d * 380.0);
          float r = hash(q);
          float tw = 0.6 + 0.4 * sin(uTime * 2.0 + r * 40.0);
          col += vec3(step(0.9975, r) * uStars * tw * smoothstep(0.0, 0.25, h));
        }
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return { mesh, uniforms };
}
