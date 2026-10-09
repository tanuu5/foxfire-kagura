// 効果音・楽器・曲の試聴と確認（dev/audio.html）。window.__audioCheck() はヘッドレスの確認からも呼べる。
//   __audioCheck()                       効果音・楽器・曲を全部書き出して、ピーク・RMS・NaN・書き間違いを返す
//   __audioCheck({ sfx: false, inst: false, songs: ['st1'] })   一部だけ
//   __songStems('st1')                   曲の列ごとに 1 本ずつ書き出した大きさ（ミキサーを通さない。混ぜ具合を見る）
// 曲は 1 周ぶん（＋余韻）を書き出し、8 小節ごとの RMS、0.5 秒ごとの RMS の幅、帯域ごとの割合も返す
// （帯域：low 〜150 Hz / lowmid 〜500 / mid 〜2k / pres 2k〜5k / high 5k〜。pres が多すぎると効果音とぶつかる）。
import { GameAudio, renderOffline } from '../src/audio/Audio.js';
import { SFX, INSTRUMENTS } from '../src/audio/synth.js';
import { SONGS } from '../src/audio/songs.js';
import { Sequencer, compile } from '../src/audio/sequencer.js';

const audio = new GameAudio({ master: 0.9, music: 0.6, sfx: 0.8 });
addEventListener('pointerdown', () => audio.unlock(), { once: true });
const add = (row, label, fn) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = async () => { await audio.unlock(); fn(); };
  document.getElementById(row).appendChild(b);
};

// 楽器の試し弾き：音の高さのある楽器は短いフレーズ、太鼓などは 1 打
const DRUMS = new Set(['kick', 'snare', 'hat', 'taiko', 'shime', 'tsuzumi', 'ka', 'hyoshigi', 'kane', 'chiki', 'suzu']);
const CHORDY = new Set(['pad', 'sho', 'koe']);
function demo(name, ctx, bus, t0) {
  const fn = INSTRUMENTS[name];
  if (DRUMS.has(name)) { fn(ctx, bus, t0, { vel: 0.9 }); return 1; }
  if (CHORDY.has(name)) { for (const m of [57, 64, 69, 71]) fn(ctx, bus, t0, { m, dur: 1.6, vel: 0.8 }); return 2.6; }
  const low = name === 'bass' || name === 'sub' ? -24 : name === 'shamisen' || name === 'kokyu' ? -12 : 0;
  [69, 72, 74, 76, 81].forEach((m, i) => fn(ctx, bus, t0 + i * 0.22, { m: m + low, dur: i === 4 ? 0.8 : 0.2, vel: 0.85 }));
  return 1.9;
}

for (const name of Object.keys(SFX)) add('sfx', name, () => audio.sfx(name));
for (const name of Object.keys(INSTRUMENTS)) add('inst', name, () => demo(name, audio.ctx, audio.mix.music, audio.ctx.currentTime + 0.05));
for (const id of Object.keys(SONGS)) add('songs', '▶ ' + id, () => audio.music(id));
add('songs', '■ 止める', () => audio.stopMusic());

// ---------------------------------------------------------------- 測る道具
function stats(buf, t0 = 0, t1 = buf.duration) {
  const sr = buf.sampleRate, i0 = Math.floor(t0 * sr), i1 = Math.min(buf.length, Math.floor(t1 * sr));
  let peak = 0, sum = 0, nan = 0, clip = 0, n = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = i0; i < i1; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) { nan++; continue; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a > 0.9) clip++;
      sum += v * v; n++;
    }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)), nan, clip };
}

/** 帯域ごとのエネルギーの割合（左右を混ぜて、2 段のフィルターで切り分けて書き出す）。 */
const BANDS = [['low', 0, 150], ['lowmid', 150, 500], ['mid', 500, 2000], ['pres', 2000, 5000], ['high', 5000, 0]];
async function bands(buf, t0 = 0, t1 = buf.duration) {
  const sr = buf.sampleRate, i0 = Math.floor(t0 * sr), n = Math.max(1, Math.min(buf.length - i0, Math.floor((t1 - t0) * sr)));
  const mono = new AudioBuffer({ length: n, sampleRate: sr, numberOfChannels: 1 });
  const m = mono.getChannelData(0), L = buf.getChannelData(0), R = buf.getChannelData(buf.numberOfChannels - 1);
  for (let i = 0; i < n; i++) m[i] = 0.5 * (L[i0 + i] + R[i0 + i]);
  const E = [];
  for (const [, lo, hi] of BANDS) {
    const ctx = new OfflineAudioContext(1, n, sr);
    const src = ctx.createBufferSource();
    src.buffer = mono;
    let last = src;
    const f = (type, hz) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = hz; b.Q.value = 0.707; last.connect(b); last = b; };
    if (lo) { f('highpass', lo); f('highpass', lo); }
    if (hi) { f('lowpass', hi); f('lowpass', hi); }
    last.connect(ctx.destination);
    src.start();
    const d = (await ctx.startRendering()).getChannelData(0);
    let s = 0;
    for (let i = 0; i < n; i++) s += d[i] * d[i];
    E.push(s);
  }
  const tot = E.reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(BANDS.map(([k], i) => [k, +(E[i] / tot).toFixed(3)]));
}

/** 0.5 秒ごとの RMS を並べる。 */
function shortTerm(buf, t0, t1, win = 0.5) {
  const out = [];
  for (let t = t0; t + win <= t1 + 1e-6; t += win) out.push(stats(buf, t, t + win).rms);
  return out;
}

function songInfo(song) {
  const c = compile(song), steps = song.steps || 16;
  const barSec = (steps * 60) / (song.bpm || 120) / 4;
  return { c, steps, bars: c.bars.length, barSec, sec: c.bars.length * barSec };
}

/** 曲を 1 周（＋余韻）書き出して測る。 */
async function checkSong(id, song) {
  const { c, bars, barSec, sec } = songInfo(song);
  const tail = song.loop === false ? 3 : 2;
  const seconds = Math.min(150, sec + tail);
  const r = await renderOffline((ctx, mix) => new Sequencer(ctx, mix.music, song).prime(seconds - 0.5), seconds);
  const body = stats(r.buffer, 0, Math.min(sec, seconds));
  const sections = [];
  for (let b = 0; b < bars; b += 8) sections.push(+stats(r.buffer, b * barSec, Math.min(bars, b + 8) * barSec).rms.toFixed(3));
  const st = shortTerm(r.buffer, 0, Math.min(sec, seconds)).sort((a, b) => a - b);
  return {
    name: 'song ' + id, peak: r.peak, rms: body.rms, nan: r.nan, warn: c.warn, clip: body.clip,
    bpm: song.bpm, bars, sec: +sec.toFixed(1), sections,
    stP10: +(st[Math.floor(st.length * 0.1)] ?? 0).toFixed(3), stMax: +(st[st.length - 1] ?? 0).toFixed(3),
    bands: await bands(r.buffer, 0, Math.min(sec, seconds)),
  };
}

/** 全部の効果音・楽器・曲を書き出して、ピーク・RMS・NaN・曲の書き間違いを返す。 */
async function check({ sfx = true, inst = true, songs = true } = {}) {
  const rows = [];
  if (sfx) for (const name of Object.keys(SFX)) {
    const r = await renderOffline((ctx, mix) => SFX[name](ctx, mix.sfx, 0.05, {}), 2.5);
    rows.push({ name: 'sfx ' + name, peak: r.peak, rms: r.rms, nan: r.nan, warn: [] });
  }
  if (inst) for (const name of Object.keys(INSTRUMENTS)) {
    const r = await renderOffline((ctx, mix) => demo(name, ctx, mix.music, 0.05), 3);
    rows.push({ name: 'inst ' + name, peak: r.peak, rms: r.rms, nan: r.nan, warn: [] });
  }
  if (songs) for (const [id, song] of Object.entries(SONGS)) {
    if (Array.isArray(songs) && !songs.includes(id)) continue;
    rows.push(await checkSong(id, song));
  }
  return rows.map((r) => ({ ...r, peak: +r.peak.toFixed(3), rms: +r.rms.toFixed(4), silent: r.peak < 0.001 }));
}
window.__audioCheck = check;

/** 曲の列を 1 本ずつ書き出す（ミキサー・リバーブを通さない素の大きさ）。混ぜ具合を数字で見るため。 */
async function stems(id, { withBands = true } = {}) {
  const song = SONGS[id];
  const { sec } = songInfo(song);
  const out = [];
  for (const name of Object.keys(song.tracks)) {
    const solo = { ...song, tracks: { [name]: song.tracks[name] } };
    const sr = 48000, ctx = new OfflineAudioContext(2, Math.ceil((sec + 1) * sr), sr);
    const dry = ctx.createGain(), wet = ctx.createGain(); // wet はつながない
    dry.connect(ctx.destination);
    new Sequencer(ctx, { dry, wet }, solo).prime(sec);
    const buf = await ctx.startRendering();
    const s = stats(buf, 0, sec);
    const row = { track: name, inst: song.tracks[name].inst || 'drums', peak: +s.peak.toFixed(3), rms: +s.rms.toFixed(4), db: +(20 * Math.log10(s.rms || 1e-9)).toFixed(1) };
    if (withBands) row.bands = await bands(buf, 0, sec);
    out.push(row);
  }
  return out;
}
window.__songStems = stems;

document.getElementById('check').onclick = async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  btn.textContent = '書き出し中…（曲は 1 曲 30〜40 秒）';
  const rows = await check().finally(() => { btn.disabled = false; btn.textContent = '書き出して確かめる'; });
  document.getElementById('out').innerHTML = '<tr><th>音</th><th>ピーク</th><th>RMS</th><th>NaN</th><th>8 小節ごとの RMS・帯域</th><th>注意</th></tr>' + rows.map((r) =>
    `<tr><td>${r.name}</td><td>${r.peak}</td><td>${r.rms}</td><td class="${r.nan ? 'bad' : ''}">${r.nan}</td><td>${r.sections ? r.sections.join(' ') + ' ／ pres ' + r.bands.pres : ''}</td><td class="bad">${[r.silent ? '無音' : '', r.peak > 0.95 ? '大きすぎ' : '', ...r.warn].filter(Boolean).join(' / ')}</td></tr>`).join('');
};
