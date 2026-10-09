// ※ このファイルと、4 人のキャラクター（いなほ・ぽこ・すず・つくよ）のデザインは MIT License の対象外です（LICENSE の「例外」を参照）。
//   The code in this file and the characters' designs are not covered by the MIT License (see the exception in LICENSE).
// 4 人の仕様（GirlModel が読む）。色は sRGB の 16 進。
//   いなほ：稲荷の見習い巫女（狐）。狐色の長い髪を紅白の水引で結ぶ。白衣と緋袴、神楽鈴。
//   ぽこ：豆狸。焦げ茶のボブ、頭に葉っぱ、しましまの太いしっぽ。山吹色の短い着物、手に徳利。
//   すず：猫又。黒髪のロング、黒い猫耳、しっぽが 2 本。紫の着物に赤い帯、首に鈴。
//   つくよ：月のうさぎ。銀の姫カット、長いうさ耳、白と藤色の衣に羽衣、三日月の髪飾り、杵。

export const SPECS = {
  inaho: {
    id: 'inaho',
    skin: '#ffe6d6',
    line: 0x3a2224,
    rim: 0.55,
    hair: { color: '#f2c06c', root: '#e2a24e', tip: '#ffe0a0', back: 'long', backLen: 0.6, tie: ['#e8343c', '#fff6ee'], ahoge: true, sideLen: 0.24, bangs: { n: 7, len: 0.1, w: 0.026 } },
    ears: { type: 'fox', color: '#f2b45c', inner: '#fff4e6', tip: '#6a3a26' },
    tail: { type: 'fox', color: '#f2b45c', tip: '#fffaf2' },
    outfit: { type: 'miko', top: '#fbf7f0', collar: '#fbf7f0', collar2: '#e8343c', bottom: '#d8282f', himo: '#d8282f', koshiita: '#d8282f', sleeve: 'wide', sleeveCord: '#e8343c', sock: '#fffdf8', sandal: ['#f4ead8', '#d8282f'], hem: -0.36 },
    props: { kagura: true },
    face: { iris: ['#4a160e', '#c2452a', '#ffb870'], lash: '#3a1a18', brow: '#b07840', marks: 'rgba(226,52,60,0.85)' },
    faceDefault: { eyes: 'open', mouth: 'smile', brows: 'normal', blush: 0.45 },
  },
  poko: {
    id: 'poko',
    skin: '#ffe0cc',
    line: 0x3a2418,
    rim: 0.5,
    hair: { color: '#7a5034', root: '#5a3824', tip: '#b88858', back: 'short', ahoge: false, sideLen: 0.13, sideW: 0.034, bangs: { n: 7, len: 0.09, w: 0.028 }, backW: 0.056 },
    ears: { type: 'tanuki', color: '#7a5034', inner: '#e8c8a0', tip: '#2a1a14' },
    tail: { type: 'tanuki', color: '#8a6040', tip: '#2a1a14', stripes: '#3a2418' },
    outfit: { type: 'kimono', top: '#f0a030', bottom: '#f0a030', collar: '#fff4dc', collar2: '#c8501e', obi: '#4a2a1a', obiCord: '#7ad06a', bow: '#4a2a1a', sleeve: 'wide', sleeveColor: '#f0a030', sleeveTrim: '#c8501e', hem: -0.16, flare: 0.08, hemTrim: '#c8501e', seam: '#c8501e', sandal: ['#8a5a30', '#c8281e'] },
    props: { leaf: true, tokkuri: true },
    face: { iris: ['#1e3a14', '#4a8a2a', '#c8e870'], lash: '#2a1810', brow: '#5a3824', fang: true },
    faceDefault: { eyes: 'open', mouth: 'grin', brows: 'normal', blush: 0.55 },
  },
  suzu: {
    id: 'suzu',
    skin: '#fbe4dc',
    line: 0x241a2a,
    rim: 0.6,
    rimColor: 0xd8b0ff,
    hair: { color: '#2c2436', root: '#1c1624', tip: '#5a4a78', back: 'long', backLen: 0.66, ahoge: false, sideLen: 0.3, bangs: { n: 7, len: 0.105, w: 0.026, part: true } },
    ears: { type: 'cat', color: '#2c2436', inner: '#f2a6c0', tip: null },
    tail: { type: 'cat2', color: '#2c2436', tip: '#f4f0ff' },
    outfit: { type: 'kimono', top: '#5a2e86', bottom: '#4a2470', collar: '#f6eefc', collar2: '#d8304a', obi: '#d8304a', obiCord: '#ffd36a', bow: '#d8304a', sleeve: 'wide', sleeveColor: '#5a2e86', sleeveTrim: '#2c1640', hem: -0.5, flare: 0.06, hemTrim: '#2c1640', seam: '#3a1a5a', sandal: ['#2a2030', '#d8304a'] },
    props: { bell: '#ffcc3a', bellCord: '#d8304a' },
    face: { iris: ['#4a3a08', '#d8a018', '#fff07a'], slit: true, lash: '#1a1220', brow: '#2c2436', fang: true, pupil: 'rgba(20,14,10,0.95)' },
    faceDefault: { eyes: 'half', mouth: 'cat', brows: 'normal', blush: 0.3 },
  },
  tsukuyo: {
    id: 'tsukuyo',
    skin: '#fff0ea',
    line: 0x2a2236,
    rim: 0.7,
    rimColor: 0xdfe8ff,
    hair: { color: '#e8ecfa', root: '#c8cce8', tip: '#ffffff', back: 'long', backLen: 0.78, ahoge: false, sideLen: 0.34, hime: true, bangs: { n: 9, len: 0.1, w: 0.022 }, backW: 0.054 },
    ears: { type: 'rabbit', color: '#f6f6ff', inner: '#ffc0d0', tip: null, flop: true },
    tail: { type: 'rabbit', color: '#ffffff' },
    outfit: { type: 'kimono', top: '#f8f6ff', bottom: '#cdb8f0', collar: '#ffffff', collar2: '#9a7ad8', obi: '#9a7ad8', obiCord: '#ffd76a', sleeve: 'wide', sleeveColor: '#f8f6ff', sleeveTrim: '#cdb8f0', hem: -0.52, flare: 0.1, hemTrim: '#9a7ad8', seam: '#b49ae4', sandal: ['#f4f0ff', '#9a7ad8'] },
    props: { crescent: true, sash: '#ffe0f2', kine: true },
    face: { iris: ['#4a0a1a', '#d8283a', '#ff9aa8'], lash: '#2a1a2a', brow: '#b8b8d8' },
    faceDefault: { eyes: 'open', mouth: 'flat', brows: 'normal', blush: 0.3 },
  },
};
