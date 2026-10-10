// ゲームの本体：状態（タイトル・プレイ・一時停止…）、固定 60Hz の進行、ステージの台本、点数。
// 雛形の形を残している：async init()、STATES の表と setState()、step(dt)（描かない）、render(dt)、snapshot()。
import * as THREE from 'three';
import { TICK, DIFFS, HALF_H, HALF_W, PLAYER } from './config.js';
import { Rng } from '../core/rng.js';
import { events } from '../core/events.js';
import { createStore } from '../core/save.js';
import { settings } from '../core/settings.js';
import { t } from '../core/i18n.js';
import { FieldLayer } from './FieldLayer.js';
import { World } from '../world/World.js';
import { Bullets } from './Bullets.js';
import { PlayerShots, SHOT } from './PlayerShots.js';
import { Items, ITEM } from './Items.js';
import { Particles } from './Particles.js';
import { Tasks } from './Tasks.js';
import { Lasers } from './Lasers.js';
import { Portraits } from './Portraits.js';
import { makeBehaviors } from './danmaku.js';
import { TitleScene } from './TitleScene.js';
import { Debris } from './Debris.js';
import { Player } from './Player.js';
import { Enemy, KIND } from './Enemies.js';
import { Boss } from './Boss.js';
import { makeDanmaku } from './danmaku.js';
import { SHAPE, ICON } from './atlas.js';
import { STAGES } from './stages/index.js';
import { makeEnemyModel, preloadEnemyModels, warmEnemyModels } from '../chara/enemies.js';
import { makePlayerModel, makeBossModel } from '../chara/actors.js';

// 状態の表（雛形の約束）。title：タイトル ／ hud ／ touch ／ input：play・actions・menu ／ music ／ modal ／ duck
export const STATES = {
  title: { title: true, input: 'menu', music: 'title' },
  play: { hud: true, touch: true, input: 'play' },
  paused: { hud: true, input: 'menu', modal: 'pause', duck: true },
  gameover: { hud: true, input: 'menu', modal: 'gameover' },
  result: { input: 'menu', modal: 'result' },
  preview: { hud: true, input: 'menu' },   // 開発用：背景だけを動かして見る（__dev.preview）
};

const EXTENDS = [4e6, 10e6, 18e6, 28e6, 40e6];
// 記録の画面に並べるスペルカード（出てくる順）
const SPELL_LIST = ['spell.poko.mid', 'spell.poko.1', 'spell.poko.2', 'spell.poko.3', 'spell.suzu.mid', 'spell.suzu.1', 'spell.suzu.2', 'spell.suzu.3',
  'spell.tsukuyo.mid', 'spell.tsukuyo.1', 'spell.tsukuyo.2', 'spell.tsukuyo.3', 'spell.tsukuyo.4', 'spell.tsukuyo.5'];
const DIFF_SCORE = [0.5, 1, 1.2, 1.5];
// 楽曲視聴に並べる曲（流れる順）。ゲームの中で一度流れた曲だけ聴ける（難易度は問わない）
const TRACKS = ['title', 'st1', 'boss1', 'st2', 'boss2', 'st3', 'boss3', 'ending', 'gameover'];

export class Game {
  constructor({ renderer, input, audio, screens, touch, hud, layout }) {
    Object.assign(this, { renderer, input, audio, screens, touch, hud, layout });
    this.save = createStore('foxfire-kagura.save', {
      best: { easy: 0, normal: 0, hard: 0, lunatic: 0 },
      reached: { easy: 1, normal: 1, hard: 1, lunatic: 1 },
      cleared: { easy: false, normal: false, hard: false, lunatic: false },
      spells: {},   // スペル名 → [取得, 挑戦]
      music: {},    // 楽曲視聴で聴ける曲 → true
    }, 1);
    this.unlockMusicFromSave();
    audio.onMusic = (id) => this.hearMusic(id);
    this.state = 'title';
    this.time = 0;
    this.acc = 0;
    this.frame = 0;
    this.rng = new Rng(20261009);

    // 描画の層
    this.field = new FieldLayer();
    this.world = new World(layout, renderer, this.field);
    layout.addCamera(this.field.camera);
    renderer.setScene(this.world.scene, this.world.camera);
    renderer.setField(this.field.scene, this.field.camera);
    renderer.setLook({ exposure: 1.0, bloomStrength: 0.45, bloomRadius: 0.4, bloomThreshold: 0.92, vignette: 0.25, saturation: 1.08 });
    this.world.register({
      test: () => import('../world/stages/test.js'),
      title: () => import('../world/stages/title.js'),
      stage1: () => import('../world/stages/stage1.js'),
      stage2: () => import('../world/stages/stage2.js'),
      stage3: () => import('../world/stages/stage3.js'),
    });

    // 見た目のモデル（本物ができるまでは仮のもの）
    this.models = {
      make: (kind, def) => (kind.startsWith('girl:') ? makeBossModel(kind.slice(5)) : makeEnemyModel(kind, def)),
    };

    // 仕組み
    this.bullets = new Bullets();
    this.shots = new PlayerShots();
    this.items = new Items();
    this.fx = new Particles();
    this.lasers = new Lasers();
    this.debris = new Debris(this.field.scene);
    this.tasks = new Tasks();
    this.B = makeDanmaku(this);
    this.BEH = makeBehaviors(this);
    this.portraits = new Portraits(this);
    this.player = new Player(this, makePlayerModel());
    this.field.scene.add(this.player.model.root);
    this.enemies = [];
    this.boss = null;
    this.S = this.makeStageAPI();
    this.inp = { mx: 0, my: 0, dx: 0, dy: 0, shot: false, focus: false, bomb: false };
    this.flashV = 0;
    this.fadeV = 0;          // 暗転（0〜1）
    this.fadeTarget = 0;
    this.difficulty = 'normal';
    this.D = 1;
    this.stageNo = 0;
    this.resetScore();
  }

  get hiScore() { return this.save.data.best[this.difficulty] || 0; }

  async init() {
    await Promise.all([loadFonts(), this.world.preload()]);
    // 敵のモデル：形と顔を先に作り、シェーダーを 1 回描いてコンパイルしておく（最初に出たときに止まらないように）
    const kinds = Object.values(KIND);
    preloadEnemyModels(kinds);
    const done = warmEnemyModels(this.field.scene, kinds);
    this.renderer.render(1 / 60);
    done();
    this.world.setStageNow('title') || this.world.setStageNow('test');
    this.titleScene = new TitleScene(this.world);
    this.setState('title');
  }

  resetScore() {
    this.score = 0;
    this.graze = 0;
    this.pointValue = 10000;
    this.nextExtend = 0;
    this.continues = 0;
  }

  /** 状態を変える（雛形の約束）。 */
  setState(s) {
    const S = STATES[s];
    if (!S) throw new Error('状態がありません: ' + s);
    const prev = this.state;
    this.state = s;
    this.screens.showTitle(!!S.title);
    this.hud.show(!!S.hud);
    this.touch.setVisible(!!S.touch);
    this.input.mode = S.input || 'menu';
    if (!S.modal) this.screens.closeAll();
    else if (!this.screens.isOpen(S.modal)) this.screens.open(S.modal);
    if (S.music) this.audio.music(S.music);
    this.audio.duck(!!S.duck);
    this[`enter_${s}`]?.(prev);
    if (prev !== s) events.emit('state', { from: prev, to: s });
  }

  enter_paused() { this.audio.sfx('pause'); }
  enter_title() {
    this.hud.center('');
    const cleared = Object.values(this.save.data.cleared).some(Boolean);
    this.world.stage?.cleared?.(cleared);
    this.titleScene?.setVisible(true);
    this.player.model.root.visible = false;
    this.fadeV = 0; this.fadeTarget = 0;
  }
  enter_play(prev) { if (prev === 'title' || prev === 'result') this.titleScene?.setVisible(false); }

  /** はじめから（難易度・ステージ）。 */
  start(difficulty = this.difficulty, stage = 1, o = {}) {
    this.startAt = o.at || null;     // 開発用：'mid' / 'road2' / 'boss' から始める
    this.devPhase = o.phase ?? null; // 開発用：ボスのフェーズの番号から始める
    this.difficulty = DIFFS.includes(difficulty) ? difficulty : 'normal';
    this.D = DIFFS.indexOf(this.difficulty);
    this.resetScore();
    this.player.reset();
    this.touch.resetToggles?.();
    this.practice = o.practice ?? stage > 1;
    if (this.practice && stage > 1) this.player.power = Math.min(4, 1 + (stage - 1) * 1.25); // 練習：先のステージは強くして始める
    this.beginStage(stage);
    this.setState('play');
  }

  /** ステージを始める（台本を走らせる）。 */
  beginStage(n) {
    this.marks = [];
    this.pend = null;
    this.fadeTarget = 0;
    this.clearField();
    this.stageNo = n;
    this.world.setStageNow('stage' + n) || this.world.setStageNow('test');
    this.stageToken = { alive: true };
    const def = STAGES[n] || STAGES.test;
    this.grace = 20;
    this.tasks.add(def.script(this.S), this.stageToken, 'stage' + n);
  }

  clearField() {
    this.tasks.clear();
    for (const e of this.enemies) e.remove();
    this.enemies = [];
    this.boss = null;
    this.bullets.clear();
    this.lasers.clear();
    this.shots.clear();
    this.items.clear();
    this.fx.clear();
    this.debris.clear();
    this.hud.clearPopups();
    this.hud.center('');
    this.hud.dialogue(null);
    this.dialogueOpen = false;
    this.portraits.hideAll();
    this.player.x = 0;
    this.player.y = -HALF_H + 60;
  }

  // ---------------------------------------------------------------- 進行
  step(dt) {
    const input = this.input;
    input.update(dt);
    this.time += dt;
    this[`update_${this.state}`]?.(dt);
    this.audio.tick(dt);
    input.endFrame();
  }

  update_title(dt) {
    if (this.input.menu.back && this.screens.back()) this.audio.sfx('ui_back');
    this.world.update(dt, { speed: 0.6 });
    this.titleScene?.update(dt);
  }

  update_paused() {
    const input = this.input;
    if (input.menu.back || input.menu.start || input.pressed('pause')) {
      if (this.screens.top !== this.screens.modals.pause) { this.screens.back(); this.audio.sfx('ui_back'); }
      else this.setState('play');
    }
  }

  update_gameover() {}

  /** 開発用：背景を見る。o = { boss, spell, bullets（読みやすさを見るための弾）, speed } */
  async preview(id, o = {}) {
    this.clearField();
    this.stageNo = 0;
    await this.world.setStage(id);
    this.previewCtx = { boss: !!o.boss, spell: !!o.spell, speed: o.speed ?? 1 };
    this.previewBullets = o.bullets ?? true;
    this.world.setSpell(!!o.spell);
    this.player.reset();
    this.setState('preview');
    return id;
  }

  update_preview(dt) {
    this.acc += dt;
    let n = Math.floor((this.acc + TICK * 0.25) / TICK);
    if (n > 4) { n = 4; this.acc = 0; } else this.acc -= n * TICK;
    const COLORS = ['red', 'sky', 'yellow', 'green', 'purple', 'white', 'orange', 'pink'];
    const SH = [SHAPE.orb, SHAPE.rice, SHAPE.ball, SHAPE.kunai, SHAPE.star, SHAPE.pellet, SHAPE.ofuda, SHAPE.scale];
    for (let k = 0; k < n; k++) {
      this.frame++;
      if (this.previewBullets && this.frame % 20 === 0) {
        const j = Math.floor(this.frame / 20);
        this.B.ring(0, 140, 20, 1.8, j * 0.13, SH[j % SH.length], COLORS[j % COLORS.length]);
      }
      this.bullets.update({ x: 9999, y: 9999, r: 0, grazeR: 0, vulnerable: false });
      this.player.updateOptions();
      this.fx.update();
    }
    this.world.update(dt, this.previewCtx);
  }
  update_result() {}

  update_play(dt) {
    const I = this.input;
    if (I.pressed('pause') || I.menu.start) { this.setState('paused'); return; }
    // このフレームの入力（何コマ回しても、押した瞬間・指の動きは最初のコマだけ）
    let mx = I.move.x, my = I.move.y;
    const len = Math.hypot(mx, my);
    if (len > 0.25) { mx /= len; my /= len; } else { mx = my = 0; }
    const inp = this.inp;
    inp.mx = mx; inp.my = my;
    inp.shot = I.down('shot') || I.pressed('shot') || I.device === 'touch' || settings.autoShot === 'on';
    inp.focus = I.down('focus');
    inp.skip = I.down('skip');
    // 押した瞬間・指の動きは、コマが回るまでためておく（速い画面ではコマの回らないフレームがあるので、取りこぼさない）
    const pend = (this.pend ||= { bomb: false, confirm: false, dx: 0, dy: 0 });
    pend.bomb ||= I.pressed('bomb');
    pend.confirm ||= I.pressed('shot') || I.pressed('confirm');
    pend.dx += I.touchMove.x; pend.dy += I.touchMove.y;
    // 固定 60Hz：60Hz の画面なら 1 フレーム 1 コマ。速い画面では何フレームかに 1 回
    this.acc += dt;
    let n = Math.floor((this.acc + TICK * 0.25) / TICK);
    if (n > 4) { n = 4; this.acc = 0; } else this.acc -= n * TICK;
    for (let k = 0; k < n && this.state === 'play'; k++) {
      inp.bomb = pend.bomb; inp.confirm = pend.confirm; inp.dx = pend.dx; inp.dy = pend.dy;
      pend.bomb = pend.confirm = false; pend.dx = pend.dy = 0;
      if (this.bot) this.botInput?.(inp); // 開発用の自動プレイ（dev/bot.js）
      this.tick();
    }
    this.world.parallax = this.player.alive ? this.player.x / HALF_W : 0;
    this.world.update(dt, { boss: !!this.boss?.alive, spell: !!this.boss?.phase?.spell });
  }

  /** 1 コマ（1/60 秒）。 */
  tick() {
    this.frame++;
    if (this.grace > 0) this.grace--;
    const p = this.player;
    this.tasks.tick();
    p.tick(this.inp);
    for (const e of this.enemies) if (e.alive) e.tick();
    this.shots.update(this.enemies, (e, dmg, x, y, type) => this.onShotHit(e, dmg, x, y, type));
    const r = this.bullets.update(p);
    if (r.grazes) {
      this.graze += r.grazes;
      this.pointValue = 10000 + Math.floor(this.graze / 5) * 100;
      this.addScore(r.grazes * 200);
      this.audio.sfx('graze', { minGap: 0.04 });
      for (let k = 0; k < Math.min(3, r.grazes); k++) this.fx.graze((p.x + r.gx) / 2, (p.y + r.gy) / 2);
    }
    if (r.hit >= 0) p.hit();
    const lr = this.lasers.update(p);
    if (lr.grazes) { this.graze += lr.grazes; this.addScore(lr.grazes * 200); this.audio.sfx('graze', { minGap: 0.04 }); }
    if (lr.hit) p.hit();
    if (p.vulnerable) {
      for (const e of this.enemies) {
        if (!e.alive || e.z < -5) continue;
        const dx = e.x - p.x, dy = e.y - p.y, rr = e.bodyR + p.r;
        if (dx * dx + dy * dy < rr * rr) { p.hit(); break; }
      }
    }
    this.items.update(p, (type, auto, y) => this.pickItem(type, auto, y));
    this.fx.update();
    this.debris.update();
    this.portraits.update(TICK);
    if (this.frame % 30 === 0) this.enemies = this.enemies.filter((e) => e.alive);
    this.hud.tickPopups();
    if (this.flashV > 0) this.flashV = Math.max(0, this.flashV - 0.04);
    if (this.fadeV !== this.fadeTarget) this.fadeV += Math.sign(this.fadeTarget - this.fadeV) * Math.min(Math.abs(this.fadeTarget - this.fadeV), 1 / 40);
  }

  canShoot() { return !this.dialogueOpen && this.grace <= 0; }

  onShotHit(e, dmg, x, y) {
    let d = dmg;
    if (e.boss && this.player.bombT > 0) d *= 0.3;
    e.damage(d);
    this.addScore(10);
    if (Math.random() < 0.35) this.fx.hit(x, y + 6, e.boss ? 'white' : 'gold');
    if (!e.boss) this.audio.sfx('hit', { minGap: 0.06 });
  }

  /** ボムの間：範囲の敵を焼く。 */
  damageCircle(x, y, r, dmg) {
    for (const e of this.enemies) {
      if (!e.alive || !e.hittable) continue;
      const dx = e.x - x, dy = e.y - y, rr = r + e.r;
      if (dx * dx + dy * dy < rr * rr) e.damage(e.boss ? dmg * (e.phase?.spell ? 0.25 : 0.5) : dmg);
    }
  }

  /** 弾を全部消す。toItems：星のアイテムに変える（ボム・フェーズの終わり）。 */
  cancelBullets(toItems = true, collect = false) {
    this.lasers.cancel();
    this.bullets.cancelAll((x, y) => {
      this.fx.vanish(x, y, 'white');
      if (toItems && this.items.top < 900) this.items.spawn(x, y, ITEM.star, { vx: 0, vy: 1.2, home: collect ? 2 : 0 });
    });
  }

  addScore(n) {
    this.score += Math.floor((n * DIFF_SCORE[this.D]) / 10) * 10;
    while (this.nextExtend < EXTENDS.length && this.score >= EXTENDS[this.nextExtend]) {
      this.nextExtend++;
      this.extend();
    }
  }

  extend() {
    this.player.lives = Math.min(8, this.player.lives + 1);
    this.audio.sfx('extend');
    this.hud.popup(t('msg.extend'), this.player.x, this.player.y + 40, 'big');
  }

  pickItem(type, auto, y) {
    const p = this.player;
    const before = p.powerLevel;
    switch (type) {
      case ITEM.power: if (p.power < 4) p.power = Math.min(4, p.power + 0.05); else this.addScore(1000); this.addScore(10); break;
      case ITEM.bigpower: p.power = Math.min(4, p.power + 1); this.addScore(1000); break;
      case ITEM.fullpower: p.power = 4; break;
      case ITEM.point: {
        const k = auto ? 1 : Math.max(0.25, Math.min(1, (y + HALF_H) / (HALF_H * 1.5)));
        this.addScore(Math.floor((this.pointValue * k) / 10) * 10);
        break;
      }
      case ITEM.star: this.addScore(200 + Math.floor(this.graze / 10) * 10); break;
      case ITEM.bomb: p.bombs = Math.min(8, p.bombs + 1); this.audio.sfx('bombget'); break;
      case ITEM.life: this.extend(); break;
    }
    if (p.powerLevel > before) {
      this.audio.sfx('powerup');
      this.hud.popup(p.power >= 4 ? t('msg.fullPower') : t('msg.powerUp'), p.x, p.y + 30, 'power');
    }
    this.audio.sfx('item', { minGap: 0.05 });
  }

  onBomb() {
    this.audio.sfx('bomb');
    this.portraits.cutIn('l', 'inaho');
    this.world.shake(8);
    this.flash(0.5, '#bfe6ff');
    this.cancelBullets(true);
  }

  onPlayerDeath() {
    this.world.shake(10);
    this.touch.resetToggles?.();
  }

  onGameOver() {
    this.setState('gameover');
  }

  declareSpell(boss, p) {
    this.audio.sfx('spell');
    this.flash(0.35, '#ffffff');
    if (boss.def.portrait) this.portraits.cutIn('r', boss.def.portrait);
    const rec = (this.save.data.spells[p.name] ||= [0, 0]);
    rec[1]++;
    this.save.save();
  }

  onSpellCapture(boss, p, bonus) {
    this.addScore(bonus);
    this.audio.sfx('capture');
    this.hud.popup(t('msg.spellBonus'), 0, 120, 'bonus');
    this.hud.popup('+' + Math.floor(bonus * DIFF_SCORE[this.D]).toLocaleString('en-US'), 0, 96, 'bonus-n');
    const rec = (this.save.data.spells[p.name] ||= [0, 0]);
    rec[0]++;
    this.save.save();
  }

  /** 曲を流し、曲名を少しの間だけ出す（東方の「♪」のように）。 */
  playMusic(id) {
    if (this.audio.songId === id) return;
    this.audio.music(id);
    const key = 'music.' + id;
    if (t(key) !== key) this.hud.music(t(key));
  }

  /** スペルの取得の記録（取得 / 挑戦）。 */
  spellRecord(name) { return this.save.data.spells[name] || [0, 0]; }

  onSpellFail() {
    this.hud.popup(t('msg.bonusFailed'), 0, 110, 'fail');
  }

  flash(v, color = '#ffffff') {
    this.flashV = Math.max(this.flashV, v);
    this.renderer.setFx({ flashColor: color });
  }

  /** 敵を出す。 */
  spawnEnemy(kind, x, y, script) {
    const def = typeof kind === 'string' ? KIND[kind] : kind;
    const e = new Enemy(this, def, x, y);
    this.enemies.push(e);
    if (script) this.tasks.add(script(e, this.S), e, 'enemy');
    return e;
  }

  spawnBoss(def) {
    const b = new Boss(this, def);
    this.enemies.push(b);
    this.boss = b;
    return b;
  }

  // ---------------------------------------------------------------- ステージの台本から使うもの
  makeStageAPI() {
    const G = this;
    return {
      G,
      get D() { return G.D; },
      get B() { return G.B; },
      get player() { return G.player; },
      SHAPE, KIND, ITEM,
      rand: (lo, hi) => G.rng.range(lo, hi),
      t,
      enemy: (kind, x, y, script) => G.spawnEnemy(kind, x, y, script),
      /** ボス戦（登場 → 会話 → フェーズ → 撃破 → 会話）。 */
      *boss(def, { before, after } = {}) {
        (G.marks ||= []).push([def.midboss ? 'midboss' : 'boss', G.frame]);
        const b = G.spawnBoss(def);
        if (def.music) G.playMusic(def.music);
        if (def.epithet) G.hud.bossTitle(t(def.epithet), t(def.nameKey));
        yield* b.enter(0, 120);
        if (before) yield* G.S.dialogue(before);
        yield* b.fight();
        if (after) yield* G.S.dialogue(after);
        if (!def.midboss) {
          // 去っていく
          for (let i = 0; i < 60; i++) { b.y += 3 + i * 0.1; yield 1; }
          b.remove();
        }
        G.boss = null;
      },
      /** 会話。lines = [{ who: 'inaho' | 'boss', key: 'dlg.xxx', face: { eyes, mouth, brows } }]。決定で次へ、早送りで飛ばす。 */
      *dialogue(lines) {
        G.dialogueOpen = true;
        const bdef = G.boss?.def;
        G.portraits.open(bdef?.portrait);
        for (const L of lines) {
          const side = L.who === 'inaho' ? 'l' : 'r';
          const speaker = L.who === 'inaho' ? 'name.inaho' : bdef?.nameKey;
          const text = t(L.key);
          G.hud.dialogue({ speaker, text, side });
          G.portraits.speak(side, L.face, Math.min(110, 12 + text.length * 3));
          if (L.who !== 'inaho' && L.pose && G.boss) G.boss.pose = L.pose;
          yield 10;
          while (!G.inp.confirm && !G.inp.skip) yield 1;
          G.audio.sfx('dlg', { minGap: 0.05 });
          yield G.inp.skip ? 2 : 1;
        }
        if (G.boss) G.boss.pose = null;
        G.portraits.close();
        G.hud.dialogue(null);
        G.dialogueOpen = false;
        G.grace = 10;
      },
      music: (id) => G.playMusic(id),
      /** 台本の区切り。開発用に途中から始めるとき（G.startAt）は、そこまでの区切りを飛ばす。 */
      section(name) {
        if (G.startAt && G.startAt !== name) return false;
        G.startAt = null;
        (G.marks ||= []).push([name, G.frame]);
        return true;
      },
      /** 開発用の目印（いつ何が起きたか。__dev.game.marks で見る）。 */
      mark(name) { (G.marks ||= []).push([name, G.frame]); },
      /** 波を並べて走らせる（待たない）。 */
      par(gen) { return G.tasks.add(gen, G.stageToken, 'par'); },
      /** 背景への合図（'boss' など）。 */
      world: (name, arg) => G.world.event(name, arg),
      get BEH() { return G.BEH; },
      get rng() { return G.rng; },
      title(n) {
        G.hud.center(t(`stage${n}.title`), t(`stage${n}.sub`));
        G.tasks.add((function* () { yield 200; G.hud.center(''); })(), G.stageToken);
      },
      *clear({ final = false } = {}) {
        yield 60;
        G.items.collectAll();
        const bonus = 1000000 * G.stageNo + Math.floor(G.player.power * 100) * 1000 + G.graze * 100;
        G.addScore(bonus);
        G.hud.center(t('msg.stageClear'), t('msg.clearBonus', { n: Math.floor(bonus * DIFF_SCORE[G.D]).toLocaleString('en-US') }));
        G.audio.sfx('clear');
        yield 200;
        if (final && !G.practice) { G.hud.center(''); return; }
        G.fadeTarget = 1;
        yield 45;
        G.hud.center('');
        G.onStageClear();
      },
    };
  }

  onStageClear() {
    const d = this.difficulty;
    const next = this.stageNo + 1;
    this.save.data.reached[d] = Math.max(this.save.data.reached[d] || 1, Math.min(3, next));
    this.save.save();
    if (STAGES[next] && !this.practice) this.beginStage(next);
    else this.finish(next > 3);
  }

  /** タイトルへもどる。 */
  toTitle() {
    this.clearField();
    this.player.reset();
    this.stageNo = 0;
    this.world.setStageNow('title') || this.world.setStageNow('test');
    this.setState('title');
  }

  /** コンティニュー：点数は 0 から（最後の桁がコンティニューの回数）。残機とボムを戻して続ける。 */
  continueGame() {
    this.continues++;
    this.score = Math.min(9, this.continues);
    this.nextExtend = 0;
    const p = this.player;
    p.lives = PLAYER.startLives;
    p.bombs = PLAYER.startBombs;
    p.state = 'dead';
    p.timer = 1;
    this.setState('play');
    if (this.musicBefore) { this.audio.stopMusic(0.2); this.audio.music(this.musicBefore); }
  }

  enter_gameover() {
    // 短い曲を流す（コンティニューしたら、それまでの曲に戻す）
    this.musicBefore = this.audio.songId || this.musicBefore;
    this.audio.stopMusic(0.3);
    this.audio.music('gameover', { fadeIn: 0.05 });
    const el = this.screens.modals.gameover.querySelector('.gameover-note');
    el.textContent = this.practice ? '' : t('gameover.note', { n: this.continues });
    this.screens.modals.gameover.querySelector('[data-act="continueGame"]').classList.toggle('hidden', !!this.practice);
    if (this.score > (this.save.data.best[this.difficulty] || 0) && !this.practice && !this.continues) {
      this.save.data.best[this.difficulty] = this.score;
      this.save.save();
    }
  }

  enter_result() {
    this.clearField();
    this.world.setStageNow('title');
    this.titleScene?.setVisible(true);
    this.fadeV = 0; this.fadeTarget = 0;
    const m = this.screens.modals.result;
    const cleared = this.lastCleared;
    m.querySelector('.result-title').textContent = cleared ? t('result.allClear') : t('result.title');
    const rows = [
      [t('diff.title'), t('diff.' + this.difficulty)],
      [t('hud.score'), this.score.toLocaleString('en-US')],
      [t('hud.hiscore'), this.hiScore.toLocaleString('en-US')],
      [t('hud.graze'), this.graze.toLocaleString('en-US')],
      [t('result.continues'), String(this.continues)],
    ];
    m.querySelector('.result-list').innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    this.audio.music('title');
  }

  /** 記録の画面：難易度ごとのハイスコアと、スペルカードの取得（出会っていないものは ？？？）。 */
  syncRecords() {
    const body = this.screens.modals.records.querySelector('.rec-body');
    const sv = this.save.data;
    const fmt = (n) => Math.floor(n).toLocaleString('en-US');
    let html = '<dl class="rec-best">';
    for (const d of DIFFS) html += `<dt>${t('diff.' + d)}${sv.cleared[d] ? ' <span class="clear">★</span>' : ''}</dt><dd>${fmt(sv.best[d] || 0)}</dd>`;
    html += '</dl><h3>' + t('records.spells') + '</h3><ul class="rec-spells">';
    for (const name of SPELL_LIST) {
      const r = sv.spells[name];
      html += r ? `<li><span>${t(name)}</span><b>${r[0]}/${r[1]}</b></li>` : `<li class="unknown"><span>？？？</span><b>0/0</b></li>`;
    }
    body.innerHTML = html + '</ul>';
  }

  /** 曲が流れたら、楽曲視聴で聴けるようにする。 */
  hearMusic(id) {
    const m = this.save.data.music;
    if (!TRACKS.includes(id) || m[id]) return;
    m[id] = true;
    this.save.save();
  }

  /** 楽曲視聴ができる前の記録からも解放する（たどり着いたステージ・倒したボス・クリア）。
   *  reached の既定値は 1 なので、1 のままなら遊んだかどうか分からない。2 以上のときだけ見る */
  unlockMusicFromSave() {
    const sv = this.save.data;
    const m = sv.music;
    const reached = Math.max(1, ...Object.values(sv.reached));
    for (let n = 1; reached > 1 && n <= reached; n++) {
      m['st' + n] = true;
      if (n > 1) m['boss' + (n - 1)] = true;
    }
    if (Object.values(sv.cleared).some(Boolean)) m.boss3 = m.ending = true;
  }

  /** 楽曲視聴の画面：聴いた曲は曲名と流れる場面、まだの曲は ？？？。流している曲に印を付ける。 */
  syncMusicRoom() {
    const list = this.screens.modals.music.querySelector('.mr-list');
    const heard = this.save.data.music;
    const cur = this.musicRoomTrack;
    list.innerHTML = TRACKS.map((id, i) => {
      const no = String(i + 1).padStart(2, '0');
      if (!heard[id]) return `<button class="mr-track locked" disabled><span class="mr-no">${no}</span><span class="mr-name">？？？</span></button>`;
      return `<button data-act="track" data-track="${id}" class="mr-track${id === cur ? ' playing' : ''}"><span class="mr-no">${no}</span>`
        + `<span class="mr-name">${t('music.' + id)}</span><small class="mr-scene">${t('musicroom.scene.' + id)}</small></button>`;
    }).join('');
  }

  /** 楽曲視聴で曲を流す（流している曲をもう一度選ぶと、頭から）。 */
  playTrack(id) {
    if (!TRACKS.includes(id) || !this.save.data.music[id]) return;
    this.audio.stopMusic(0.25);
    this.audio.music(id, { fadeIn: 0.05 });
    this.musicRoomTrack = id;
    for (const b of this.screens.modals.music.querySelectorAll('.mr-track')) b.classList.toggle('playing', b.dataset.track === id);
  }

  /** 楽曲視聴を閉じたら、タイトルの曲に戻す。 */
  closeMusicRoom() {
    if (!this.musicRoomTrack) return;
    this.musicRoomTrack = null;
    if (this.state === 'title') { this.audio.stopMusic(0.4); this.audio.music('title'); }
  }

  /** 練習の画面：行ったことのあるステージだけ選べる。 */
  syncPracticeMenu() {
    const m = this.screens.modals.practice;
    const sel = m.querySelector('[data-practice-diff]');
    if (!sel.dataset.bound) {
      sel.dataset.bound = '1';
      sel.value = this.difficulty;
      sel.addEventListener('change', () => this.syncPracticeMenu());
    }
    const reached = this.save.data.reached[sel.value] || 1;
    for (const b of m.querySelectorAll('[data-act="pstage"]')) b.disabled = +b.dataset.stage > reached;
  }

  /** ゲームの終わり（全クリア・練習の終わり）。 */
  finish(cleared) {
    const d = this.difficulty;
    this.lastCleared = cleared;
    if (cleared && !this.practice && !this.continues) this.save.data.cleared[d] = true;
    if (this.score > (this.save.data.best[d] || 0) && !this.practice) this.save.data.best[d] = this.score;
    this.save.save();
    this.setState('result');
  }

  // ---------------------------------------------------------------- 描画
  render(dt) {
    this.player.syncModel(dt);
    for (const e of this.enemies) e.sync(dt);
    const F = this.field;
    this.bullets.render(F.bulletBatch);
    this.lasers.render(F.laserBatch);
    this.shots.render(F.shotBatch);
    this.items.render(F.itemBatch);
    this.fx.render(F.fxAdd, F.fxAlpha);
    this.debris.render();
    this.renderPlayerFx();
    this.renderer.setFx({ time: this.time, flash: this.flashV, fade: this.fadeV });
    if (this.state !== 'title') this.hud.update(this);
    this.renderer.render(dt);
  }

  /** 子機（狐火）と、低速のときの当たり判定の印。ボスの足もとの魔法陣。 */
  renderPlayerFx() {
    const F = this.field, p = this.player;
    F.auraBatch.begin();
    const b = this.boss;
    if (b?.alive && b.showBar && b.z > -50) {
      const c = b.phase?.spell ? [1, 0.45, 0.7] : [0.6, 0.75, 1];
      const k = b.phaseActive ? 1 : 0.5;
      F.auraBatch.push(b.x, b.y - 6, this.time * 0.8, 120, 120, SHAPE.p_ring, c[0], c[1], c[2], 0.34 * k);
      F.auraBatch.push(b.x, b.y - 6, -this.time * 1.3, 88, 88, SHAPE.p_ring, c[0], c[1], c[2], 0.26 * k);
      F.auraBatch.push(b.x, b.y - 6, this.time * 2.0, 70, 70, SHAPE.star, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.18 * k);
    }
    F.auraBatch.end();
    F.optBatch.begin();
    F.topBatch.begin();
    if (p.alive && this.state !== 'title' && this.state !== 'result') {
      const fl = 1 + Math.sin(this.time * 18) * 0.08;
      for (const o of p.opts) F.optBatch.push(p.x + o.x, p.y + o.y, 0, 14 * fl, 17 * fl, ICON.option, 1, 1, 1, 0.95);
      if (p.focusT > 0) {
        const a = p.focusT;
        F.topBatch.push(p.x, p.y, this.time * 2, 64, 64, SHAPE.p_ring, 1, 0.55, 0.65, 0.5 * a);
        F.topBatch.push(p.x, p.y, -this.time * 3, 48, 48, SHAPE.p_ring, 0.55, 0.75, 1, 0.4 * a);
        F.topBatch.push(p.x, p.y, 0, 9, 9, SHAPE.hitbox, 1, 0.25, 0.3, a);
      }
    }
    F.optBatch.end();
    F.topBatch.end();
  }

  /** window.__dev.state() に出す値。 */
  snapshot() {
    const p = this.player;
    return {
      state: this.state, difficulty: this.difficulty, stage: this.stageNo, score: this.score, graze: this.graze,
      player: { x: +p.x.toFixed(1), y: +p.y.toFixed(1), state: p.state, lives: p.lives, bombs: p.bombs, power: +p.power.toFixed(2), invuln: p.invuln },
      bullets: this.bullets.count, enemies: this.enemies.filter((e) => e.alive).length, items: this.items.top,
      boss: this.boss?.alive ? { phase: this.boss.phaseIndex, hp: Math.round(this.boss.hp), time: +this.boss.timeLeft.toFixed(1) } : null,
      frame: this.frame,
    };
  }
}


/** 字体を読み込む（オフラインでも止まらないよう、長く待たない）。 */
async function loadFonts() {
  if (!document.fonts) return;
  const want = ['700 16px "Zen Maru Gothic"', '700 16px "Shippori Mincho B1"'];
  await Promise.race([
    Promise.allSettled(want.map((f) => document.fonts.load(f, 'あ狐A'))),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
}
