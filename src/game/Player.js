// 自機（いなほ）：移動・低速・ショット・ボム・被弾と復帰。
// 見た目（3D モデル）は model に任せる（update(dt, look) と root を持つもの）。ここはゲームの決まりだけ。
import { HALF_W, HALF_H, PLAYER } from './config.js';
import { SHOT } from './PlayerShots.js';
import { ITEM } from './Items.js';
import { SHAPE } from './atlas.js';
import { clamp } from '../core/math.js';

// 低速のときの子機（狐火）の並び（自機からのずれ）。パワー 1〜4
const FOCUS_SLOTS = [
  [[0, 26]],
  [[-9, 24], [9, 24]],
  [[-14, 18], [0, 28], [14, 18]],
  [[-8, 26], [8, 26], [-20, 16], [20, 16]],
];

export class Player {
  constructor(G, model) {
    this.G = G;
    this.model = model;
    this.reset();
  }

  reset(keepStock = false) {
    this.x = 0;
    this.y = -HALF_H + 60;
    this.state = 'play';     // play | dying | dead | respawn
    this.timer = 0;
    this.invuln = 0;
    this.focus = false;
    this.focusT = 0;          // 0〜1（低速の見た目の切り替え）
    this.shotT = 0;
    this.bombT = 0;           // ボムの残りコマ
    this.vx = 0;
    if (!keepStock) {
      this.power = 1;
      this.lives = PLAYER.startLives;
      this.bombs = PLAYER.startBombs;
    }
    this.opts = [];           // 子機の位置（ドット、自機からのずれ）
    this.optAngle = 0;
    this.hitThisLife = false;
    this.bombedThisPhase = false;
    this.deathsThisPhase = 0;
  }

  get alive() { return this.state === 'play' || this.state === 'respawn'; }
  get vulnerable() { return this.state === 'play' && this.invuln <= 0; }
  get powerLevel() { return Math.max(1, Math.min(4, Math.floor(this.power + 1e-6))); }
  get r() { return PLAYER.hitR; }
  get grazeR() { return PLAYER.grazeR; }

  /** 1 コマ。inp = { mx, my, dx, dy（タッチの相対移動・ドット）, shot, focus, bomb（押した瞬間）} */
  tick(inp) {
    const G = this.G;
    if (this.invuln > 0) this.invuln--;
    if (this.bombT > 0) this.bombT--;

    if (this.state === 'dying') {
      // 決死：被弾してから少しの間にボムを押せば助かる
      if (inp.bomb && this.bombs > 0) { this.state = 'play'; this.useBomb(true); }
      else if (--this.timer <= 0) this.die();
      return;
    }
    if (this.state === 'dead') {
      if (--this.timer <= 0) {
        if (this.lives < 0) { G.onGameOver(); return; }
        this.state = 'respawn';
        this.timer = 40;
        this.x = 0;
        this.y = -HALF_H - 30;
        this.invuln = PLAYER.respawnInvuln;
      }
      return;
    }
    if (this.state === 'respawn') {
      this.y += (-HALF_H + 64 - this.y) * 0.12;
      if (--this.timer <= 0) this.state = 'play';
    }

    // 移動
    this.focus = !!inp.focus;
    this.focusT = clamp(this.focusT + (this.focus ? 0.15 : -0.15), 0, 1);
    if (this.state === 'play') {
      const sp = this.focus ? PLAYER.focusSpeed : PLAYER.speed;
      let mx = inp.mx, my = inp.my;
      const len = Math.hypot(mx, my);
      if (len > 1) { mx /= len; my /= len; }
      let dx = mx * sp, dy = my * sp;
      // タッチ：指の動きをそのまま（速すぎるときだけ抑える）
      if (inp.dx || inp.dy) {
        const lim = PLAYER.speed * 2.2;
        const l = Math.hypot(inp.dx, inp.dy);
        const k = l > lim ? lim / l : 1;
        dx += inp.dx * k; dy += inp.dy * k;
      }
      this.vx = dx;
      const m = PLAYER.margin;
      this.x = clamp(this.x + dx, -HALF_W + m, HALF_W - m);
      this.y = clamp(this.y + dy, -HALF_H + m + 6, HALF_H - m - 10);
    }

    // 子機の位置
    this.updateOptions();

    // ショット
    if (this.shotT > 0) this.shotT--;
    if (inp.shot && this.alive && G.canShoot()) this.fire();

    // ボム
    if (inp.bomb && this.state === 'play' && this.bombs > 0 && this.bombT <= 0) this.useBomb(false);
    if (this.bombT > 0) this.bombTick();
  }

  updateOptions() {
    const n = this.powerLevel;
    this.optAngle += 0.045;
    while (this.opts.length < n) this.opts.push({ x: 0, y: 0 });
    this.opts.length = n;
    for (let k = 0; k < n; k++) {
      // 通常：自機のまわりを回る。低速：前に集まる
      const a = this.optAngle + (k / n) * Math.PI * 2;
      const ux = Math.cos(a) * 30, uy = Math.sin(a) * 14 + 4;
      const [fx, fy] = FOCUS_SLOTS[n - 1][k];
      const t = this.focusT;
      const o = this.opts[k];
      o.x = ux + (fx - ux) * t;
      o.y = uy + (fy - uy) * t;
    }
  }

  fire() {
    const G = this.G;
    const t = this.shotT;
    if (t > 0) return;
    this.shotT = 4;
    G.frameShot = (G.frameShot || 0) + 1;
    const f = G.frameShot;
    // 本体：お札 2 列
    G.shots.spawn(this.x - 6, this.y + 10, 0, 17, SHOT.ofuda, 4);
    G.shots.spawn(this.x + 6, this.y + 10, 0, 17, SHOT.ofuda, 4);
    // 子機
    for (let k = 0; k < this.opts.length; k++) {
      const o = this.opts[k];
      if (this.focus) {
        G.shots.spawn(this.x + o.x, this.y + o.y + 8, 0, 20, SHOT.needle, 3.2);
      } else if ((f + k) % 2 === 0) {
        const spread = (k - (this.opts.length - 1) / 2) * 0.22;
        G.shots.spawn(this.x + o.x, this.y + o.y, Math.sin(spread) * 9, Math.cos(spread) * 9, SHOT.fox, 7.5);
      }
    }
    G.audio.sfx('shot', { minGap: 0.07 });
  }

  /** 弾・敵に当たった。 */
  hit() {
    if (!this.vulnerable) return;
    this.state = 'dying';
    this.timer = PLAYER.deathbombFrames;
    this.G.audio.sfx('pichun');
    this.G.fx.emit({ x: this.x, y: this.y, cell: SHAPE.p_flash, color: 'white', life: 10, size: 30, size1: 80, alpha: 1 });
  }

  die() {
    const G = this.G;
    this.state = 'dead';
    this.timer = 36;
    this.lives--;
    this.hitThisLife = true;
    this.deathsThisPhase++;
    G.fx.burst(this.x, this.y, 'pink', 2);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      G.fx.emit({ x: this.x, y: this.y, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, cell: SHAPE.p_twinkle, color: 'gold', life: 40, size: 14, size1: 4, drag: 0.94, spin: 0.2 });
    }
    // パワーを落とす（一部はアイテムで拾い直せる）
    const lost = Math.min(this.power - 1, 1);
    this.power = Math.max(1, this.power - 1);
    const n = Math.round(lost / 0.05 * 0.35);
    for (let k = 0; k < Math.min(n, 7); k++) G.items.spawn(this.x + (Math.random() - 0.5) * 60, this.y + 10, ITEM.power, { vy: 3 + Math.random() * 2, vx: (Math.random() - 0.5) * 3 });
    if (lost >= 0.99) G.items.spawn(this.x, this.y + 20, ITEM.bigpower, { vy: 3.6 });
    G.cancelBullets(false);
    G.onPlayerDeath();
    if (this.bombs < PLAYER.startBombs) this.bombs = PLAYER.startBombs;
    if (this.lives < 0) this.bombs = 0;
  }

  useBomb(deathbomb) {
    const G = this.G;
    this.bombs--;
    this.bombT = PLAYER.bombInvuln;
    this.invuln = Math.max(this.invuln, PLAYER.bombInvuln);
    this.bombedThisPhase = true;
    this.bombOrbs = [];
    for (let k = 0; k < 9; k++) this.bombOrbs.push({ a: (k / 9) * Math.PI * 2, r: 8, x: this.x, y: this.y, life: 0 });
    G.onBomb(deathbomb);
  }

  /** ボムの間：9 つの狐火が渦を巻いて広がり、弾を消して敵を焼く。 */
  bombTick() {
    const G = this.G;
    const age = PLAYER.bombInvuln - this.bombT;
    const k = age / 150;
    if (age < 160) G.cancelBullets(true);
    for (const o of this.bombOrbs || []) {
      o.a += 0.05 + (1 - Math.min(1, k)) * 0.06;
      o.r = 10 + Math.min(1, k) * 260 * (0.5 + 0.5 * Math.sin(Math.min(1, k) * Math.PI / 2));
      o.x = this.x + Math.cos(o.a) * o.r;
      o.y = this.y + Math.sin(o.a) * o.r * 0.9 + age * 0.6;
      if (age < 170) {
        G.fx.emit({ x: o.x, y: o.y, cell: SHAPE.p_dot, color: 'sky', life: 18, size: 46, size1: 10, alpha: 0.8 });
        G.fx.emit({ x: o.x, y: o.y, cell: SHAPE.flame, color: 'cyan', life: 10, size: 30, size1: 16, alpha: 0.7, angle: 0 });
        G.damageCircle(o.x, o.y, 54, 1.5);
      }
    }
  }

  /** 見た目を合わせる（描く前に毎フレーム）。 */
  syncModel(dt) {
    const m = this.model;
    if (!m) return;
    const visible = this.state !== 'dead' && this.state !== 'dying';
    const blink = this.invuln > 0 && this.state !== 'dying' && Math.floor(this.invuln / 4) % 2 === 0;
    m.root.visible = visible;
    m.root.position.set(this.x, this.y, 0);
    m.setBlink?.(blink);
    m.update?.(dt, { vx: this.vx, focus: this.focusT, state: this.state });
  }
}
