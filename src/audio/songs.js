// 曲のデータ（書き方は sequencer.js の先頭）。デモの 2 曲：作品に合わせて書き換える。
// 繰り返し聞く曲は 8〜16 小節にして、ループのつなぎ目（最後の小節 → 最初の小節）が自然に聞こえるようにする。

export const SONGS = {
  title: {
    id: 'title', bpm: 96, gain: 0.9,
    tracks: {
      pad: { inst: 'pad', vol: 0.8, bars: [
        'C4+E4+G4 - - - - - - - - - - - - - - -',
        'A3+C4+E4 - - - - - - - - - - - - - - -',
        'F3+A3+C4 - - - - - - - - - - - - - - -',
        'G3+B3+D4 - - - - - - - - - - - - - - -',
      ] },
      pluck: { inst: 'pluck', vol: 0.6, pan: 0.2, bars: [
        'C5 . G4 . E5 . G4 . C5 . G4 . E5 . D5 .',
        'A4 . E4 . C5 . E4 . A4 . E4 . C5 . B4 .',
        'F4 . C5 . A4 . C5 . F4 . C5 . A4 . G4 .',
        'G4 . D5 . B4 . D5 . G4 . B4 . D5 . . .',
      ] },
      bass: { inst: 'bass', vol: 0.6, bars: ['C2 - - - . . . . C2 - - - . . . .', 'A1 - - - . . . . A1 - - - . . . .', 'F1 - - - . . . . F1 - - - . . . .', 'G1 - - - . . . . G1 - - - . . . .'] },
    },
  },
  play: {
    id: 'play', bpm: 128, gain: 0.85,
    tracks: {
      drums: { inst: 'drums', bars: [
        { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.' },
        { kick: 'x...x...x...x.x.', snare: '....x.......x..o', hat: '..x...x...x.xxxx' },
      ] },
      bass: { inst: 'bass', bars: [
        'C2 . C2 . C3 . C2 . C2 . C2 . C3 . Bb1 .',
        'Ab1 . Ab1 . Ab2 . Ab1 . Bb1 . Bb1 . Bb2 . G1 .',
      ] },
      lead: { inst: 'lead', vol: 0.7, pan: -0.1, bars: [
        'G4 - - C5 - - Eb5 - D5 - C5 - G4 - - -',
        'Ab4 - - C5 - - Eb5 - F5 - - Eb5 D5 - - -',
        'G4 - - C5 - - Eb5 - G5 - F5 - Eb5 - D5 -',
        'C5 - - - Bb4 - - - C5 - - - . . . .',
      ] },
    },
  },
};
