// キャラクター・敵の材質（アニメ調）：3 段の陰（トゥーン）＋ ふちの光（リム）＋ 輪郭線（裏返した殻）。
// フィールドの層でも、背景の層でも使える。色はふつうの THREE.Color（sRGB の 16 進で渡してよい）。
//
//   const m = toon(0xf3e9dc);                       // 白衣
//   const m2 = toon(0xd8333c, { rim: 0.6 });        // 緋袴
//   mesh.material = m;  addOutline(mesh, { width: 0.6 });   // 輪郭線（width はフィールドのドット相当）
//
// 輪郭線の太さは画面の上でおおよそ一定になる（遠くても細くなりすぎない）。
import * as THREE from 'three';

let gradientMap = null;
/** 陰の段（3 段）。 */
function gradient() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const cache = new Map();

/**
 * トゥーンの材質。o：{ rim（ふちの光の強さ 0〜1）, rimColor, emissive, emissiveIntensity, map, side, transparent, opacity, flat（陰なし）, name, shared（同じ設定なら使い回す、既定 true） }
 */
export function toon(color, o = {}) {
  const key = o.shared === false || o.map ? null : JSON.stringify([color, o]);
  if (key && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: o.flat ? null : gradient(),
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    map: o.map || null,
    side: o.side ?? THREE.FrontSide,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    alphaTest: o.alphaTest ?? 0,
  });
  m.name = o.name || 'toon';
  const rim = o.rim ?? 0.45;
  const rimColor = new THREE.Color(o.rimColor ?? 0xfff2e0);
  m.userData.rim = { value: rim };
  m.userData.rimColor = { value: rimColor };
  m.userData.flash = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = m.userData.rim;
    sh.uniforms.uRimColor = m.userData.rimColor;
    sh.uniforms.uFlash = m.userData.flash;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;\nuniform vec3 uRimColor;\nuniform float uFlash;')
      .replace('#include <opaque_fragment>', `
        {
          vec3 vd = normalize(vViewPosition + vec3(1e-6));
          float fr = 1.0 - clamp(dot(normalize(normal + vec3(1e-6)), vd), 0.0, 1.0);
          outgoingLight += uRimColor * uRim * smoothstep(0.55, 0.95, fr) * 0.8;
          outgoingLight = mix(outgoingLight, vec3(1.0), clamp(uFlash, 0.0, 1.0));
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'toonRim';
  if (key) cache.set(key, m);
  return m;
}

/** 当たったときの白い点滅（共有の材質なら全部が光るので、敵ごとに shared: false の材質を使うこと）。 */
export function setFlash(material, v) { if (material?.userData?.flash) material.userData.flash.value = v; }

const outlineCache = new Map();
/** 輪郭線の材質。width はフィールドのドット相当の太さ。 */
export function outlineMaterial(color = 0x2a1c24, width = 0.5) {
  const key = color + ':' + width;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.ShaderMaterial({
    name: 'outline',
    uniforms: { uColor: { value: new THREE.Color(color) }, uWidth: { value: width } },
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      uniform float uWidth;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal + vec3(1e-6));
        // 画面の上でほぼ一定の太さ：遠いほど太らせる（フィールドのカメラはおよそ 1130 の距離にある）
        float k = uWidth * max(-mv.z, 1.0) / 1130.0;
        mv.xyz += n * k;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  });
  outlineCache.set(key, m);
  return m;
}

/** mesh に輪郭線（同じ形を裏返して少し太らせたもの）を足す。 */
export function addOutline(mesh, { color = 0x2a1c24, width = 0.5 } = {}) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(color, width));
  o.name = (mesh.name || 'mesh') + '-outline';
  o.raycast = () => {};
  mesh.add(o);
  return o;
}
