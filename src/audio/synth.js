// 音源と効果音。音声ファイルは使わず、Web Audio のオシレーターとノイズで鳴らす。
// どの関数も (ctx, out, t, p) の形：out はミキサーの系統（{ dry, wet }）、t は鳴らす時刻（ctx.currentTime 基準）。
// p は { f（Hz）or m（MIDI）, dur, vel（0〜1）, pan（-1〜1）, rev（リバーブへの送り 0〜1） } など。
// 値はすべて fin() で確かめてから使う（NaN が AudioParam に入ると、その音はもう鳴らない）。
// 和楽器（琴・三味線・笛・太鼓など）は wa.js にあり、INSTRUMENTS の後ろで混ぜる。
import { waInstruments } from './wa.js';

const fin = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const FLOOR = 0.0001; // 指数ランプは 0 に向かえないので、ここまで下げる

const noiseCache = new WeakMap();
function noiseBuffer(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    const n = ctx.sampleRate * 1.5;
    b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let s = 22222;
    for (let i = 0; i < n; i++) d[i] = ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** node → 音量 → 定位 → out.dry（と、rev があれば out.wet）につなぐ。音量の GainNode を返す。 */
function route(ctx, node, out, p) {
  const g = ctx.createGain();
  g.gain.value = 0;
  let last = node.connect(g);
  if (p.pan) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, fin(p.pan, 0)));
    last = last.connect(pan);
  }
  last.connect(out.dry);
  const rev = fin(p.rev, 0);
  if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; last.connect(s).connect(out.wet); }
  return g;
}

/** 立ち上がり a、減衰 d で peak から消える（打楽器・効果音の形）。 */
function perc(param, t, peak, a, d) {
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(Math.max(FLOOR, peak), t + a);
  param.exponentialRampToValueAtTime(FLOOR, t + a + d);
}
/** 立ち上がり a、保持、離して r で消える（持続音の形）。 */
function adsr(param, t, peak, a, hold, r) {
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(Math.max(FLOOR, peak), t + a);
  param.setValueAtTime(Math.max(FLOOR, peak), t + a + hold);
  param.exponentialRampToValueAtTime(FLOOR, t + a + hold + r);
}

function osc(ctx, type, f, t, end) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f), t);
  o.start(t);
  o.stop(end + 0.05);
  return o;
}

function noise(ctx, t, end) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  s.start(t, Math.random() * 1.2);
  s.stop(end + 0.05);
  return s;
}

function filter(ctx, type, f, q = 0.8) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = Math.max(10, f);
  b.Q.value = q;
  return b;
}

const hz = (p, def) => fin(p.f, p.m !== undefined ? mtof(fin(p.m, 69)) : def);

/** パルス波（デューティ比 duty）の PeriodicWave。AudioContext ごと・デューティごとに 1 回だけ作る（高い倍音はブラウザが帯域を制限する）。 */
const pulseWaves = new WeakMap();
function pulseWave(ctx, duty) {
  let m = pulseWaves.get(ctx);
  if (!m) pulseWaves.set(ctx, (m = new Map()));
  let w = m.get(duty);
  if (!w) {
    const n = 48, real = new Float32Array(n + 1), imag = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    w = ctx.createPeriodicWave(real, imag); // 最大が 1 になるようにそろえてくれる
    m.set(duty, w);
  }
  return w;
}

// ---------------------------------------------------------------- 楽器（シーケンサーから使う）
export const INSTRUMENTS = {
  /** 矩形波のリード（チップチューン寄り）。 */
  lead(ctx, out, t, p) {
    const f = hz(p, 440), dur = fin(p.dur, 0.25), vel = fin(p.vel, 0.8);
    const o = osc(ctx, 'square', f, t, t + dur + 0.2);
    const lp = filter(ctx, 'lowpass', Math.min(9000, f * 6), 0.7);
    const g = route(ctx, o.connect(lp), out, { rev: 0.18, ...p });
    adsr(g.gain, t, 0.14 * vel, 0.006, Math.max(0, dur - 0.03), 0.12);
  },
  /** のこぎり波のベース（フィルターで弾く）。 */
  bass(ctx, out, t, p) {
    const f = hz(p, 55), dur = fin(p.dur, 0.25), vel = fin(p.vel, 0.8);
    const o = osc(ctx, 'sawtooth', f, t, t + dur + 0.15);
    const lp = filter(ctx, 'lowpass', 900, 3);
    lp.frequency.setValueAtTime(220 + 2200 * vel, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.18);
    const g = route(ctx, o.connect(lp), out, p);
    adsr(g.gain, t, 0.3 * vel, 0.004, Math.max(0, dur - 0.04), 0.08);
  },
  /** 少しずらした 3 本ののこぎり波のパッド（和音向け）。 */
  pad(ctx, out, t, p) {
    const f = hz(p, 220), dur = fin(p.dur, 1), vel = fin(p.vel, 0.6);
    const lp = filter(ctx, 'lowpass', 1800, 0.5);
    const mix = ctx.createGain();
    for (const det of [-9, 0, 8]) { const o = osc(ctx, 'sawtooth', f, t, t + dur + 0.8); o.detune.value = det; o.connect(mix); }
    mix.gain.value = 0.33;
    const g = route(ctx, mix.connect(lp), out, { rev: 0.35, ...p });
    adsr(g.gain, t, 0.08 * vel, 0.12, Math.max(0, dur - 0.12), 0.6);
  },
  /** 弾いた音（三角波＋短い倍音）。アルペジオ・メロディに。 */
  pluck(ctx, out, t, p) {
    const f = hz(p, 440), vel = fin(p.vel, 0.8);
    const o = osc(ctx, 'triangle', f, t, t + 0.6);
    const o2 = osc(ctx, 'sine', f * 2, t, t + 0.25);
    const m = ctx.createGain();
    o.connect(m); o2.connect(m);
    const g = route(ctx, m, out, { rev: 0.2, ...p });
    perc(g.gain, t, 0.25 * vel, 0.003, 0.45);
  },
  /** 鐘（FM）。完成・ご褒美の合図に。 */
  bell(ctx, out, t, p) {
    const f = hz(p, 880), vel = fin(p.vel, 0.7), dur = fin(p.dur, 1.4);
    const car = osc(ctx, 'sine', f, t, t + dur);
    const mod = osc(ctx, 'sine', f * 3.5, t, t + dur);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.05), t + dur);
    mod.connect(mg).connect(car.frequency);
    const g = route(ctx, car, out, { rev: 0.35, ...p });
    perc(g.gain, t, 0.18 * vel, 0.002, dur);
  },
  kick(ctx, out, t, p) {
    const vel = fin(p.vel, 0.9);
    const o = osc(ctx, 'sine', 150, t, t + 0.45);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = route(ctx, o, out, p);
    perc(g.gain, t, 0.9 * vel, 0.002, 0.38);
  },
  snare(ctx, out, t, p) {
    const vel = fin(p.vel, 0.8);
    const n = noise(ctx, t, t + 0.25);
    const g = route(ctx, n.connect(filter(ctx, 'bandpass', 1800, 0.7)), out, { rev: 0.15, ...p });
    perc(g.gain, t, 0.5 * vel, 0.001, 0.18);
    const o = osc(ctx, 'triangle', 190, t, t + 0.15);
    const g2 = route(ctx, o, out, p);
    perc(g2.gain, t, 0.3 * vel, 0.001, 0.09);
  },
  hat(ctx, out, t, p) {
    const vel = fin(p.vel, 0.6), open = !!p.open;
    const n = noise(ctx, t, t + (open ? 0.35 : 0.08));
    const g = route(ctx, n.connect(filter(ctx, 'highpass', 7500, 0.7)), out, p);
    perc(g.gain, t, 0.22 * vel, 0.001, open ? 0.3 : 0.05);
  },
  /** パルス波のリード（デューティ 25%。ファミコン風の主旋律）。長い音には遅れてビブラート。
   *  曲の列が rev を書かないときは 0.2 を送る。ノード：osc・(LFO・深さ)・lowpass・gain（＋pan・送り）＝3〜7 */
  pulse(ctx, out, t, p) {
    const f = Math.min(8000, Math.max(20, hz(p, 880))), dur = Math.min(30, Math.max(0.02, fin(p.dur, 0.25))), vel = fin(p.vel, 0.8);
    const end = t + dur + 0.15;
    const o = osc(ctx, 'square', f, t, end);
    o.setPeriodicWave(pulseWave(ctx, 0.25));
    if (dur > 0.3) {
      const lfo = osc(ctx, 'sine', 5.6, t, end);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(0, t + 0.16);
      depth.gain.linearRampToValueAtTime(f * 0.007, t + 0.45);
      lfo.connect(depth).connect(o.frequency);
    }
    const lp = filter(ctx, 'lowpass', Math.min(5000, f * 3.5), 0.6); // 2〜5 kHz（効果音の帯域）を埋めすぎないように、上の倍音を少し丸める
    const g = route(ctx, o.connect(lp), out, { ...p, rev: fin(p.rev, 0.2) });
    adsr(g.gain, t, 0.15 * vel, 0.005, Math.max(0, dur - 0.03), 0.1);
  },
  /** 細いパルス波（デューティ 12.5%）の短い音。速い分散和音（ぴろぴろ）・合いの手に。
   *  ゲートのように切れる。ノード：osc・lowpass・gain（＋pan・送り）＝3〜5 */
  pulse8(ctx, out, t, p) {
    const f = Math.min(8000, Math.max(20, hz(p, 880))), vel = fin(p.vel, 0.8);
    const d = Math.min(0.5, Math.max(0.05, fin(p.dur, 0.1) * 0.8));
    const o = osc(ctx, 'square', f, t, t + d + 0.08);
    o.setPeriodicWave(pulseWave(ctx, 0.125));
    const lp = filter(ctx, 'lowpass', Math.min(6000, f * 4), 0.6);
    const g = route(ctx, o.connect(lp), out, { ...p, rev: fin(p.rev, 0.15) });
    adsr(g.gain, t, 0.12 * vel, 0.003, Math.max(0, d - 0.02), 0.05);
  },
};
// 和楽器（wa.js）：koto shamisen fue shakuhachi kokyu sho koe sub taiko shime tsuzumi ka hyoshigi kane chiki suzu
Object.assign(INSTRUMENTS, waInstruments({ fin, FLOOR, route, perc, adsr, osc, noise, filter, hz }));

// ---------------------------------------------------------------- 効果音（audio.sfx(name) で鳴らす）
// 作品に合わせて足す・作り替える。名前はゲームの出来事に合わせる（coin, hit, gameover …）。
export const SFX = {
  ui_move(ctx, out, t) { INSTRUMENTS.pluck(ctx, out, t, { f: 1320, vel: 0.35, rev: 0 }); },
  ui_ok(ctx, out, t) { INSTRUMENTS.pluck(ctx, out, t, { f: 988, vel: 0.5 }); INSTRUMENTS.pluck(ctx, out, t + 0.06, { f: 1480, vel: 0.5 }); },
  ui_back(ctx, out, t) { INSTRUMENTS.pluck(ctx, out, t, { f: 880, vel: 0.45 }); INSTRUMENTS.pluck(ctx, out, t + 0.06, { f: 587, vel: 0.45 }); },
  pause(ctx, out, t) { INSTRUMENTS.bell(ctx, out, t, { f: 784, vel: 0.9, dur: 0.6 }); },
  jump(ctx, out, t, p = {}) {
    const o = osc(ctx, 'square', 300, t, t + 0.2);
    o.frequency.exponentialRampToValueAtTime(760 * fin(p.pitch, 1), t + 0.14);
    const g = route(ctx, o.connect(filter(ctx, 'lowpass', 3200)), out, p);
    perc(g.gain, t, 0.12, 0.004, 0.16);
  },
  land(ctx, out, t, p = {}) {
    const n = noise(ctx, t, t + 0.12);
    const g = route(ctx, n.connect(filter(ctx, 'lowpass', 600, 0.9)), out, p);
    perc(g.gain, t, 0.35 * fin(p.vel, 1), 0.002, 0.1);
  },
  coin(ctx, out, t, p = {}) {
    const k = fin(p.pitch, 1);
    for (const [dt, f] of [[0, 1319], [0.07, 1976]]) {
      const o = osc(ctx, 'square', f * k, t + dt, t + dt + 0.3);
      const g = route(ctx, o.connect(filter(ctx, 'lowpass', 6000)), out, { rev: 0.15, ...p });
      perc(g.gain, t + dt, 0.1, 0.002, dt ? 0.26 : 0.08);
    }
  },
  explode(ctx, out, t, p = {}) {
    const dur = fin(p.dur, 1.1);
    const n = noise(ctx, t, t + dur);
    const lp = filter(ctx, 'lowpass', 3000, 0.6);
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = route(ctx, n.connect(lp), out, { rev: 0.3, ...p });
    perc(g.gain, t, 0.7, 0.004, dur);
    INSTRUMENTS.kick(ctx, out, t, { vel: 1 });
  },
  powerup(ctx, out, t, p = {}) {
    [523, 659, 784, 1047, 1319].forEach((f, i) => INSTRUMENTS.pluck(ctx, out, t + i * 0.055, { f, vel: 0.55, rev: 0.25, ...p }));
  },
  // ---------------------------------------------------------------- 弾幕の効果音
  /** 自機のショット（ずっと鳴るので、小さく短く）。 */
  shot(ctx, out, t, p = {}) {
    const n = noise(ctx, t, t + 0.05);
    const g = route(ctx, n.connect(filter(ctx, 'bandpass', 5200, 1.2)), out, p);
    perc(g.gain, t, 0.09, 0.001, 0.035);
    const o = osc(ctx, 'triangle', 1900, t, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.04);
    const g2 = route(ctx, o, out, p);
    perc(g2.gain, t, 0.04, 0.001, 0.04);
  },
  /** 敵の弾の発射「たん」。 */
  tan(ctx, out, t, p = {}) {
    const o = osc(ctx, 'square', 880, t, t + 0.1);
    o.frequency.exponentialRampToValueAtTime(330, t + 0.06);
    const g = route(ctx, o.connect(filter(ctx, 'lowpass', 2600)), out, p);
    perc(g.gain, t, 0.11, 0.001, 0.07);
    const n = noise(ctx, t, t + 0.06);
    const g2 = route(ctx, n.connect(filter(ctx, 'highpass', 3000)), out, p);
    perc(g2.gain, t, 0.08, 0.001, 0.04);
  },
  /** きらっ（細い弾・レーザーの発射）。 */
  kira(ctx, out, t, p = {}) {
    for (const [dt, f] of [[0, 2637], [0.03, 3520]]) {
      const o = osc(ctx, 'sine', f, t + dt, t + dt + 0.2);
      const g = route(ctx, o, out, { rev: 0.25, ...p });
      perc(g.gain, t + dt, 0.1, 0.001, 0.16);
    }
  },
  /** 太鼓「どん」（腹鼓のスペル）。 */
  drum(ctx, out, t, p = {}) {
    const o = osc(ctx, 'sine', 120, t, t + 0.4);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    const g = route(ctx, o, out, { rev: 0.25, ...p });
    perc(g.gain, t, 0.55, 0.002, 0.32);
    const n = noise(ctx, t, t + 0.08);
    const g2 = route(ctx, n.connect(filter(ctx, 'lowpass', 900)), out, p);
    perc(g2.gain, t, 0.18, 0.001, 0.06);
  },
  drum_big(ctx, out, t, p = {}) {
    SFX.drum(ctx, out, t, p);
    const o = osc(ctx, 'sine', 90, t, t + 0.7);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    const g = route(ctx, o, out, { rev: 0.4, ...p });
    perc(g.gain, t, 0.6, 0.003, 0.6);
  },
  /** レーザー「びーっ」。 */
  laser(ctx, out, t, p = {}) {
    const o = osc(ctx, 'sawtooth', 220, t, t + 0.7);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.5);
    const g = route(ctx, o.connect(filter(ctx, 'bandpass', 1400, 2)), out, { rev: 0.3, ...p });
    adsr(g.gain, t, 0.16, 0.05, 0.35, 0.25);
  },
  /** 雑魚に当たった。 */
  hit(ctx, out, t, p = {}) {
    const n = noise(ctx, t, t + 0.04);
    const g = route(ctx, n.connect(filter(ctx, 'bandpass', 2400, 2)), out, p);
    perc(g.gain, t, 0.24, 0.001, 0.03);
  },
  /** ボスに当たった。 */
  damage(ctx, out, t, p = {}) {
    const n = noise(ctx, t, t + 0.06);
    const g = route(ctx, n.connect(filter(ctx, 'bandpass', 1500, 1.5)), out, p);
    perc(g.gain, t, 0.4, 0.001, 0.05);
  },
  damage_low(ctx, out, t, p = {}) {
    const n = noise(ctx, t, t + 0.06);
    const g = route(ctx, n.connect(filter(ctx, 'bandpass', 3400, 2)), out, p);
    perc(g.gain, t, 0.3, 0.001, 0.05);
  },
  /** 雑魚がやられた「ぽん」。 */
  explode_s(ctx, out, t, p = {}) {
    const n = noise(ctx, t, t + 0.3);
    const lp = filter(ctx, 'lowpass', 2400, 0.8);
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.25);
    const g = route(ctx, n.connect(lp), out, { rev: 0.15, ...p });
    perc(g.gain, t, 0.33, 0.002, 0.25);
    const o = osc(ctx, 'sine', 320, t, t + 0.2);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.15);
    const g2 = route(ctx, o, out, p);
    perc(g2.gain, t, 0.36, 0.002, 0.15);
  },
  explode_m(ctx, out, t, p = {}) { SFX.explode(ctx, out, t, { dur: 0.7, ...p }); },
  /** 被弾「ぴちゅーん」。 */
  pichun(ctx, out, t, p = {}) {
    const o = osc(ctx, 'square', 1700, t, t + 0.6);
    o.frequency.setValueAtTime(1700, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.5);
    const lfo = osc(ctx, 'sine', 32, t, t + 0.6);
    const lg = ctx.createGain(); lg.gain.value = 60;
    lfo.connect(lg).connect(o.frequency);
    const g = route(ctx, o.connect(filter(ctx, 'lowpass', 4000)), out, { rev: 0.3, ...p });
    perc(g.gain, t, 0.3, 0.002, 0.55);
    const n = noise(ctx, t, t + 0.5);
    const g2 = route(ctx, n.connect(filter(ctx, 'lowpass', 1800)), out, p);
    perc(g2.gain, t, 0.5, 0.002, 0.4);
  },
  /** かすり「しゅっ」。 */
  graze(ctx, out, t, p = {}) {
    const n = noise(ctx, t, t + 0.05);
    const g = route(ctx, n.connect(filter(ctx, 'highpass', 6000)), out, p);
    perc(g.gain, t, 0.13, 0.001, 0.04);
  },
  /** アイテムを拾った。 */
  item(ctx, out, t, p = {}) {
    const o = osc(ctx, 'sine', 1568, t, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(2093, t + 0.04);
    const g = route(ctx, o, out, p);
    perc(g.gain, t, 0.1, 0.001, 0.06);
  },
  extend(ctx, out, t, p = {}) {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => INSTRUMENTS.bell(ctx, out, t + i * 0.07, { f, vel: 0.7, dur: 0.9, ...p }));
  },
  bombget(ctx, out, t, p = {}) {
    [1047, 1319, 1568].forEach((f, i) => INSTRUMENTS.bell(ctx, out, t + i * 0.06, { f, vel: 0.6, dur: 0.6, ...p }));
  },
  /** ボム：風が巻いて、どーん。 */
  bomb(ctx, out, t, p = {}) {
    const n = noise(ctx, t, t + 1.4);
    const bp = filter(ctx, 'bandpass', 300, 1.4);
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.7);
    bp.frequency.exponentialRampToValueAtTime(500, t + 1.3);
    const g = route(ctx, n.connect(bp), out, { rev: 0.4, ...p });
    adsr(g.gain, t, 0.5, 0.25, 0.4, 0.7);
    INSTRUMENTS.kick(ctx, out, t + 0.05, { vel: 1 });
    SFX.explode(ctx, out, t + 0.1, { dur: 1.2 });
  },
  /** スペルカードの宣言。 */
  spell(ctx, out, t, p = {}) {
    const n = noise(ctx, t, t + 0.9);
    const bp = filter(ctx, 'bandpass', 4000, 1.2);
    bp.frequency.setValueAtTime(5000, t);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.8);
    const g = route(ctx, n.connect(bp), out, { rev: 0.5, ...p });
    perc(g.gain, t, 0.35, 0.02, 0.8);
    INSTRUMENTS.bell(ctx, out, t + 0.05, { f: 196, vel: 1, dur: 2.2 });
    INSTRUMENTS.bell(ctx, out, t + 0.05, { f: 294, vel: 0.6, dur: 1.8 });
  },
  capture(ctx, out, t, p = {}) {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => INSTRUMENTS.bell(ctx, out, t + i * 0.06, { f, vel: 0.65, dur: 1.2, ...p }));
  },
  timer(ctx, out, t, p = {}) { INSTRUMENTS.pluck(ctx, out, t, { f: 1760, vel: 0.5, rev: 0, ...p }); },
  timer_hi(ctx, out, t, p = {}) { INSTRUMENTS.pluck(ctx, out, t, { f: 2349, vel: 0.65, rev: 0, ...p }); },
  phase_end(ctx, out, t, p = {}) {
    SFX.explode(ctx, out, t, { dur: 0.9 });
    [1319, 1760, 2637].forEach((f, i) => INSTRUMENTS.bell(ctx, out, t + 0.05 + i * 0.05, { f, vel: 0.4, dur: 1, ...p }));
  },
  phase_timeout(ctx, out, t, p = {}) {
    const n = noise(ctx, t, t + 0.8);
    const lp = filter(ctx, 'lowpass', 3000);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.7);
    const g = route(ctx, n.connect(lp), out, { rev: 0.4, ...p });
    perc(g.gain, t, 0.3, 0.01, 0.7);
  },
  boss_escape(ctx, out, t, p = {}) {
    const n = noise(ctx, t, t + 0.8);
    const bp = filter(ctx, 'bandpass', 600, 1.5);
    bp.frequency.exponentialRampToValueAtTime(4000, t + 0.6);
    const g = route(ctx, n.connect(bp), out, { rev: 0.4, ...p });
    perc(g.gain, t, 0.6, 0.05, 0.7);
  },
  boss_down(ctx, out, t, p = {}) {
    const o = osc(ctx, 'sawtooth', 200, t, t + 1.2);
    o.frequency.exponentialRampToValueAtTime(1800, t + 1.0);
    const g = route(ctx, o.connect(filter(ctx, 'lowpass', 2400)), out, { rev: 0.4, ...p });
    adsr(g.gain, t, 0.12, 0.05, 0.8, 0.3);
  },
  boss_explode(ctx, out, t, p = {}) {
    SFX.explode(ctx, out, t, { dur: 2.2 });
    INSTRUMENTS.kick(ctx, out, t, { vel: 1 });
    INSTRUMENTS.kick(ctx, out, t + 0.12, { vel: 0.8 });
  },
  dlg(ctx, out, t, p = {}) { INSTRUMENTS.pluck(ctx, out, t, { f: 1175, vel: 0.3, rev: 0, ...p }); },
  clear(ctx, out, t, p = {}) {
    [[0, 784], [0.12, 988], [0.24, 1175], [0.36, 1568], [0.6, 1319], [0.72, 1568]].forEach(([dt, f]) => INSTRUMENTS.bell(ctx, out, t + dt, { f, vel: 0.7, dur: 1.2, ...p }));
  },
};
