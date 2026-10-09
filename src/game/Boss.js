// ボス（と中ボス）：通常攻撃とスペルカードを順に。体力・制限時間・スペル取得ボーナス・弾消し。
//
// def = {
//   nameKey, model, color, r,
//   phases: [{ spell: false|true, name: 'spell.xxx', hp, time（秒）, bonus（スペルの基本点）, survival（耐久）, run: function* (boss, S) }],
//   midboss: true（倒したら逃げる。爆発しない）
// }
// 弾幕の台本（run）は、フェーズが終わると止まる（boss.token が持ち主）。台本の中で別の動きを並べたいときは boss.task(gen)。
import { Enemy } from './Enemies.js';
import { ITEM } from './Items.js';
import { HALF_H } from './config.js';
import { SHAPE } from './atlas.js';

export class Boss extends Enemy {
  constructor(G, def) {
    super(G, { ...def, hp: 1, drops: {}, score: 0 }, def.x ?? 0, def.y ?? HALF_H + 60);
    this.boss = true;
    this.def = def;
    this.nameKey = def.nameKey;
    this.hittable = false;
    this.showBar = false;
    this.phase = null;
    this.phaseIndex = -1;
    this.phaseActive = false;
    this.timeLeft = 0;
    this.token = { alive: false };
    this.defeated = false;
    this.r = def.r ?? 22;
    this.bodyR = def.bodyR ?? 14;
    this.spellBonusNow = 0;
    this.captured = [];
  }

  get hpRatio() { return this.maxHp > 0 ? this.hp / this.maxHp : 0; }
  get starsLeft() {
    if (!this.def.phases) return 0;
    let n = 0;
    for (let i = Math.max(0, this.phaseIndex + (this.phase?.spell ? 1 : 0)); i < this.def.phases.length; i++) if (this.def.phases[i].spell) n++;
    return n;
  }

  /** 台本と並べて動かす別のコルーチン（フェーズが終わると止まる）。 */
  task(gen) { return this.G.tasks.add(gen, this.token); }

  damage(n) {
    if (!this.alive || !this.hittable || !this.phaseActive) return;
    this.hp -= n;
    this.flash = 2;
    this.G.audio.sfx(this.hpRatio < 0.15 ? 'damage_low' : 'damage', { minGap: 0.07 });
  }

  /** 奥から飛んでくる。 */
  *enter(x = 0, y = 120, frames = 90) {
    this.z = -900;
    this.x = x * 0.3; this.y = 200;
    const x0 = this.x, y0 = this.y, z0 = this.z;
    for (let i = 1; i <= frames; i++) {
      const k = 1 - Math.pow(1 - i / frames, 3);
      this.x = x0 + (x - x0) * k;
      this.y = y0 + (y - y0) * k;
      this.z = z0 * (1 - k);
      yield 1;
    }
    this.z = 0;
  }

  /** フェーズを全部こなす（ステージの台本から yield* boss.fight()）。 */
  *fight() {
    const G = this.G;
    this.showBar = true;
    const phases = this.def.phases;
    for (let i = 0; i < phases.length; i++) {
      if (!this.alive) return;
      yield* this.runPhase(phases[i], i);
    }
    this.showBar = false;
    this.defeated = true;
    G.world.setSpell?.(false);
    if (this.def.midboss) {
      // 中ボス：逃げる
      G.audio.sfx('boss_escape');
      this.hittable = false;
      for (let i = 0; i < 50; i++) { this.y += i * 0.25; this.x += Math.sin(i * 0.3) * 2; yield 1; }
      this.remove();
    } else {
      yield* this.defeat();
    }
  }

  *runPhase(p, i) {
    const G = this.G;
    this.phase = p;
    this.phaseIndex = i;
    this.phaseActive = false;
    this.hittable = false;
    this.hp = this.maxHp = p.hp;
    this.token = { alive: true };
    const player = G.player;
    if (p.spell) {
      G.declareSpell(this, p);
      G.world.setSpell?.(true, this.def.spellColor);
    } else G.world.setSpell?.(false);
    // 決まった位置へ
    const [sx, sy] = p.start || [0, 120];
    if (Math.hypot(this.x - sx, this.y - sy) > 2) yield* this.moveTo(sx, sy, 40, 'inOutQuad');
    else yield 20;
    this.phaseActive = true;
    this.hittable = !p.survival;
    this.timeLeft = p.time;
    player.bombedThisPhase = false;
    player.deathsThisPhase = 0;
    G.tasks.add(p.run(this, G.S), this.token, p.name || 'phase');
    let result = 'timeout';
    this.spellBonusNow = p.spell ? this.bonusAt(0, p) : 0;
    let elapsed = 0;
    while (this.alive) {
      yield 1;
      elapsed++;
      this.timeLeft = p.time - elapsed / 60;
      if (p.spell) this.spellBonusNow = player.bombedThisPhase || player.deathsThisPhase ? 0 : this.bonusAt(elapsed / 60, p);
      if (this.timeLeft <= 10 && this.timeLeft > 0 && elapsed % 60 === 0) G.audio.sfx(this.timeLeft <= 4 ? 'timer_hi' : 'timer');
      if (this.hp <= 0) { result = 'defeated'; break; }
      if (this.timeLeft <= 0) { result = 'timeout'; break; }
    }
    // 終わり：台本を止め、弾を消す
    this.token.alive = false;
    this.phaseActive = false;
    this.hittable = false;
    const captured = p.spell && !player.bombedThisPhase && !player.deathsThisPhase && (result === 'defeated' || p.survival);
    G.cancelBullets(true, true);
    G.audio.sfx(result === 'defeated' ? 'phase_end' : 'phase_timeout');
    G.fx.burst(this.x, this.y, this.def.color || 'white', 1);
    if (result === 'defeated' || p.survival) {
      const last = i === this.def.phases.length - 1;
      if (!last) {
        G.items.scatter(this.x, this.y, ITEM.power, p.spell ? 6 : 4, 60);
        G.items.scatter(this.x, this.y, ITEM.point, p.spell ? 8 : 5, 60);
      }
    }
    if (p.spell) {
      G.world.setSpell?.(false);
      if (captured) G.onSpellCapture(this, p, this.spellBonusNow);
      else G.onSpellFail(this, p);
      this.captured.push(captured);
    }
    this.phase = null;
    yield 50;
  }

  /** スペルの点：時間とともに 1/3 まで下がる。 */
  bonusAt(sec, p) {
    const base = p.bonus || 1000000;
    const k = Math.min(1, sec / Math.max(1, p.time));
    return Math.floor((base * (1 - k * 0.66)) / 10) * 10;
  }

  /** ボスを倒した：大きな爆発。 */
  *defeat() {
    const G = this.G;
    this.hittable = false;
    G.audio.sfx('boss_down');
    for (let k = 0; k < 6; k++) {
      G.fx.burst(this.x + (Math.random() - 0.5) * 50, this.y + (Math.random() - 0.5) * 50, k % 2 ? 'white' : this.def.color || 'orange', 1);
      G.world.shake(6);
      this.x += (Math.random() - 0.5) * 4;
      yield 8;
    }
    G.fx.burst(this.x, this.y, 'white', 2);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      G.fx.emit({ x: this.x, y: this.y, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, cell: SHAPE.p_ring, color: this.def.color || 'gold', life: 40, size: 20, size1: 4, drag: 0.95 });
    }
    G.world.shake(14);
    G.flash(0.85, '#ffffff');
    G.audio.sfx('boss_explode');
    G.items.scatter(this.x, this.y, ITEM.point, 16, 120);
    G.items.scatter(this.x, this.y, ITEM.power, 8, 100);
    if (this.def.dropLife) G.items.spawn(this.x, this.y, ITEM.life, { vy: 2.5 });
    G.items.collectAll();
    // 倒れたボスは、少しよろけて下がる（会話のあと去る）
    this.dazed = true;
    yield* this.moveTo(this.x * 0.5, 150, 60, 'outQuad');
  }
}
