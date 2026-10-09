// 背景の空気：霧と明かり。どの材質も同じ霧の値（uniform の入れ物）を共有し、1 か所を変えれば全部に効く。
//
//   const atmo = makeAtmo({ fog: 0x6a4a6a, fogSun: 0xff9a5a, density: 0.0016, far: 1400 })
//   litMat(atmo, { emit: true, sway: 0.03, rim: true })   Lambert に霧・発光（頂点の aEmit）・揺れ・縁の光を足した材質
//   FOG_GLSL                                                自前のシェーダー（地面・水・雲）に入れる霧の関数
//
// 霧は 3 つを重ねる：距離の霧（exp2）、高さの霧（低いところほど濃い。谷にたまる靄）、生成範囲の端を隠す霧。
// 色は視線の向きで変える（太陽・月の方向は uFogSun に寄る）。上から見下ろすと、遠く（画面の上）ほど夕焼けの色になる。
import * as THREE from 'three';

export function makeAtmo(o = {}) {
  return {
    uFogColor: { value: new THREE.Color(o.fog ?? 0x303040) },
    uFogSun: { value: new THREE.Color(o.fogSun ?? o.fog ?? 0x303040) },
    uSunDir: { value: new THREE.Vector3(...(o.sunDir || [0, 0.1, -1])).normalize() },
    uFogDensity: { value: o.density ?? 0.0015 },
    uFogH: { value: new THREE.Vector4(o.hBase ?? 0, o.hFall ?? 0.03, o.hAmount ?? 0, 0) }, // 高さの霧：基準の高さ・薄くなる速さ・濃さ
    uFogFar: { value: o.far ?? 3000 },
    uSunPow: { value: o.sunPow ?? 5 },
    uRim: { value: new THREE.Color(o.rim ?? 0x000000) },
    uWTime: { value: 0 },
    uNoise: { value: o.noise || null },
    uFogGlow: { value: new THREE.Color(0x000000) },              // 地平の光の帯（空の uGlowCol × uGlowAmt と合わせる）
    uFogGlowDir: { value: new THREE.Vector3(0, 0, -1) },
  };
}

/** 自前のシェーダー用の霧（vWPos と cameraPosition を使う）。 */
export const FOG_GLSL = /* glsl */ `
uniform vec3 uFogColor, uFogSun, uSunDir, uFogGlow, uFogGlowDir;
uniform vec4 uFogH;
uniform float uFogDensity, uFogFar, uSunPow;
float atmoAmount(vec3 wpos) {
  vec3 d = wpos - cameraPosition;
  float dist = length(d);
  float e = uFogDensity * dist;
  float tau = e * e;
  // 高さの霧：密度 a·exp(-b(y - y0)) を視線に沿って積分したもの
  float b = max(uFogH.y, 1e-4);
  float e1 = exp(clamp(-b * (cameraPosition.y - uFogH.x), -40.0, 40.0));
  float e2 = exp(clamp(-b * (wpos.y - uFogH.x), -40.0, 40.0));
  float dy = wpos.y - cameraPosition.y;
  float hf = abs(dy) > 0.05 ? (e1 - e2) / (b * dy) : e2;
  tau += uFogH.z * dist * max(hf, 0.0);
  float f = 1.0 - exp(-min(tau, 60.0));
  f = max(f, smoothstep(uFogFar * 0.72, uFogFar, dist));
  return clamp(f, 0.0, 1.0);
}
vec3 atmoColor(vec3 wpos) {
  vec3 d = wpos - cameraPosition;
  vec3 v = d / max(length(d), 1e-4);
  float s = max(dot(v, uSunDir), 0.0);
  vec3 c = mix(uFogColor, uFogSun, pow(s, max(uSunPow, 0.5)));
  // 空の地平の光の帯と同じ式（遠くの雲・地面が空に溶けるように）
  vec3 vh = vec3(v.x, 0.0, v.z);
  float side = max(dot(vh / max(length(vh), 1e-4), uFogGlowDir), 0.0);
  c += uFogGlow * exp(-abs(v.y) * 7.0) * (0.25 + 0.75 * side * side);
  return c;
}
vec3 applyAtmo(vec3 col, vec3 wpos) { return mix(col, atmoColor(wpos), atmoAmount(wpos)); }
`;

const V_HEAD = /* glsl */ `
varying vec3 vWPos;
uniform float uWTime;
uniform float uSway;
#ifdef ATMO_EMIT
attribute float aEmit;
varying float vEmit;
#endif
`;

const V_SWAY = /* glsl */ `
#ifdef ATMO_SWAY
{
  #ifdef USE_INSTANCING
    vec2 ip = instanceMatrix[3].xz;
  #else
    vec2 ip = modelMatrix[3].xz;
  #endif
  float sw = sin(uWTime * 0.9 + ip.x * 0.043 + ip.y * 0.061) * 0.7 + sin(uWTime * 2.1 + ip.x * 0.13 - ip.y * 0.07) * 0.3;
  float hy = max(position.y, 0.0);
  transformed.x += sw * uSway * hy * hy;
  transformed.z += sw * uSway * 0.5 * hy * hy * cos(ip.x);
}
#endif
`;

const V_WPOS = /* glsl */ `
{
  vec4 wp4 = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    wp4 = batchingMatrix * wp4;
  #endif
  #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4;
  #endif
  vWPos = (modelMatrix * wp4).xyz;
}
#ifdef ATMO_EMIT
  vEmit = aEmit;
#endif
`;

const F_HEAD = /* glsl */ `
varying vec3 vWPos;
uniform vec3 uRim;
uniform float uEmitGain;
uniform sampler2D uNoise;
uniform vec2 uDetail;
#ifdef ATMO_EMIT
varying float vEmit;
#endif
${FOG_GLSL}
`;

const F_DETAIL = /* glsl */ `
#ifdef ATMO_DETAIL
{
  // 面の向きで 3 方向から模様を引く（UV なしで石・木肌のざらつき）
  vec3 wN = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz + vec3(1e-5));
  vec3 an = abs(wN);
  float s = uDetail.x;
  float tx = texture2D(uNoise, vWPos.zy * s).b;
  float ty = texture2D(uNoise, vWPos.xz * s).b;
  float tz = texture2D(uNoise, vWPos.xy * s).b;
  float dt = (tx * an.x + ty * an.y + tz * an.z) / (an.x + an.y + an.z + 1e-4);
  diffuseColor.rgb *= max(1.0 + (dt - 0.5) * uDetail.y, 0.0);
}
#endif
`;

const F_ADD = /* glsl */ `
#ifdef ATMO_EMIT
  outgoingLight += diffuseColor.rgb * vEmit * uEmitGain;
#endif
#ifdef ATMO_RIM
{
  float rf = 1.0 - clamp(dot(normal, normalize(vViewPosition + vec3(1e-5))), 0.0, 1.0);
  outgoingLight += uRim * rf * rf * rf;
}
#endif
`;

/**
 * 霧などを足した Lambert の材質。
 * o = { emit（頂点の aEmit で光る）, sway（木の揺れの強さ。形の高さ 1 あたり）, rim（縁の光）, detail: [細かさ, 強さ]（ざらつき）,
 *       map, side, transparent, opacity, alphaTest, color, vertexColors, emitGain }
 */
export function litMat(atmo, o = {}) {
  const m = new THREE.MeshLambertMaterial({
    vertexColors: o.vertexColors ?? true,
    color: o.color ?? 0xffffff,
    map: o.map || null,
    side: o.side ?? THREE.FrontSide,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    alphaTest: o.alphaTest ?? 0,
    depthWrite: o.depthWrite ?? true,
  });
  m.name = o.name || 'lit';
  const defs = {};
  if (o.emit) defs.ATMO_EMIT = '';
  if (o.sway) defs.ATMO_SWAY = '';
  if (o.rim) defs.ATMO_RIM = '';
  if (o.detail) defs.ATMO_DETAIL = '';
  m.defines = defs;
  const own = (m.userData.u = {
    uSway: { value: o.sway || 0 },
    uEmitGain: { value: o.emitGain ?? 1 },
    uDetail: { value: new THREE.Vector2(...(o.detail || [0.1, 0])) },
  });
  m.onBeforeCompile = (sh) => patchLit(sh, atmo, own);
  return m;
}

function patchLit(sh, atmo, own) {
  Object.assign(sh.uniforms, atmo, own);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + V_HEAD)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + V_SWAY)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + V_WPOS);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + F_HEAD)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + F_DETAIL)
    .replace('#include <opaque_fragment>', F_ADD + '\n#include <opaque_fragment>')
    .replace('#include <fog_fragment>', 'gl_FragColor.rgb = applyAtmo(gl_FragColor.rgb, vWPos);');
}

/** 半球の明かりと、太陽（月）の向きの明かり。group に入れて返す。 */
export function makeLights(group, o = {}) {
  const hemi = new THREE.HemisphereLight(o.sky ?? 0x8090b0, o.ground ?? 0x202028, o.hemi ?? 1);
  const sun = new THREE.DirectionalLight(o.sun ?? 0xffffff, o.sunI ?? 1);
  sun.position.set(...(o.sunDir || [0, 1, -1]));
  group.add(hemi, sun, sun.target);
  return { hemi, sun };
}

/** 色を補間して入れる（毎フレーム呼んでも物を作らない）。 */
export function lerpColor(out, a, b, t) {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
  return out;
}

export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
