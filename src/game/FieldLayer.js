// フィールドの層：自機・敵・弾・アイテム・演出を置くシーンと、それを正面から見る固定のカメラ。
// 背景（world）の上に重ねて描く。座標はフィールドのドット（x 右、y 上、z 手前）。
import * as THREE from 'three';
import { FIELD_DIST } from './Layout.js';
import { SpriteBatch } from './SpriteBatch.js';
import { buildMaskAtlas, buildColorAtlas, MASK_GRID_SIZE, ICON_GRID_SIZE } from './atlas.js';

export class FieldLayer {
  constructor() {
    const scene = (this.scene = new THREE.Scene());
    scene.name = 'field';
    const cam = (this.camera = new THREE.PerspectiveCamera(24, 1, 10, FIELD_DIST * 4));
    cam.name = 'fieldCamera';
    cam.position.set(0, 0, FIELD_DIST);
    cam.lookAt(0, 0, 0);

    // キャラクターと敵の明かり（ステージの雰囲気に合わせて setMood で変える）
    this.hemi = new THREE.HemisphereLight(0xfff3e6, 0x5a4a6a, 1.25);
    this.key = new THREE.DirectionalLight(0xfff0dd, 1.7);
    this.key.position.set(-0.6, 0.9, 1.0);
    this.rim = new THREE.DirectionalLight(0x9fc4ff, 0.9);
    this.rim.position.set(0.7, 0.4, -1.0);
    scene.add(this.hemi, this.key, this.rim);

    // 弾・ショット・アイテム・演出
    this.maskAtlas = buildMaskAtlas();
    this.colorAtlas = buildColorAtlas();
    const G = MASK_GRID_SIZE, IG = ICON_GRID_SIZE;
    this.shotBatch = new SpriteBatch({ name: 'playerShots', capacity: 400, atlas: this.colorAtlas, cols: IG, rows: IG, mode: 'color', renderOrder: 20 });
    this.itemBatch = new SpriteBatch({ name: 'items', capacity: 1024, atlas: this.colorAtlas, cols: IG, rows: IG, mode: 'color', renderOrder: 30 });
    this.fxAlpha = new SpriteBatch({ name: 'fxAlpha', capacity: 1500, atlas: this.maskAtlas, cols: G, rows: G, mode: 'mask', renderOrder: 35, core: 1, glow: 0.4 });
    this.fxAdd = new SpriteBatch({ name: 'fxAdd', capacity: 3000, atlas: this.maskAtlas, cols: G, rows: G, mode: 'mask', additive: true, renderOrder: 38, core: 1.6, glow: 1 });
    this.bulletBatch = new SpriteBatch({ name: 'bullets', capacity: 4096, atlas: this.maskAtlas, cols: G, rows: G, mode: 'mask', renderOrder: 40, core: 1.12, glow: 0.5 });
    this.topBatch = new SpriteBatch({ name: 'top', capacity: 64, atlas: this.maskAtlas, cols: G, rows: G, mode: 'mask', renderOrder: 60, core: 1.4, glow: 0.6 });
    this.optBatch = new SpriteBatch({ name: 'options', capacity: 32, atlas: this.colorAtlas, cols: IG, rows: IG, mode: 'color', additive: false, renderOrder: 25 });
    this.auraBatch = new SpriteBatch({ name: 'aura', capacity: 32, atlas: this.maskAtlas, cols: G, rows: G, mode: 'mask', additive: true, renderOrder: 15, core: 1, glow: 0.6 });
    scene.add(this.auraBatch.mesh);
    this.laserBatch = new SpriteBatch({ name: 'lasers', capacity: 128, atlas: this.maskAtlas, cols: G, rows: G, mode: 'mask', renderOrder: 39, core: 1.0, glow: 0.3 });
    for (const b of [this.shotBatch, this.itemBatch, this.fxAlpha, this.fxAdd, this.bulletBatch, this.topBatch, this.optBatch, this.laserBatch]) scene.add(b.mesh);
  }

  /** 明かりの色と強さ（ステージの時間帯に合わせる）。 */
  setMood({ hemiSky = 0xfff3e6, hemiGround = 0x5a4a6a, hemi = 1.25, key = 0xfff0dd, keyI = 1.7, rim = 0x9fc4ff, rimI = 0.9 } = {}) {
    this.hemi.color.set(hemiSky); this.hemi.groundColor.set(hemiGround); this.hemi.intensity = hemi;
    this.key.color.set(key); this.key.intensity = keyI;
    this.rim.color.set(rim); this.rim.intensity = rimI;
  }
}
