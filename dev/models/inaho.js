// 確認台のアダプター：いなほ（主人公）。ボスも ?m=bosses で同じ形で見られる。
import { GirlModel } from '../../src/chara/GirlModel.js';
import { SPECS } from '../../src/chara/specs.js';

export function girlAdapter(id, title) {
  return {
    title,
    create({ THREE }) {
      const g = new GirlModel(SPECS[id], { outline: 1.6 });
      return {
        root: g.root,
        model: g,
        update(dt, ctx) {
          const p = ctx.params || {};
          g.setPose(p.pose || 'stand');
          if (p.face) g.setFace(p.face);
          g.setTalking(!!p.talk);
          g.update(dt, { vx: p.vx || 0, vy: p.vy || 0, focus: p.focus || 0 });
        },
        dispose() { g.dispose(); },
      };
    },
    modes: {
      stand: { pose: 'stand', face: { eyes: 'open', mouth: 'smile' } },
      fly: { pose: 'fly', vy: 4 },
      flyLeft: { pose: 'fly', vx: -4, vy: 2 },
      float: { pose: 'float' },
      cast: { pose: 'cast', face: { eyes: 'angry', mouth: 'open', brows: 'angry' } },
      declare: { pose: 'declare', face: { eyes: 'wide', mouth: 'open', brows: 'up' } },
      hurt: { pose: 'hurt', face: { eyes: 'closed', mouth: 'o', brows: 'sad' } },
      dazed: { pose: 'dazed', face: { eyes: 'dizzy', mouth: 'o' } },
      talk: { pose: 'portrait', talk: true, face: { eyes: 'open', mouth: 'smile' } },
      happy: { pose: 'portrait', face: { eyes: 'happy', mouth: 'open', blush: 0.8 } },
    },
    views: {
      face: { pos: [0, 1.2, 0.75], target: [0, 1.17, 0], fov: 25 },
      bust: { pos: [0, 1.05, 1.6], target: [0, 1.0, 0], fov: 28 },
      // 下から見上げた頭（耳の付け根・首まわりの確認用）
      headLow: { pos: [0.45, 0.98, 0.62], target: [0, 1.2, 0], fov: 32 },
      headSide: { pos: [1.0, 1.32, 0.35], target: [0, 1.2, 0], fov: 25 },
      // ゲーム中の自機と同じ角度（後ろ上から見下ろす）
      playerCam: { pos: [0, 1.75, -1.3], target: [0, 1.05, 0], fov: 25 },
      playerHead: { pos: [0, 1.5, -0.75], target: [0, 1.15, 0], fov: 25 },
      crown: { pos: [0, 1.95, -0.3], target: [0, 1.2, 0.03], fov: 25 },
      // 腕と袖（袖口から手が出ているか）
      armL: { pos: [1.7, 1.05, -0.1], target: [0.05, 0.85, -0.05], fov: 22 },
      armR: { pos: [-1.7, 1.05, -0.1], target: [-0.05, 0.85, -0.05], fov: 22 },
      sideBack: { pos: [-1.4, 1.1, -0.5], target: [0, 0.92, -0.05], fov: 32 },
    },
    lights({ THREE }) {
      const g = new THREE.Group();
      g.add(new THREE.HemisphereLight(0xfff3e6, 0x5a4a6a, 1.6));
      const k = new THREE.DirectionalLight(0xfff0dd, 2.2); k.position.set(-0.6, 0.9, 1.0); g.add(k);
      const r = new THREE.DirectionalLight(0x9fc4ff, 1.4); r.position.set(0.7, 0.4, -1.0); g.add(r);
      return g;
    },
    background: '#2a2438',
  };
}

export default girlAdapter('inaho', 'いなほ（狐の巫女）');
