// 会話の立ち絵とスペルカードのカットイン。3D のモデルを大きくフィールドの下に出す（左：いなほ、右：ボス）。
// 話している側は明るく口が動き、聞いている側は少し暗くなる。表情は台詞ごとに変えられる。
// カットイン：スペル宣言のときにボスが、ボムのときにいなほが、画面を斜めに横切る。
import * as THREE from 'three';
import { GirlModel } from '../chara/GirlModel.js';
import { SPECS } from '../chara/specs.js';

const SCALE = 250;
const CHEST = 0.86;

function makePortrait(id) {
  const girl = new GirlModel(SPECS[id], { outline: 1.4 });
  const root = new THREE.Group();
  root.name = 'portrait-' + id;
  const inner = new THREE.Group();
  inner.scale.setScalar(SCALE);
  inner.add(girl.root);
  girl.root.position.y = -CHEST;
  root.add(inner);
  root.visible = false;
  girl.setPose('portrait');
  return { id, girl, root, inner, x: 0, y: 0, tx: 0, ty: 0, show: 0, want: 0, talkT: 0 };
}

export class Portraits {
  constructor(G) {
    this.G = G;
    this.left = null;
    this.right = null;
    this.cut = null;   // { p, t, dur, side }
  }

  ensure(side, id) {
    const cur = this[side];
    if (cur && cur.id === id) return cur;
    if (cur) { cur.root.removeFromParent(); cur.girl.dispose(); }
    const p = makePortrait(id);
    this.G.field.scene.add(p.root);
    this[side] = p;
    return p;
  }

  /** 会話を始める：左にいなほ、右にボス。 */
  open(bossId) {
    const L = this.ensure('left', 'inaho');
    const R = bossId ? this.ensure('right', bossId) : null;
    L.want = 1;
    if (R) R.want = 1;
    for (const p of [L, R]) if (p) { p.root.visible = true; p.girl.setPose('portrait'); }
  }

  close() {
    for (const p of [this.left, this.right]) if (p) { p.want = 0; p.talkT = 0; p.girl.setTalking(false); }
  }

  /** side（'l' / 'r'）が話す。face で表情、frames のあいだ口を動かす。 */
  speak(side, face, frames = 40) {
    const me = side === 'r' ? this.right : this.left;
    const other = side === 'r' ? this.left : this.right;
    if (me) { if (face) me.girl.setFace(face); me.talkT = frames; me.active = true; }
    if (other) other.active = false;
  }

  /** スペルカード・ボムのカットイン。 */
  cutIn(side, id) {
    const p = this.ensure(side === 'r' ? 'right' : 'left', id);
    p.root.visible = true;
    p.girl.setPose(side === 'r' ? 'declare' : 'cast');
    p.girl.setFace(side === 'r' ? { eyes: 'angry', mouth: 'open', brows: 'angry' } : { eyes: 'open', mouth: 'open', brows: 'up' });
    this.cut = { p, t: 0, dur: 70, side };
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 12);
    for (const [p, s] of [[this.left, -1], [this.right, 1]]) {
      if (!p) continue;
      if (this.cut?.p === p) continue;
      p.show += (p.want - p.show) * k;
      const x = s * (105 + (1 - p.show) * 170);
      const y = -135 + (p.active ? 6 : 0);
      p.root.position.set(x, y, 0);
      p.inner.rotation.y = -s * 0.38;
      p.root.visible = p.show > 0.02;
      if (!p.root.visible) continue;
      p.girl.setDim(p.active === false ? 0.55 : 1);
      if (p.talkT > 0) { p.talkT--; p.girl.setTalking(true); } else p.girl.setTalking(false);
      p.girl.update(dt, {});
    }
    const c = this.cut;
    if (c) {
      c.t++;
      const u = c.t / c.dur;
      const s = c.side === 'r' ? 1 : -1;
      // 下の角から入って中央近くで止まり、上の角へ抜ける
      const ease = u < 0.3 ? 1 - Math.pow(1 - u / 0.3, 3) : u < 0.75 ? 1 : 1 + Math.pow((u - 0.75) / 0.25, 2) * 1.6;
      const x = s * (260 - ease * 190), y = -330 + ease * 260;
      c.p.root.position.set(x, y, 0);
      c.p.inner.rotation.y = -s * 0.5;
      c.p.girl.setDim(1);
      c.p.girl.update(dt, {});
      if (c.t >= c.dur) {
        c.p.root.visible = c.p.show > 0.02;
        c.p.girl.setPose('portrait');
        this.cut = null;
      }
    }
  }

  hideAll() {
    for (const p of [this.left, this.right]) if (p) { p.want = 0; p.show = 0; p.root.visible = false; }
    this.cut = null;
  }
}
