// キャラクターの材質：やわらかいトゥーンの陰 ＋ ふちの光 ＋ 白い点滅 ＋「揺れの骨」による曲げ。
// 髪・しっぽ・袖・袴のすそは、頂点の aBone（骨の番号）と aT（根元 0 → 先 1）を見て、シェーダーの中で曲げる。
// 骨ごとの値は uniforms の配列（1 体ぶん）：uPivot[i]（曲げの中心）、uRot[i]（先での回転 x, y, z）、uWave[i]（波：xyz = 軸×振れ幅、w = 位相）。
// 1 体のすべての部品が同じ材質（と配列）を使い、輪郭線も同じ曲げをする。
import * as THREE from 'three';

export const MAX_BONES = 16;

let softGrad = null;
/** やわらかい 2 段＋ハイライトの陰（アニメ塗りの肌・服向け）。 */
export function softGradient() {
  if (softGrad) return softGrad;
  const w = 64;
  const data = new Uint8Array(w * 4);
  for (let i = 0; i < w; i++) {
    const x = i / (w - 1);
    const t = THREE.MathUtils.smoothstep(x, 0.36, 0.5);
    const v = 0.56 + 0.44 * t + 0.05 * THREE.MathUtils.smoothstep(x, 0.86, 0.95);
    const b = Math.round(Math.min(1, v) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  softGrad = new THREE.DataTexture(data, w, 1, THREE.RGBAFormat);
  softGrad.minFilter = softGrad.magFilter = THREE.LinearFilter;
  softGrad.generateMipmaps = false;
  softGrad.needsUpdate = true;
  return softGrad;
}

/** 1 体ぶんの骨の値（材質どうしで共有する uniforms）。 */
export function makeBones() {
  return {
    uPivot: { value: Array.from({ length: MAX_BONES }, () => new THREE.Vector3()) },
    uRot: { value: Array.from({ length: MAX_BONES }, () => new THREE.Vector3()) },
    uWave: { value: Array.from({ length: MAX_BONES }, () => new THREE.Vector4()) },
  };
}

// 頂点を骨で曲げる GLSL（toon と輪郭線で共通）
const DEFORM_PARS = /* glsl */ `
  attribute float aBone;
  attribute float aT;
  uniform vec3 uPivot[${MAX_BONES}];
  uniform vec3 uRot[${MAX_BONES}];
  uniform vec4 uWave[${MAX_BONES}];
  mat3 rotXYZ(vec3 a) {
    float cx = cos(a.x), sx = sin(a.x), cy = cos(a.y), sy = sin(a.y), cz = cos(a.z), sz = sin(a.z);
    mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
    mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
    mat3 rz = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0);
    return rz * ry * rx;
  }
  mat3 boneR;
  vec3 bonePivot;
  void boneSetup() {
    int b = int(aBone + 0.5);
    boneR = mat3(1.0);
    bonePivot = vec3(0.0);
    if (b <= 0 || b >= ${MAX_BONES}) return;
    float t = clamp(aT, 0.0, 1.0);
    vec4 w = uWave[b];
    vec3 ang = uRot[b] * pow(max(t, 0.0), 1.35) + w.xyz * sin(w.w - t * 3.6) * t;
    boneR = rotXYZ(ang);
    bonePivot = uPivot[b];
  }
`;

/**
 * 1 体ぶんのトゥーン材質（頂点色）。bones は makeBones() の値。
 * o：{ rim, rimColor, map, transparent, alphaTest, side, emissive }
 */
export function charMaterial(bones, o = {}) {
  const m = new THREE.MeshToonMaterial({
    color: 0xffffff,
    vertexColors: o.vertexColors ?? true,
    gradientMap: softGradient(),
    map: o.map || null,
    transparent: !!o.transparent,
    alphaTest: o.alphaTest ?? 0,
    side: o.side ?? THREE.FrontSide,
    emissive: o.emissive ?? 0x000000,
    depthWrite: o.depthWrite ?? true,
  });
  m.name = o.name || 'chara';
  const U = {
    uRim: { value: o.rim ?? 0.5 },
    uRimColor: { value: new THREE.Color(o.rimColor ?? 0xffe8d0) },
    uFlash: { value: 0 },
    uFade: { value: 1 },
    uShade: { value: new THREE.Color(o.shade ?? 0xffe6ea) },   // 陰の色味（灰色ではなく、少し赤みのある陰に）
  };
  m.userData.u = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, bones);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + DEFORM_PARS)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nboneSetup();\nobjectNormal = boneR * objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = boneR * (transformed - bonePivot) + bonePivot;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;\nuniform vec3 uRimColor;\nuniform float uFlash;\nuniform float uFade;\nuniform vec3 uShade;')
      .replace('#include <opaque_fragment>', `
        {
          // 陰になったところを少し色づける（明るさ ÷ 地の色 で陰の深さを測る）
          float lum = dot(outgoingLight, vec3(0.333)) / max(dot(diffuseColor.rgb, vec3(0.333)), 1e-3);
          outgoingLight *= mix(uShade, vec3(1.0), smoothstep(0.45, 0.95, lum));
          vec3 vd = normalize(vViewPosition + vec3(1e-6));
          float fr = 1.0 - clamp(dot(normalize(normal + vec3(1e-6)), vd), 0.0, 1.0);
          outgoingLight += uRimColor * uRim * smoothstep(0.6, 0.98, fr) * 0.4;
          outgoingLight = mix(outgoingLight, vec3(1.0), clamp(uFlash, 0.0, 1.0));
          diffuseColor.a *= uFade;
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'charToon' + (o.map ? 'Map' : '');
  return m;
}

/** 輪郭線（裏返した殻）。同じ骨で曲げる。width はフィールドのドット相当（画面上でほぼ一定）。 */
export function charOutline(bones, { color = 0x2b1d22, width = 0.55, worldScale = 1 } = {}) {
  const m = new THREE.ShaderMaterial({
    name: 'charOutline',
    uniforms: { uColor: { value: new THREE.Color(color) }, uWidth: { value: width }, uFade: { value: 1 }, ...bones },
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      ${DEFORM_PARS}
      uniform float uWidth;
      void main() {
        boneSetup();
        vec3 p = boneR * (position - bonePivot) + bonePivot;
        vec3 n = boneR * normal;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec3 vn = normalize(normalMatrix * n + vec3(1e-6));
        // 画面の上でほぼ一定の太さ（フィールドのカメラの距離 ≒ 1130 を基準に）
        float k = uWidth * max(-mv.z, 0.01) / 1130.0;
        mv.xyz += vn * k;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFade;
      void main() { if (uFade < 0.5) discard; gl_FragColor = vec4(uColor, 1.0); }`,
  });
  return m;
}
