// スマホの操作（弾幕向け）：画面のどこでもドラッグすると、指の動いたぶんだけ自機が動く（相対移動）。
// ショットは自動。ボムのボタン、低速の切り替えボタン、一時停止のボタンを出す。
// 縦持ちではフィールドの下の余白に、横持ちでは左右のパネルにボタンを置く。最初に画面がさわられたときに出す。
import { t } from '../core/i18n.js';

export const BUTTONS = [
  { action: 'bomb', label: 'touch.bomb', cls: 'tb-bomb' },
  { action: 'focus', label: 'touch.focus', cls: 'tb-focus', toggle: true },
];

export class TouchControls {
  constructor(root, surface, input, { onPause, layout } = {}) {
    this.input = input;
    this.layout = layout;
    this.visible = false;
    this.enabled = false;
    this.sens = 1.25; // 指の動き → 自機の動きの倍率
    const el = document.createElement('div');
    el.id = 'touch';
    el.className = 'hidden';
    el.innerHTML = `${BUTTONS.map((b, i) => `<button class="tbtn ${b.cls}" data-i="${i}" data-i18n="${b.label}">${t(b.label)}</button>`).join('')}
      <button class="tbtn pause" data-i18n-aria="pause.title" aria-label="${t('pause.title')}">Ⅱ</button>`;
    root.appendChild(el);
    this.el = el;
    this.toggles = {};

    for (const b of el.querySelectorAll('.tbtn[data-i]')) {
      const def = BUTTONS[+b.dataset.i];
      if (def.toggle) {
        b.addEventListener('touchstart', (e) => {
          e.preventDefault();
          const on = !this.toggles[def.action];
          this.toggles[def.action] = on;
          input.setTouchButton(def.action, on);
          b.classList.toggle('on', on);
        }, { passive: false });
      } else {
        const set = (on) => (e) => { e.preventDefault(); input.setTouchButton(def.action, on); b.classList.toggle('on', on); };
        b.addEventListener('touchstart', set(true), { passive: false });
        b.addEventListener('touchend', set(false), { passive: false });
        b.addEventListener('touchcancel', set(false), { passive: false });
      }
    }
    el.querySelector('.tbtn.pause').addEventListener('touchstart', (e) => { e.preventDefault(); onPause?.(); }, { passive: false });

    // ドラッグ：最初の指だけを追う
    let id = null, lx = 0, ly = 0;
    const target = surface;
    target.addEventListener('touchstart', (e) => {
      for (const tc of e.changedTouches) if (id === null) { id = tc.identifier; lx = tc.clientX; ly = tc.clientY; }
    }, { passive: true });
    target.addEventListener('touchmove', (e) => {
      for (const tc of e.changedTouches) {
        if (tc.identifier !== id) continue;
        const s = this.layout?.scale || 1;
        input.addTouchMove(((tc.clientX - lx) / s) * this.sens, (-(tc.clientY - ly) / s) * this.sens);
        lx = tc.clientX; ly = tc.clientY;
      }
    }, { passive: true });
    const end = (e) => { for (const tc of e.changedTouches) if (tc.identifier === id) id = null; };
    target.addEventListener('touchend', end, { passive: true });
    target.addEventListener('touchcancel', end, { passive: true });
    addEventListener('touchstart', () => { this.enabled = true; this.refresh(); }, { once: true, passive: true });
    input.onRelease = () => {
      id = null;
      for (const b of el.querySelectorAll('.tbtn.on')) if (!BUTTONS[+b.dataset.i]?.toggle) b.classList.remove('on');
    };
  }

  /** 低速の切り替えを戻す（ミス・ステージの始まりなどで）。 */
  resetToggles() {
    for (const [action, on] of Object.entries(this.toggles)) if (on) { this.toggles[action] = false; this.input.setTouchButton(action, false); }
    for (const b of this.el.querySelectorAll('.tbtn.on')) b.classList.remove('on');
  }

  setLabel() {}
  setVisible(v) { this.visible = v; this.refresh(); }
  refresh() { this.el.classList.toggle('hidden', !(this.visible && this.enabled)); }
}
