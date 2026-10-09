// タイトル・一時停止・設定・あそびかたの画面。上に重なる画面（モーダル）は積み重ねで管理し、
// いちばん上の画面を MenuNav が操作する。文言はすべて i18n のキー（data-i18n）で書く。
//
//   const screens = new Screens(uiRoot, { onStart, onResume, onRetry, onToTitle, onSettings });
//   screens.showTitle(true)  screens.open('pause')  screens.back()  screens.current()
//   screens.addModal('report', html)   作品の画面を足す（<section id="m-report" class="modal hidden">…）。
//                                      中の data-act のボタンのうち、ここで知らないものは cb.onAction(act, el) に届く
import { t, applyDom, LANGS } from '../core/i18n.js';
import { settings, QUALITIES, PAD_TYPES } from '../core/settings.js';

const opt = (v, key) => `<option value="${v}" data-i18n="${key}">${t(key)}</option>`;
const slider = (k) => `<label class="row"><span data-i18n="settings.${k}">${t('settings.' + k)}</span>
  <input type="range" min="0" max="100" step="5" data-vol="${k}" value="${Math.round(settings.volume[k] * 100)}"></label>`;

export class Screens {
  constructor(root, cb) {
    this.cb = cb;
    this.root = root;
    this.stack = [];
    root.insertAdjacentHTML('beforeend', `
<section id="title" class="screen hidden">
  <div class="logo">
    <h1 data-i18n="game.title">${t('game.title')}</h1>
    <p class="sub" data-i18n="game.sub">${t('game.sub')}</p>
    <p class="tagline" data-i18n="game.tagline">${t('game.tagline')}</p>
  </div>
  <div class="menu">
    <button data-act="continue" class="continue hidden" data-i18n="title.continue">${t('title.continue')}</button>
    <button data-act="start" data-i18n="title.start">${t('title.start')}</button>
    <button data-act="practice" data-i18n="title.practice">${t('title.practice')}</button>
    <button data-act="howto" data-i18n="title.howto">${t('title.howto')}</button>
    <button data-act="records" data-i18n="title.records">${t('title.records')}</button>
    <button data-act="settings" data-i18n="title.settings">${t('title.settings')}</button>
  </div>
  <footer class="copyright">© 2026 たぬ</footer>
</section>
<section id="m-diff" class="modal hidden"><div class="card diffcard">
  <h2 data-i18n="diff.title">${t('diff.title')}</h2>
  ${['easy', 'normal', 'hard', 'lunatic'].map((d) => `<button data-act="diff" data-diff="${d}" class="diff-${d}"><b data-i18n="diff.${d}">${t('diff.' + d)}</b><small data-i18n="diff.${d}.desc">${t('diff.' + d + '.desc')}</small></button>`).join('')}
  <button data-act="back" data-i18n="ui.back">${t('ui.back')}</button>
</div></section>
<section id="m-practice" class="modal hidden"><div class="card">
  <h2 data-i18n="practice.title">${t('practice.title')}</h2>
  <label class="row"><span data-i18n="diff.title">${t('diff.title')}</span>
    <select data-practice-diff>${['easy', 'normal', 'hard', 'lunatic'].map((d) => `<option value="${d}" data-i18n="diff.${d}">${t('diff.' + d)}</option>`).join('')}</select></label>
  ${[1, 2, 3].map((n) => `<button data-act="pstage" data-stage="${n}"><span data-i18n="stage${n}.short">${t('stage' + n + '.short')}</span></button>`).join('')}
  <p class="note" data-i18n="practice.note">${t('practice.note')}</p>
  <button data-act="back" data-i18n="ui.back">${t('ui.back')}</button>
</div></section>
<section id="m-pause" class="modal hidden"><div class="card">
  <h2 data-i18n="pause.title">${t('pause.title')}</h2>
  <button data-act="resume" data-i18n="pause.resume">${t('pause.resume')}</button>
  <button data-act="retry" data-i18n="pause.retry">${t('pause.retry')}</button>
  <button data-act="settings" data-i18n="title.settings">${t('title.settings')}</button>
  <button data-act="toTitle" data-i18n="pause.toTitle">${t('pause.toTitle')}</button>
</div></section>
<section id="m-records" class="modal hidden"><div class="card recordcard" data-scroll>
  <h2 data-i18n="records.title">${t('records.title')}</h2>
  <div class="rec-body"></div>
  <button data-act="back" data-i18n="ui.back">${t('ui.back')}</button>
</div></section>
<section id="m-gameover" class="modal hidden"><div class="card">
  <h2 data-i18n="gameover.title">${t('gameover.title')}</h2>
  <p class="gameover-note"></p>
  <button data-act="continueGame" data-i18n="gameover.continue">${t('gameover.continue')}</button>
  <button data-act="retry" data-i18n="pause.retry">${t('pause.retry')}</button>
  <button data-act="toTitle" data-i18n="pause.toTitle">${t('pause.toTitle')}</button>
</div></section>
<section id="m-result" class="modal hidden"><div class="card resultcard">
  <h2 class="result-title"></h2>
  <dl class="result-list"></dl>
  <button data-act="toTitle" data-i18n="pause.toTitle">${t('pause.toTitle')}</button>
</div></section>
<section id="m-settings" class="modal hidden"><div class="card">
  <h2 data-i18n="settings.title">${t('settings.title')}</h2>
  ${slider('master')}${slider('music')}${slider('sfx')}
  <label class="row"><span data-i18n="settings.quality">${t('settings.quality')}</span>
    <select data-set="quality">${QUALITIES.map((q) => opt(q, 'settings.quality.' + q)).join('')}</select></label>
  <label class="row"><span data-i18n="settings.lang">${t('settings.lang')}</span>
    <select data-set="lang">${LANGS.map((l) => `<option value="${l.id}">${l.label}</option>`).join('')}</select></label>
  <label class="row"><span data-i18n="settings.pad">${t('settings.pad')}</span>
    <select data-set="padType">${PAD_TYPES.map((p) => opt(p, 'settings.pad.' + p)).join('')}</select></label>
  <label class="row"><span data-i18n="settings.autoShot">${t('settings.autoShot')}</span>
    <select data-set="autoShot">${opt('off', 'settings.off')}${opt('on', 'settings.on')}</select></label>
  <button data-act="fullscreen" class="fs-btn" data-i18n="settings.fullscreen">${t('settings.fullscreen')}</button>
  <button data-act="back" data-i18n="ui.back">${t('ui.back')}</button>
</div></section>
<section id="m-howto" class="modal hidden"><div class="card" data-scroll>
  <h2 data-i18n="howto.title">${t('howto.title')}</h2>
  <p data-i18n="howto.body">${t('howto.body')}</p>
  <dl class="keys">
    <dt data-glyph="move"></dt><dd data-i18n="howto.move">${t('howto.move')}</dd>
    <dt data-glyph="shot"></dt><dd data-i18n="howto.shot">${t('howto.shot')}</dd>
    <dt data-glyph="focus"></dt><dd data-i18n="howto.focus">${t('howto.focus')}</dd>
    <dt data-glyph="bomb"></dt><dd data-i18n="howto.bomb">${t('howto.bomb')}</dd>
    <dt data-glyph="pause"></dt><dd data-i18n="howto.pause">${t('howto.pause')}</dd>
  </dl>
  <p class="touch-only" data-i18n="howto.touch">${t('howto.touch')}</p>
  <p data-i18n="howto.items">${t('howto.items')}</p>
  <button data-act="back" data-i18n="ui.back">${t('ui.back')}</button>
</div></section>`);
    this.title = root.querySelector('#title');
    this.modals = {};
    for (const n of ['pause', 'settings', 'howto', 'diff', 'practice', 'gameover', 'result', 'records']) this.modals[n] = root.querySelector('#m-' + n);

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      cb.onClick?.(act);
      if (act === 'start') cb.onStart?.();
      else if (act === 'continue') cb.onContinue?.();
      else if (act === 'howto') this.open('howto');
      else if (act === 'practice') this.open('practice');
      else if (act === 'records') this.open('records');
      else if (act === 'fullscreen') {
        const d = document;
        if (d.fullscreenElement) d.exitFullscreen?.().catch(() => {});
        else d.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
      }
      else if (act === 'settings') this.open('settings');
      else if (act === 'resume') cb.onResume?.();
      else if (act === 'retry') cb.onRetry?.();
      else if (act === 'toTitle') cb.onToTitle?.();
      else if (act === 'back') this.back();
      else cb.onAction?.(act, b);
    });
    const s = this.modals.settings;
    for (const r of s.querySelectorAll('[data-vol]')) {
      r.addEventListener('input', () => { settings.volume[r.dataset.vol] = +r.value / 100; cb.onSettings?.('volume'); });
    }
    for (const sel of s.querySelectorAll('[data-set]')) {
      sel.addEventListener('change', () => { settings[sel.dataset.set] = sel.value; cb.onSettings?.(sel.dataset.set); });
    }
  }

  /** 作品の画面を足す。html は <section id="m-名前" class="modal hidden"> … </section>。開くのは open('名前')。 */
  addModal(name, html) {
    this.root.insertAdjacentHTML('beforeend', html);
    this.modals[name] = this.root.querySelector('#m-' + name);
    return this.modals[name];
  }

  /** 設定画面の表示を、今の設定にそろえる（開くたびに呼ぶ）。 */
  syncSettings() {
    const s = this.modals.settings;
    s.querySelector('.fs-btn')?.classList.toggle('hidden', !document.fullscreenEnabled);
    for (const r of s.querySelectorAll('[data-vol]')) r.value = Math.round(settings.volume[r.dataset.vol] * 100);
    for (const sel of s.querySelectorAll('[data-set]')) sel.value = settings[sel.dataset.set];
  }

  showTitle(on) { this.title.classList.toggle('hidden', !on); }

  /** タイトルの「つづきから」を出すか（セーブのある作品で。main.js の onContinue とつなぐ）。 */
  setContinue(on) { this.title.querySelector('.continue')?.classList.toggle('hidden', !on); }

  open(name) {
    const m = this.modals[name];
    if (name === 'settings') this.syncSettings();
    applyDom(m);
    m.classList.remove('hidden');
    // 同じ画面を 2 回積まない（2 回積むと、もどる 1 回では閉じきらず、状態がその画面のまま戻れなくなる）。開いていれば、いちばん上へ
    const i = this.stack.indexOf(m);
    if (i >= 0) this.stack.splice(i, 1);
    this.stack.push(m);
    if (i < 0) this.cb.onModal?.(name, true);
  }

  /** いちばん上の画面を閉じる。閉じたら true。 */
  back() {
    const m = this.stack.pop();
    if (!m) return false;
    m.classList.add('hidden');
    this.cb.onModal?.(m.id.slice(2), false);
    return true;
  }

  closeAll() { while (this.back()); }

  get top() { return this.stack[this.stack.length - 1] || null; }
  isOpen(name) { return this.stack.includes(this.modals[name]); }

  /** MenuNav が操作する画面：いちばん上のモーダル、なければ（出ていれば）タイトルのメニュー。 */
  current() {
    if (this.top) return this.top;
    return this.title.classList.contains('hidden') ? null : this.title.querySelector('.menu');
  }
}
