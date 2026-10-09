// 空：天頂・中ほど・地平・地平の下の 4 色のグラデーション、太陽、星（2 層）、天の川、月、地平の光の帯。
// 大きな球の内側に描き、毎フレーム カメラの位置に合わせる（follow）。値は uniforms をじかに変える。
import * as THREE from 'three';

export function makeSkyDome(o = {}) {
  const v3 = (a, d) => new THREE.Vector3(...(a || d)).normalize();
  const uniforms = {
    uZenith: { value: new THREE.Color(o.zenith ?? 0x0a1030) },
    uMid: { value: new THREE.Color(o.mid ?? 0x1a2350) },
    uHorizon: { value: new THREE.Color(o.horizon ?? 0x34406a) },
    uGround: { value: new THREE.Color(o.ground ?? 0x0a0c14) },
    uSunDir: { value: v3(o.sunDir, [0, 0.05, -1]) },
    uSunCol: { value: new THREE.Color(o.sunColor ?? 0xffc080) },
    uSunSize: { value: o.sunSize ?? 0.012 },
    uSunGlow: { value: o.sunGlow ?? 0 },
    uStars: { value: o.stars ?? 0 },
    uMilky: { value: o.milky ?? 0 },
    uMilkyN: { value: v3(o.milkyN, [0.55, 0.35, 0.75]) },
    uMoonDir: { value: v3(o.moonDir, [0, 0.3, -1]) },
    uMoonCol: { value: new THREE.Color(o.moonColor ?? 0xf4ead0) },
    uMoonSize: { value: o.moonSize ?? 0.02 },
    uMoonOn: { value: o.moon ?? 0 },
    uMoonGlow: { value: o.moonGlow ?? 0.6 },
    uMoonVeil: { value: 0 },   // 月にかかる薄い雲（0〜1）
    uRays: { value: 0 },       // 月から放たれる光の筋（月の出）
    uGlowCol: { value: new THREE.Color(o.glowColor ?? 0x9aa8d8) },
    uGlowDir: { value: v3(o.glowDir, [0, 0, -1]) },
    uGlowAmt: { value: o.glow ?? 0 },
    uTime: { value: 0 },
    uNoise: { value: o.noise || null },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'skyDome',
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uMid, uHorizon, uGround, uSunDir, uSunCol, uMilkyN, uMoonDir, uMoonCol, uGlowCol, uGlowDir;
      uniform float uSunSize, uSunGlow, uStars, uMilky, uMoonSize, uMoonOn, uMoonGlow, uMoonVeil, uGlowAmt, uTime, uRays;
      uniform sampler2D uNoise;
      varying vec3 vDir;
      float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
      float mare(vec2 p, vec2 c, vec2 r, float n) { vec2 q = (p - c) / r; return smoothstep(1.05, 0.4, length(q) + n * 0.6); }
      float vnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y);
        float b = mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y);
        return mix(a, b, f.z);
      }
      // 星：方向を 3 次元のます目に分け、ます目ごとに 1 つ（あるかないか）
      float stars(vec3 d, float scale, float dens, float size) {
        vec3 q = d * scale;
        vec3 c = floor(q);
        float h = hash13(c);
        if (h > dens) return 0.0;
        vec3 sp = hash33(c + 7.13) * 0.6 + 0.2;
        float dist = length(fract(q) - sp);
        float b = hash13(c + 3.71);
        b = b * b * b;
        float tw = 0.7 + 0.3 * sin(uTime * (1.3 + h * 4.0) + h * 91.0);
        return smoothstep(size, size * 0.15, dist) * (0.18 + 1.5 * b) * tw;
      }
      void main() {
        vec3 d = normalize(vDir + vec3(1e-6));
        float h = d.y;
        vec3 col;
        if (h >= 0.0) {
          col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
          col = mix(col, uZenith, smoothstep(0.16, 0.9, h));
        } else {
          col = mix(uHorizon, uGround, smoothstep(0.0, 0.18, -h));
        }
        // 地平の光の帯（月の出の前ぶれ・夕焼けの名残）
        if (uGlowAmt > 0.0) {
          vec3 dh = vec3(d.x, 0.0, d.z);
          float side = max(dot(dh / max(length(dh), 1e-4), uGlowDir), 0.0);
          col += uGlowCol * uGlowAmt * exp(-abs(h) * 7.0) * (0.25 + 0.75 * side * side);
        }
        // 太陽
        if (uSunGlow > 0.0) {
          float s = max(dot(d, uSunDir), 0.0);
          col += uSunCol * (pow(s, 7.0) * 0.45 + pow(s, 60.0) * 0.6) * uSunGlow;
          col += uSunCol * smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.55, s) * 2.2 * uSunGlow;
        }
        // 月（円盤・海の模様・縁の暗さ・まわりの暈）
        float moonMask = 0.0, halo = 0.0;
        if (uMoonOn > 0.0) {
          vec3 m = uMoonDir;
          vec3 up0 = abs(m.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
          vec3 mr = normalize(cross(up0, m));
          vec3 mu = cross(m, mr);
          float tz = max(tan(uMoonSize), 1e-4);
          vec2 mp = vec2(dot(d, mr), dot(d, mu)) / tz;
          float r = length(mp);
          float front = step(0.0, dot(d, m));
          moonMask = smoothstep(1.0, 0.985, r) * front;
          float limb = sqrt(max(1.0 - r * r, 0.0));
          // 表側の「海」（暗い模様）。日本で「餅をつく兎」と見る形。縁はノイズでくずす
          vec2 mq = vec2(-mp.x, mp.y);
          float nn = texture2D(uNoise, mq * 0.9 + vec2(0.13, 0.71)).g - 0.5;
          float mar = 0.0;
          mar = max(mar, mare(mq, vec2(-0.5, 0.06), vec2(0.27, 0.5), nn));    // 嵐の大洋
          mar = max(mar, mare(mq, vec2(-0.2, 0.43), vec2(0.31, 0.25), nn));   // 雨の海
          mar = max(mar, mare(mq, vec2(0.17, 0.39), vec2(0.18, 0.17), nn));    // 晴れの海
          mar = max(mar, mare(mq, vec2(0.31, 0.12), vec2(0.23, 0.21), nn));   // 静かの海
          mar = max(mar, mare(mq, vec2(0.63, 0.28), vec2(0.1, 0.09), nn));    // 危難の海
          mar = max(mar, mare(mq, vec2(0.49, -0.13), vec2(0.14, 0.2), nn));   // 豊かの海
          mar = max(mar, mare(mq, vec2(0.3, -0.27), vec2(0.08, 0.09), nn));   // 神酒の海
          mar = max(mar, mare(mq, vec2(-0.22, -0.34), vec2(0.2, 0.15), nn));  // 雲の海
          mar = max(mar, mare(mq, vec2(-0.43, -0.35), vec2(0.09, 0.09), nn)); // 湿りの海
          mar = max(mar, mare(mq, vec2(0.0, 0.7), vec2(0.38, 0.06), nn));     // 氷の海
          float crater = texture2D(uNoise, mq * 1.8 + vec2(0.5, 0.2)).b;
          vec3 mc = uMoonCol * (0.74 + 0.26 * pow(limb, 0.5));
          mc *= 1.0 - mar * 0.26;
          mc = mix(mc, mc * vec3(0.94, 0.97, 1.04), mar);
          mc *= 0.96 + crater * 0.07;
          // ティコ（明るい点）
          mc += uMoonCol * 0.08 * smoothstep(0.06, 0.0, length(mq - vec2(-0.12, -0.7)));
          // 薄い雲がかかる
          float veil = uMoonVeil * smoothstep(0.35, 0.75, texture2D(uNoise, mp * 0.22 + vec2(uTime * 0.004, 0.0)).g);
          mc *= 1.0 - veil * 0.55;
          float outR = max(r - 1.0, 0.0);
          halo = (exp(-outR * 3.5) * 0.5 + exp(-outR * 0.8) * 0.18) * front * (1.0 - moonMask);
          col = mix(col, mc, moonMask * uMoonOn);
          col += uMoonCol * halo * uMoonGlow * uMoonOn;
          if (uRays > 0.0) {
            float ang = atan(mp.y, mp.x + 1e-5);
            float ray = 0.5 + 0.5 * sin(ang * 13.0 + uTime * 0.21) * sin(ang * 7.0 - uTime * 0.13 + 1.3);
            ray = ray * ray * exp(-outR * 0.9) * smoothstep(0.0, 0.4, outR);
            col += uMoonCol * ray * uRays * uMoonOn * front;
          }
        }
        // 星と天の川（地平の近くと月のまわりでは薄く）
        if (uStars > 0.0 && h > -0.02) {
          float vis = smoothstep(-0.02, 0.2, h) * (1.0 - moonMask) * (1.0 - clamp(halo * uMoonOn * 2.5, 0.0, 1.0));
          float mb = dot(d, uMilkyN);
          float band = exp(-(mb * mb) / 0.0484);
          float st = stars(d, 160.0, 0.32, 0.2) + stars(d, 330.0, 0.22 + band * 0.4, 0.22) * 0.6;
          vec3 sc = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.75), hash13(floor(d * 160.0) + 1.3));
          col += sc * st * uStars * vis;
          if (uMilky > 0.0) {
            float n = vnoise(d * 5.0) * 0.55 + vnoise(d * 13.0) * 0.3 + vnoise(d * 31.0) * 0.15;
            float dust = smoothstep(0.45, 0.75, vnoise(d * 9.0 + 3.0)) * exp(-(mb * mb) / 0.0049);
            float mw = band * smoothstep(0.25, 0.85, n) * (1.0 - dust * 0.8);
            col += mix(vec3(0.32, 0.38, 0.62), vec3(0.62, 0.52, 0.55), n) * mw * uMilky * vis * 0.22;
          }
        }
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(o.radius ?? 6000, 48, 24), mat);
  mesh.name = 'skyDome';
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return {
    mesh,
    uniforms,
    follow(cam) { mesh.position.copy(cam); },
    dispose() { mesh.geometry.dispose(); mat.dispose(); },
  };
}
