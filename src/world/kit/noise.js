// 乱数と、繰り返すノイズ（背景の模様のもと）。
//   rng(seed)            決まった種から 0〜1 の乱数を返す関数（mulberry32）
//   hash2(i, j, seed)    整数の格子点ごとに決まった 0〜1 の値
//   noiseTexture(size)   上下左右につながる fBm を 4 つ（RGBA）入れた画像。地面・雲・水の模様に使う
// ワールド座標が大きくなっても模様が崩れないよう、シェーダーでは hash ではなくこの画像を引く。
import * as THREE from 'three';

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(i, j, seed = 0) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 繰り返す値ノイズの fBm（size × size、0〜1 に正規化）。period は一番粗い格子のます目の数。 */
export function tileFbm(size, period, octaves, seed, gain = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1, p = period;
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(p * p);
    for (let j = 0; j < p; j++) for (let i = 0; i < p; i++) lat[j * p + i] = hash2(i, j, seed + o * 101);
    const cell = size / p;
    for (let y = 0; y < size; y++) {
      const fy = y / cell, j0 = Math.floor(fy), ty = fy - j0;
      const sy = ty * ty * (3 - 2 * ty);
      const ja = (j0 % p) * p, jb = ((j0 + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = x / cell, i0 = Math.floor(fx), tx = fx - i0;
        const sx = tx * tx * (3 - 2 * tx);
        const ia = i0 % p, ib = (i0 + 1) % p;
        const a = lat[ja + ia] + (lat[ja + ib] - lat[ja + ia]) * sx;
        const b = lat[jb + ia] + (lat[jb + ib] - lat[jb + ia]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    amp *= gain;
    p *= 2;
    if (p > size) break;
  }
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < out.length; k++) { lo = Math.min(lo, out[k]); hi = Math.max(hi, out[k]); }
  const s = 1 / Math.max(hi - lo, 1e-6);
  for (let k = 0; k < out.length; k++) out[k] = (out[k] - lo) * s;
  return out;
}

/** RGBA に別々の fBm（R：粗い・G：中くらい・B：細かい・A：とても細かい）。 */
export function noiseTexture(size = 256, seed = 7) {
  const chans = [tileFbm(size, 4, 5, seed), tileFbm(size, 8, 4, seed + 17), tileFbm(size, 16, 4, seed + 31), tileFbm(size, 32, 3, seed + 47)];
  const data = new Uint8Array(size * size * 4);
  for (let k = 0; k < size * size; k++) for (let c = 0; c < 4; c++) data[k * 4 + c] = Math.round(chans[c][k] * 255);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  tex.name = 'noise';
  return tex;
}
