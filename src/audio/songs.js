// 曲のデータ（書き方は sequencer.js の先頭）。狐火かぐら：タイトル・3 つのステージ・3 人のボス・エンディング・ゲームオーバー・おまけステージ。
//   title（イ短調 84）／st1（ニ長調 156）／boss1（ハ長調のシャッフル、拍は 165）／st2（ホ短調・都節 144）／boss2（ニ短調 168）
//   ／st3（イ長調 → ロ長調 150）／boss3（ハ短調 172）／ending（イ長調 88）／gameover（2 小節。くり返さない）
//   ／clawd（おまけステージ。ニ長調 → ホ長調 170、和 × 8bit）。play は st1 の別名（古いコードが使う）。
// タイトルの主題はエンディングで長調に、つくよ（boss3）のサビの主題もエンディングでやさしい長調になって戻ってくる。
//
// 小節の文字列を手で 16 個ずつ数えると間違えるので、下の小さな道具で作る（できあがるのは、ふつうの小節の文字列）：
//   mel('E5:6 F5:2 E5:8 | …')   旋律を「音:長さ（ステップ数）」で書き、'|' で小節を区切る（長さを省くと 1）。
//                               '.:4' 休み、'-:4' 前の音をのばす（小節をまたいでもよい）、'C5!:2' 強く、'C5?:2' 弱く、'A4+C5:8' 和音。
//                               小節の長さが合わないと、compile() の警告（〜個のはず）に出る。
//   和音の表（chart）             1 小節を空白で枠に分け、枠ごとに和音記号を書く（'F G' は前半 F・後半 G、'.' は前の和音のまま）。
//                               記号：C Cm C5 C7 Cm7 Cmaj7 C6 Csus4 Csus2 C7sus4 Cadd9 Cmadd9 C9 Cm9 Cdim Cdim7 Cm7b5 Caug、分数 'C/E'。
//   pad(chart, opt)             和音を押さえる（前の和音から一番近い形を選ぶ）。opt.lo / hi は音域（MIDI）、opt.every で弾き直す間隔。
//   arp(chart, tpl, opt)        分散和音。tpl の数字＝下から何番目の音（和音の音の数より大きいと 1 オクターブ上へ）、'1+3' は 2 音いっしょ。
//   bass(chart, tpl, opt)       ベース。r 根音（分数和音なら下の音）、o その 1 オクターブ上、3 5 6 7 は和音の 3・5・6・7 度。
//                               和音が変わるところの '-' は根音を弾き直す。opt.lo より上の 1 オクターブに根音を置く。
//   tpl を配列にすると小節ごとに順に使う（null の小節は休み）。rep(n, …) は同じ小節（の並び）を n 回。
//   shift(bars, k) は半音 k 個ずらす。over(bars, n, xs) は n 小節目から xs で置きかえる。
// 曲の chart は解析と開発用の表示のために曲にも持たせる（シーケンサーは使わない）。
//
// 音量の目安：書き出して peak ≤ 0.9、RMS 0.10〜0.18（dev/audio.html の「書き出して確かめる」）。
// 効果音が上に乗るので、旋律は C5〜A5 あたりに置き、2〜5 kHz（鉦・鈴・ハイハット）を埋めすぎない。
// 列に pan（0 以外）を書くと StereoPanner が入り、真ん中寄りでも約 3 dB 小さくなる（pan なしの列はそのまま左右に出る）。
import { noteToMidi } from './sequencer.js';

// ---------------------------------------------------------------- 書くための小さな道具
const rep = (n, ...xs) => Array.from({ length: n }, () => xs).flat();
const over = (bars, at, xs) => { const b = [...bars]; b.splice(at - 1, xs.length, ...xs); return b; };

function mel(src) {
  return src.split('|').map((s) => s.trim()).filter(Boolean).map((s) => {
    const out = [];
    for (const tk of s.split(/\s+/)) {
      const i = tk.lastIndexOf(':');
      const body = i > 0 ? tk.slice(0, i) : tk;
      const n = i > 0 ? Math.max(1, parseInt(tk.slice(i + 1), 10) || 1) : 1;
      if (body === '.') for (let k = 0; k < n; k++) out.push('.');
      else { out.push(body); for (let k = 1; k < n; k++) out.push('-'); }
    }
    return out.join(' ');
  });
}

function shift(bars, k) {
  return bars.map((b) => (typeof b !== 'string' ? b : b.split(/\s+/).map((tk) => {
    if (tk === '.' || tk === '-') return tk;
    const m = /^([^!?]+)([!?]?)$/.exec(tk);
    return m[1].split('+').map((x) => 'n' + (noteToMidi(x) + k)).join('+') + m[2];
  }).join(' ')));
}

const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 5: [0, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9],
  sus4: [0, 5, 7], sus2: [0, 2, 7], '7sus4': [0, 5, 7, 10], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], 9: [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14], dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8],
};
const pcOf = (name) => ((noteToMidi(name + '4') % 12) + 12) % 12;
function chord(sym) {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym);
  if (!m || !(m[2] in QUAL)) { console.warn('[songs] 和音記号が読めない:', sym); return { root: 0, bass: 0, iv: QUAL[''] }; }
  return { root: pcOf(m[1]), bass: m[3] ? pcOf(m[3]) : pcOf(m[1]), iv: QUAL[m[2]] };
}

/** 和音の表 → 小節ごと・ステップごとの { ch: 和音, start: ここで変わるか }。 */
function slots(chart, steps) {
  let cur = null;
  return chart.map((bar) => {
    const ss = bar.trim().split(/\s+/);
    const len = Math.floor(steps / ss.length);
    if (len * ss.length !== steps) console.warn('[songs] 和音の枠が割り切れない:', bar);
    const row = [];
    ss.forEach((s) => {
      const start = s !== '.';
      if (start) cur = chord(s);
      for (let k = 0; k < len; k++) row.push({ ch: cur, start: start && k === 0 });
    });
    while (row.length < steps) row.push({ ch: cur, start: false });
    return row;
  });
}

/** 和音を lo〜hi の中に密集して積んだ形をすべて（転回形 × 位置。9 度は隣の音とくっつく＝笙の合竹のような形）。 */
function voicings(ch, lo, hi) {
  const pcs = [...new Set(ch.iv.map((x) => (ch.root + x) % 12))].sort((a, b) => a - b);
  const res = [];
  for (let inv = 0; inv < pcs.length; inv++) {
    const order = [...pcs.slice(inv), ...pcs.slice(0, inv)];
    for (let base = lo; base <= hi; base++) {
      if (base % 12 !== order[0]) continue;
      const v = [base];
      for (const pc of order.slice(1)) { let x = v[v.length - 1] + 1; while (x % 12 !== pc) x++; v.push(x); }
      if (v[v.length - 1] <= hi) res.push(v);
    }
  }
  return res;
}
const avg = (v) => v.reduce((a, b) => a + b, 0) / v.length;
/** 前の形から一番近い形（それぞれの音から一番近い音までの距離の合計。真ん中から離れすぎないように少し引き戻す）。 */
function closest(cands, prev, lo, hi) {
  if (!cands.length) return null;
  const near = (a, b) => a.reduce((s, x) => s + Math.min(...b.map((y) => Math.abs(x - y))), 0);
  const cost = (v) => (prev ? near(v, prev) + near(prev, v) : 0) + 0.6 * Math.abs(avg(v) - (lo + hi) / 2);
  return cands.reduce((a, b) => (cost(b) < cost(a) ? b : a));
}
const tpls = (tpl) => [].concat(tpl);

function pad(chart, { lo = 55, hi = 74, steps = 16, every = 0, acc = '' } = {}) {
  let v = null;
  return slots(chart, steps).map((row) => row.map((c, i) => {
    if (!c.ch) return '.';
    if (c.start) v = closest(voicings(c.ch, lo, hi), v, lo, hi) || v;
    if (!v) return '.';
    return c.start || (every && i % every === 0) ? v.map((x) => 'n' + x).join('+') + acc : '-';
  }).join(' '));
}

function arp(chart, tpl, { lo = 57, hi = 76, steps = 16 } = {}) {
  const T = tpls(tpl);
  let v = null;
  return slots(chart, steps).map((row, b) => {
    const t = T[b % T.length];
    const tk = t == null ? [] : t.trim().split(/\s+/);
    const bar = row.map((c, i) => {
      if (c.start && c.ch) v = closest(voicings(c.ch, lo, hi), v, lo, hi) || v;
      const x = tk[i] ?? '.';
      const m = /^(\d(?:\+\d)*)([!?]?)$/.exec(x);
      if (!m) return x;
      if (!v) return '.';
      return m[1].split('+').map((d) => { const k = Number(d) - 1, n = v.length; return 'n' + (v[k % n] + 12 * Math.floor(k / n)); }).join('+') + m[2];
    });
    return t == null ? null : bar.join(' ');
  });
}

function bass(chart, tpl, { lo = 28, steps = 16 } = {}) {
  const T = tpls(tpl);
  const deg = (ch, want, d) => ch.iv.find((x) => want.includes(x % 12)) ?? d;
  return slots(chart, steps).map((row, b) => {
    const t = T[b % T.length];
    if (t == null) return null;
    const tk = t.trim().split(/\s+/);
    return row.map((c, i) => {
      let x = tk[i] ?? '.';
      if (!c.ch) return x === '-' ? '-' : '.';
      if (x === '-' && c.start) x = 'r';
      const m = /^([ro3567])([!?]?)$/.exec(x);
      if (!m) return x;
      const r = lo + ((((c.ch.bass - lo) % 12) + 12) % 12);
      const root = r + ((((c.ch.root - c.ch.bass) % 12) + 12) % 12);
      const n = { r, o: r + 12, 3: root + deg(c.ch, [3, 4, 5, 2], 4), 5: root + deg(c.ch, [7, 6, 8], 7), 6: root + 9, 7: root + deg(c.ch, [10, 11, 9], 10) }[m[1]];
      return 'n' + n + m[2];
    }).join(' ');
  });
}

// ================================================================ title：タイトル（夜の社。静かで、少しさびしい）
// イ短調（平調子 A B C E F の色）、84 BPM、24 小節で 1 周。琴の分散和音と笙の上で、尺八 → 篠笛が主題を吹く。
// 主題（E A B C ─ ／ E C B A ─）は、エンディングで長調になって戻ってくる。
const T_CH = [
  'Amadd9', 'Fmaj7', 'Dm9', 'Esus4 Em',                                  // 1–4 前奏：琴と笙だけ
  'Am', 'Fmaj7', 'G6', 'Em7', 'Am', 'Fmaj7', 'Dm7', 'Esus4 Em',          // 5–12 A：尺八の主題
  'Fmaj7', 'G6', 'Em7', 'Amadd9', 'Dm7', 'G', 'Cmaj7', 'Esus4 Em',       // 13–20 B：篠笛（少し明るく、上へ）
  'Amadd9', 'Fmaj7', 'Dm9', 'Esus4 Em',                                  // 21–24 後奏：琴が主題を高く → 1 小節目へ
];
const T_KA = '1 2 3 4 5 . 4 3 2 3 4 5 6 . 5 4'; // さざなみ（16 分）
const T_KB = '1 . 3 . 5 . 4 . 2 . 4 . 5 . 3 .'; // 旋律の下では 8 分で静かに
const title = {
  id: 'title', bpm: 84, gain: 1.8, chart: T_CH,
  tracks: {
    koto: { inst: 'koto', vol: 0.85, pan: -0.25, bars: arp(T_CH, [...rep(4, T_KA), ...rep(16, T_KB), ...rep(4, T_KA)], { lo: 52, hi: 69 }) },
    sho: { inst: 'sho', vol: 0.6, bars: pad(T_CH, { lo: 62, hi: 79 }) },
    sub: { inst: 'sub', vol: 0.3, bars: bass(T_CH, 'r - - - - - - - - - - - - - - -', { lo: 36 }) },
    shaku: { inst: 'shakuhachi', bars: [...rep(4, null), ...mel(`
      .:2 E4:2 A4:3 B4:1 C5:8 | E5:4 C5:2 B4:2 A4:8 | .:2 D4:2 G4:3 A4:1 B4:8 | D5:4 B4:2 A4:2 G4:4 E4:4 |
      .:2 E4:2 A4:3 B4:1 C5:4 E5:4 | F5:6 E5:2 C5:4 A4:4 | D5:4 C5:2 A4:2 F4:4 A4:4 | B4:6 A4:2 E4:8`), ...rep(12, null)] },
    fue: { inst: 'fue', vol: 0.9, bars: [...rep(12, null), ...mel(`
      .:2 A4:2 C5:2 E5:2 A5:6 G5:2 | E5:6 D5:2 B4:8 | .:2 G4:2 B4:2 D5:2 G5:6 E5:2 | C5:4 B4:4 A4:8 |
      .:2 F4:2 A4:2 C5:2 F5:6 E5:2 | D5:6 C5:2 B4:8 | .:2 E5:2 G5:2 B5:2 C6:6 B5:2 | A5:6 E5:2 B4:8`), ...rep(4, null)] },
    koe: { inst: 'koe', vol: 0.55, bars: [...rep(12, null), ...pad(T_CH.slice(12, 20), { lo: 55, hi: 70 }), ...rep(4, null)] },
    koto2: { inst: 'koto', vol: 1.4, pan: 0.15, bars: [...rep(20, null), ...mel(`
      .:2 E5:2 A5:3 B5:1 C6:8 | A5:3 G5:1 E5:4 C5:8 | .:2 A4:2 D5:3 E5:1 F5:8 | E5:6 D5:2 B4:8`)] },
    perc: { inst: 'drums', vol: 0.8, bars: [
      { suzu: 'x... .... .... ....' }, null, null, null,
      { tsuzumi: 'x... .... .... ....' }, null, { tsuzumi: 'x... .... ..o. ....' }, null,
      { tsuzumi: 'x... .... .... ....' }, null, { tsuzumi: 'x... .... ..o. ....' }, null,
      { suzu: 'x... .... .... ....' }, null, { tsuzumi: 'x... .... .... ....' }, null,
      { tsuzumi: 'x... .... .... ....' }, null, { suzu: 'x... .... .... ....' }, { tsuzumi: '.... .... x... ....' },
      { suzu: 'x... .... .... ....' }, null, null, null,
    ] },
  },
};

// ---------------------------------------------------------------- よく使うひな形
const K_RUN = '1 2 3 4 5 4 3 2 1 2 3 4 5 4 3 2';   // 琴：16 分で上って下りる
const K_8 = '1 . 2 . 3 . 2 . 1 . 2 . 3 . 4 .';     // 琴：8 分
const B_8 = 'r . r . r . r . r . r . r . r .';      // ベース：8 分
const B_DRIVE = 'r . o . r . o . r . o . r . o .';  // ベース：オクターブで走る
const B_BOUNCE = 'r . . r . . r . r . . r . . o .'; // ベース：3＋3＋2 で跳ねる（太鼓の「どん・どどん」）
const BAR = 'r - - - - - - - - - - - - - - -';      // ベース：全音符
const HALF = 'r - - - - - - - r - - - - - - -';     // ベース：2 分音符

// ================================================================ st1：ステージ 1（夕暮れの千本鳥居。お祭りへ向かう道）
// ニ長調（陽音階 D E G A B ＋長音階）、156 BPM、48 小節。三味線のリフと、大太鼓・締太鼓・当り鉦の祭りばやしで始まる。
// 前奏（1–4 リフ、5–8 篠笛の呼びかけ）→ A（9–16、下がっていくベース）→ 盛り上げ（17–24）
// → サビ（25–40、IV–V–iii–vi。琴が 1 オクターブ下で重ねる）→ 三味線と笛のかけあい（41–48）→ 1 小節目へ。
const S1_CH = [
  'D', 'D', 'G/D', 'D', 'G', 'A', 'Bm', 'A',
  'D', 'A/C#', 'Bm', 'Bm/A', 'G', 'D/F#', 'Em7', 'A',
  'G', 'A', 'F#m7', 'Bm7', 'Em7', 'F#m7', 'G', 'A7sus4 A7',
  'Gmaj7', 'A', 'F#m7', 'Bm', 'Gmaj7', 'A', 'D', 'D7',
  'Gmaj7', 'A', 'F#m7', 'Bm', 'Em7', 'A', 'D', 'D',
  'Bm', 'G', 'A', 'D', 'Bm', 'G', 'Em7', 'A',
];
const S1_RIFF = mel(`
  D3 . D4 . A3 . D4 E4 G4 . E4 . D4 . A3 . | B3 . D4 . A3 . G3 A3 B3 . A3 . G3 . E3 . |
  D3 . D4 . B3 . D4 E4 G4 . E4 . D4 . B3 . | A3 . D4 . E4 . F#4 E4 D4 . A3 . B3 . A3 .`);
const S1_HOOK = mel(`
  A5:3 B5:3 A5:2 F#5:4 E5:2 D5:2 | E5:4 .:2 A4:2 C#5:2 E5:2 F#5:2 E5:2 | A5:3 B5:3 A5:2 F#5:4 E5:2 C#5:2 | D5:6 C#5:2 B4:8 |
  A5:3 B5:3 A5:2 F#5:4 E5:2 D5:2 | E5:4 .:2 A4:2 C#5:2 E5:2 A5:2 B5:2 | D6:6 C#6:2 B5:4 A5:4 | A5:6 F#5:2 D5:4 E5:2 F#5:2 |
  A5:3 B5:3 A5:2 F#5:4 E5:2 D5:2 | E5:4 .:2 A4:2 C#5:2 E5:2 F#5:2 E5:2 | A5:3 B5:3 A5:2 F#5:4 E5:2 C#5:2 | D5:6 E5:2 F#5:8 |
  G5:3 A5:3 G5:2 E5:4 D5:2 B4:2 | C#5:4 E5:4 A5:4 B5:2 C#6:2 | D6:12 .:4 | .:4 A4:2 B4:2 D5:2 E5:2 F#5:2 A5:2`);
const S1_CHOP = '. . 1+3 . . . 1+3 . . . 1+3 . . . 1+3 .'; // 三味線：裏拍で 2 音
const st1 = {
  id: 'st1', bpm: 156, gain: 1.75, chart: S1_CH,
  tracks: {
    fue: { inst: 'fue', bars: [...rep(4, null), ...mel(`
      D5:2 E5:2 G5:2 A5:2 B5:4 A5:2 G5:2 | A5:6 G5:2 E5:4 .:4 | D5:2 E5:2 F#5:2 A5:2 B5:4 A5:2 F#5:2 | E5:12 .:4 |
      .:2 A4:2 D5:2 E5:2 F#5:4 E5:2 D5:2 | E5:6 D5:2 C#5:4 A4:4 | .:2 B4:2 D5:2 E5:2 F#5:4 A5:2 F#5:2 | F#5:8 E5:4 D5:4 |
      .:2 B4:2 D5:2 E5:2 G5:4 F#5:2 E5:2 | F#5:4 E5:2 D5:2 A4:8 | .:2 G4:2 B4:2 D5:2 E5:4 G5:2 E5:2 | E5:6 F#5:2 E5:4 C#5:4 |
      B4:4 D5:4 G5:6 F#5:2 | E5:4 C#5:4 A4:8 | A4:4 C#5:4 F#5:6 E5:2 | D5:4 F#5:4 B5:8 |
      G5:4 E5:4 B4:6 D5:2 | C#5:4 E5:4 A5:6 F#5:2 | G5:4 A5:4 B5:6 A5:2 | A5:8 .:2 E5:2 F#5:2 G5:2`), ...S1_HOOK, ...mel(`
      .:16 | .:2 D5:2 E5:2 G5:2 A5:3 G5:1 E5:2 D5:2 | .:16 | .:2 F#5:2 E5:2 D5:2 E5:3 F#5:1 A5:4 |
      B5:4 A5:2 F#5:2 E5:2 F#5:2 D5:4 | D5:4 E5:2 G5:2 A5:4 B5:4 | G5:6 E5:2 D5:4 B4:4 | E5:6 C#5:2 A4:8`)] },
    koto: { inst: 'koto', vol: 1.05, pan: -0.25, bars: over(over(arp(S1_CH, [
      ...rep(4, null), ...rep(4, K_8), ...rep(8, '1 . . 3 . . 2 . . 4 . . 3 . 2 .'), ...rep(8, K_RUN), ...rep(16, null), ...rep(4, K_8), ...rep(4, K_RUN),
    ], { lo: 55, hi: 69 }), 1, mel('D4 E4 G4 A4 B4 D5:3 .:8')), 25, shift(S1_HOOK, -12)) },
    shami: { inst: 'shamisen', vol: 1.2, pan: 0.25, bars: over(over(over(arp(S1_CH, [
      ...rep(4, null), ...rep(12, S1_CHOP), ...rep(4, null), ...rep(28, S1_CHOP),
    ], { lo: 50, hi: 64 }), 1, S1_RIFF), 41, mel('B3 . B3 D4 F#4 . E4 D4 B3 . A3 . B3 .:3')), 43, mel('A3 . A3 C#4 E4 . D4 C#4 A3 . G3 . A3 .:3')) },
    pad: { inst: 'pad', vol: 0.6, bars: [...rep(16, null), ...pad(S1_CH.slice(16, 40), { lo: 57, hi: 74 }), ...rep(8, null)] },
    bass: { inst: 'bass', vol: 0.85, bars: bass(S1_CH, [
      null, null, ...rep(6, B_BOUNCE), ...rep(8, 'r . r . o . r . r . r . o . r .'), ...rep(4, 'r . . . r . . . r . . . r . . .'), ...rep(4, B_8),
      ...rep(16, B_DRIVE), ...rep(7, B_BOUNCE), 'r . r . r . r . o . o . o . o .',
    ], { lo: 28 }) },
    kit: { inst: 'drums', vol: 0.6, bars: (() => {
      const intro = { kick: 'x... .... x... ....', snare: '.... x... .... x...' };
      const verse = { kick: 'x... ..x. x... ....', snare: '.... x... .... x...', hat: '..x. ..x. ..x. ..x.' };
      const pre = { kick: 'x... x... x... x...', snare: '.... x... .... x...', hat: '..x. ..x. ..x. ..x.' };
      const preFill = { kick: 'x... x... x... x...', snare: 'x.x. x.x. xxxx XXXX', hat: '..x. ..x. .... ....' };
      const hook = { kick: 'x... x... x... x...', snare: '.... X... .... X...', hat: '..O. ..O. ..O. ..O.' };
      const hookFill = { kick: 'x... x... x... x.x.', snare: '.... X... ..x. XxXX', hat: '..O. ..O. .... ....' };
      const end = { kick: 'x... x... x... x...', snare: '.... x... x.x. xxxx' };
      return [...rep(4, null), ...rep(4, intro), ...rep(8, verse), ...rep(7, pre), preFill, ...rep(7, hook), hookFill, ...rep(7, hook), hookFill, ...rep(7, verse), end];
    })() },
    wa: { inst: 'drums', vol: 0.35, bars: (() => {
      const intro = { taiko: 'X... x..x X... x...', shime: 'x.xx x.xx x.xx x.xx' };
      const introEnd = { taiko: 'X... x..x X.x. X.X.', shime: 'x.xx x.xx xxxx xxxx' };
      const main = { taiko: 'X... .... .... ....', shime: 'o.oo o.oo o.oo o.oo' };
      const pre = { taiko: 'X... .... x... ....', shime: 'o.oo o.oo o.oo o.oo' };
      const hook = { taiko: 'X... .... .... ....', shime: 'x.oo x.oo x.oo x.oo' };
      const inter = { taiko: 'X..x ..X. X..x ..x.', shime: 'x.xx x.xx x.xx x.xx' };
      const fill = { taiko: 'X... X... X.X. XXXX' };
      return [...rep(3, intro), introEnd, ...rep(3, intro), introEnd, ...rep(8, main), ...rep(7, pre), fill, ...rep(16, hook), ...rep(7, inter), fill];
    })() },
    kane: { inst: 'drums', vol: 0.7, pan: 0.3, bars: (() => {
      const open = { hyoshigi: 'x... .... .... ....', kane: 'x... .... .... ....', chiki: '..o. o..o ..o. o..o' };
      const chan = { kane: 'x... .... x... ....', chiki: '..o. o..o ..o. o..o' };
      const accent = { kane: 'x... .... .... ....' };
      const suzu = { kane: 'x... .... .... ....', suzu: 'x... .... .... ....' };
      return [open, ...rep(7, chan), accent, ...rep(7, null), accent, ...rep(7, null), suzu, ...rep(7, null), accent, ...rep(7, null), open, ...rep(7, chan)];
    })() },
  },
};

// ================================================================ boss1：ぽこ（豆狸）。いたずら好きで、跳ねる
// ハ長調のシャッフル（はねる 8 分）。1 小節 12 ステップ＝3 連符の 8 分なので、bpm は 165 の 3/4（123.75）と書く（拍は 165）。
// A（1–8）：三味線と琴で主題（I–VI7–ii–V のくり返し、ブギのベース）、鼓の「ぽん・ぽこ」が合いの手
// → B（9–16）：篠笛が歌う → C（17–24）：抜き足差し足（イ短調、下がっていくベース。化かしの場面）→ A'（25–32）：みんなで主題。
const B1_CH = [
  'C', 'A7', 'Dm7', 'G7', 'C', 'A7', 'Dm7 G7', 'C',
  'F', 'F#dim7', 'C/G', 'A7', 'Dm7', 'G7', 'Em7 A7', 'Dm7 G7',
  'Am', 'Am/G', 'F7', 'E7', 'Am', 'Am/G', 'D7/F#', 'G7',
  'C', 'A7', 'Dm7', 'G7', 'C', 'A7', 'Dm7 G7', 'C G7',
];
const B1_HOOK = mel(`
  E4:2 G4 C5:2 E5 D#5:2 E5 C5:3 | .:2 C#5 E5:2 G5 A5:3 G5:2 E5 | F5:3 E5:2 D5 C5:3 A4:3 | B4:2 C5 D5:2 F5 E5:2 D5 B4:3 |
  E4:2 G4 C5:2 E5 D#5:2 E5 C5:3 | .:2 C#5 E5:2 G5 A5:2 Bb5 A5:2 G5 | F5:3 D5:3 G5:2 F5 D5:3 | E5:3 C5:3 .:6`);
const B1_HOOK2 = [...B1_HOOK.slice(0, 7), ...mel('C5:3 G4:3 B4:2 D5 F5:3')];
const B1_SNEAK = mel(`
  A3 . C4 E4 . A4 G#4 . A4 E4:2 . | A3 . C4 E4 . A4 B4 . C5 B4:2 . | A3 . C4 Eb4 . F4 A4 . C5 A4:2 . | G#3 . B3 D4 . E4 G#4 . B4 G#4:2 . |
  A3 . C4 E4 . A4 G#4 . A4 E4:2 . | A3 . C4 E4 . A4 B4 . C5 B4:2 . | F#4 . A4 C5 . D5 F#5 . A5 F#5:2 . | G5:2 F5 D5:2 B4 G4:2 F4 D4:3`);
const B1_SPLIT = (ch, one, two) => ch.map((c) => (c.includes(' ') ? two : one));
const boss1 = {
  id: 'boss1', bpm: 123.75, steps: 12, gain: 1.95, chart: B1_CH,
  tracks: {
    shami: { inst: 'shamisen', vol: 1.45, pan: 0.15, bars: [...B1_HOOK,
      ...arp(B1_CH.slice(8, 16), '. . 1+3 . . 1+3 . . 1+3 . . 1+3', { lo: 50, hi: 64, steps: 12 }), ...B1_SNEAK, ...B1_HOOK2] },
    koto2: { inst: 'koto', vol: 1.2, pan: -0.2, bars: [...B1_HOOK, ...rep(16, null), ...B1_HOOK2] },
    fue: { inst: 'fue', bars: [...rep(8, null), ...mel(`
      A4:3 C5:3 F5:5 E5 | Eb5:3 C5:3 A4:3 F#4:3 | G4:2 C5 E5:2 G5 A5:3 G5:3 | E5:6 C#5:3 A4:3 |
      D5:2 F5 A5:2 C6 A5:3 F5:3 | G5:3 F5:2 D5 B4:3 G4:3 | E5:2 G5 B5:3 A5:2 G5 E5:2 C#5 | D5:3 F5:3 B4:2 D5 G4:3 |
      E5:12 | E5:6 D5:6 | C5:6 Eb5:6 | D5:6 B4:6 | C5:12 | C5:6 B4:6 | A4:6 C5:6 | B4:6 D5:3 F5:3`), ...B1_HOOK2] },
    chomp: { inst: 'koto', vol: 0.9, pan: -0.3, bars: [...rep(8, null),
      ...arp(B1_CH.slice(8, 16), '. . . 1+2+3 . . . . . 1+2+3 . .', { lo: 55, hi: 70, steps: 12 }), ...rep(8, null),
      ...arp(B1_CH.slice(24), '. . . 1+2+3 . . . . . 1+2+3 . .', { lo: 55, hi: 70, steps: 12 })] },
    bass: { inst: 'bass', vol: 0.5, bars: bass(B1_CH, [
      ...B1_SPLIT(B1_CH.slice(0, 8), 'r - 3 5 - 6 7 - 6 5 - 3', 'r - 3 5 - 3 r - 3 5 - 3'),
      ...B1_SPLIT(B1_CH.slice(8, 16), 'r - - 3 - - 5 - - 6 - -', 'r - 3 5 - 3 r - 3 5 - 3'),
      ...rep(8, 'r - . 5 - . r - . 5 - .'),
      ...B1_SPLIT(B1_CH.slice(24), 'r - 3 5 - 6 7 - 6 5 - 3', 'r - 3 5 - 3 r - 3 5 - 3'),
    ], { lo: 33, steps: 12 }) },
    kit: { inst: 'drums', vol: 0.65, bars: (() => {
      const a = { kick: 'x.. ... x.. ...', snare: '... x.. ... x..', hat: 'x.x x.x x.x x.x' };
      const aEnd = { kick: 'x.. ... ... ...', snare: '... x.. ... ...', hat: 'x.x x.x ... ...' };
      const b = { kick: 'x.. ... x.. ..x', snare: '... x.o ... x..', hat: '..x ..x ..x ..x' };
      const bFill = { kick: 'x.. ... x.. ...', snare: '... x.. x.x xxx' };
      const c = { kick: 'x.. ... x.. ...', hat: '..o ..o ..o ..o' };
      const cFill = { kick: 'x.. ... x.. ...', snare: '... ... x.x XxX' };
      return [...rep(3, a), aEnd, ...rep(3, a), aEnd, ...rep(7, b), bFill, ...rep(7, c), cFill, ...rep(3, a), aEnd, ...rep(3, a), bFill];
    })() },
    wa: { inst: 'drums', vol: 0.7, bars: (() => {
      const pon = { tsuzumi: '... ... x.x x..' };                       // ぽん・ぽこ・ぽん（狸の腹つづみ）
      const ponEnd = { taiko: '... ... X.. ...', tsuzumi: '... ... ..x x.x' };
      const ka = { ka: '... x.. ... x..' };
      const tiptoe = { shime: '..o ..o ..o ..o' };
      return [null, null, null, pon, null, null, null, ponEnd, ...rep(8, ka), ...rep(8, tiptoe), null, null, null, pon, null, null, null, ponEnd];
    })() },
    kane: { inst: 'drums', vol: 0.7, pan: 0.3, bars: [
      { hyoshigi: 'x.. ... ... ...' }, ...rep(7, null), { kane: 'x.. ... ... ...' }, ...rep(7, null),
      { suzu: 'x.. ... ... ...' }, ...rep(7, null), { kane: 'x.. ... ... ...', hyoshigi: 'x.. ... ... ...' }, ...rep(7, null)] },
  },
};

// ================================================================ st2：ステージ 2（夜の竹林と、灯籠流しの川）
// ホ短調（都節 E F A B C の色）、144 BPM、48 小節。琴の 16 分のさざなみ（川）と、竹の「か」、灯籠の鈴。
// 前奏（1–8、E の上で i と ♭II を行き来する）→ A：尺八（9–24）→ サビ：篠笛（25–40、♭VI△7–V7–i の切ない進行で走る）
// → 間奏：琴が都節で駆ける（41–48）→ B7 から 1 小節目へ。
const S2_CH = [
  'Em', 'Fmaj7/E', 'Em', 'Fmaj7/E', 'Em', 'Fmaj7/E', 'Dm/E', 'Fmaj7/E',
  'Em', 'Fmaj7', 'Em', 'Fmaj7', 'Am7', 'G', 'Fmaj7', 'Esus4 Em',
  'Em', 'Fmaj7', 'Em', 'Dm7', 'Am7', 'C', 'Am7', 'Bsus4 B7',
  'Cmaj7', 'B7', 'Em7', 'Em7/D', 'Cmaj7', 'B7', 'Em', 'D',
  'Cmaj7', 'B7', 'Em7', 'Em7/D', 'Am7', 'B7', 'Em', 'Fmaj7/E',
  'Em', 'Fmaj7/E', 'Em', 'Fmaj7/E', 'Am', 'G', 'Fmaj7', 'Bsus4 B7',
];
const S2_WATER = mel(`
  E4 B4 A4 B4 E5 B4 A4 B4 E4 B4 A4 B4 F5 E5 B4 A4 | E4 C5 A4 C5 E5 C5 A4 C5 E4 C5 A4 C5 F5 E5 C5 A4 |
  E4 A4 F4 A4 D5 A4 F4 A4 E4 A4 F4 A4 D5 E5 A4 F4`);
const st2 = {
  id: 'st2', bpm: 144, gain: 1.8, chart: S2_CH,
  tracks: {
    shaku: { inst: 'shakuhachi', bars: [...rep(4, null), ...mel(`
      .:8 B4:8 | C5:6 B4:2 A4:8 | .:8 E4:4 F4:4 | E4:16 |
      B4:6 C5:2 B4:4 A4:2 B4:2 | C5:6 A4:2 F4:4 E4:4 | .:2 E4:2 F4:2 A4:2 B4:6 C5:2 | E5:8 C5:4 A4:4 |
      B4:6 C5:2 E5:4 D5:2 C5:2 | B4:8 A4:4 G4:4 | A4:4 C5:4 F5:6 E5:2 | E5:4 B4:4 E4:8 |
      B4:6 C5:2 B4:4 A4:2 B4:2 | C5:6 A4:2 F4:4 A4:4 | .:2 E5:2 F5:2 A5:2 B5:6 A5:2 | F5:8 E5:4 D5:4 |
      C5:6 B4:2 C5:4 E5:4 | G5:8 E5:4 C5:4 | E5:4 D5:2 C5:2 A4:8 | B4:4 E5:4 D#5:4 F#5:4`), ...rep(24, null)] },
    shaku2: { inst: 'shakuhachi', vol: 0.5, bars: [...rep(40, null), ...mel('B4:16 | A4:16 | B4:16 | A4:16 | C5:16 | B4:16 | A4:16 | B4:16')] },
    fue: { inst: 'fue', bars: [...rep(24, null), ...mel(`
      G5:3 F#5:3 E5:2 B5:6 A5:2 | A5:3 G5:3 F#5:2 D#5:6 F#5:2 | G5:3 F#5:3 E5:2 D5:4 B4:4 | E5:12 .:4 |
      G5:3 F#5:3 E5:2 B5:6 C6:2 | B5:3 A5:3 F#5:2 D#5:6 E5:2 | E5:6 F#5:2 G5:4 B5:4 | A5:8 F#5:4 D5:4 |
      G5:3 F#5:3 E5:2 B5:6 A5:2 | A5:3 G5:3 F#5:2 D#5:6 F#5:2 | G5:3 F#5:3 E5:2 D5:4 E5:4 | B4:8 .:2 B4:2 C5:2 D5:2 |
      E5:6 D5:2 C5:4 E5:4 | D#5:6 E5:2 F#5:4 A5:4 | G5:6 F#5:2 E5:8 | .:4 E5:2 F5:2 A5:2 B5:2 C6:2 B5:2`), ...rep(8, null)] },
    koto: { inst: 'koto', vol: 0.95, pan: -0.25, bars: [
      S2_WATER[0], S2_WATER[1], S2_WATER[0], S2_WATER[1], S2_WATER[0], S2_WATER[1], S2_WATER[2], S2_WATER[1],
      ...arp(S2_CH.slice(8, 40), [...rep(16, '1 . 3 . 2 . 4 . 1 . 3 . 5 . 4 .'), ...rep(16, '1 2 3 4 3 2 3 4 1 2 3 4 5 4 3 2')], { lo: 52, hi: 69 }),
      ...rep(8, null)] },
    koto2: { inst: 'koto', vol: 1.35, pan: 0.1, bars: [...rep(40, null), ...mel(`
      E5:2 F5:2 A5:2 B5:2 A5:2 F5:2 E5:2 C5:2 | B4:2 C5:2 E5:2 F5:2 E5:2 C5:2 B4:2 A4:2 |
      E5:2 F5:2 A5:2 B5:2 C6:2 B5:2 A5:2 F5:2 | E5:4 C5:4 A4:4 F4:4 |
      A4:2 C5:2 E5:2 F5:2 E5:2 C5:2 B4:2 A4:2 | B4:2 D5:2 G5:2 A5:2 B5:4 G5:4 |
      A5:2 F5:2 E5:2 C5:2 A4:2 C5:2 E5:2 F5:2 | E5:4 B4:4 D#5:4 F#5:4`)] },
    shami: { inst: 'shamisen', vol: 1.25, pan: 0.25, bars: [...rep(24, null), ...arp(S2_CH.slice(24, 40), '1 . . 1+3 . . 1 . 1 . . 1+3 . . 2 .', { lo: 50, hi: 62 }), ...rep(8, null)] },
    sho: { inst: 'sho', vol: 0.6, bars: [...pad(S2_CH.slice(0, 24), { lo: 64, hi: 79 }), ...rep(16, null), ...pad(S2_CH.slice(40), { lo: 64, hi: 79 })] },
    koe: { inst: 'koe', vol: 0.55, bars: [...rep(24, null), ...pad(S2_CH.slice(24, 40), { lo: 55, hi: 72 }), ...rep(8, null)] },
    toro: { inst: 'bell', vol: 0.5, pan: 0.3, bars: [...mel('.:8 B5:8 | .:16 | .:8 E5:8 | .:16 | .:8 B5:8 | .:16 | .:8 A5:8 | .:16'), ...rep(40, null)] },
    bass: { inst: 'bass', vol: 0.8, bars: bass(S2_CH, [
      ...rep(4, null), ...rep(4, 'r . . r . . r . r . . r . . r .'), ...rep(16, B_BOUNCE), ...rep(16, B_DRIVE),
      ...rep(7, 'r . . . . . r . r . . . . . r .'), 'r . r . r . r . r . r . o . o .',
    ], { lo: 31 }) },
    kit: { inst: 'drums', vol: 0.57, bars: (() => {
      const half = { kick: 'x... .... .... ....', snare: '.... .... x... ....' };
      const verse = { kick: 'x... ..x. ..x. ....', snare: '.... x... .... x...', hat: '..x. ..x. ..x. ..x.' };
      const verseFill = { kick: 'x... ..x. ..x. ....', snare: '.... x... ..x. xxXX', hat: '..x. ..x. .... ....' };
      const hook = { kick: 'x..x ..x. x..x ..x.', snare: '.... X... .... X...', hat: 'x.x. x.x. x.x. x.x.' };
      const hookFill = { kick: 'x..x ..x. x... ....', snare: '.... X... x.xx XXXX', hat: 'x.x. x.x. .... ....' };
      const end = { kick: 'x... .... x... ....', snare: '.... .... x.x. xxxx' };
      return [...rep(4, null), ...rep(4, half), ...rep(7, verse), verseFill, ...rep(7, verse), verseFill, ...rep(7, hook), hookFill, ...rep(7, hook), hookFill, ...rep(7, null), end];
    })() },
    wa: { inst: 'drums', vol: 0.42, bars: (() => {
      const bamboo = { ka: '..x. ..x. ..x. ..x.' };
      const verse = { shime: 'x.oo x.oo x.oo x.oo', ka: '.... .... .... ..x.' };
      const hook = { taiko: 'X... .... .... ....', shime: 'x.oo x.oo x.oo x.oo' };
      const bridge = { taiko: 'X..x ..X. .x.. X...', shime: 'x.x. x.x. x.x. x.xx' };
      const fill = { taiko: 'X... X... X.X. XXXX' };
      return [...rep(4, null), ...rep(4, bamboo), ...rep(16, verse), ...rep(16, hook), ...rep(7, bridge), fill];
    })() },
    bells: { inst: 'drums', vol: 0.7, pan: 0.3, bars: (() => {
      const s = { suzu: 'x... .... .... ....' };
      return [s, null, null, null, s, null, null, null, s, ...rep(7, null), s, ...rep(7, null), s, ...rep(7, null), s, ...rep(7, null),
        { suzu: 'x... .... .... ....', hyoshigi: 'x... .... .... ....' }, ...rep(7, null)];
    })() },
  },
};

// ================================================================ boss2：すず（猫又）。クールで、ずる賢く、おしゃれ
// ニ短調、168 BPM、32 小節。三味線の黒いリフ（ブルーノートの ♭5 と、猫のように忍び寄る半音）と、すずの鈴。
// A：リフ（1–8、5–8 は琴が猫の手のように合いの手）→ サビ：胡弓（9–16、♭VI△7–V7–i7–♭VII の小粋な進行）
// → B：内声が半音ずつ下がる（17–24、篠笛が A を保つ）→ サビ'（25–32）→ 1 小節目へ。
const B2_CH = [
  'Dm9', 'Dm9', 'Bbmaj7', 'A7', 'Dm9', 'Dm9', 'Gm7', 'A7sus4 A7',
  'Bbmaj7', 'A7', 'Dm7', 'Cm7 F7', 'Bbmaj7', 'A7', 'Dm7 Cm7', 'Gm7 A7',
  'Dm', 'Dm/C#', 'Dm/C', 'Bm7b5', 'Bbmaj7', 'Gm7', 'Em7b5', 'A7',
  'Bbmaj7', 'A7', 'Dm7', 'Cm7 F7', 'Bbmaj7', 'A7', 'Dm7', 'Em7b5 A7',
];
const B2_RIFF = mel(`
  D3 .:2 D3 .:2 F3 . G3 . Ab3 A3 . C4 D4 . | F4 . D4 C4 . A3 . G3 Ab3 G3 F3 . D3 .:3 |
  Bb2 .:2 Bb2 .:2 D3 . F3 . A3 Bb3 . D4 F4 . | E4 . C#4 A3 . G3 . E3 F3 E3 C#3 . A2 .:3 |
  D3 .:2 D3 .:2 F3 . G3 . Ab3 A3 . C4 D4 . | F4 . D4 C4 . A3 . G3 Ab3 G3 F3 . D3 .:3 |
  G3 .:2 G3 .:2 Bb3 . C4 . Db4 D4 . F4 G4 . | A3 . D4 E4 . A3 . D4 C#4 . E4 . G4:2 F4 E4`);
const B2_HOOK = mel(`
  D5:3 F5:3 A5:4 G5:2 F5:2 D5:2 | E5:3 C#5:3 E5:4 G5:6 | F5:3 E5:3 D5:2 C5:4 A4:4 | Eb5:3 D5:3 C5:2 A4:3 C5:3 Eb5:2 |
  D5:3 F5:3 A5:4 C6:2 Bb5:2 A5:2 | G5:3 E5:3 C#5:4 Bb4:2 C#5:2 E5:2 | D5:6 F5:2 Eb5:4 D5:2 C5:2 | Bb4:4 D5:4 C#5:4 E5:4`);
const B2_STAB = '. . 1+2 . . . 1+2 . . . . 1+2 . . 1+2 .';
const boss2 = {
  id: 'boss2', bpm: 168, gain: 2.1, chart: B2_CH,
  tracks: {
    shami: { inst: 'shamisen', vol: 1.35, pan: 0.2, bars: [...B2_RIFF, ...arp(B2_CH.slice(8, 16), B2_STAB, { lo: 50, hi: 64 }),
      ...arp(B2_CH.slice(16, 24), '1 . 2 . 3 . 2 . 1 . 2 . 3 . 4 .', { lo: 50, hi: 64 }), ...arp(B2_CH.slice(24), B2_STAB, { lo: 50, hi: 64 })] },
    kokyu: { inst: 'kokyu', vol: 1.3, bars: [...rep(8, null), ...B2_HOOK, ...rep(8, null), ...B2_HOOK.slice(0, 6), ...mel('F5:3 E5:3 D5:2 C5:4 A4:4 | E5:4 G5:4 C#5:4 A4:4')] },
    fue: { inst: 'fue', vol: 0.7, bars: [...rep(16, null), ...mel(`
      A5:8 F5:4 D5:4 | A5:8 E5:4 C#5:4 | A5:8 F5:4 C5:4 | A5:8 F5:4 D5:4 |
      .:2 D5:2 F5:2 A5:2 Bb5:4 A5:2 F5:2 | G5:6 F5:2 D5:4 Bb4:4 | E5:3 G5:3 Bb5:4 A5:2 G5:2 E5:2 | C#5:4 E5:4 G5:4 A5:4`), ...rep(8, null)] },
    koto: { inst: 'koto', vol: 0.8, pan: -0.25, bars: [...rep(4, null),
      ...mel('.:8 D5 F5 G5 A5 C6:2 A5:2 | .:8 C6 A5 G5 F5 D5:4 | .:8 Bb4 D5 F5 G5 Bb5:2 G5:2 | .:8 A5 G5 E5 C#5 A4:4'),
      ...arp(B2_CH.slice(8), [...rep(8, '. . . 1+2+3 . . 1+2+3 . . . . 1+2+3 . . . .'), ...rep(8, K_RUN), ...rep(8, '. . . 1+2+3 . . 1+2+3 . . . . 1+2+3 . . . .')], { lo: 55, hi: 70 })] },
    pad: { inst: 'pad', vol: 0.45, bars: [...rep(8, null), ...pad(B2_CH.slice(8), { lo: 55, hi: 72 })] },
    bass: { inst: 'bass', vol: 0.7, bars: bass(B2_CH, [
      ...rep(8, 'r . . r . . o . . r . . o . r .'), ...rep(8, 'r . . o . . r . r . o . . r o .'),
      ...rep(8, 'r - - - - - - - r . . r . . o .'), ...rep(8, 'r . . o . . r . r . o . . r o .'),
    ], { lo: 28 }) },
    kit: { inst: 'drums', vol: 0.5, bars: (() => {
      const riff = { kick: 'x..x ..x. ..x. ....', snare: '.... x..o .... x..o', hat: 'xoxo xoxo xoxo xoxo' };
      const riffEnd = { kick: 'x..x ..x. ..x. ....', snare: '.... x..o x.xo xXxX', hat: 'xoxo xoxo .... ....' };
      const hook = { kick: 'x..x ..x. ..x. .x..', snare: '.... X... .... X..o', hat: 'x.xo x.xo x.xo x.xo' };
      const hookEnd = { kick: 'x..x ..x. ..x. ....', snare: '.... X... x.xx XXXX', hat: 'x.xo x.xo .... ....' };
      const b = { kick: 'x... .... x.x. ....', snare: '.... .... X... ....', hat: 'x.x. x.x. x.x. x.x.' };
      const bEnd = { kick: 'x... .... x... ....', snare: '.... .... X.x. xxxx', hat: 'x.x. x.x. .... ....' };
      return [...rep(7, riff), riffEnd, ...rep(7, hook), hookEnd, ...rep(7, b), bEnd, ...rep(7, hook), hookEnd];
    })() },
    bells: { inst: 'drums', vol: 0.75, pan: 0.35, bars: (() => {
      const bell = { suzu: '.... .... .... ..x.' };                     // すずの首の鈴
      const clap = { hyoshigi: '.... x... .... x...' };
      const clapBell = { hyoshigi: '.... x... .... x...', suzu: '.... .... .... ..x.' };
      return [...rep(8, null, bell), ...rep(4, clap, clapBell), ...rep(4, null, bell)];
    })() },
  },
};

// ================================================================ st3：ステージ 3（雲海の上、月の社へ）
// イ長調 → 2 回目のサビでロ長調へ上がる（高度が上がる）、150 BPM、48 小節。笙の和音と声、きらめく琴、大太鼓。
// 前奏（1–8）→ A（9–16、句ごとに少しずつ高くなる）→ B（17–24、ベースが音階で上がる）→ サビ 1（25–32、カノン進行）
// → サビ 2（33–40、ロ長調）→ 後奏（41–48、ロ長調から E を経て、イ長調の 1 小節目へ）。
const S3_CH = [
  'Aadd9', 'E/G#', 'F#m7', 'Dadd9', 'A/C#', 'Bm7', 'Dmaj7', 'Esus4 E',
  'Dadd9', 'E', 'C#m7', 'F#m7', 'Bm7', 'C#m7', 'Dmaj7', 'Esus4 E',
  'F#m7', 'E/G#', 'A', 'Bm7', 'C#m7', 'D', 'Esus4', 'E',
  'A', 'E/G#', 'F#m', 'C#m/E', 'D', 'A/C#', 'Bm7', 'E',
  'B', 'F#/A#', 'G#m', 'D#m/F#', 'E', 'B/D#', 'C#m7', 'F#',
  'Emaj7', 'F#', 'D#m7', 'G#m7', 'C#m7', 'F#sus4 F#', 'Eadd9', 'Esus4 E',
];
const S3_HOOK = mel(`
  E5:6 F#5:2 A5:4 G#5:2 E5:2 | F#5:6 E5:2 B4:8 | C#5:6 E5:2 F#5:4 A5:4 | G#5:6 F#5:2 E5:8 |
  F#5:6 E5:2 D5:4 F#5:4 | E5:6 C#5:2 A4:8 | D5:4 F#5:4 A5:4 B5:4 | G#5:12 .:4`);
const st3 = {
  id: 'st3', bpm: 150, gain: 1.8, chart: S3_CH,
  tracks: {
    fue: { inst: 'fue', bars: [...rep(8, null), ...mel(`
      A4:2 B4:2 C#5:2 E5:2 F#5:6 E5:2 | E5:6 F#5:2 G#5:8 | B4:2 C#5:2 E5:2 F#5:2 G#5:6 F#5:2 | F#5:6 G#5:2 A5:8 |
      C#5:2 D5:2 F#5:2 A5:2 B5:6 A5:2 | G#5:6 A5:2 B5:8 | D5:2 E5:2 F#5:2 A5:2 C#6:6 B5:2 | B5:8 G#5:8 |
      C#5:6 E5:2 F#5:4 A5:4 | G#5:6 F#5:2 E5:8 | E5:6 F#5:2 A5:4 C#5:4 | D5:6 C#5:2 B4:8 |
      E5:6 G#5:2 B5:4 G#5:4 | F#5:6 E5:2 D5:4 A5:4 | A5:8 B5:8 | G#5:8 .:4 E5:2 F#5:2`), ...S3_HOOK, ...shift(S3_HOOK, 2), ...rep(8, null)] },
    kokyu: { inst: 'kokyu', vol: 1.05, pan: 0.15, bars: [...rep(32, null), ...mel(`
      D#5:8 F#5:8 | C#5:16 | B4:8 D#5:8 | A#4:16 | B4:8 G#4:8 | B4:16 | E5:16 | C#5:8 A#4:8 |
      B4:6 D#5:2 G#5:8 | A#5:6 G#5:2 F#5:8 | F#5:6 G#5:2 A#5:8 | B5:6 A#5:2 G#5:8 |
      G#5:6 E5:2 C#5:8 | B4:8 A#4:8 | G#4:6 F#4:2 E4:8 | A4:8 G#4:8`)] },
    koto: { inst: 'koto', vol: 0.9, pan: -0.25, bars: arp(S3_CH, [
      ...rep(8, '1 . 3 . 5 . 6 . 4 . 5 . 7 . 6 .'), ...rep(8, '1 . 3 . 5 . 3 . 2 . 4 . 6 . 4 .'), ...rep(8, K_RUN),
      ...rep(16, '1 2 3 5 4 3 5 6 5 4 6 7 6 5 4 3'), ...rep(8, '1 . 3 . 5 . 6 . 4 . 5 . 7 . 6 .'),
    ], { lo: 57, hi: 72 }) },
    hoshi: { inst: 'bell', vol: 0.3, pan: 0.3, bars: [...mel('.:8 B5:8 | .:16 | .:8 A5:8 | .:16 | .:8 C#6:8 | .:16 | .:8 A5:8 | .:16'), ...rep(40, null)] },
    sho: { inst: 'sho', vol: 0.6, bars: [...pad(S3_CH.slice(0, 16), { lo: 64, hi: 81 }), ...rep(24, null), ...pad(S3_CH.slice(40), { lo: 64, hi: 81 })] },
    koe: { inst: 'koe', vol: 0.55, bars: [...rep(16, null), ...pad(S3_CH.slice(16, 40), { lo: 55, hi: 74 }), ...rep(8, null)] },
    pad: { inst: 'pad', vol: 0.65, bars: [...rep(24, null), ...pad(S3_CH.slice(24, 40), { lo: 50, hi: 67 }), ...rep(8, null)] },
    bass: { inst: 'bass', vol: 0.55, bars: bass(S3_CH, [
      ...rep(8, BAR), ...rep(8, 'r - - - - - - . r - - . r - - .'), ...rep(8, B_8), ...rep(16, B_DRIVE), ...rep(8, HALF),
    ], { lo: 31 }) },
    kit: { inst: 'drums', vol: 0.55, bars: (() => {
      const intro = { kick: 'x... .... .... ....' };
      const a = { kick: 'x... .... x.x. ....', snare: '.... .... X... ....', hat: '..x. ..x. ..x. ..x.' };
      const aEnd = { kick: 'x... .... x.x. ....', snare: '.... .... X... x.xx', hat: '..x. ..x. ..x. ....' };
      const b = { kick: 'x... x... x... x...', snare: '.... x... .... x...', hat: '..x. ..x. ..x. ..x.' };
      const b7 = { kick: 'x... x... x... x...', snare: 'x.x. x.x. x.x. x.x.' };
      const b8 = { kick: 'x... x... x... x...', snare: 'xxxx xxxx XXXX XXXX' };
      const hook = { kick: 'x... x..x x... x...', snare: '.... X... .... X...', hat: 'x.x. x.x. x.x. x.x.' };
      const hookEnd = { kick: 'x... x... x... x.x.', snare: '.... X... x.x. XXXX', hat: 'x.x. x.x. .... ....' };
      const out = { kick: 'x... .... x... ....', hat: '..x. ..x. ..x. ..x.' };
      return [...rep(4, null), ...rep(4, intro), ...rep(7, a), aEnd, ...rep(6, b), b7, b8, ...rep(7, hook), hookEnd, ...rep(7, hook), hookEnd, ...rep(8, out)];
    })() },
    wa: { inst: 'drums', vol: 0.47, bars: (() => {
      const big = { taiko: 'X... .... .... ....' };
      const a = { taiko: 'x... .... .... ....' };
      const b = { taiko: 'x... .... x... ....', shime: 'o.o. o.o. o.o. o.o.' };
      const roll = { taiko: 'X... X... X.X. XXXX' };
      const hook = { taiko: 'X... .... x... ....', shime: 'x.oo x.oo x.oo x.oo' };
      return [big, null, null, null, big, null, null, null, ...rep(8, a), ...rep(7, b), roll, ...rep(7, hook), roll, ...rep(8, hook), big, ...rep(7, null)];
    })() },
    bells: { inst: 'drums', vol: 0.7, pan: 0.3, bars: (() => {
      const suzu = { suzu: 'x... .... .... ....' };
      const crash = { kane: 'x... .... .... ....', suzu: 'x... .... .... ....' };
      return [suzu, ...rep(7, null), suzu, ...rep(7, null), suzu, ...rep(7, null), crash, ...rep(7, null), crash, ...rep(7, null), suzu, ...rep(7, null)];
    })() },
  },
};

// ================================================================ boss3：つくよ（月の兎）。ラスボス：壮大で、美しく、少しさびしい
// ハ短調、172 BPM、48 小節。前奏の総奏（ナポリの ♭II で悲しみの色）→ A：胡弓がひとりで歌う（半音ずつ下がるベース）
// → B：笛と胡弓が上へ → サビ（25–40：♭VI–♭VII–v–i の王道進行。笛と、1 オクターブ下の胡弓）
// → 間奏（41–48：琴が主題を静かに。太鼓と「か」で餅つきの「ぺったん」）→ 1 小節目へ。サビの主題はエンディングで長調になる。
const B3_CH = [
  'Cm', 'Ab', 'Fm', 'G', 'Cm', 'Ab', 'Dbmaj7', 'G7',
  'Cm', 'Cm/B', 'Cm/Bb', 'Am7b5', 'Abmaj7', 'Fm7', 'Dm7b5', 'G7',
  'Fm7', 'Gm7', 'Abmaj7', 'Bb', 'Abmaj7', 'Bb/Ab', 'G7sus4', 'G7',
  'Abmaj7', 'Bb', 'Gm7', 'Cm', 'Abmaj7', 'Bb', 'G7', 'Cm',
  'Fm7', 'Bb7', 'Ebmaj7', 'Abmaj7', 'Dm7b5', 'G7', 'Cm', 'Cm',
  'Abmaj7', 'Eb/G', 'Fm7', 'Cm', 'Dbmaj7', 'Cm', 'Dm7b5', 'G7',
];
const B3_HOOK = mel(`
  Eb5:3 F5:3 G5:2 C6:6 Bb5:2 | Bb5:4 Ab5:2 G5:2 F5:8 | D5:3 F5:3 G5:2 Bb5:6 Ab5:2 | G5:4 F5:2 Eb5:2 C5:8 |
  Eb5:3 F5:3 G5:2 C6:6 D6:2 | D6:4 C6:2 Bb5:2 F5:8 | Ab5:3 G5:3 F5:2 D5:4 B4:4 | C5:8 .:4 G4:2 C5:2 |
  Ab5:3 G5:3 F5:2 C6:6 Bb5:2 | Ab5:4 G5:2 F5:2 D5:8 | G5:3 Bb5:3 D6:2 Eb6:6 D6:2 | C6:4 Bb5:2 Ab5:2 G5:8 |
  F5:3 Ab5:3 C6:2 Ab5:4 F5:4 | Ab5:4 G5:2 F5:2 D5:4 B4:4 | C5:6 D5:2 Eb5:4 G5:4 | C6:12 .:4`);
const B3_HIT = '1+2+3 - . 1+2+3 - . 1+2+3 - . . 1+2+3 - 1+2+3 - . .'; // 総奏の打ち込み（3＋3＋4＋2）
const boss3 = {
  id: 'boss3', bpm: 172, gain: 1.95, chart: B3_CH,
  tracks: {
    fue: { inst: 'fue', bars: [...rep(4, null), ...mel(`
      Eb5:3 F5:3 G5:2 C6:8 | Bb5:4 Ab5:2 G5:2 Eb5:8 | F5:3 Ab5:3 C6:2 Ab5:8 | B5:4 Ab5:4 F5:4 D5:2 B4:2`), ...rep(8, null), ...mel(`
      C5:4 Eb5:4 F5:4 Ab5:4 | Bb4:4 D5:4 F5:4 G5:4 | C5:4 Eb5:4 G5:4 Ab5:4 | D5:4 F5:4 Bb5:8 |
      Ab5:6 G5:2 Eb5:8 | Bb5:6 Ab5:2 F5:8 | C6:6 Bb5:2 G5:8 | B5:8 .:4 C5:2 D5:2`), ...B3_HOOK, ...rep(8, null)] },
    kokyu: { inst: 'kokyu', vol: 1.25, pan: 0.1, bars: [...rep(8, null), ...mel(`
      G4:6 Ab4:2 G4:4 Eb4:4 | G4:6 F4:2 Eb4:8 | Bb4:6 Ab4:2 G4:8 | Eb5:6 C5:2 A4:8 |
      Ab4:2 C5:2 Eb5:2 G5:6 F5:2 Eb5:2 | F5:6 Eb5:2 C5:8 | Ab4:4 C5:4 D5:4 F5:4 | G5:8 F5:4 D5:2 B4:2 |
      Ab4:16 | Bb4:16 | C5:16 | D5:8 F5:8 | C5:16 | D5:16 | F5:16 | D5:8 F5:8`), ...rep(24, null)] },
    kokyu2: { inst: 'kokyu', vol: 0.75, pan: -0.1, bars: [...rep(24, null), ...shift(B3_HOOK, -12), ...mel(`
      C5:16 | Bb4:16 | Ab4:16 | G4:16 | F4:16 | G4:16 | Ab4:16 | B4:8 D5:8`)] },
    stab: { inst: 'kokyu', vol: 0.8, bars: [...arp(B3_CH.slice(0, 4), B3_HIT, { lo: 55, hi: 70 }), ...rep(44, null)] },
    koto: { inst: 'koto', vol: 0.8, pan: -0.25, bars: [null, null, null, ...mel('.:8 D4 F4 G4 B4 D5 F5 G5 B5'),
      ...arp(B3_CH.slice(4, 40), [...rep(4, '1 . 2 . 3 . 4 . 5 . 4 . 3 . 2 .'), ...rep(8, '1 . 3 . 2 . 4 . 1 . 3 . 5 . 4 .'),
        ...rep(8, K_RUN), ...rep(16, '1 2 3 4 5 4 3 2 1 2 3 4 5 6 5 4')], { lo: 55, hi: 70 }), ...rep(8, null)] },
    koto2: { inst: 'koto', vol: 1.5, pan: 0.1, bars: [...rep(40, null), ...mel(`
      Eb5:3 F5:3 G5:2 C6:8 | Bb5:4 Ab5:2 G5:2 Eb5:8 | Ab4:3 C5:3 Eb5:2 F5:8 | G5:4 F5:2 Eb5:2 C5:8 |
      F5:3 Ab5:3 C6:2 Ab5:8 | G5:4 F5:2 Eb5:2 C5:8 | Ab5:6 G5:2 F5:8 | B4:4 D5:4 F5:4 Ab5:4`)] },
    koe: { inst: 'koe', vol: 0.55, bars: [...pad(B3_CH.slice(0, 8), { lo: 55, hi: 72 }), ...rep(16, null), ...pad(B3_CH.slice(24), { lo: 55, hi: 72 })] },
    pad: { inst: 'pad', vol: 0.55, bars: [...rep(4, null), ...pad(B3_CH.slice(4, 8), { lo: 48, hi: 67 }), ...rep(16, null), ...pad(B3_CH.slice(24, 40), { lo: 48, hi: 67 }), ...rep(8, null)] },
    bass: { inst: 'bass', vol: 0.7, bars: bass(B3_CH, [
      ...rep(4, 'r . . r . . r . . . r . r . . .'), ...rep(4, B_DRIVE), ...rep(8, B_8), ...rep(24, B_DRIVE), ...rep(6, BAR), B_8, B_8,
    ], { lo: 28 }) },
    kit: { inst: 'drums', vol: 0.45, bars: (() => {
      const hit = { kick: 'X..X ..X. ..X. X...', snare: 'X..X ..X. ..X. X...' };
      const drive = { kick: 'x... x... x... x...', snare: '.... x... .... x...', hat: '..x. ..x. ..x. ..x.' };
      const driveEnd = { kick: 'x... x... x... x...', snare: '.... x... x.x. xxXX', hat: '..x. ..x. .... ....' };
      const verse = { kick: 'x... ..x. x... ..x.', snare: '.... X... .... X...', hat: 'x.x. x.x. x.x. x.x.' };
      const b = { kick: 'x... x... x... x...', snare: '.... X... .... X...', hat: '..x. ..x. ..x. ..x.' };
      const bEnd = { kick: 'x... x... x... x...', snare: 'x.x. x.x. xxxx XXXX' };
      const hook = { kick: 'x... x... x... x..x', snare: '.... X... .... X...', hat: '..O. ..O. ..O. ..O.' };
      const hookEnd = { kick: 'x... x... x... x.x.', snare: '.... X... x.xx XXXX', hat: '..O. ..O. .... ....' };
      const build1 = { kick: 'x... .... x... ....', snare: 'x... x... x.x. x.x.' };
      const build2 = { kick: 'x... x... x... x...', snare: 'x.x. x.x. xxxx XXXX' };
      return [...rep(4, hit), ...rep(3, drive), driveEnd, ...rep(8, verse), ...rep(7, b), bEnd, ...rep(7, hook), hookEnd, ...rep(7, hook), hookEnd, ...rep(6, null), build1, build2];
    })() },
    wa: { inst: 'drums', vol: 0.32, bars: (() => {
      const hit = { taiko: 'X..X ..X. ..X. X...' };
      const main = { taiko: 'X... .... X... ....' };
      const hook = { taiko: 'X... .... x... ....', shime: 'x.oo x.oo x.oo x.oo' };
      const pettan = { taiko: 'x... .... x... ....', ka: '.... x... .... x...' };  // 餅つき：杵（太鼓）と、返す手（か）
      const roll = { taiko: 'X... X... X.X. XXXX' };
      return [...rep(4, hit), ...rep(19, main), roll, ...rep(16, hook), ...rep(6, pettan), main, roll];
    })() },
    bells: { inst: 'drums', vol: 0.7, pan: 0.3, bars: (() => {
      const k = { kane: 'x... .... .... ....' };
      const ks = { kane: 'x... .... .... ....', suzu: 'x... .... .... ....' };
      return [k, ...rep(7, null), k, ...rep(7, null), k, ...rep(7, null), ks, ...rep(7, null), ks, ...rep(7, null), { suzu: 'x... .... .... ....' }, ...rep(7, null)];
    })() },
  },
};

// ================================================================ ending：エンディング（月が昇り、みんなでお月見）
// イ長調、88 BPM、32 小節。タイトルの主題が長調になって（5–12、尺八）、つくよの主題もやさしい長調で（13–20、胡弓）、
// 最後は 2 人の旋律が重なる（21–28、篠笛と胡弓）。III7（C#7）を 1 度だけ使って、なつかしさを少し。
const E_CH = [
  'Aadd9', 'Dmaj7', 'Bm7', 'Esus4 E',
  'A', 'F#m7', 'Bm7', 'E', 'A', 'Dmaj7', 'Bm7', 'Esus4 E',
  'Dmaj7', 'E', 'C#m7', 'F#m', 'Dmaj7', 'E', 'C#7', 'F#m',
  'Bm7', 'E7', 'Amaj7', 'Dmaj7', 'Bm7', 'E7sus4 E7', 'A', 'A',
  'Aadd9', 'Dmaj7', 'Bm7', 'Esus4 E',
];
const ending = {
  id: 'ending', bpm: 88, gain: 1.75, chart: E_CH,
  tracks: {
    koto: { inst: 'koto', vol: 1, pan: -0.25, bars: arp(E_CH, [...rep(4, T_KA), ...rep(16, T_KB), ...rep(8, '1 . 2 3 4 . 3 2 1 . 2 3 5 . 4 3'), ...rep(4, T_KA)], { lo: 52, hi: 69 }) },
    shaku: { inst: 'shakuhachi', bars: [...rep(4, null), ...mel(`
      .:2 E4:2 A4:3 B4:1 C#5:8 | E5:4 C#5:2 B4:2 A4:8 | .:2 D4:2 F#4:3 A4:1 B4:8 | D5:4 B4:2 A4:2 G#4:4 E4:4 |
      .:2 E4:2 A4:3 B4:1 C#5:4 E5:4 | F#5:6 E5:2 C#5:4 A4:4 | D5:4 C#5:2 A4:2 F#4:4 A4:4 | B4:6 A4:2 G#4:8`), ...rep(20, null)] },
    kokyu: { inst: 'kokyu', vol: 1.35, pan: 0.1, bars: [...rep(12, null), ...mel(`
      A4:3 B4:3 C#5:2 F#5:6 E5:2 | E5:4 D5:2 C#5:2 B4:8 | G#4:3 B4:3 C#5:2 E5:6 F#5:2 | C#5:4 B4:2 A4:2 F#4:8 |
      A4:3 B4:3 C#5:2 F#5:6 G#5:2 | G#5:4 F#5:2 E5:2 B4:8 | D5:3 C#5:3 B4:2 G#4:4 E#4:4 | F#4:12 .:4`), ...rep(12, null)] },
    kokyu2: { inst: 'kokyu', vol: 0.8, pan: -0.1, bars: [...rep(20, null), ...mel(`
      F#4:8 A4:8 | G#4:8 B4:8 | A4:8 E4:8 | F#4:16 | D4:8 F#4:8 | A4:8 G#4:8 | E4:16 | C#4:16`), ...rep(4, null)] },
    fue: { inst: 'fue', bars: [...rep(20, null), ...mel(`
      D5:3 C#5:3 B4:2 F#5:6 E5:2 | D5:4 C#5:2 B4:2 G#4:8 | C#5:3 E5:3 G#5:2 A5:6 G#5:2 | F#5:4 E5:2 D5:2 C#5:8 |
      B4:3 D5:3 F#5:2 D5:4 B4:4 | A4:6 B4:2 G#4:4 E4:4 | .:2 C#5:2 E5:3 F#5:1 A5:8 | G#5:4 E5:2 C#5:2 A4:8`), ...rep(4, null)] },
    koto2: { inst: 'koto', vol: 1.4, pan: 0.15, bars: [...rep(28, null), ...mel(`
      .:2 E5:2 A5:3 B5:1 C#6:8 | A5:4 F#5:2 E5:2 C#5:8 | .:2 D5:2 F#5:3 A5:1 B5:8 | A5:6 E5:2 G#5:8`)] },
    sho: { inst: 'sho', vol: 0.65, bars: [...pad(E_CH.slice(0, 12), { lo: 62, hi: 79 }), ...rep(16, null), ...pad(E_CH.slice(28), { lo: 62, hi: 79 })] },
    koe: { inst: 'koe', vol: 0.5, bars: [...rep(12, null), ...pad(E_CH.slice(12, 28), { lo: 55, hi: 70 }), ...rep(4, null)] },
    pad: { inst: 'pad', vol: 0.55, bars: [...rep(20, null), ...pad(E_CH.slice(20, 28), { lo: 50, hi: 66 }), ...rep(4, null)] },
    sub: { inst: 'sub', vol: 0.26, bars: bass(E_CH, [...rep(20, HALF), ...rep(8, 'r - - - - - 5 - r - - - - - 5 -'), ...rep(4, HALF)], { lo: 33 }) },
    perc: { inst: 'drums', vol: 0.5, bars: (() => {
      const suzu = { suzu: 'x... .... .... ....' };
      const pon = { tsuzumi: 'x... .... .... ....' };
      const beat = { taiko: 'x... .... .... ....', tsuzumi: '.... .... x... ....' };
      const matsuri = { taiko: 'x... .... x... ....', shime: 'o.o. o.o. o.o. o.o.' };
      return [suzu, null, null, null, ...rep(8, pon), ...rep(8, beat), ...rep(8, matsuri), suzu, null, null, null];
    })() },
  },
};

// ================================================================ gameover：ゲームオーバー（短い、さびしいジングル。くり返さない）
// イ短調、132 BPM、2 小節（約 3.6 秒）。琴が都節で下りてきて、低い太鼓と笙の和音で終わる。
const gameover = {
  id: 'gameover', bpm: 132, gain: 2.6, loop: false, chart: ['Am', 'Am'],
  tracks: {
    koto: { inst: 'koto', vol: 1.25, bars: mel('E5:2 C5:2 B4:2 A4:2 F4:4 E4:4 | A3+E4+A4:16') },
    sho: { inst: 'sho', vol: 0.8, bars: mel('A4+E5:16 | A4+C5+E5:16') },
    sub: { inst: 'sub', vol: 0.35, bars: mel('.:16 | A2:16') },
    perc: { inst: 'drums', vol: 0.8, bars: [{ tsuzumi: 'x... .... .... ....' }, { taiko: 'x... .... .... ....' }] },
  },
};

// ================================================================ clawd：おまけステージ（中秋の夜空。ターミナルから来たカニの Clawd と弾幕ごっこ）
// 道中からボス戦まで、この 1 曲をくり返す。和（三味線・琴・篠笛・太鼓）× 8bit（パルス波のリード、細いパルス波の速い分散和音、
// ノイズのハイハット）。明るく少しとぼけて、でも走る。ニ長調 → サビ 2 でホ長調、170 BPM、74 小節（約 1 分 45 秒で 1 周）。
// 前奏（1–4：三味線のリフと 8bit の分散和音、太鼓のふちの「かたかた」はキーを打つ音で、最後の拍子木が Enter
// ＝ターミナルが立ち上がる。5–8：リードがサビの頭をちらっと、ベースが G A B♭ C と上って A へ）
// → A（9–24：リードが呼んで琴が答える。20 小節目の Gm6（短調の iv）で少しとぼける）
// → B（25–32：篠笛。8bit の分散和音が 8 分から 16 分になり、太鼓も 4 つ打ちへ盛り上げる）
// → サビ 1（33–48：IV△7–V–iii7–vi7 の王道進行。リードの 1 オクターブ下を琴。最後は ♭VI–♭VII–I）
// → 間奏（49–56：三味線が呼んで、リードが答える。C△7 → B7 でホ長調へ）→ サビ 2（57–72：ホ長調。篠笛が上、リードが 1 オクターブ下）
// → 後奏（73–74：G → A7 でニ長調の 1 小節目へ）。
const CL_CH = [
  'D', 'C/D', 'G/D', 'D', 'Gmaj7', 'A', 'Bb', 'C',                // 1–8 前奏
  'D', 'D', 'G', 'A', 'D', 'Bm', 'Em7', 'A7',                     // 9–16 A
  'D', 'F#m', 'G', 'Gm6', 'D/F#', 'B7', 'Em7', 'A7',              // 17–24 A'
  'Bm', 'G', 'A', 'F#m7', 'Bm', 'G', 'Em7', 'A7sus4 A7',          // 25–32 B
  'Gmaj7', 'A', 'F#m7', 'Bm7', 'Em7', 'F#m7', 'G', 'A',           // 33–40 サビ 1
  'Gmaj7', 'A', 'F#m7', 'Bm7', 'Em7', 'A7', 'Bb C', 'D',          // 41–48
  'Bm', 'G', 'A', 'D', 'Bm', 'G', 'Cmaj7', 'B7sus4 B7',           // 49–56 間奏
  'Amaj7', 'B', 'G#m7', 'C#m7', 'F#m7', 'G#m7', 'A', 'B',         // 57–64 サビ 2（ホ長調）
  'Amaj7', 'B', 'G#m7', 'C#m7', 'F#m7', 'B7', 'C D', 'E',         // 65–72
  'G', 'A7sus4 A7',                                               // 73–74 後奏
];
// サビの主旋律（ニ長調。付点 4 分・付点 4 分・4 分の「たーん・たーん・たん」で始まる）。サビ 2 は 2 半音上げて篠笛が吹く。
const CL_HOOK = mel(`
  G5:3 F#5:3 G5:2 B5:4 A5:2 G5:2 | A5:6 E5:2 C#5:4 A4:2 C#5:2 | F#5:3 E5:3 F#5:2 A5:4 G5:2 F#5:2 | F#5:6 C#5:2 D5:4 B4:2 D5:2 |
  E5:3 D5:3 E5:2 G5:4 F#5:2 E5:2 | A5:3 F#5:3 C#5:2 E5:4 F#5:2 A5:2 | B5:6 A5:2 G5:4 D5:2 G5:2 | A5:8 E5:2 F#5:2 G5:2 A5:2 |
  G5:3 F#5:3 G5:2 B5:4 A5:2 G5:2 | A5:6 E5:2 C#5:4 A4:2 C#5:2 | F#5:3 E5:3 F#5:2 A5:4 G5:2 F#5:2 | F#5:6 C#5:2 D5:4 B4:2 D5:2 |
  G5:3 F#5:3 E5:2 B5:4 A5:2 G5:2 | A5:6 G5:2 E5:4 C#5:2 E5:2 | F5:3 D5:3 F5:2 G5:3 E5:3 G5:2 | F#5:2 A5:2 D6:8 .:4`);
// A：リードが前半で呼び、偶数小節の後半は琴が答える（CL_ANS）。
const CL_A = mel(`
  F#5:3 A5:3 F#5:2 D5:2 E5:2 F#5:2 A5:2 | D5:4 A4:4 .:8 | G5:3 B5:3 G5:2 D5:2 E5:2 G5:2 A5:2 | E5:4 C#5:4 .:8 |
  F#5:3 A5:3 F#5:2 D5:2 E5:2 F#5:2 A5:2 | D5:4 B4:4 .:8 | E5:3 G5:3 B5:2 G5:2 F#5:2 E5:2 D5:2 | C#5:4 A4:4 .:8 |
  A5:6 F#5:2 D5:6 E5:2 | F#5:6 E5:2 C#5:8 | B5:6 A5:2 G5:4 D5:4 | E5:6 D5:2 Bb4:8 |
  A4:3 D5:3 F#5:2 A5:6 F#5:2 | A5:3 F#5:3 D#5:2 B4:6 D#5:2 | E5:3 G5:3 B5:2 G5:4 E5:2 D5:2 | C#5:4 E5:2 G5:2 A5:2 G5:1 F#5:1 E5:2 D5:1 E5:1`);
const CL_ANS = mel(`
  .:8 A5 B5 A5 F#5 E5:2 D5:2 | .:8 E5 F#5 E5 C#5 B4:2 A4:2 | .:8 F#5 A5 F#5 E5 D5:2 B4:2 | .:8 G5 A5 G5 E5 C#5:2 A4:2`);
// 三味線：前奏のリフ（D のペダルの上で D → C → G と、ミクソリディアンでとぼける）と、間奏の呼びかけ（49–50, 53–54）。
const CL_RIFF = mel(`
  D3:2 A3 D4 . D4 E4 F#4 A4:2 F#4 E4 D4:2 A3:2 | C4:2 G3 C4 . C4 D4 E4 G4:2 E4 D4 C4:2 G3:2 |
  B3:2 G3 B3 . B3 D4 E4 G4:2 E4 D4 B3:2 G3:2 | A3:2 D4 E4 F#4:2 E4 F#4 A4:2 B4:2 A4:2 F#4:2`);
const CL_CALL = mel(`
  B3:2 D4 E4 F#4:2 E4 D4 B3:2 A3:2 B3:2 D4:2 | G3:2 B3 D4 E4:2 D4 B3 G3:2 A3:2 B3:4 |
  B3:2 D4 E4 F#4:2 E4 D4 B3:2 D4:2 F#4:2 A4:2 | B4:2 A4 G4 E4:2 D4 B3 G3:2 A3:2 B3:2 D4:2`);
const CL_CHOP = '. . 1+3 . . . 1+3 . . . 1+3 . . . 1+3 .';   // 三味線：裏拍の「ちゃっ」
const CL_BOOT = '1 2 3 4 1 2 3 4 1 2 3 4 5 4 3 2';          // 8bit：ぴろぴろ（ターミナルが立ち上がる）
const clawd = {
  id: 'clawd', bpm: 170, gain: 2, chart: CL_CH,
  tracks: {
    lead: { inst: 'pulse', vol: 1.3, bars: [...rep(4, null), ...mel(`
      G5:3 F#5:3 G5:2 B5:4 A5:2 G5:2 | A5:6 E5:2 C#5:4 A4:2 C#5:2 | D5:3 F5:3 Bb5:2 F5:4 D5:2 F5:2 | G5:6 E5:2 C5:4 E5:2 G5:2`),
      ...CL_A, ...rep(26, null), ...mel(`
      C#5 E5 A5 E5 C#5 E5 A5 E5 .:2 A5:2 G5:2 E5:2 | F#5:3 E5:3 D5:2 A4:4 .:4`), null, null, ...mel(`
      E5:3 G5:3 C6:2 B5:4 G5:2 E5:2 | E5:4 F#5:4 D#5:2 F#5:2 A5:2 B5:2`), ...rep(18, null)] },
    hook: { inst: 'pulse', vol: 1.5, bars: [...rep(32, null), ...CL_HOOK, ...rep(26, null)] },          // サビ 1 の主旋律（少し前に出す）
    lead2: { inst: 'pulse', vol: 0.8, bars: [...rep(56, null), ...shift(CL_HOOK, -10), null, null] },  // サビ 2：篠笛の 1 オクターブ下
    fue: { inst: 'fue', vol: 0.85, bars: [...rep(24, null), ...mel(`
      F#5:6 E5:2 D5:4 B4:4 | D5:3 E5:3 G5:2 B5:6 A5:2 | A5:6 G5:2 E5:4 C#5:4 | E5:6 F#5:2 C#5:8 |
      F#5:6 E5:2 D5:4 B4:4 | D5:3 E5:3 G5:2 B5:6 D6:2 | B5:6 A5:2 G5:4 E5:4 | D5:4 E5:4 C#5:2 D5:2 E5:2 F#5:2`),
      ...rep(24, null), ...shift(CL_HOOK, 2), null, null] },
    koto: { inst: 'koto', vol: 0.9, pan: -0.25, bars: over(arp(CL_CH, [
      ...rep(4, null), ...rep(20, K_8), ...rep(24, null), ...rep(8, null), ...rep(16, K_RUN), null, null,
    ], { lo: 55, hi: 69 }), 33, shift(CL_HOOK, -12)) },
    koto2: { inst: 'koto', vol: 1.3, pan: 0.15, bars: [...rep(9, null), CL_ANS[0], null, CL_ANS[1], null, CL_ANS[2], null, CL_ANS[3], ...rep(56, null),
      ...mel('D6 B5 A5 G5 E5 D5 B4 A4 G4:4 .:4'), null] },
    shami: { inst: 'shamisen', vol: 1.2, pan: 0.25, bars: (() => {
      let b = arp(CL_CH, [...rep(4, null), ...rep(68, CL_CHOP), null, null], { lo: 50, hi: 64 });
      b = over(b, 1, CL_RIFF);
      b = over(b, 49, CL_CALL.slice(0, 2));
      b = over(b, 53, CL_CALL.slice(2));
      return over(b, 74, mel('.:8 E4:2 D4:2 C#4:2 A3:2'));
    })() },
    chip: { inst: 'pulse8', vol: 1.5, pan: -0.3, bars: arp(CL_CH, [
      ...rep(4, CL_BOOT), ...rep(20, null), ...rep(4, '1 . 2 . 3 . 4 . 5 . 4 . 3 . 2 .'), ...rep(4, K_RUN), ...rep(16, null),
      K_RUN, K_RUN, null, null, K_RUN, K_RUN, null, null, ...rep(16, null), CL_BOOT, CL_BOOT,
    ], { lo: 57, hi: 72 }) },
    pad: { inst: 'pad', vol: 0.6, bars: [...rep(32, null), ...pad(CL_CH.slice(32, 48), { lo: 55, hi: 72 }), ...rep(26, null)] },
    sho: { inst: 'sho', vol: 0.5, bars: [...rep(24, null), ...pad(CL_CH.slice(24, 32), { lo: 62, hi: 77 }), ...rep(42, null)] },
    koe: { inst: 'koe', vol: 0.5, bars: [...rep(32, null), ...pad(CL_CH.slice(32, 48), { lo: 55, hi: 72, acc: '?' }), ...rep(8, null),
      ...pad(CL_CH.slice(56, 72), { lo: 55, hi: 72 }), null, null] },
    bass: { inst: 'bass', vol: 0.7, bars: bass(CL_CH, [
      ...rep(4, B_BOUNCE), ...rep(4, B_DRIVE), ...rep(16, B_BOUNCE), ...rep(8, B_8), ...rep(16, B_DRIVE),
      ...rep(8, B_BOUNCE), ...rep(16, B_DRIVE), B_8, 'r . r . r . r . r . r . o . o .',
    ], { lo: 30 }) },
    kit: { inst: 'drums', vol: 0.5, bars: (() => {
      const boot = { kick: 'x... .... x... ....' };
      const tease = { kick: 'x... x... x... x...', snare: '.... x... .... x...', hat: '..x. ..x. ..x. ..x.' };
      const teaseEnd = { kick: 'x... x... x... x...', snare: 'x.x. x.x. xxxx XXXX' };
      const verse = { kick: 'x... ..x. x... ....', snare: '.... x... .... x...', hat: 'x.x. x.x. x.x. x.x.' };
      const verseFill = { kick: 'x... ..x. x... ....', snare: '.... x... ..x. xxXX', hat: 'x.x. x.x. .... ....' };
      const bA = { kick: 'x... .... x.x. ....', snare: '.... x... .... x...', hat: 'x.x. x.x. x.x. x.x.' };
      const b = { kick: 'x... x... x... x...', snare: '.... x... .... x...', hat: 'xoxo xoxo xoxo xoxo' };
      const b7 = { kick: 'x... x... x... x...', snare: 'x.x. x.x. x.x. x.x.', hat: 'xoxo xoxo xoxo xoxo' };
      const b8 = { kick: 'x... x... x... x...', snare: 'xxxx xxxx XXXX XXXX' };
      const hook = { kick: 'x... x..x x... x...', snare: '.... X... .... X...', hat: '..O. ..O. ..O. ..O.' };
      const hookFill = { kick: 'x... x... x... x.x.', snare: '.... X... x.xx XXXX', hat: '..O. ..O. .... ....' };
      const inter = { kick: 'x..x ..x. x..x ..x.', snare: '.... x... .... x...', hat: 'x.x. x.x. x.x. x.x.' };
      const out1 = { kick: 'x... .... x... ....', snare: '.... .... x.x. xxxx' };
      const out2 = { kick: 'x... x... x... x...', snare: 'x.x. x.x. xxxx XXXX' };
      return [null, null, boot, boot, ...rep(3, tease), teaseEnd, ...rep(7, verse), verseFill, ...rep(7, verse), verseFill,
        ...rep(4, bA), b, b, b7, b8, ...rep(7, hook), hookFill, ...rep(7, hook), hookFill, ...rep(7, inter), teaseEnd,
        ...rep(7, hook), hookFill, ...rep(7, hook), hookFill, out1, out2];
    })() },
    wa: { inst: 'drums', vol: 0.38, bars: (() => {
      const roll = { taiko: 'X... X... X.X. XXXX' };
      const tease = { taiko: 'X... .... x... ....', shime: 'o.oo o.oo o.oo o.oo' };
      const verse = { taiko: 'X... .... .... ....', shime: 'o.o. o.o. o.o. o.o.' };
      const b = { taiko: 'X... .... x... ....', shime: 'o.oo o.oo o.oo o.oo' };
      const hook = { taiko: 'X... .... x... ....', shime: 'x.oo x.oo x.oo x.oo' };
      const matsuri = { taiko: 'X..x ..X. X..x ..x.', shime: 'x.xx x.xx x.xx x.xx' };
      return [{ taiko: 'X... .... .... ....' }, { taiko: 'x... .... .... ....' }, { taiko: 'X... .... x... ....' }, { taiko: 'X... .... X.X. XXXX' },
        ...rep(3, tease), roll, ...rep(20, verse), ...rep(3, b), roll, ...rep(16, hook), ...rep(7, matsuri), roll,
        ...rep(16, hook), { taiko: 'X... X... X... X...' }, roll];
    })() },
    bells: { inst: 'drums', vol: 0.7, pan: 0.3, bars: (() => {
      const kane = { kane: 'x... .... .... ....' };
      const shine = { kane: 'x... .... .... ....', suzu: 'x... .... .... ....' };
      const chiki = { chiki: '..o. o..o ..o. o..o' };
      return [
        { ka: 'x.x. xx.. x.xx .x..' }, { ka: '.xx. x..x .x.x x...' }, { ka: 'x.xx ..x. xx.. x.x.' }, { ka: 'x.x. x.xx .x.. ....', hyoshigi: '.... .... .... x...' },
        shine, null, null, null, { suzu: 'x... .... .... ....' }, ...rep(15, null), kane, ...rep(7, null),
        shine, ...rep(7, null), kane, ...rep(7, null), { hyoshigi: 'x... .... .... ....', kane: 'x... .... .... ....' }, ...rep(6, chiki), null,
        shine, ...rep(7, null), kane, ...rep(7, null), { suzu: 'x... .... .... ....' }, null];
    })() },
  },
};

export const SONGS = { title, st1, play: st1, boss1, st2, boss2, st3, boss3, ending, gameover, clawd };
