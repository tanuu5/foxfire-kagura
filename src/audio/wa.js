// 和楽器：琴・三味線・篠笛・尺八・胡弓・笙・声（合唱）・やわらかいベース・大太鼓・締太鼓・鼓・太鼓のふち・拍子木・当り鉦・鈴。
// 音声ファイルは使わず、オシレーターとノイズで鳴らす（synth.js の楽器と同じ (ctx, out, t, p) の形）。
//
// synth.js の小さな道具（fin, route, perc …）を受け取って楽器の表を返す。synth.js がそれを INSTRUMENTS に混ぜる
// （こちらからは synth.js を import しない。循環させないため）。
// - 1 音あたりのノードは 8 個くらいまで（弾が何百も出ている最中にも鳴るので）。数はそれぞれのコメントに書く。
// - 太鼓・鉦・鈴はドラムの列（{ taiko: 'x...x...' }）から鳴らせる。高さ（m）が無いときは楽器ごとの決まった高さ。
// - 曲の列が rev を書かないと p.rev は undefined で届くので、楽器ごとの既定の送り量に戻す（rv）。
// - 値は fin() と clamp で確かめてから AudioParam に入れる（NaN が入ると、その音はもう鳴らない）。

/** 倍音の表（sin の成分。先頭が基音）。PeriodicWave は AudioContext ごとに 1 回だけ作る（wave）。 */
const series = (n, fn) => Array.from({ length: n }, (_, i) => fn(i + 1));
const HARM = {
  // 琴：端の近くを爪ではじいた弦（倍音が多く明るい）
  koto: series(28, (n) => Math.sin(n * Math.PI * 0.13) / Math.pow(n, 1.25)),
  // 三味線：細いパルス波（鼻にかかった「びーん」）
  shamisen: series(32, (n) => Math.sin(n * Math.PI * 0.16) / n),
  // 篠笛・尺八：ほとんど基音（息の音は別に足す）
  fue: [1, 0.32, 0.14, 0.07, 0.035, 0.018],
  shakuhachi: [1, 0.2, 0.12, 0.04, 0.02],
  // 笙：リード（奇数の倍音が少し強い）
  sho: series(14, (n) => (n % 2 ? 1 : 0.6) / Math.pow(n, 1.2)),
  // やわらかいベース：基音と少しの 2 倍音（小さなスピーカーでも聞こえるように）
  sub: [1, 0.32, 0.08],
};
const waves = new WeakMap();
function wave(ctx, name) {
  let m = waves.get(ctx);
  if (!m) waves.set(ctx, (m = new Map()));
  let w = m.get(name);
  if (!w) {
    const h = HARM[name];
    const real = new Float32Array(h.length + 1), imag = new Float32Array(h.length + 1);
    h.forEach((a, i) => { imag[i + 1] = a; });
    w = ctx.createPeriodicWave(real, imag); // 最大が 1 になるようにそろえてくれる
    m.set(name, w);
  }
  return w;
}

/** 打つ音の素（短いノイズを色づけしたもの）。lo/hi：通す帯域（Hz）、res：[共鳴の Hz, 帯域 Hz]、tau：消える速さ（秒）、amp：音の大きさ。 */
const CLICK = {
  tsume: { lo: 1500, hi: 9000, tau: 0.003, amp: 0.3 },  // 琴の爪
  bachi: { lo: 700, hi: 4500, tau: 0.009, amp: 0.55 },  // 三味線の撥（皮ごと打つ）
  skin: { hi: 650, tau: 0.025, amp: 0.55 },             // 大太鼓の皮（低い）
  slap: { lo: 500, hi: 4000, tau: 0.008, amp: 0.5 },    // 締太鼓・鼓の皮
  wood: { res: [1800, 300], tau: 0.004, amp: 0.6 },     // 拍子木・太鼓のふち
};
const clicks = new WeakMap();
function clickBuffer(ctx, kind) {
  let m = clicks.get(ctx);
  if (!m) clicks.set(ctx, (m = new Map()));
  let b = m.get(kind);
  if (b) return b;
  const c = CLICK[kind], sr = ctx.sampleRate;
  const n = Math.ceil(sr * Math.min(0.3, c.tau * 9));
  b = ctx.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  const aL = c.hi ? 1 - Math.exp((-2 * Math.PI * c.hi) / sr) : 1;
  const aH = c.lo ? Math.exp((-2 * Math.PI * c.lo) / sr) : 0;
  const R = c.res ? Math.exp((-Math.PI * c.res[1]) / sr) : 0;
  const cw = c.res ? 2 * Math.cos((2 * Math.PI * c.res[0]) / sr) : 0;
  let s = 9001 + kind.length * 131, lp = 0, hp = 0, px = 0, y1 = 0, y2 = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    let x = (((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1) * Math.exp(-i / (c.tau * sr));
    lp += aL * (x - lp);
    x = lp;
    if (aH) { hp = aH * (hp + x - px); px = x; x = hp; }
    if (R) { const y = x + R * cw * y1 - R * R * y2; y2 = y1; y1 = y; x = y; }
    d[i] = x;
    peak = Math.max(peak, Math.abs(x));
  }
  const k = c.amp / (peak || 1);
  for (let i = 0; i < n; i++) d[i] *= k;
  m.set(kind, b);
  return b;
}

/** 決まった時刻から決まった値を返す（乱数の代わり。書き出すたびに同じ音になる）。 */
const hash = (t, k = 1) => { const x = Math.sin(t * 12.9898 * k + 78.233) * 43758.5453; return x - Math.floor(x); };

export function waInstruments({ fin, FLOOR, route, perc, adsr, osc, noise, filter, hz }) {
  const clamp = (x, lo, hi, d) => Math.min(hi, Math.max(lo, fin(x, d)));
  const velOf = (p, d) => clamp(p.vel, 0, 1.5, d);
  const durOf = (p, d) => clamp(p.dur, 0.02, 30, d);
  const freqOf = (p, d) => clamp(hz(p, d), 20, 16000, d);
  const rv = (p, d) => ({ ...p, rev: clamp(p.rev, 0, 1, d) }); // 列が rev を書かなかったときの送り量
  const pos = (x) => Math.max(FLOOR * 2, x); // 指数ランプの行き先は 0 にできない

  /** PeriodicWave の発振器。 */
  function wosc(ctx, name, f, t, end) {
    const o = osc(ctx, 'sine', f, t, end);
    o.setPeriodicWave(wave(ctx, name));
    return o;
  }
  /** 打つ音の素を t に鳴らす（rate で色を少し変える）。 */
  function hit(ctx, kind, t, rate = 1) {
    const s = ctx.createBufferSource();
    s.buffer = clickBuffer(ctx, kind);
    s.playbackRate.value = clamp(rate, 0.25, 4, 1);
    s.start(t);
    return s;
  }
  /** 遅れてかかるビブラート（osc の高さを揺らす）。 */
  function vibrato(ctx, o, f, t, end, rate, delay, depth) {
    const lfo = osc(ctx, 'sine', rate, t, end);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.setValueAtTime(0, t + delay);
    g.gain.linearRampToValueAtTime(f * depth, t + delay + 0.4);
    lfo.connect(g).connect(o.frequency);
  }

  /** 笛の仲間（篠笛・尺八）。v は楽器ごとの性格。下からすくって入り、長い音には遅れてビブラート。
   *  息のノイズを音の高さの近くに通して混ぜる（吹きはじめは強く）。ノード：osc・(LFO・深さ)・ノイズ・bandpass・息の gain・gain（＋送り）＝6〜8 */
  function flute(ctx, out, t, p, v) {
    const f = freqOf(p, v.f), vel = velOf(p, 0.8), dur = durOf(p, 0.4);
    const end = t + dur + v.rel;
    const o = wosc(ctx, v.wave, f * v.scoop, t, end);
    o.frequency.exponentialRampToValueAtTime(f, t + v.scoopT);
    if (dur > 0.3) vibrato(ctx, o, f, t, end, v.vib, v.vibDelay, v.vibDepth);
    const n = noise(ctx, t, end);
    const bp = filter(ctx, 'bandpass', Math.min(9000, f * v.airMul), v.airQ);
    const air = ctx.createGain();
    air.gain.setValueAtTime(v.chiff, t);
    air.gain.exponentialRampToValueAtTime(v.air, t + 0.15);
    const g = route(ctx, o, out, rv(p, v.rev));
    n.connect(bp).connect(air).connect(g);
    adsr(g.gain, t, v.peak * vel, v.att, Math.max(0, dur - v.att), v.rel);
  }
  const FUE = { f: 880, wave: 'fue', scoop: 0.98, scoopT: 0.05, vib: 5.6, vibDelay: 0.2, vibDepth: 0.0075, airMul: 2, airQ: 1.4, chiff: 0.9, air: 0.2, att: 0.03, rel: 0.09, peak: 0.17, rev: 0.25 };
  const SHAKU = { f: 587, wave: 'shakuhachi', scoop: 0.966, scoopT: 0.09, vib: 4.8, vibDelay: 0.28, vibDepth: 0.011, airMul: 1.5, airQ: 0.9, chiff: 1.6, air: 0.42, att: 0.07, rel: 0.16, peak: 0.17, rev: 0.32 };

  /** 当り鉦（チャンチキ）：倍音でない比の 2 本の矩形波を bandpass に通した金属の音。d：鳴る長さ。ノード：osc 2・bandpass・gain（＋pan・送り）＝4〜6 */
  function kaneHit(ctx, out, t, p, d, peak) {
    const f = freqOf(p, 1180), vel = velOf(p, 0.8);
    const o1 = osc(ctx, 'square', f, t, t + d), o2 = osc(ctx, 'square', f * 1.483, t, t + d);
    const bp = filter(ctx, 'bandpass', Math.min(7000, f * 1.75), 1.5);
    o1.connect(bp);
    o2.connect(bp);
    const g = route(ctx, bp, out, rv(p, 0.2));
    perc(g.gain, t, peak * vel, 0.001, d);
  }

  return {
    /** 琴：爪ではじいた明るい音。はじいた直後は少し高く、すぐ落ち着く。明るさは速く消える。
     *  鳴る長さは書いた長さ＋余韻（低い弦ほど長い）。ノード：osc・lowpass・爪の音・gain（＋pan・送り）＝4〜6 */
    koto(ctx, out, t, p) {
      const f = freqOf(p, 440), vel = velOf(p, 0.8), dur = durOf(p, 0.25);
      const m = 69 + 12 * Math.log2(f / 440);
      const ring = clamp(Math.min(2 - (m - 60) * 0.03, dur + 0.6), 0.3, 2.4, 1);
      const o = wosc(ctx, 'koto', f * 1.012, t, t + ring);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      const lp = filter(ctx, 'lowpass', Math.min(12000, f * 9), 1.2);
      lp.frequency.setValueAtTime(Math.min(12000, f * 9), t);
      lp.frequency.exponentialRampToValueAtTime(clamp(f * 2.2, 300, 6000, 1000), t + 0.4);
      const g = route(ctx, o.connect(lp), out, rv(p, 0.22));
      hit(ctx, 'tsume', t, f / 660).connect(g);
      perc(g.gain, t, 0.26 * vel, 0.002, ring);
    },
    /** 三味線：撥で皮ごと打つ「べん」。細いパルス波を胴の鳴り（1.4 kHz あたりの山）に通す。
     *  打った瞬間は強く明るく、すぐ半分ほどに落ちてから余韻。ノード：osc・lowpass・peaking・撥の音・gain（＋pan・送り）＝5〜7 */
    shamisen(ctx, out, t, p) {
      const f = freqOf(p, 220), vel = velOf(p, 0.8), dur = durOf(p, 0.2);
      const ring = clamp(dur + 0.3, 0.2, 1.3, 0.5);
      const o = wosc(ctx, 'shamisen', f * 1.03, t, t + 0.08 + ring);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      const lp = filter(ctx, 'lowpass', 8000, 0.9);
      lp.frequency.setValueAtTime(clamp(f * 14, 1500, 12000, 4000), t);
      lp.frequency.exponentialRampToValueAtTime(clamp(f * 4.5, 600, 5000, 1500), t + 0.22);
      const body = filter(ctx, 'peaking', 1400, 2.4);
      body.gain.value = 8;
      const g = route(ctx, o.connect(lp).connect(body), out, rv(p, 0.12));
      hit(ctx, 'bachi', t).connect(g);
      const pk = pos(0.22 * vel);
      g.gain.setValueAtTime(FLOOR, t);
      g.gain.linearRampToValueAtTime(pk, t + 0.002);
      g.gain.exponentialRampToValueAtTime(pos(pk * 0.42), t + 0.07);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.07 + ring);
    },
    /** 篠笛：明るく澄んだ笛。旋律の主役。 */
    fue(ctx, out, t, p) { flute(ctx, out, t, p, FUE); },
    /** 尺八：息の多い、くぐもった笛。すくい上げとビブラートが大きい。 */
    shakuhachi(ctx, out, t, p) { flute(ctx, out, t, p, SHAKU); },
    /** 胡弓：弓でこする音（のこぎり波 → lowpass → 胴の山）。少し下からすくい、遅れてビブラート。
     *  ノード：osc・LFO・深さ・lowpass・peaking・gain（＋pan・送り）＝6〜8 */
    kokyu(ctx, out, t, p) {
      const f = freqOf(p, 440), vel = velOf(p, 0.8), dur = durOf(p, 0.4);
      const end = t + dur + 0.16;
      const o = osc(ctx, 'sawtooth', f * 0.985, t, end);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      if (dur > 0.25) vibrato(ctx, o, f, t, end, 5.8, 0.15, 0.008);
      const lp = filter(ctx, 'lowpass', 3000, 1);
      lp.frequency.setValueAtTime(clamp(f * 5 + 600, 800, 9000, 3000), t);
      lp.frequency.exponentialRampToValueAtTime(clamp(f * 3 + 300, 600, 6000, 2000), t + 0.18);
      const body = filter(ctx, 'peaking', 950, 1.6);
      body.gain.value = 5;
      const g = route(ctx, o.connect(lp).connect(body), out, rv(p, 0.28));
      adsr(g.gain, t, 0.12 * vel, 0.06, Math.max(0, dur - 0.06), 0.16);
    },
    /** 笙：細いリードの和音（'A4+B4+E5' のように和音で使う）。ゆっくりふくらみ、のばしている間も少しずつ強くなる。
     *  ノード：osc 2・mix・lowpass・gain（＋pan・送り）＝5〜7 */
    sho(ctx, out, t, p) {
      const f = freqOf(p, 880), vel = velOf(p, 0.7), dur = durOf(p, 1);
      const att = Math.min(0.5, 0.08 + dur * 0.25), top = Math.max(att + 0.02, dur), rel = 0.8, pk = pos(0.05 * vel);
      const mix = ctx.createGain();
      mix.gain.value = 0.5;
      for (const c of [-5, 5]) { const o = wosc(ctx, 'sho', f, t, t + top + rel); o.detune.value = c; o.connect(mix); }
      const lp = filter(ctx, 'lowpass', Math.min(8000, f * 6), 0.5);
      const g = route(ctx, mix.connect(lp), out, rv(p, 0.4));
      g.gain.setValueAtTime(FLOOR, t);
      g.gain.linearRampToValueAtTime(pk * 0.7, t + att);
      g.gain.linearRampToValueAtTime(pk, t + top);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + top + rel);
    },
    /** 声（合唱の「あー」）：少しずらした 2 本ののこぎり波を、lowpass と母音の山（820 Hz あたり）に通す。
     *  ノード：osc 2・mix・lowpass・peaking・gain（＋pan・送り）＝6〜8 */
    koe(ctx, out, t, p) {
      const f = freqOf(p, 440), vel = velOf(p, 0.7), dur = durOf(p, 1);
      const att = 0.25, rel = 0.6;
      const mix = ctx.createGain();
      mix.gain.value = 0.5;
      for (const c of [-8, 7]) { const o = osc(ctx, 'sawtooth', f, t, t + dur + rel); o.detune.value = c; o.connect(mix); }
      const lp = filter(ctx, 'lowpass', 1900, 0.5);
      const vowel = filter(ctx, 'peaking', 820, 1.3);
      vowel.gain.value = 8;
      const g = route(ctx, mix.connect(lp).connect(vowel), out, rv(p, 0.45));
      adsr(g.gain, t, 0.06 * vel, att, Math.max(0, dur - att), rel);
    },
    /** やわらかいベース（ほぼサイン波）。静かな曲に。ノード：osc・gain（＋pan・送り）＝2〜4 */
    sub(ctx, out, t, p) {
      const f = freqOf(p, 55), vel = velOf(p, 0.8), dur = durOf(p, 0.4);
      const o = wosc(ctx, 'sub', f, t, t + dur + 0.12);
      const g = route(ctx, o, out, rv(p, 0));
      adsr(g.gain, t, 0.34 * vel, 0.012, Math.max(0, dur - 0.04), 0.1);
    },
    /** 大太鼓（長胴）「どん」：下がっていくサイン波＋皮のもう 1 つの鳴り（倍音でない比）＋皮を打つ低いノイズ。
     *  低く鳴らすほど長く響く。ノード：osc 2・その gain・皮の音・gain（＋pan・送り）＝5〜7 */
    taiko(ctx, out, t, p) {
      const f = freqOf(p, 92), vel = velOf(p, 0.8);
      const d = clamp(0.62 * Math.sqrt(92 / f), 0.25, 0.9, 0.6);
      const o = osc(ctx, 'sine', f * 1.8, t, t + d);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
      o.frequency.exponentialRampToValueAtTime(f * 0.92, t + d);
      const o2 = osc(ctx, 'sine', f * 2.9, t, t + 0.25);
      o2.frequency.exponentialRampToValueAtTime(f * 1.59, t + 0.04);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.45, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      const g = route(ctx, o, out, rv(p, 0.25));
      o2.connect(g2).connect(g);
      hit(ctx, 'skin', t).connect(g);
      perc(g.gain, t, 0.8 * vel, 0.002, d);
    },
    /** 締太鼓「てん」：高く張った小さな太鼓。短い三角波と、皮をはたく音。ノード：osc・皮の音・gain（＋pan・送り）＝3〜5 */
    shime(ctx, out, t, p) {
      const f = freqOf(p, 400), vel = velOf(p, 0.8);
      const o = osc(ctx, 'triangle', f * 1.3, t, t + 0.14);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.012);
      const g = route(ctx, o, out, rv(p, 0.12));
      hit(ctx, 'slap', t).connect(g);
      perc(g.gain, t, 0.3 * vel, 0.001, 0.1);
    },
    /** 鼓「ぽん」：丸い音が鳴りながら少し下がる。ノード：osc・皮の音・gain（＋pan・送り）＝3〜5 */
    tsuzumi(ctx, out, t, p) {
      const f = freqOf(p, 300), vel = velOf(p, 0.8);
      const o = osc(ctx, 'sine', f * 1.15, t, t + 0.5);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      o.frequency.exponentialRampToValueAtTime(f * 0.85, t + 0.4);
      const g = route(ctx, o, out, rv(p, 0.35));
      hit(ctx, 'slap', t, 0.6).connect(g);
      perc(g.gain, t, 0.4 * vel, 0.002, 0.42);
    },
    /** 太鼓のふち「か」：乾いた短い木の音。ノード：osc・木の音・gain（＋pan・送り）＝3〜5 */
    ka(ctx, out, t, p) {
      const f = freqOf(p, 1100), vel = velOf(p, 0.8);
      const o = osc(ctx, 'triangle', f, t, t + 0.07);
      const g = route(ctx, o, out, rv(p, 0.08));
      hit(ctx, 'wood', t, f / 1800).connect(g);
      perc(g.gain, t, 0.2 * vel, 0.001, 0.05);
    },
    /** 拍子木「かちっ」：硬い木を打ち合わせる。ノード：osc 2・その gain・木の音・gain（＋pan・送り）＝5〜7 */
    hyoshigi(ctx, out, t, p) {
      const f = freqOf(p, 1500), vel = velOf(p, 0.8);
      const o = osc(ctx, 'sine', f, t, t + 0.2);
      const o2 = osc(ctx, 'sine', f * 2.76, t, t + 0.2);
      const g2 = ctx.createGain();
      g2.gain.value = 0.3;
      const g = route(ctx, o, out, rv(p, 0.3));
      o2.connect(g2).connect(g);
      hit(ctx, 'wood', t, f / 1800).connect(g);
      perc(g.gain, t, 0.26 * vel, 0.001, 0.14);
    },
    /** 当り鉦「ちゃん」（響かせる）。 */
    kane(ctx, out, t, p) { kaneHit(ctx, out, t, p, 0.34, 0.1); },
    /** 当り鉦「ちき」（押さえて短く）。 */
    chiki(ctx, out, t, p) { kaneHit(ctx, out, t, p, 0.07, 0.075); },
    /** 鈴（神楽鈴）：高い 3 つの鳴り（倍音でない比）を、振るように 4 回すばやく鳴らす。まばらに使う。
     *  ノード：osc 3・gain（＋pan・送り）＝4〜6 */
    suzu(ctx, out, t, p) {
      const f = freqOf(p, 2300), vel = velOf(p, 0.8), end = t + 0.75;
      const os = [[1, 0], [1.34, 8], [1.93, -6]].map(([k, c], i) => {
        const o = osc(ctx, 'sine', f * k, t, end);
        o.detune.value = c + (hash(t, i + 1) * 2 - 1) * 12;
        return o;
      });
      const g = route(ctx, os[0], out, rv(p, 0.45));
      os[1].connect(g);
      os[2].connect(g);
      const pk = pos(0.035 * vel), gp = g.gain;
      const shake = [[0, 1], [0.05, 0.55], [0.11, 0.7], [0.18, 0.4]];
      gp.setValueAtTime(FLOOR, t);
      shake.forEach(([dt, a], i) => {
        gp.linearRampToValueAtTime(pos(pk * a), t + dt + 0.002);
        const last = i === shake.length - 1;
        gp.exponentialRampToValueAtTime(last ? FLOOR : pos(pk * a * 0.25), t + (last ? 0.62 : shake[i + 1][0]));
      });
    },
  };
}
