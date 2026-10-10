// ゲーム中の表示（HTML）。
//   横長：フィールドの左右にパネル（左：ハイスコア・スコア・残機・ボム、右：パワー・グレイズ・点・難易度）
//   縦長：上の帯にまとめる
// フィールドの上（ボスの体力・スペル名・時間・会話・中央の知らせ）は #fieldui に。位置は Layout の CSS 変数で合わせる。
// 値は変わったときだけ書き換える（毎フレーム DOM をさわらない）。
import { t, onLangChange } from '../core/i18n.js';
import { iconDataURL } from '../game/atlas.js';

const fmt = (n) => Math.floor(n).toLocaleString('en-US');

export class Hud {
  constructor(root) {
    const lifeIcon = iconDataURL('life', 64);
    const bombIcon = iconDataURL('bomb', 64);
    root.insertAdjacentHTML('beforeend', `
<div id="hud" class="hidden">
  <div class="fieldframe"></div>
  <div class="side side-l">
    <div class="stat big"><span class="lbl" data-i18n="hud.hiscore">${t('hud.hiscore')}</span><b class="v-hi">0</b></div>
    <div class="stat big"><span class="lbl" data-i18n="hud.score">${t('hud.score')}</span><b class="v-score">0</b></div>
    <div class="stat"><span class="lbl" data-i18n="hud.lives">${t('hud.lives')}</span><span class="icons v-lives"></span></div>
    <div class="stat"><span class="lbl" data-i18n="hud.bombs">${t('hud.bombs')}</span><span class="icons v-bombs"></span></div>
  </div>
  <div class="side side-r">
    <div class="diff v-diff"></div>
    <div class="stat"><span class="lbl" data-i18n="hud.power">${t('hud.power')}</span><b class="v-power">1.00</b></div>
    <div class="stat"><span class="lbl" data-i18n="hud.graze">${t('hud.graze')}</span><b class="v-graze">0</b></div>
    <div class="stat"><span class="lbl" data-i18n="hud.point">${t('hud.point')}</span><b class="v-point">0</b></div>
    <div class="deco" data-i18n="game.title">${t('game.title')}</div>
    <div class="stage v-stage"></div>
  </div>
  <div class="topbar">
    <div class="tb-score"><span class="lbl" data-i18n="hud.score">${t('hud.score')}</span><b class="v-score">0</b></div>
    <div class="tb-res"><span class="icons v-lives"></span><span class="icons v-bombs"></span></div>
    <div class="tb-power"><span class="lbl">P</span><b class="v-power">1.00</b></div>
  </div>
  <div id="fieldui">
    <div class="boss hidden">
      <div class="boss-row"><span class="boss-name"></span><span class="boss-stars"></span><span class="boss-timer"></span></div>
      <div class="boss-bar"><i></i></div>
    </div>
    <div class="spell hidden"><div class="spell-name"></div><div class="spell-bonus"></div></div>
    <div class="center-msg hidden"></div>
    <div class="sub-msg hidden"></div>
    <div class="enemy-marker hidden">ENEMY</div>
    <div class="dialogue hidden"><div class="speaker"></div><div class="text"></div><div class="next">▼</div></div>
    <div class="popups"></div>
    <div class="music hidden"></div>
    <div class="bosstitle hidden"><small></small><b></b></div>
  </div>
</div>`);
    this.el = root.querySelector('#hud');
    this.q = (s) => this.el.querySelectorAll(s);
    this.icons = { life: lifeIcon, bomb: bombIcon };
    this.last = {};
    this.fieldui = this.el.querySelector('#fieldui');
    this.bossEl = this.el.querySelector('.boss');
    this.bossBar = this.el.querySelector('.boss-bar i');
    this.spellEl = this.el.querySelector('.spell');
    this.centerEl = this.el.querySelector('.center-msg');
    this.subEl = this.el.querySelector('.sub-msg');
    this.markerEl = this.el.querySelector('.enemy-marker');
    this.dlgEl = this.el.querySelector('.dialogue');
    this.popEl = this.el.querySelector('.popups');
    this.musicEl = this.el.querySelector('.music');
    this.btEl = this.el.querySelector('.bosstitle');
    this.btT = 0;
    this.musicT = 0;
    onLangChange(() => { this.last = {}; });
  }

  show(on) { this.el.classList.toggle('hidden', !on); }

  set(key, sel, value, fn = (v) => v) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    for (const el of this.q(sel)) el.textContent = fn(value);
  }

  setIcons(key, sel, n, icon) {
    if (this.last[key] === n) return;
    this.last[key] = n;
    const html = n > 8 ? `<img src="${icon}" alt=""><em>×${n}</em>` : Array.from({ length: Math.max(0, n) }, () => `<img src="${icon}" alt="">`).join('');
    for (const el of this.q(sel)) el.innerHTML = html;
  }

  /** 毎フレーム：G の値を表示に写す（変わったものだけ）。 */
  update(G) {
    const p = G.player;
    this.set('hi', '.v-hi', Math.max(G.hiScore, G.score), fmt);
    this.set('score', '.v-score', G.score, fmt);
    this.setIcons('lives', '.v-lives', Math.max(0, p.lives), this.icons.life);
    this.setIcons('bombs', '.v-bombs', p.bombs, this.icons.bomb);
    this.set('power', '.v-power', Math.floor(p.power * 100) / 100, (v) => (v >= 4 ? 'MAX' : v.toFixed(2)));
    this.set('graze', '.v-graze', G.graze, fmt);
    this.set('point', '.v-point', G.pointValue, fmt);
    this.set('diff', '.v-diff', G.difficulty, (d) => t('diff.' + d));
    this.set('stage', '.v-stage', G.stageNo, (n) => (n === 'ex' ? t('hud.extra') : n ? t('hud.stage', { n }) : ''));
    this.updateBoss(G);
  }

  updateBoss(G) {
    const b = G.boss;
    const on = !!(b && b.alive && b.showBar);
    if (this.last.bossOn !== on) { this.last.bossOn = on; this.bossEl.classList.toggle('hidden', !on); this.markerEl.classList.toggle('hidden', !on); }
    if (!on) { if (this.last.spellOn) { this.last.spellOn = false; this.spellEl.classList.add('hidden'); } return; }
    this.set('bossName', '.boss-name', b.nameKey, (k) => t(k));
    this.set('bossStars', '.boss-stars', b.starsLeft, (n) => '★'.repeat(Math.max(0, n)));
    const sec = Math.max(0, b.timeLeft);
    this.set('bossTimer', '.boss-timer', Math.ceil(sec), (v) => String(v).padStart(2, '0'));
    this.el.querySelector('.boss-timer').classList.toggle('warn', sec < 10 && sec > 0);
    const hp = Math.max(0, Math.min(1, b.hpRatio));
    const pct = Math.round(hp * 1000) / 10;
    if (this.last.hp !== pct) { this.last.hp = pct; this.bossBar.style.width = pct + '%'; }
    this.bossBar.classList.toggle('sp', !!b.phase?.spell);
    const mx = Math.round((b.x / 360 + 0.5) * 1000) / 10;
    if (this.last.mx !== mx) { this.last.mx = mx; this.markerEl.style.left = mx + '%'; }
    const sp = b.phase?.spell && b.phaseActive;
    if (this.last.spellOn !== !!sp) { this.last.spellOn = !!sp; this.spellEl.classList.toggle('hidden', !sp); }
    if (sp) {
      this.set('spellName', '.spell-name', b.phase.name, (k) => t(k));
      const rec = G.spellRecord(b.phase.name);
      this.set('spellBonus', '.spell-bonus', b.spellBonusNow + '|' + rec.join('/'), () => (b.spellBonusNow > 0 ? t('hud.bonus', { n: fmt(b.spellBonusNow) }) : t('hud.bonusFailed')) + '　' + t('hud.history', { a: rec[0], b: rec[1] }));
    }
  }

  /** 中央の知らせ（ステージ名など）。text を空にすると消す。 */
  center(text, sub = '', cls = '') {
    this.centerEl.className = 'center-msg' + (cls ? ' ' + cls : '');
    this.subEl.className = 'sub-msg' + (cls ? ' ' + cls : '');
    this.centerEl.textContent = text;
    this.centerEl.classList.toggle('hidden', !text);
    this.subEl.textContent = sub;
    this.subEl.classList.toggle('hidden', !sub);
  }

  /** 会話：speaker（名前のキー）、text、side（'l' | 'r'）。null で閉じる。 */
  dialogue(line) {
    if (!line) { this.dlgEl.classList.add('hidden'); return; }
    this.dlgEl.classList.remove('hidden');
    this.dlgEl.dataset.side = line.side || 'l';
    this.dlgEl.querySelector('.speaker').textContent = line.speaker ? t(line.speaker) : '';
    this.dlgEl.querySelector('.text').textContent = line.text;
  }

  /** フィールドの上に、短い文字を少しの間だけ出す（ボーナスなど）。x, y はフィールドの座標。 */
  popup(text, x, y, cls = '') {
    const el = document.createElement('div');
    el.className = 'popup ' + cls;
    el.textContent = text;
    el.style.left = ((x / 360 + 0.5) * 100).toFixed(2) + '%';
    el.style.top = ((0.5 - y / 480) * 100).toFixed(2) + '%';
    this.popEl.appendChild(el);
    el._life = 70;
    return el;
  }

  /** ボスの二つ名と名前（登場のとき、3 秒ほど）。 */
  bossTitle(epithet, name) {
    this.btEl.querySelector('small').textContent = epithet;
    this.btEl.querySelector('b').textContent = name;
    this.btEl.classList.remove('hidden');
    this.btT = 200;
  }

  /** 曲名を出す（ゲームの時間で 4 秒ほど）。 */
  music(name) {
    this.musicEl.textContent = '♪ ' + name;
    this.musicEl.classList.remove('hidden');
    this.musicT = 260;
  }

  /** 毎フレーム：出している文字の寿命を進める（ゲームの時間で。CSS のアニメーションは使わない）。 */
  tickPopups() {
    if (this.btT > 0) {
      this.btT--;
      const k = Math.min(1, this.btT / 40, (200 - this.btT) / 25);
      this.btEl.style.opacity = k.toFixed(2);
      this.btEl.style.transform = `translateX(${((1 - Math.min(1, (200 - this.btT) / 25)) * 20).toFixed(1)}%)`;
      if (this.btT === 0) this.btEl.classList.add('hidden');
    }
    if (this.musicT > 0) {
      this.musicT--;
      const k = Math.min(1, this.musicT / 40, (260 - this.musicT) / 20);
      this.musicEl.style.opacity = k.toFixed(2);
      if (this.musicT === 0) this.musicEl.classList.add('hidden');
    }
    for (const el of [...this.popEl.children]) {
      el._life--;
      const k = el._life / 70;
      el.style.opacity = Math.min(1, k * 3).toFixed(2);
      el.style.transform = `translate(-50%, ${(-(1 - k) * 30).toFixed(1)}%)`;
      if (el._life <= 0) el.remove();
    }
  }

  clearPopups() { this.popEl.innerHTML = ''; this.btT = 0; this.btEl.classList.add('hidden'); }
}
