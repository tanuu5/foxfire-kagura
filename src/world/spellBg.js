// スペルカード中の背景：画面を少し暗くし、フィールドの中心に大きな魔法陣（輪と文様）をゆっくり回す。
// 背景のカメラの子として、いちばん手前（深度を見ない）に描く。ステージの背景が独自の演出を持つなら、そちらを使ってよい。
import * as THREE from 'three';

export function makeSpellBg() {
  const uniforms = {
    uT: { value: 0 },
    uA: { value: 0 },                           // 0〜1（出し入れ）
    uColor: { value: new THREE.Color(0xff4a7a) },
    uScale: { value: 4 },                       // 板の半分の幅が、フィールドの高さの半分の何倍か
  };
  const mat = new THREE.ShaderMaterial({
    name: 'spellBg',
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uT, uA, uScale;
      uniform vec3 uColor;
      varying vec2 vUv;
      float ring(float r, float c, float w) { return smoothstep(w, 0.0, abs(r - c)); }
      void main() {
        vec2 p = (vUv - 0.5) * 2.0 * uScale;   // フィールドの高さの半分を 1 とする
        float r = length(p) + 1e-5;
        float a = atan(p.y, p.x);
        float a1 = a + uT * 0.25, a2 = a - uT * 0.4;
        float m = 0.0;
        m += ring(r, 0.92, 0.006) + ring(r, 0.86, 0.004) + ring(r, 0.58, 0.005) + ring(r, 0.52, 0.003) + ring(r, 0.30, 0.004);
        // 外の輪の文様（短い刻み）
        float tick = step(0.55, fract(a1 * 24.0 / 6.2832)) * step(0.865, r) * step(r, 0.915);
        m += tick * 0.7;
        // 中の輪の星形（2 つの三角）
        for (int k = 0; k < 2; k++) {
          float off = float(k) * 3.14159 / 3.0 + uT * 0.15;
          float aa = mod(a2 + off, 6.2832 / 3.0) - 3.14159 / 3.0;
          float d = r * cos(aa) - 0.52 * 0.5;
          m += smoothstep(0.006, 0.0, abs(d)) * step(r, 0.53);
        }
        // 放射の線
        float rad = smoothstep(0.02, 0.0, abs(fract(a1 * 8.0 / 6.2832) - 0.5) * r) * step(0.30, r) * step(r, 0.52);
        m += rad * 0.5;
        float glow = exp(-abs(r - 0.7) * 3.0) * 0.04;
        float dark = 0.3 * smoothstep(0.0, 1.6, r) + 0.28;
        vec3 col = uColor * (m * 0.22 + glow);
        // 暗くする（アルファ）と、光（足す）を前もって掛けて出す
        float alpha = uA * dark;
        gl_FragColor = vec4(col * uA, alpha);
      }`,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.name = 'spellBg';
  mesh.renderOrder = 1000;
  mesh.frustumCulled = false;
  mesh.visible = false;
  let target = 0;
  return {
    mesh,
    uniforms,
    set(on, color) { target = on ? 1 : 0; if (color) uniforms.uColor.value.set(color); },
    /** 毎フレーム：カメラの前に置く（camera の子）。baseFov はフィールドの高さが占める背景のカメラの画角（度）。 */
    update(dt, baseFov) {
      const a = uniforms.uA.value;
      uniforms.uA.value = a + (target - a) * Math.min(1, dt * 3);
      uniforms.uT.value += dt;
      mesh.visible = uniforms.uA.value > 0.01;
      if (!mesh.visible) return;
      const dist = 10;
      const halfH = dist * Math.tan(((baseFov / 2) * Math.PI) / 180);
      const S = halfH * 2 * 4; // フィールドの高さの 4 倍：画面全体を覆う
      mesh.position.set(0, 0, -dist);
      mesh.scale.set(S, S, 1);
      uniforms.uScale.value = S / 2 / halfH;
    },
  };
}
