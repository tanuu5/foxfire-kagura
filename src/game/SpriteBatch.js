// 板（四角）をたくさん 1 回で描く：弾・自機のショット・アイテム・火花。
// フィールドの面（z ≒ 0）に置き、1 つずつ位置・向き・大きさ・アトラスのマス・色・濃さを持つ。
//
//   const sb = new SpriteBatch({ capacity: 4096, atlas, mode: 'mask' });
//   sb.begin();  sb.push(x, y, angle, sx, sy, cell, r, g, b, alpha, z);  …  sb.end();
//
// mode
//   'mask'  ：アトラスの各色を「型」として読む（R = 本体を色で塗る、G = 芯を白く、B = 縁を暗く、A = 光を足す）。弾幕の弾
//   'color' ：アトラスの色をそのまま使う（アイテムの絵）。色を掛けて濃さを変えられる
// どちらも「前もって掛けた透明度」で混ぜる（ONE, ONE_MINUS_SRC_ALPHA）。alpha を 0 にして色だけ出せば足し算の光になる
// （additive: true でまとめてそうする）。
import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute vec4 aA;   // x, y, 向き（ラジアン）, 濃さ
  attribute vec4 aB;   // 幅, 高さ, マスの番号, z
  attribute vec3 aC;   // 色（リニア）
  uniform vec2 uGrid;  // アトラスの列数・行数
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float c = cos(aA.z), s = sin(aA.z);
    vec2 p = position.xy * aB.xy;
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(aA.xy + p, aB.w, 1.0);
    float col = mod(aB.z, uGrid.x);
    float row = floor(aB.z / uGrid.x + 0.001);
    vUv = (vec2(col, uGrid.y - 1.0 - row) + uv) / uGrid;
    vColor = aC;
    vAlpha = aA.w;
  }`;

const FRAG_MASK = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uCore;     // 芯の明るさ（1 より大きいと Bloom で光る）
  uniform float uGlow;     // 光の強さ
  uniform float uAdd;      // 1 なら全部を足し算の光にする
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 m = texture2D(uMap, vUv);
    vec3 col = mix(vColor, vec3(uCore), m.g);
    col = mix(col, vColor * 0.22, m.b * (1.0 - m.g));
    float a = clamp(max(max(m.r, m.g), m.b), 0.0, 1.0) * vAlpha;
    vec3 glow = vColor * m.a * vAlpha * uGlow;
    vec3 rgb = col * a + glow;
    gl_FragColor = vec4(max(rgb, vec3(0.0)), a * (1.0 - uAdd));
  }`;

const FRAG_COLOR = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uAdd;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 m = texture2D(uMap, vUv);
    float a = m.a * vAlpha;
    gl_FragColor = vec4(max(m.rgb * vColor * a, vec3(0.0)), a * (1.0 - uAdd));
  }`;

export class SpriteBatch {
  constructor({ capacity = 1024, atlas, cols = 8, rows = 8, mode = 'mask', additive = false, renderOrder = 10, core = 1.4, glow = 0.9, name = 'sprites' }) {
    this.capacity = capacity;
    this.count = 0;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    this.a = new Float32Array(capacity * 4);
    this.b = new Float32Array(capacity * 4);
    this.c = new Float32Array(capacity * 3);
    const attr = (arr, n) => new THREE.InstancedBufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.attrA = attr(this.a, 4);
    this.attrB = attr(this.b, 4);
    this.attrC = attr(this.c, 3);
    g.setAttribute('aA', this.attrA);
    g.setAttribute('aB', this.attrB);
    g.setAttribute('aC', this.attrC);
    g.instanceCount = 0;
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      name,
      uniforms: {
        uMap: { value: atlas },
        uGrid: { value: new THREE.Vector2(cols, rows) },
        uCore: { value: core },
        uGlow: { value: glow },
        uAdd: { value: additive ? 1 : 0 },
      },
      vertexShader: VERT,
      fragmentShader: mode === 'color' ? FRAG_COLOR : FRAG_MASK,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  begin() { this.count = 0; }

  /** 1 枚足す。角度は「上向きに描いた絵」を回す量（ラジアン）。 */
  push(x, y, angle, sx, sy, cell, r, g, b, alpha = 1, z = 0) {
    const i = this.count;
    if (i >= this.capacity) return;
    const a = this.a, bb = this.b, c = this.c;
    const k = i * 4, k3 = i * 3;
    a[k] = x; a[k + 1] = y; a[k + 2] = angle; a[k + 3] = alpha;
    bb[k] = sx; bb[k + 1] = sy; bb[k + 2] = cell; bb[k + 3] = z;
    c[k3] = r; c[k3 + 1] = g; c[k3 + 2] = b;
    this.count = i + 1;
  }

  end() {
    const n = this.count;
    this.geometry.instanceCount = n;
    if (!n) return;
    for (const [attr, size] of [[this.attrA, 4], [this.attrB, 4], [this.attrC, 3]]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * size);
      attr.needsUpdate = true;
    }
  }
}
