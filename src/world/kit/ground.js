// カメラについて動く地面：格子の高さと色を GPU で決める（Lambert に組み込むので、明かりはほかの物と同じ）。
// 格子はます目の大きさに合わせてずらすので、頂点は世界の決まった場所に乗り、動いても揺れない。
//
// ステージが渡す GLSL（vec2 p は世界の xz）：
//   glsl（頂点・画素の両方）：float groundH(vec2 p)  高さ。使う uniform もここで宣言する
//   colorGLSL（画素だけ）：  vec3 groundCol(vec3 wp, vec3 n)  色（n は世界の法線）
//                           vec3 groundGlow(vec3 wp, vec3 n, vec3 alb)  自分で光る分（灯りのたまりなど）
//   画素のほうでは uNoise（ノイズの画像）と霧の値がそのまま使える。
// 高さは JS でも同じ式を持ち、物を地面に置くときに使う（式を変えるときは両方を変える）。
import * as THREE from 'three';
import { litMat } from './atmo.js';

/** o = { w, d, nx, nz, ahead（カメラより前に出す長さ）, glsl, colorGLSL, uniforms, eps（法線を取る幅）, key } */
export function makeGround(atmo, o) {
  const w = o.w, d = o.d, nx = o.nx, nz = o.nz;
  const geo = new THREE.PlaneGeometry(w, d, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.deleteAttribute('uv');
  const mat = litMat(atmo, { vertexColors: false, name: 'ground' });
  const own = mat.userData.u;
  Object.assign(own, o.uniforms || {});
  own.uGroundEps = { value: o.eps ?? 2 };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    prev(sh);
    Object.assign(sh.uniforms, own);
    const decl = `uniform float uGroundEps;\nvarying vec3 vGN;\n${o.glsl}\n`;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + decl)
      .replace('#include <beginnormal_vertex>', `
        vec3 gW = (modelMatrix * vec4(position, 1.0)).xyz;
        float gH = groundH(gW.xz);
        float ge = uGroundEps;
        float hx0 = groundH(gW.xz - vec2(ge, 0.0)), hx1 = groundH(gW.xz + vec2(ge, 0.0));
        float hz0 = groundH(gW.xz - vec2(0.0, ge)), hz1 = groundH(gW.xz + vec2(0.0, ge));
        vec3 objectNormal = normalize(vec3(hx0 - hx1, 2.0 * ge, hz0 - hz1));
        vGN = objectNormal;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, position.y + gH, position.z);');
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', decl + (o.colorGLSL || '') + '\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec3 gN = normalize(vGN + vec3(0.0, 1e-5, 0.0));\ndiffuseColor.rgb = groundCol(vWPos, gN);')
      .replace('#include <opaque_fragment>', 'outgoingLight += groundGlow(vWPos, gN, diffuseColor.rgb);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'ground:' + (o.key || 'g');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ground';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  const cx = w / nx, cz = d / nz;
  const ahead = o.ahead ?? d * 0.35;
  return {
    mesh, mat, uniforms: own,
    /** カメラの位置に合わせて、ます目の単位でずらす。 */
    follow(cam) {
      mesh.position.x = Math.round(cam.x / cx) * cx;
      mesh.position.z = Math.round((cam.z - ahead) / cz) * cz;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
