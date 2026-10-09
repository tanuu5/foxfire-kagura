// 仮の背景：夕暮れの地面に鳥居の列が並び、前へ進む。本物の背景ができるまでの確認用。
import * as THREE from 'three';
import { makeSky } from '../sky.js';

export default class TestWorld {
  constructor(world) {
    this.world = world;
    const g = (this.group = new THREE.Group());
    g.name = 'testWorld';
    world.scene.add(g);
    this.sky = makeSky({ top: 0x2a2f6a, horizon: 0xff9a62, bottom: 0x3a2030, sunDir: [0.2, 0.08, -1], stars: 0.6 });
    g.add(this.sky.mesh);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: 0x3a4a3a }));
    ground.rotation.x = -Math.PI / 2;
    ground.name = 'ground';
    g.add(ground);
    this.ground = ground;
    // 鳥居（柱 2 本と笠木）を並べる
    const red = new THREE.MeshLambertMaterial({ color: 0xd8402a });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a1a1a });
    const torii = new THREE.Group();
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 40, 10), red); p.position.set(s * 16, 20, 0); torii.add(p); }
    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(46, 4, 5), dark); kasagi.position.y = 42; torii.add(kasagi);
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(38, 3, 3), red); nuki.position.y = 34; torii.add(nuki);
    this.toriis = [];
    for (let i = 0; i < 60; i++) {
      const t = torii.clone();
      t.position.set(Math.sin(i * 0.2) * 30, 0, -i * 40);
      g.add(t);
      this.toriis.push(t);
    }
    // 木（円すい）
    const treeGeo = new THREE.ConeGeometry(14, 60, 7);
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x1f3a2a });
    const trees = new THREE.InstancedMesh(treeGeo, treeMat, 400);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 400; i++) {
      const side = i % 2 ? 1 : -1;
      m.makeTranslation(side * (70 + Math.random() * 300), 30, -Math.random() * 2400);
      trees.setMatrixAt(i, m);
    }
    trees.name = 'trees';
    g.add(trees);
    this.trees = trees;
  }

  enter() {
    const w = this.world;
    w.scene.fog = new THREE.Fog(0x8a5a6a, 200, 1500);
    w.scene.background = new THREE.Color(0x2a2f6a);
    this.group.add(new THREE.HemisphereLight(0xffd0b0, 0x303050, 1.2));
    const sun = new THREE.DirectionalLight(0xffb070, 2);
    sun.position.set(0.3, 0.3, -1);
    this.group.add(sun);
    w.setFov(52);
    w.rig.pos.set(0, 260, 200);
    w.rig.pitch = -0.95;
  }

  update(dt, ctx) {
    const w = this.world;
    w.rig.pos.z -= 60 * dt * (ctx.speed ?? 1);
    this.sky.mesh.position.copy(w.rig.pos);
    this.sky.uniforms.uTime.value = ctx.t;
    this.ground.position.set(w.rig.pos.x, 0, w.rig.pos.z - 1200);
    // 後ろに行った鳥居と木を前へ回す
    for (const t of this.toriis) if (t.position.z > w.rig.pos.z + 200) t.position.z -= 60 * 40;
    this.trees.position.z = Math.floor((w.rig.pos.z + 200) / 2400) * 2400;
  }

  dispose() { this.group.removeFromParent(); }
}
