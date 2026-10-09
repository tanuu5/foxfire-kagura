// タイトル画面の 3D：背景（title の世界）の anchor にいなほを立たせ、まわりに狐火を浮かべる。
// 背景のモジュールが anchor = { pos, scale, yaw } を持っていればそこに、なければカメラの前の右寄りに置く。
import * as THREE from 'three';
import { GirlModel } from '../chara/GirlModel.js';
import { SPECS } from '../chara/specs.js';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(170,225,255,0.9)');
  r.addColorStop(0.6, 'rgba(70,140,255,0.35)');
  r.addColorStop(1, 'rgba(40,90,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class TitleScene {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'titleChara';
    this.girl = new GirlModel(SPECS.inaho, { outline: 1.0 });
    this.girl.setPose('stand');
    this.girl.setFace({ eyes: 'open', mouth: 'smile', blush: 0.5 });
    this.group.add(this.girl.root);
    const tex = glowTexture();
    this.fires = [];
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.scale.setScalar(0.16);
      s.name = 'foxfire' + k;
      this.group.add(s);
      this.fires.push(s);
    }
    // キャラクター用の明かり（背景の明かりに足す。夜でも顔が見えるように）
    this.light = new THREE.PointLight(0xbfe2ff, 1.2, 4, 1.5);
    this.light.position.set(0.3, 1.4, 0.8);
    this.group.add(this.light);
    this.t = 0;
    this.attached = null;
  }

  /** 背景が変わったら付け直す。 */
  attach() {
    const st = this.world.stage;
    if (!st) return;
    if (this.attached === st) return;
    this.attached = st;
    this.world.scene.add(this.group);
    const a = st.anchor;
    if (a) {
      this.group.position.copy(a.pos);
      this.group.scale.setScalar(a.scale ?? 1);
      this.group.rotation.set(0, a.yaw ?? 0, 0);
    } else {
      // 仮置き：カメラの前、右寄り
      const cam = this.world.camera;
      cam.updateMatrixWorld();
      const p = new THREE.Vector3(1.0, -1.4, -5.5).applyMatrix4(cam.matrixWorld);
      this.group.position.copy(p);
      this.group.scale.setScalar(1);
      this.group.rotation.set(0, Math.atan2(cam.position.x - p.x, cam.position.z - p.z), 0);
    }
  }

  setVisible(on) {
    this.group.visible = on;
    if (on) this.attach();
  }

  update(dt) {
    if (!this.group.visible) return;
    this.t += dt;
    this.girl.update(dt, {});
    this.fires.forEach((s, k) => {
      const a = this.t * 0.8 + (k / this.fires.length) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.55, 1.0 + Math.sin(this.t * 1.7 + k) * 0.12 + k * 0.05, Math.sin(a) * 0.4);
      s.scale.setScalar(0.14 + Math.sin(this.t * 9 + k * 2) * 0.015);
    });
  }
}
