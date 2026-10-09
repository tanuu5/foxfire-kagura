// 道中の敵の顔：canvas に 4 コマ描く（0 ふつう・1 まばたき・2 痛い（当たったとき）・3 とくべつ）。
// 座標は [-1, 1]（コマの中心が 0）、y は下向き。コマの外側 1 割ほどは透明に残す（縮小でとなりのコマがにじまないように）。
// p は enemies.js の palette（種類ごとの色）。顔のシールは照明を受けないので、ここで塗った色がそのまま見える。
import { draw as D, css, TAU } from './enemyParts.js';

const WHITE = 0xffffff;

/** 白目のある目（ひとつ目の妖怪用）。o：r（白目の半径）、iris（黒目の色 2 つ）、look（-1〜1 の横目）、small（黒目を小さく） */
function bigEye(c, x, y, rx, ry, o) {
  const ink = css(o.ink);
  D.fillEllipse(c, x, y, rx, ry, css(o.white ?? 0xfffaf0));
  c.save();
  D.ellipse(c, x, y, rx, ry); c.clip();
  const ir = (o.small ? 0.42 : 0.62) * Math.min(rx, ry);
  const ix = x + (o.look || 0) * rx * 0.3, iy = y + ry * 0.08;
  const g = c.createRadialGradient(ix, iy - ir * 0.3, ir * 0.1, ix, iy, ir);
  g.addColorStop(0, css(o.iris[0])); g.addColorStop(1, css(o.iris[1]));
  D.ellipse(c, ix, iy, ir, ir * 1.04); c.fillStyle = g; c.fill();
  D.fillEllipse(c, ix, iy, ir * 0.5, ir * 0.56, css(o.pupil ?? 0x140a0c));
  D.fillEllipse(c, ix - ir * 0.36, iy - ir * 0.42, ir * 0.3, ir * 0.24, css(WHITE), -0.5);
  D.fillEllipse(c, ix + ir * 0.4, iy + ir * 0.4, ir * 0.14, ir * 0.11, css(WHITE, 0.9));
  // 上まぶたの影
  c.fillStyle = css(o.ink, 0.18);
  D.ellipse(c, x, y - ry * 0.95, rx * 1.1, ry * 0.45); c.fill();
  c.restore();
  // ふち（上まぶたは太く）
  D.ellipse(c, x, y, rx, ry); c.lineWidth = 0.035; c.strokeStyle = ink; c.stroke();
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, Math.PI * 1.04, Math.PI * 1.96); c.lineWidth = 0.085; c.stroke();
  // まつげ
  if (o.lashes) {
    for (const [a, len] of [[-0.55, 0.13], [-0.25, 0.1], [0.25, 0.1], [0.55, 0.13]].slice(0, o.lashes === 2 ? 4 : 3)) {
      const px = x + Math.sin(a) * rx * 1.0, py = y - Math.cos(a) * ry * 0.98;
      D.line(c, [[px, py], [px + Math.sin(a) * len, py - Math.cos(a) * len * 0.9]], 0.05, ink);
    }
  }
}

/** ひとつ目の閉じた目（‿ にまつげ）。 */
function bigEyeClosed(c, x, y, w, ink, lashes = true) {
  D.curve(c, x - w, y - 0.02, x, y + w * 0.55, x + w, y - 0.02, 0.085, css(ink));
  if (lashes) for (const k of [-0.6, 0, 0.6]) {
    const px = x + k * w * 0.8, py = y + w * 0.27 * (1 - k * k * 0.6);
    D.line(c, [[px, py], [px + k * 0.06, py + 0.1]], 0.045, css(ink));
  }
}

/** ぎゅっとつむった目（ひとつ目用：≫ の字を横に寝かせた形）。 */
function bigEyeSqueeze(c, x, y, w, ink) {
  D.line(c, [[x - w, y - w * 0.32], [x - w * 0.1, y], [x - w, y + w * 0.32]], 0.08, css(ink));
  D.line(c, [[x + w, y - w * 0.32], [x + w * 0.1, y], [x + w, y + w * 0.32]], 0.08, css(ink));
}

/** 汗のしずく。 */
function sweat(c, x, y, s) {
  c.beginPath();
  c.moveTo(x, y - s);
  c.quadraticCurveTo(x + s * 0.75, y + s * 0.2, x, y + s * 0.62);
  c.quadraticCurveTo(x - s * 0.75, y + s * 0.2, x, y - s);
  c.fillStyle = css(0xbfe8ff, 0.95); c.fill();
  c.lineWidth = 0.025; c.strokeStyle = css(0x3a6a9a); c.stroke();
}

export const FACES = {
  // ---------------------------------------------------------------- 鬼火：ふたつのまるい目、ほお、小さな口
  wisp(c, f, p) {
    const ex = 0.34, ey = -0.08;
    for (const s of [-1, 1]) D.blush(c, s * 0.62, 0.17, 0.17, 0.1, 0xff6f9a, 0.55);
    if (f === 0) {
      for (const s of [-1, 1]) D.eye(c, s * ex, ey, 0.17, 0.25, { dark: p.ink, iris: p.iris });
      D.curve(c, -0.08, 0.22, 0, 0.3, 0.08, 0.22, 0.05, css(p.ink));
    } else if (f === 1) {
      for (const s of [-1, 1]) D.closed(c, s * ex, ey + 0.02, 0.15, 1, 0.07, p.ink);
      D.curve(c, -0.08, 0.22, 0, 0.3, 0.08, 0.22, 0.05, css(p.ink));
    } else if (f === 2) {
      for (const s of [-1, 1]) D.squeeze(c, s * ex, ey, 0.13, -s, 0.075, p.ink);
      D.fillEllipse(c, 0, 0.27, 0.07, 0.06, css(p.ink));
    } else {
      for (const s of [-1, 1]) D.closed(c, s * ex, ey + 0.06, 0.15, -1, 0.07, p.ink);
      c.beginPath(); c.moveTo(-0.12, 0.2); c.quadraticCurveTo(0, 0.42, 0.12, 0.2); c.closePath();
      c.fillStyle = css(p.ink); c.fill();
    }
  },

  // ---------------------------------------------------------------- 葉っぱ：葉脈（シールは葉の正面全体）と、たぬきの顔
  leaf(c, f, p) {
    // 葉脈（葉の形で切り抜く。顔のところはあける）
    c.save();
    c.beginPath();
    p.leafOutline.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath(); c.clip();
    const vein = css(p.vein, 0.6);
    D.line(c, [[0, -1.0], [0, -0.62]], 0.04, vein);
    D.curve(c, 0, 0.36, 0.01, 0.7, 0.0, 1.02, 0.04, vein);
    for (const [y, len] of [[0.45, 0.5], [0.64, 0.42], [0.82, 0.28]]) {
      for (const s of [-1, 1]) D.curve(c, 0, y, s * len * 0.45, y + 0.02, s * len, y + 0.2, 0.03, vein);
    }
    for (const s of [-1, 1]) D.curve(c, s * 0.02, -0.66, s * 0.3, -0.62, s * 0.52, -0.42, 0.028, vein);
    c.restore();
    // 顔（[-1, 1] の顔の座標に直す）
    c.save();
    c.translate(p.faceAt[0], p.faceAt[1]);
    c.scale(p.faceScale, p.faceScale);
    const ex = 0.36, ey = -0.1;
    // 口のまわりの白い毛
    D.fillEllipse(c, 0, 0.27, 0.34, 0.23, css(p.muzzle));
    // たぬきの模様：目のまわりをつなぐ黒い帯
    c.beginPath();
    for (const s of [-1, 1]) c.ellipse(s * 0.38, ey + 0.04, 0.33, 0.22, s * 0.4, 0, TAU);
    c.rect(-0.2, ey - 0.06, 0.4, 0.16);
    c.fillStyle = css(p.mask); c.fill('nonzero');
    if (f === 0 || f === 3) {
      for (const s of [-1, 1]) {
        if (f === 3 && s > 0) { D.closed(c, s * ex, ey + 0.04, 0.14, -1, 0.065, 0xfff6dc); continue; }   // ウインク
        // ずるそうな目：上が平らな半月
        c.save();
        D.ellipse(c, s * ex, ey + 0.02, 0.15, 0.15); c.clip();
        D.fillEllipse(c, s * ex, ey + 0.02, 0.15, 0.15, css(0xfff6dc));
        D.fillEllipse(c, s * ex - s * 0.035, ey + 0.05, 0.095, 0.105, css(p.pupil));
        D.fillEllipse(c, s * ex - s * 0.065, ey + 0.01, 0.038, 0.032, css(WHITE));
        c.fillStyle = css(p.mask);
        c.fillRect(s * ex - 0.2, ey - 0.2, 0.4, 0.15);
        c.restore();
        D.line(c, [[s * ex - 0.17, ey - 0.05 + s * 0.015], [s * ex + 0.17, ey - 0.05 - s * 0.03]], 0.05, css(p.ink));
      }
    } else if (f === 1) {
      for (const s of [-1, 1]) D.closed(c, s * ex, ey + 0.02, 0.14, 1, 0.065, 0xfff6dc);
    } else {
      for (const s of [-1, 1]) D.squeeze(c, s * ex, ey + 0.03, 0.12, -s, 0.065, 0xfff6dc);
    }
    // 鼻と口
    c.beginPath(); c.moveTo(-0.08, 0.12); c.quadraticCurveTo(0, 0.08, 0.08, 0.12); c.quadraticCurveTo(0.02, 0.22, 0, 0.22); c.quadraticCurveTo(-0.02, 0.22, -0.08, 0.12);
    c.fillStyle = css(p.ink); c.fill();
    if (f === 2) D.fillEllipse(c, 0, 0.34, 0.07, 0.08, css(p.ink));
    else {
      if (f === 3) D.fillEllipse(c, 0.05, 0.37, 0.065, 0.085, css(0xff6a88));   // あっかんべー
      D.catMouth(c, 0, 0.27, 0.15, 0.045, p.ink);
      if (f !== 3) D.poly(c, [[0.06, 0.29], [0.105, 0.29], [0.085, 0.37]], css(WHITE));   // 八重歯
    }
    for (const s of [-1, 1]) D.blush(c, s * 0.66, 0.26, 0.14, 0.08, 0xff7a6a, 0.5);
    c.restore();
  },

  // ---------------------------------------------------------------- 提灯：大きなひとつ目、破れた口
  lantern(c, f, p) {
    const ey = -0.3;
    if (f === 0) bigEye(c, 0, ey, 0.42, 0.34, { ink: p.ink, iris: [0xffd25a, 0xc0461a], lashes: 1 });
    else if (f === 1) bigEyeClosed(c, 0, ey, 0.4, p.ink);
    else if (f === 2) bigEyeSqueeze(c, 0, ey, 0.36, p.ink);
    else { bigEye(c, 0, ey, 0.44, 0.38, { ink: p.ink, iris: [0xffd25a, 0xc0461a], small: true }); sweat(c, 0.58, -0.5, 0.12); }
    // 破れた紙の口（ぎざぎざ）
    const my = 0.47, w = f === 2 ? 0.4 : 0.56;
    c.beginPath();
    c.moveTo(-w, my - 0.04);
    const n = 8;
    for (let i = 1; i <= n; i++) c.lineTo(-w + (2 * w * i) / n, my - 0.04 + (i % 2 ? 0.09 : 0) * (f === 2 ? -1 : 1));
    c.quadraticCurveTo(0, my + (f === 2 ? 0.22 : 0.42), -w, my - 0.04);
    c.closePath();
    c.fillStyle = css(p.mouth); c.fill();
    c.lineWidth = 0.04; c.strokeStyle = css(p.ink); c.stroke();
    c.save(); c.clip();
    D.fillEllipse(c, 0, my + 0.3, 0.3, 0.16, css(p.throat));
    c.restore();
  },

  // ---------------------------------------------------------------- 唐傘：まつげの長いひとつ目、舌を出す口
  umbrella(c, f, p) {
    const ey = -0.12;
    if (f === 0) bigEye(c, 0, ey, 0.42, 0.42, { ink: p.ink, iris: [p.irisA, p.irisB], lashes: 2, look: 0.25 });
    else if (f === 1) bigEyeClosed(c, 0, ey + 0.04, 0.4, p.ink);
    else if (f === 2) bigEyeSqueeze(c, 0, ey, 0.36, p.ink);
    else {
      bigEye(c, 0, ey, 0.42, 0.42, { ink: p.ink, iris: [p.irisA, p.irisB], lashes: 2, look: -0.35 });
      // 半目（いたずら）
      c.save(); D.ellipse(c, 0, ey, 0.43, 0.43); c.clip();
      c.fillStyle = css(p.lid); c.fillRect(-0.5, ey - 0.5, 1, 0.45);
      c.restore();
      D.line(c, [[-0.43, ey - 0.06], [0.43, ey - 0.06]], 0.085, css(p.ink));
    }
    // 口（舌はモデルの部品）
    c.beginPath(); c.moveTo(-0.2, 0.6); c.quadraticCurveTo(0, 0.86, 0.2, 0.6); c.quadraticCurveTo(0, 0.68, -0.2, 0.6);
    c.fillStyle = css(p.mouth); c.fill();
    c.lineWidth = 0.035; c.strokeStyle = css(p.ink); c.stroke();
  },

  // ---------------------------------------------------------------- 化け猫：光る黄色い目（縦長のひとみ）、ω の口と牙、ひげ
  cat(c, f, p) {
    const ex = 0.38, ey = -0.1;
    const glowEye = (s, narrow) => {
      const x = s * ex, y = ey;
      const ry = narrow ? 0.09 : 0.17;
      c.save();
      c.translate(x, y); c.rotate(-s * 0.18);
      const g = c.createRadialGradient(0, 0, 0.02, 0, 0, 0.22);
      g.addColorStop(0, css(0xfff7b0)); g.addColorStop(0.6, css(0xffe03a)); g.addColorStop(1, css(0xffa418));
      // アーモンド形
      c.beginPath();
      c.moveTo(-0.21, 0); c.quadraticCurveTo(0, -ry * 2, 0.21, 0); c.quadraticCurveTo(0, ry * 2, -0.21, 0);
      c.fillStyle = g; c.fill();
      c.lineWidth = 0.03; c.strokeStyle = css(0xff8a10); c.stroke();
      D.fillEllipse(c, 0.01, 0, 0.04, ry * 0.85, css(0x2a1200));
      D.fillEllipse(c, -0.07, -ry * 0.35, 0.035, 0.03, css(WHITE));
      c.restore();
    };
    if (f === 0) for (const s of [-1, 1]) glowEye(s, false);
    else if (f === 3) {
      for (const s of [-1, 1]) glowEye(s, true);
      for (const s of [-1, 1]) D.line(c, [[s * 0.18, -0.3], [s * 0.52, -0.22]], 0.05, css(0xffd040));   // 怒り眉
    } else if (f === 1) for (const s of [-1, 1]) D.closed(c, s * ex, ey, 0.17, 1, 0.06, 0xffe03a);
    else for (const s of [-1, 1]) D.squeeze(c, s * ex, ey, 0.13, -s, 0.065, 0xffe03a);
    // 鼻
    D.poly(c, [[-0.06, 0.13], [0.06, 0.13], [0, 0.2]], css(0xff8fb8));
    // 口と牙
    if (f === 2 || f === 3) {
      c.beginPath(); c.moveTo(-0.13, 0.27); c.quadraticCurveTo(0, f === 3 ? 0.55 : 0.45, 0.13, 0.27); c.closePath();
      c.fillStyle = css(0x3a1030); c.fill();
      c.lineWidth = 0.03; c.strokeStyle = css(p.whisker); c.stroke();
      for (const s of [-1, 1]) D.poly(c, [[s * 0.1, 0.28], [s * 0.04, 0.28], [s * 0.07, 0.37]], css(WHITE));
    } else {
      D.catMouth(c, 0, 0.25, 0.14, 0.035, p.whisker);
      for (const s of [-1, 1]) D.poly(c, [[s * 0.1, 0.27], [s * 0.05, 0.28], [s * 0.085, 0.35]], css(WHITE));
    }
    // ひげ
    for (const s of [-1, 1]) for (const k of [-1, 0, 1]) {
      D.line(c, [[s * 0.42, 0.16 + k * 0.05], [s * 0.82, 0.1 + k * 0.1]], 0.02, css(p.whisker, 0.75));
    }
  },

  // ---------------------------------------------------------------- 月の兎の兵隊：赤い目、きりっとした眉、小さな口
  rabbit(c, f, p) {
    const ex = 0.34, ey = -0.04;
    for (const s of [-1, 1]) D.blush(c, s * 0.6, 0.2, 0.15, 0.09, p.blush, 0.6);
    // 眉（きりっ）
    const brow = (s, up = 0) => D.line(c, [[s * 0.18, ey - 0.3 - up], [s * 0.48, ey - 0.38 - up]], 0.055, css(p.brow));
    if (f === 0) {
      for (const s of [-1, 1]) { D.eye(c, s * ex, ey, 0.15, 0.21, { dark: p.ink, iris: p.iris }); brow(s); }
      c.beginPath(); c.moveTo(0, 0.15); c.lineTo(0, 0.21); c.moveTo(-0.07, 0.25); c.quadraticCurveTo(0, 0.18, 0.07, 0.25);
      c.lineWidth = 0.035; c.strokeStyle = css(p.mouthLine); c.stroke();
    } else if (f === 1) {
      for (const s of [-1, 1]) { D.line(c, [[s * ex - 0.13, ey + 0.02], [s * ex + 0.13, ey + 0.02]], 0.06, css(p.ink)); brow(s); }
      c.beginPath(); c.moveTo(-0.07, 0.25); c.quadraticCurveTo(0, 0.18, 0.07, 0.25);
      c.lineWidth = 0.035; c.strokeStyle = css(p.mouthLine); c.stroke();
    } else if (f === 2) {
      for (const s of [-1, 1]) D.squeeze(c, s * ex, ey, 0.12, -s, 0.065, p.ink);
      D.fillEllipse(c, 0, 0.26, 0.07, 0.07, css(p.mouthIn));
    } else {
      // かけ声（杵を振り下ろすとき）
      for (const s of [-1, 1]) {
        c.save(); D.ellipse(c, s * ex, ey, 0.15, 0.21); c.clip();
        D.eye(c, s * ex, ey, 0.15, 0.21, { dark: p.ink, iris: p.iris });
        c.fillStyle = css(p.fur); c.fillRect(s * ex - 0.2, ey - 0.3, 0.4, 0.2);
        c.restore();
        D.line(c, [[s * ex - 0.15, ey - 0.1 + s * 0.03], [s * ex + 0.15, ey - 0.1 - s * 0.03]], 0.05, css(p.ink));
        brow(s, -0.06);
      }
      c.beginPath(); c.moveTo(-0.13, 0.18); c.quadraticCurveTo(0, 0.5, 0.13, 0.18); c.closePath();
      c.fillStyle = css(p.mouthIn); c.fill();
      D.fillEllipse(c, 0, 0.33, 0.07, 0.04, css(0xff7a96));
    }
  },

  // ---------------------------------------------------------------- 星：にこにこ顔
  starspirit(c, f, p) {
    const ex = 0.34, ey = -0.12;
    for (const s of [-1, 1]) D.blush(c, s * 0.6, 0.16, 0.17, 0.1, 0xff6a3a, 0.5);
    const mouth = () => {
      c.beginPath(); c.moveTo(-0.17, 0.16); c.quadraticCurveTo(0, 0.52, 0.17, 0.16); c.closePath();
      c.fillStyle = css(p.mouth); c.fill();
      c.save(); c.clip(); D.fillEllipse(c, 0, 0.38, 0.12, 0.09, css(0xff7a7a)); c.restore();
    };
    if (f === 0) {
      for (const s of [-1, 1]) D.eye(c, s * ex, ey, 0.15, 0.23, { dark: p.ink, iris: p.iris });
      mouth();
    } else if (f === 1) {
      for (const s of [-1, 1]) D.closed(c, s * ex, ey + 0.06, 0.14, -1, 0.065, p.ink);
      mouth();
    } else if (f === 2) {
      for (const s of [-1, 1]) D.squeeze(c, s * ex, ey, 0.12, -s, 0.065, p.ink);
      c.beginPath();
      for (let i = 0; i <= 6; i++) { const x = -0.16 + i * (0.32 / 6); c.lineTo(x, 0.24 + (i % 2 ? 0.04 : -0.02)); }
      c.lineWidth = 0.05; c.strokeStyle = css(p.ink); c.stroke();
    } else {
      D.eye(c, -ex, ey, 0.15, 0.23, { dark: p.ink, iris: p.iris });
      D.closed(c, ex, ey + 0.06, 0.14, -1, 0.065, p.ink);
      mouth();
    }
  },

  // ---------------------------------------------------------------- 輪入道：こわい顔（太い眉・にらむ目・ひげ・への字口）
  wheel(c, f, p) {
    const ex = 0.33, ey = -0.12;
    const ink = css(p.ink);
    if (f === 3) for (const s of [-1, 1]) D.blush(c, s * 0.55, 0.12, 0.2, 0.12, 0xff2a1a, 0.55);
    // 目
    for (const s of [-1, 1]) {
      const x = s * ex;
      if (f === 1) D.line(c, [[x - 0.15, ey + 0.02], [x + 0.15, ey + 0.02]], 0.06, ink);
      else if (f === 2) D.squeeze(c, x, ey, 0.12, -s, 0.07, p.ink);
      else {
        const xo = x + s * 0.19, xi = x - s * 0.19;   // 目じり・目がしら
        c.save();
        D.ellipse(c, x, ey, 0.17, 0.12); c.clip();
        D.fillEllipse(c, x, ey, 0.17, 0.12, css(f === 3 ? 0xfff2a0 : 0xfffaf0));
        D.fillEllipse(c, x - s * 0.03, ey + 0.02, f === 3 ? 0.035 : 0.06, f === 3 ? 0.035 : 0.065, css(f === 3 ? 0xd01010 : 0x140a08));
        // 怒ったまぶた（目がしらが下がる）
        D.poly(c, [[xo, ey - 0.2], [xi, ey - 0.2], [xi, ey + 0.0], [xo, ey - 0.11]], css(p.skin));
        c.restore();
        D.line(c, [[xo, ey - 0.11], [xi, ey + 0.0]], 0.045, ink);
        D.ellipse(c, x, ey, 0.17, 0.12); c.lineWidth = 0.03; c.strokeStyle = ink; c.stroke();
      }
      // 太い眉（目がしら側が下）
      const tilt = f === 3 ? 0.06 : 0;
      D.line(c, [[x - s * 0.06, ey - 0.17 + tilt], [x + s * 0.25, ey - 0.31 - tilt]], 0.11, ink);
    }
    // 鼻
    D.fillEllipse(c, 0, 0.1, 0.11, 0.09, css(p.nose));
    D.fillEllipse(c, -0.03, 0.07, 0.035, 0.025, css(WHITE, 0.7));
    // ひげ（八の字）
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * 0.03, 0.2);
      c.quadraticCurveTo(s * 0.2, 0.15, s * 0.36, 0.3);
      c.quadraticCurveTo(s * 0.22, 0.27, s * 0.03, 0.27);
      c.closePath(); c.fillStyle = ink; c.fill();
    }
    // 口
    if (f === 3) {
      c.beginPath(); c.moveTo(-0.2, 0.38); c.quadraticCurveTo(0, 0.28, 0.2, 0.38); c.quadraticCurveTo(0, 0.66, -0.2, 0.38);
      c.fillStyle = css(0x4a0a0a); c.fill();
      c.save(); c.clip(); c.fillStyle = css(WHITE); c.fillRect(-0.25, 0.3, 0.5, 0.08); c.restore();
    } else if (f === 2) {
      c.fillStyle = css(WHITE); c.fillRect(-0.16, 0.36, 0.32, 0.09);
      c.lineWidth = 0.03; c.strokeStyle = ink; c.strokeRect(-0.16, 0.36, 0.32, 0.09);
      for (const x of [-0.08, 0, 0.08]) D.line(c, [[x, 0.36], [x, 0.45]], 0.02, ink);
    } else D.curve(c, -0.16, 0.44, 0, 0.32, 0.16, 0.44, 0.06, ink);
  },
};

/** 色のそろった顔（種類ごとの palette を受け取る）。 */
export function faceDrawer(kind, p) {
  const fn = FACES[kind];
  return (c, f) => fn(c, f, p);
}

