// 背景の 3D の世界。ステージごとの背景（src/world/stages/*.js）を切り替え、カメラを前へ進める。
//
// 背景のモジュールの形：
//   export default class Stage1World {
//     constructor(world)          world.scene に自分の group を足す。重いものはここで作る
//     enter()                     霧・空の色・明かり（world.setLook / field の setMood）を決める
//     update(dt, ctx)             ctx = { t（秒）, speed（進む速さの倍率）, boss（ボス戦中か）, spell（スペル中か） }
//                                 world.rig（カメラの位置・向き）を動かす
//     event(name)                 台本からの合図（'boss' でボスの場所に着く、など）。任意
//     spell(on, color)            スペルカードの背景を自分で出すとき（無ければ共通の魔法陣 spellBg.js）。任意
//     dispose()                   group を外し、作ったジオメトリ・材質・テクスチャを捨てる
//   }
// 明かり・霧・空はステージの group の中に入れる（scene に直接足さない。切り替えで残るため）。scene.fog と
// scene.background は enter() で設定してよい（切り替えのときに World が消す）。
// カメラの画角は Layout が決める（world.setFov(度)）。カメラを直接 lookAt せず、rig を通す（揺れを重ねるため）。
import * as THREE from 'three';
import { makeSpellBg } from './spellBg.js';

export class World {
  constructor(layout, renderer, field) {
    this.layout = layout;
    this.renderer = renderer;
    this.field = field;
    const scene = (this.scene = new THREE.Scene());
    scene.name = 'world';
    scene.background = new THREE.Color(0x101420);
    const cam = (this.camera = new THREE.PerspectiveCamera(50, 1, 1, 9000));
    cam.name = 'worldCamera';
    layout.addCamera(cam, 50);
    this.fov = 50;
    scene.add(cam); // カメラの子（スペルの背景）を描くため
    this.spellBg = makeSpellBg();
    cam.add(this.spellBg.mesh);
    this.spellOn = false;
    this.rig = { pos: new THREE.Vector3(0, 300, 0), yaw: 0, pitch: -0.9, roll: 0 };
    this.shakeAmp = 0;
    this.stage = null;
    this.stageId = null;
    this.t = 0;
    this.loaders = {};
  }

  /** 背景のモジュールを登録する（id → () => import(...)）。 */
  register(map) { Object.assign(this.loaders, map); }

  /** 背景のモジュールを先に読み込んでおく（そのあとの setStageNow は待たずに切り替えられる）。 */
  async preload(ids = Object.keys(this.loaders)) {
    this.classes ||= {};
    await Promise.all(ids.map(async (id) => {
      try { this.classes[id] = (await this.loaders[id]()).default; } catch (e) { console.warn('[world] 読み込めません:', id, e); }
    }));
  }

  /** 読み込み済みの背景にすぐ切り替える（ゲームの 1 コマの中から呼べる）。 */
  setStageNow(id) {
    const Cls = this.classes?.[id];
    if (!Cls) return false;
    if (this.stageId === id && this.stage) return true;
    this._swap(id);
    this.stage = new Cls(this);
    this.t = 0;
    this.stage.enter?.();
    return true;
  }

  _swap(id) {
    this.stage?.dispose?.();
    this.stage = null;
    this.stageId = id;
    this.spellBg.set(false);
    this.spellBg.uniforms.uA.value = 0;
    this.scene.fog = null;
  }

  async setStage(id) {
    if (this.stageId === id && this.stage) return this.stage;
    if (this.classes?.[id]) { this.setStageNow(id); return this.stage; }
    this.stage?.dispose?.();
    this.stage = null;
    this.stageId = id;
    this.spellBg.set(false);
    this.spellBg.uniforms.uA.value = 0;
    // 前の背景が残した明かり・霧を消す（ステージは自分の group の中に明かりを入れること）
    this.scene.fog = null;
    const load = this.loaders[id];
    if (!load) throw new Error('背景がありません: ' + id);
    const mod = await load();
    const Cls = mod.default;
    this.stage = new Cls(this);
    this.t = 0;
    this.stage.enter?.();
    return this.stage;
  }

  setFov(fov) { this.fov = fov; this.layout.setFov(this.camera, fov); }

  /** スペルカードの背景（ステージが spell(on, color) を持っていればそちらに任せる）。 */
  setSpell(on, color) {
    this.spellOn = !!on;
    if (this.stage?.spell) this.stage.spell(on, color);
    else this.spellBg.set(on, color);
  }

  /** 画面を揺らす（強さはドット相当）。 */
  shake(amount) { this.shakeAmp = Math.max(this.shakeAmp, amount); }

  event(name, arg) { this.stage?.event?.(name, arg); }

  update(dt, ctx = {}) {
    this.t += dt;
    this.stage?.update?.(dt, { t: this.t, speed: 1, ...ctx });
    this.spellBg.update(dt, this.fov);
    const r = this.rig, cam = this.camera;
    cam.position.copy(r.pos);
    cam.rotation.set(r.pitch, r.yaw, r.roll, 'YXZ');
    if (this.shakeAmp > 0.01) {
      const a = this.shakeAmp;
      cam.position.x += (Math.random() - 0.5) * a * 0.6;
      cam.position.y += (Math.random() - 0.5) * a * 0.6;
      this.shakeAmp *= Math.pow(0.02, dt);
    } else this.shakeAmp = 0;
  }
}
