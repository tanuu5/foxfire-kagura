// 起動：部品を組み立て、ループを回す。作品ごとに変えるのは主に game/Game.js。
import './ui.css';    // 構造（どの作品でもほぼそのまま）
import './theme.css'; // 見た目（作品ごとに書き換える）
import { Renderer } from './core/Renderer.js';
import { Input } from './core/Input.js';
import { settings, effective, overrides, saveSettings } from './core/settings.js';
import { setLang, applyDom, t, missingKeys } from './core/i18n.js';
import { GameAudio } from './audio/Audio.js';
import { Screens } from './ui/Screens.js';
import { MenuNav } from './ui/MenuNav.js';
import { TouchControls } from './ui/TouchControls.js';
import { Hud } from './ui/Hud.js';
import { refreshGlyphs } from './ui/glyphs.js';
import { preventZoom } from './ui/noZoom.js';
import { Game } from './game/Game.js';
import { Layout } from './game/Layout.js';
import { installDevHarness } from '../dev/devHarness.js';

// 一人称・肩越しのカメラなら true：遊んでいるあいだマウスを画面に閉じ込める（クリックで閉じ込め、外れたら一時停止）
const POINTER_LOCK = false;

const app = document.getElementById('app');
const ui = document.getElementById('ui');
const loading = document.getElementById('loading');

setLang(effective.lang);
preventZoom();

let game;
let dev = null;
try {
  const layout = new Layout();
  const renderer = new Renderer(app, { quality: effective.quality });
  renderer.onResize = (w, h) => { layout.update(w, h); renderer.setFieldClip(layout.clipOn ? layout.rect : null, w, h); };
  renderer.resize();
  const input = new Input(renderer.domElement);
  const audio = new GameAudio(settings.volume, { muted: overrides.mute });
  const hud = new Hud(ui);
  const touch = new TouchControls(ui, renderer.domElement, input, { layout, onPause: () => game.state === 'play' && game.setState('paused') });
  const lock = () => { if (POINTER_LOCK) input.lockPointer(); };
  const screens = new Screens(ui, {
    onClick: (act) => audio.sfx(act === 'back' ? 'ui_back' : 'ui_ok'),
    onStart: () => screens.open('diff'),
    onContinue: () => { game.continueGame?.(); lock(); },   // セーブのある作品：screens.setContinue(true) で「つづきから」を出す
    onResume: () => { game.setState('play'); lock(); },
    onRetry: () => { game.start(game.difficulty, game.practice ? game.stageNo : 1); lock(); },
    onToTitle: () => { game.toTitle(); },
    onAction: (act, el) => {
      if (act === 'diff') { game.start(el.dataset.diff, 1); lock(); }
      else if (act === 'pstage') {
        const d = screens.root.querySelector('[data-practice-diff]').value;
        game.start(d, +el.dataset.stage); lock();
      } else if (act === 'continueGame') game.continueGame();
      else if (act === 'track') game.playTrack(el.dataset.track);
    },
    onModal: (name, open) => {
      if (open && name === 'practice') game.syncPracticeMenu();
      if (open && name === 'records') game.syncRecords();
      if (name === 'music') { if (open) game.syncMusicRoom(); else game.closeMusicRoom(); }
    },
    onSettings: (what) => {
      if (what === 'volume') audio.setVolume(settings.volume);
      if (what === 'quality' && !overrides.quality) renderer.setQuality(settings.quality);
      if (what === 'lang') setLang(settings.lang);
      if (what === 'padType' || what === 'lang') refreshGlyphs(input, settings);
      saveSettings();
    },
  });
  const nav = new MenuNav(() => screens.current(), () => audio.sfx('ui_move'));
  input.mouseNeedsLock = POINTER_LOCK; // 一人称：閉じ込めるためのクリックで、動作（剣を振るなど）をしない
  game = new Game({ renderer, input, audio, screens, touch, hud, layout });
  input.onDevice = () => refreshGlyphs(input, settings);
  if (POINTER_LOCK) {
    renderer.domElement.addEventListener('click', () => { if (game.state === 'play') input.lockPointer(); });
    input.onPointerLock = (locked) => { if (!locked && game.state === 'play' && input.device === 'kb') game.setState('paused'); };
  }
  applyDom();
  refreshGlyphs(input, settings);

  // 最初の操作で音を出せるようにする（ブラウザの決まり）。
  // どの操作を「音を出してよい合図」と見なすかはブラウザで違う（Safari は pointerdown や touchstart では動き出さず、
  // click・touchend・keyup などで動き出すことがある）ので、いくつも聞いておき、鳴り出すまで毎回試す。
  // ゲームパッドのボタンは合図と見なさないブラウザが多いが、試すだけなら害はない
  const unlock = () => { if (!audio.ready) audio.unlock(); };
  for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup', 'touchstart', 'touchend']) addEventListener(ev, unlock, { passive: true, capture: true });
  input.onPadButton = unlock;

  // Safari（Mac）は、ウィンドウの入力の受け手（ファーストレスポンダ）がページになっているときだけゲームパッドの入力を渡す。
  // アドレスバーから開いた直後などはページがまだ受け手になっておらず、一度クリックするまでパッドが効かない。
  // ページ側から受け手を奪う手はないので、その状態（document.hasFocus() が false）のあいだ、クリックを促す案内を出す。
  // 音も最初の操作が要るので、同じ案内でまとめる。撮影用の ?dev・タッチ操作中・遊んでいる最中は出さない
  const focusHint = document.createElement('div');
  focusHint.id = 'focus-hint';
  focusHint.className = 'hidden';
  focusHint.setAttribute('data-i18n', 'boot.focus');
  focusHint.textContent = t('boot.focus');
  ui.append(focusHint);
  const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;   // スマホ・タブレット（タッチが主）では出さない
  let hintShown = false;
  const updateFocusHint = () => {
    const show = !dev && !coarse && !document.hasFocus() && game.state !== 'play' && input.device !== 'touch';
    if (show === hintShown) return;
    hintShown = show;
    focusHint.classList.toggle('hidden', !show);
  };

  // ?paddiag：ゲームパッドとフォーカスの状態を画面に出す（Safari の実機で原因を見るため）
  const diag = overrides.paddiag ? installPadDiag(ui, { input, audio, game: () => game }) : null;

  const step = (dt) => {
    game.step(dt);
    // メニュー（タイトル・一時停止・設定）はゲームパッドとキーボードでも操作できる
    if (game.state !== 'play') nav.update(input.menu);
  };

  dev = installDevHarness({
    renderer: renderer.renderer,
    scene: () => game.world.scene,
    camera: () => game.world.camera,
    step,
    render: () => game.render(1 / 60),
    resize: (w, h) => renderer.resize(w, h),
    state: () => game.snapshot(),
    input: input.devInput(),
    goto: (name, o = {}) => {
      if (name === 'title') game.toTitle();
      else if (name === 'play') game.start(o.difficulty || 'normal', o.stage || 1, o);
      else if (name === 'paused') { if (game.state !== 'play') game.start(); game.setState('paused'); }
      return game.state;
    },
    extra: { game, audio, layout, i18nMissing: missingKeys, preview: (id, o) => game.preview(id, o) },
  });
  // NaN の確認は背景とフィールドの両方を見る
  if (dev) {
    const one = dev.checkNaN;
    dev.checkNaN = (root) => (root ? one(root) : [...one(game.world.scene), ...one(game.field.scene)]);
  }

  let last = performance.now();
  let started = false;
  const frame = (now) => {
    // 長い間があいたとき（裏に回っていた等）に、一度に大きく進めない
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (started) {
      if (!dev?.paused) step(dt);
      game.render(dt);
      updateFocusHint();
      diag?.(now);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // 読み込み（game.init）が終わってから回し始め、最初の数コマを描いてから読み込み画面を消す
  game.init().then(() => {
    started = true;
    last = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      loading.classList.add('done');
      // 読み込み画面が消えきってから「準備完了」にする（撮影ツールは ready を合図に撮り始めるので）
      setTimeout(() => { loading.remove(); dev?.markReady(); }, 600);
    }));
  }).catch((e) => {
    loading.querySelector('.ld-text').textContent = t('boot.loadFailed');
    console.error(e);
  });
} catch (e) {
  loading.querySelector('.ld-text').textContent = t('boot.noWebgl');
  throw e;
}

// ゲームパッド・フォーカスの診断表示（?paddiag）。毎フレーム呼ぶ。0.25 秒ごとに書き換える
function installPadDiag(ui, { input, audio, game }) {
  const box = document.createElement('pre');
  box.id = 'paddiag';
  ui.append(box);
  let connected = 0;
  let events = [];
  const log = (s) => { events.push(s); if (events.length > 6) events.shift(); };
  addEventListener('gamepadconnected', (e) => { connected++; log('connected: ' + (e.gamepad?.id || '?')); });
  addEventListener('gamepaddisconnected', (e) => log('disconnected: ' + (e.gamepad?.id || '?')));
  addEventListener('focus', () => log('window focus'));
  addEventListener('blur', () => log('window blur'));
  addEventListener('pointerdown', () => log('pointerdown'), { capture: true });
  let next = 0;
  return (now) => {
    if (now < next) return;
    next = now + 250;
    let pads = [];
    try { pads = [...(navigator.getGamepads?.() || [])]; } catch (e) { pads = ['error: ' + e]; }
    const lines = [
      `hasFocus=${document.hasFocus()} visibility=${document.visibilityState} active=${document.activeElement?.tagName || '-'}`,
      `userActivation=${navigator.userActivation?.hasBeenActive ?? 'n/a'} gamepadconnected=${connected}`,
      `input.device=${input.device} padType=${input.padType} game.state=${game()?.state} audio=${audio.ctx?.state || 'none'}`,
      `getGamepads: ${pads.length} slot(s)`,
      ...pads.map((gp, i) => {
        if (!gp) return `  [${i}] null`;
        if (typeof gp === 'string') return `  [${i}] ${gp}`;
        const pressed = [...gp.buttons].map((b, j) => (b?.pressed ? j : -1)).filter((j) => j >= 0);
        const axes = [...gp.axes].map((a) => a.toFixed(2)).join(',');
        return `  [${i}] ${gp.id.slice(0, 40)} map=${gp.mapping || '""'} conn=${gp.connected} btn=[${pressed}] axes=[${axes}]`;
      }),
      ...events.map((e) => '  ' + e),
    ];
    box.textContent = lines.join('\n');
  };
}
