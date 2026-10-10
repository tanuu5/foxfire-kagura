// ※ Clawd は Anthropic の Claude Code のマスコットで、このファイルはその非公式の二次創作（ファンによる描き起こしを箱で組み直したもの）です。
//   Clawd のデザインと、このファイル・clawdActors.js は MIT License の対象外です（LICENSE の「例外」を参照）。
//   Clawd is the mascot of Anthropic's Claude Code. This file is an unofficial fan rendition and is not covered by the MIT License (see LICENSE).
// Clawd（ドット絵の四角いカニ）の 3D モデル。箱だけで組む。単位は元の SVG（150 × 110）の 1 = 1。
// 原点は胴体の中心、+Y が上、+Z が正面（目のある面）。胴体 86 × 66、奥行き 60。
//
//   const c = new ClawdModel();            // { mini: true } で道中の小さな子分（表情なし・後ろの脚なし）
//   scene.add(c.root);
//   c.setPose('float');  c.setFace({ eyes: 'happy', brows: 'normal' });
//   c.update(dt, { vx })                   // 毎フレーム。vx（ドット/コマ）で横歩き
//
// 会話の立ち絵（Portraits）とボス（actors.js）から、GirlModel と同じ口（setPose / setFace / setTalking / setDim / setFlash / update / dispose）で使う。
// 腕は肩（胴体に埋まった内側の端）を軸に回す。中心で回すと胴体から腕が浮いて見える（clawd-mascot スキルの「関節がすべて」）。
// SVG と違って +Y が上なので、腕を上げる向きは「左腕は rotation.z がマイナス、右腕はプラス」。
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, setFlash, outlineMaterial } from './toon.js';

export const CLAWD_COLOR = 0xc67d5f;
const EYE_COLOR = 0x141414;
const OUTLINE = 0x3a1810;

// 寸法（SVG の座標から：X = svgX − 75、Y = 41 − svgY）
const BODY = { w: 86, h: 66, d: 60 };
const EYE = { s: 13, x: 19, y: 12.5 };             // 目：13 × 13、中心は (±19, 12.5)
const ARM = { w: 24, h: 22, d: 22, x: 39, y: -5 };   // 肩（回す軸）は胴体の中の x = ±39
const LEG = { w: 11, h: 28, d: 11, y: -41, xs: [-37.5, -16.5, 16.5, 37.5], zs: [16, -16] }; // 上の 6 は胴体に埋める（上げても隙間が出ない）

// 目の形（5 × 5 のドット。上の行から）。1 ドット = 13 / 5
const EYES = {
  open: ['#####', '#####', '#####', '#####', '#####'],
  half: ['.....', '.....', '#####', '#####', '#####'],
  closed: ['.....', '.....', '.....', '#####', '.....'],
  happy: ['.....', '..#..', '.#.#.', '#...#', '.....'],
  dizzyL: ['#....', '.##..', '...#.', '.##..', '#....'],   // ＞
  dizzyR: ['....#', '..##.', '.#...', '..##.', '....#'],   // ＜
};

const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** 輪郭線用：頂点をつなげて法線をならす（箱の角で線が割れないように）。 */
function hull(geo) {
  const g = geo.clone();
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-3);
  m.computeVertexNormals();
  g.dispose();
  return m;
}

function pixels(rows, size, depth) {
  const p = size / rows.length;
  const parts = [];
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '#') parts.push(box(p, p, depth, (i - 2) * p, (2 - j) * p, 0));
  }));
  const g = mergeGeometries(parts);
  parts.forEach((x) => x.dispose());
  return g;
}

// 形は全員で使い回す（作るのは 1 回だけ）
let G = null;
function shapes() {
  if (G) return G;
  const body = box(BODY.w, BODY.h, BODY.d);
  const arm = (s) => box(ARM.w, ARM.h, ARM.d, s * ARM.w / 2, 0, 0);
  const legs = (idx, rows) => mergeGeometries(idx.flatMap((k) => rows.map((z) => box(LEG.w, LEG.h, LEG.d, LEG.xs[k], LEG.y, z))));
  G = {
    body, bodyHull: hull(body),
    armL: arm(-1), armR: arm(1),
    legsA: legs([0, 2], LEG.zs), legsB: legs([1, 3], LEG.zs),
    legsAmini: legs([0, 2], [0]), legsBmini: legs([1, 3], [0]),
    eyes: Object.fromEntries(Object.entries(EYES).map(([k, rows]) => [k, pixels(rows, EYE.s, 2)])),
    eyePair: mergeGeometries([box(EYE.s, EYE.s, 2, -EYE.x, EYE.y, 0), box(EYE.s, EYE.s, 2, EYE.x, EYE.y, 0)]),
    brow: box(14, 3.2, 2),
  };
  G.armLHull = hull(G.armL); G.armRHull = hull(G.armR);
  for (const k of ['legsA', 'legsB', 'legsAmini', 'legsBmini']) G[k + 'Hull'] = hull(G[k]);
  return G;
}

const raise = (o, k, dt) => o + (k - o) * (1 - Math.exp(-dt * 12));

export class ClawdModel {
  constructor({ mini = false, outline = 0.6, color = CLAWD_COLOR } = {}) {
    const S = shapes();
    this.mini = mini;
    this.base = new THREE.Color(color);
    this.mat = toon(color, { shared: false, rim: 0.32, rimColor: 0xffe2c8 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: EYE_COLOR });
    const lineMat = outlineMaterial(OUTLINE, outline);
    const mesh = (geo, hullGeo, parent, name) => {
      const m = new THREE.Mesh(geo, this.mat);
      m.name = name;
      parent.add(m);
      if (hullGeo && outline > 0) {
        const o = new THREE.Mesh(hullGeo, lineMat);
        o.name = name + '-outline';
        o.raycast = () => {};
        m.add(o);
      }
      return m;
    };

    this.root = new THREE.Group();
    this.root.name = mini ? 'clawd-mini' : 'clawd';
    this.bodyG = new THREE.Group();      // 体ごと跳ねる・傾く（SVG の crabAll）
    this.root.add(this.bodyG);
    mesh(S.body, S.bodyHull, this.bodyG, 'body');
    // 腕：肩の位置に軸の group を置き、腕は外へ伸ばす
    this.armL = new THREE.Group(); this.armL.position.set(-ARM.x, ARM.y, 0);
    this.armR = new THREE.Group(); this.armR.position.set(ARM.x, ARM.y, 0);
    this.bodyG.add(this.armL, this.armR);
    mesh(S.armL, S.armLHull, this.armL, 'armL');
    mesh(S.armR, S.armRHull, this.armR, 'armR');
    // 脚：互い違いの 2 組（A：外側左と内側右、B：内側左と外側右）
    this.legsA = mesh(mini ? S.legsAmini : S.legsA, mini ? S.legsAminiHull : S.legsAHull, this.bodyG, 'legsA');
    this.legsB = mesh(mini ? S.legsBmini : S.legsB, mini ? S.legsBminiHull : S.legsBHull, this.bodyG, 'legsB');
    // 目：正面の面から少しだけ出す（面と重ねるとちらつく）
    const zf = BODY.d / 2 + 0.6;
    this.eyes = new THREE.Group();
    this.eyes.position.z = zf;
    this.bodyG.add(this.eyes);
    if (mini) {
      const e = new THREE.Mesh(S.eyePair, this.eyeMat);
      e.name = 'eyes';
      this.eyes.add(e);
      this.eyeL = this.eyeR = null;
    } else {
      // 表情ごとの形を持っておき、見せるものだけを出す
      this.eyeL = this.makeEye(S, -EYE.x, 'L');
      this.eyeR = this.makeEye(S, EYE.x, 'R');
      this.browL = new THREE.Mesh(S.brow, this.eyeMat); this.browL.position.set(-EYE.x, EYE.y + 12, 0);
      this.browR = new THREE.Mesh(S.brow, this.eyeMat); this.browR.position.set(EYE.x, EYE.y + 12, 0);
      this.browL.visible = this.browR.visible = false;
      this.eyes.add(this.browL, this.browR);
    }

    this.t = Math.random() * 10;
    this.pose = 'float';
    this.talking = false;
    this.face = { eyes: 'open', brows: 'normal' };
    this.blinkT = 2 + Math.random() * 2;
    this.blinking = 0;
    this.walk = 0;       // 横歩きの進み（脚を交互に上げる）
    this.upL = 0; this.upR = 0;
    this.lookY = 0;
  }

  makeEye(S, x, side) {
    const g = new THREE.Group();
    g.position.x = x;
    g.userData.shapes = {};
    for (const [k, geo] of Object.entries(S.eyes)) {
      if ((k === 'dizzyL' && side === 'R') || (k === 'dizzyR' && side === 'L')) continue;
      const m = new THREE.Mesh(geo, this.eyeMat);
      m.name = 'eye' + side + '-' + k;
      m.visible = k === 'open';
      g.add(m);
      g.userData.shapes[k.startsWith('dizzy') ? 'dizzy' : k] = m;
    }
    this.eyes.add(g);
    return g;
  }

  /** 表情：eyes（open / half / closed / happy / angry / sad / dizzy）、brows（normal / angry / sad / up）。口はない。 */
  setFace(o = {}) { Object.assign(this.face, o); }
  setPose(p) { this.pose = p; }
  setTalking(on) { this.talking = !!on; }
  setDim(v) { this.mat.color.copy(this.base).multiplyScalar(v); }
  setFlash(v) { setFlash(this.mat, v); }

  showEye(eye, kind) {
    if (!eye) return;
    const S = eye.userData.shapes;
    for (const k in S) S[k].visible = k === kind;
  }

  /**
   * 毎フレーム。o = { vx（横の速さ、ドット/コマ） }。
   * pose：float（浮かぶ）/ portrait（立ち絵）/ cast（片方のはさみを上げる）/ declare（バンザイ）/ think（考え中）
   *       / type（キーボードを打つ）/ hurt（ひるむ）/ dazed（目を回す）
   */
  update(dt, o = {}) {
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const t = this.t, pose = this.pose;
    const vx = Number.isFinite(o.vx) ? o.vx : 0;
    const moving = Math.abs(vx) > 0.25;
    // 脚：動くあいだは速く交互に、止まっているあいだはゆっくり水をかく
    this.walk += dt * (moving ? 7 + Math.min(10, Math.abs(vx) * 2.2) : 1.6);
    const ph = Math.sin(this.walk * Math.PI);
    const lift = moving ? 5 : 2;
    this.legsA.position.y = Math.max(0, ph) * lift;
    this.legsB.position.y = Math.max(0, -ph) * lift;
    // 体：ふわふわ浮かぶ。歩くときは一歩ごとに小さく跳ねる。話すときはぴょこぴょこ
    let bob = Math.sin(t * 2.6) * 1.6;
    if (moving) bob += Math.abs(ph) * 2.2;
    if (this.talking) bob += Math.abs(Math.sin(t * 13)) * 3.2;
    this.bodyG.position.y = bob;
    this.bodyG.rotation.z = pose === 'dazed' ? Math.sin(t * 2.4) * 0.14 : pose === 'hurt' ? 0.08 : -vx * 0.012;
    // 腕：上げる量（+ が上）。左は rotation.z をマイナスに、右はプラスに
    let uL = 0.12 + Math.sin(t * 2.4) * 0.1, uR = 0.12 + Math.sin(t * 2.4 + 1.3) * 0.1;
    if (pose === 'portrait') { uL = 0.06 + Math.sin(t * 1.6) * 0.05; uR = 0.06 + Math.sin(t * 1.6 + 1) * 0.05; }
    if (pose === 'cast') { uL = 0.1; uR = 0.85; }
    if (pose === 'declare') { uL = uR = 0.62 + Math.sin(t * 9) * 0.05; }
    if (pose === 'think') { uL = 1.0; uR = 0.05; }
    if (pose === 'type') { uL = -0.55 + Math.max(0, Math.sin(t * 16)) * 0.18; uR = -0.55 + Math.max(0, -Math.sin(t * 16)) * 0.18; }
    if (pose === 'hurt') { uL = uR = -0.55; }
    if (pose === 'dazed') { uL = -0.3 + Math.sin(t * 2) * 0.12; uR = -0.3 - Math.sin(t * 2) * 0.12; }
    if (this.talking && pose !== 'declare') { const w = Math.sin(t * 11) * 0.12; uL += w; uR -= w; }
    this.upL = raise(this.upL, uL, dt);
    this.upR = raise(this.upR, uR, dt);
    this.armL.rotation.z = -this.upL;
    this.armR.rotation.z = this.upR;

    // 表情（まばたきを重ねる）
    if (!this.eyeL) return;
    const f = this.face;
    let eyes = f.eyes || 'open';
    if (pose === 'dazed' || pose === 'hurt') eyes = 'dizzy';
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinking = 0.11; this.blinkT = 2.4 + Math.random() * 3; }
    if (this.blinking > 0) { this.blinking -= dt; if (eyes === 'open' || eyes === 'angry' || eyes === 'sad' || eyes === 'half') eyes = 'closed'; }
    const shape = eyes === 'angry' || eyes === 'sad' ? 'open' : eyes;
    this.showEye(this.eyeL, shape);
    this.showEye(this.eyeR, shape);
    // 考え中は上を見る
    this.lookY = raise(this.lookY, pose === 'think' ? 3 : 0, dt);
    this.eyeL.position.y = this.eyeR.position.y = this.lookY;
    const brows = eyes === 'dizzy' ? 'normal' : f.brows === 'normal' && (f.eyes === 'angry' || f.eyes === 'sad') ? f.eyes : f.brows;
    const show = brows === 'angry' || brows === 'sad' || brows === 'up';
    this.browL.visible = this.browR.visible = show;
    if (show) {
      // angry：内側（目と目のあいだ）が下がる ／ sad：内側が上がる ／ up：まっすぐ高く
      const a = brows === 'angry' ? -0.38 : brows === 'sad' ? 0.32 : 0;
      this.browL.rotation.z = a;
      this.browR.rotation.z = -a;
      this.browL.position.y = this.browR.position.y = EYE.y + (brows === 'up' ? 14 : 11) + this.lookY;
    }
  }

  dispose() {
    // 形は使い回しなので捨てない。1 体ごとの材質だけ
    this.mat.dispose();
    this.eyeMat.dispose();
  }
}
