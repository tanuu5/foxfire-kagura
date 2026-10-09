// 確認台のアダプター：道中の敵（src/chara/enemies.js）。
//
// mode：KIND の種類ごとに 1 体（どれも同じ大きさに拡大して見せる）。lineup は全種類を本当の大きさの比で 2 段に並べる。
// light：work はフィールドの明かり（FieldLayer の hemisphere・key・rim をそのまま借りる）。トーンマッピングはゲームと同じ ACES。
// opts：move（左右に動く＝facing）、flash（当たり続ける）、weak（体力が少ない：怒る・あせる顔）、▶ hit（1 回当てる）。
//
//   viewer.html?m=enemies&mode=lantern&light=work
//   ゲームの中と同じ画素の大きさで見る：lineup を front で 560 × 560 に撮ると、1 ドットがおよそ 1.4 px（720p のゲーム画面と同じ）。
//   輪郭線の太さは画面の上で一定なので、拡大した 1 体の見え方では細く見える（ゲームの中では 1 ドットほど）。
import * as THREE from 'three';
import { makeEnemyModel } from '../../src/chara/enemies.js';
import { KIND } from '../../src/game/Enemies.js';
import { FieldLayer } from '../../src/game/FieldLayer.js';

const SIZE = 40;              // 1 体を見せるときの大きさ（ドット）：r の 2.3 倍をこの大きさにそろえる
const NAMES = Object.keys(KIND);
const SLOT = 64;              // lineup の 1 マス（ドット）
const COLS = 5;

function fakeEnemy(def) {
  const hp = def.hp ?? 20;
  return { x: 0, y: 0, z: 0, t: 0, flash: 0, flashT: 0, facing: 0, hp, maxHp: hp, alive: true, def };
}

export default {
  title: 'Enemies（道中の妖怪）',

  create() {
    const root = new THREE.Group();
    root.name = 'enemies';
    const solo = {};
    NAMES.forEach((name, i) => {
      const def = KIND[name];
      const m = makeEnemyModel(def.model, def, { seed: 11 + i });
      const wrap = new THREE.Group();
      wrap.name = name;
      wrap.scale.setScalar(SIZE / (2.3 * def.r));
      wrap.add(m.root);
      root.add(wrap);
      solo[name] = { m, e: fakeEnemy(def), wrap };
    });
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const h = Math.max(size.y, size.x * 0.8, size.z * 0.8);

    // lineup：本当の大きさの比で、確認台の枠の幅に収まるように（枠を決める 1 体ずつの大きさは変えない）
    const line = new THREE.Group();
    line.name = 'lineup';
    const rows = Math.ceil(NAMES.length / COLS);
    line.scale.setScalar((h * 1.2) / (COLS * SLOT));
    line.position.copy(c);
    const lineItems = NAMES.map((name, i) => {
      const def = KIND[name];
      const m = makeEnemyModel(def.model, def, { seed: 101 + i });
      m.root.position.set(((i % COLS) - (COLS - 1) / 2) * SLOT, ((rows - 1) / 2 - Math.floor(i / COLS)) * SLOT, 0);
      line.add(m.root);
      return { m, e: fakeEnemy(def) };
    });
    line.visible = false;
    root.add(line);

    // ゲームの Enemy と同じ値を作って渡す（flash は 1/60 秒ごとに 1 ずつ減る）
    const step = (it, dt, ctx) => {
      const e = it.e;
      e.t += dt * 60;
      e.facing = ctx.toggles.move ? Math.sin(ctx.time * 1.4) * 3.2 : 0;
      if (ctx.toggles.flash) e.flashT = 3 / 60;
      e.flash = e.flashT > 0 ? Math.ceil(e.flashT * 60 - 1e-6) : 0;
      e.flashT = Math.max(0, e.flashT - dt);
      e.hp = ctx.toggles.weak ? e.maxHp * 0.2 : e.maxHp;
      it.m.update(dt, e);
    };
    const all = [...Object.values(solo), ...lineItems];

    return {
      root,
      update(dt, ctx) {
        for (const name of NAMES) solo[name].wrap.visible = ctx.mode === name;
        line.visible = ctx.mode === 'lineup';
        if (ctx.mode === 'lineup') for (const it of lineItems) step(it, dt, ctx);
        else if (solo[ctx.mode]) step(solo[ctx.mode], dt, ctx);
      },
      hit() { for (const it of all) it.e.flashT = 3 / 60; },
      dispose() { for (const it of all) it.m.dispose(); },
    };
  },

  modes: [...NAMES, 'lineup'],

  toggles: {
    move: { on: false },
    flash: { on: false },
    weak: { on: false },
  },

  actions: { hit: (m) => m.hit() },

  // ゲームと同じ見た目：ACES のトーンマッピング（src/core/Renderer.js と同じ）
  setup({ THREE: T, renderer }) { renderer.toneMapping = T.ACESFilmicToneMapping; },

  // フィールドの明かりそのもの（FieldLayer を 1 つ作って、明かりだけを借りる）
  lights({ THREE: T }) {
    const F = new FieldLayer();
    const g = new T.Group();
    g.name = 'fieldLights';
    for (const l of [F.hemi, F.key, F.rim]) { F.scene.remove(l); g.add(l); }
    return g;
  },
  lightsBackground: '#2b2433',
};
