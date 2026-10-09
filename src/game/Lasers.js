// まっすぐなレーザー：予告線（当たらない細い線）→ 太くなる → 当たる → 細くなって消える。
// 撃つ位置（owner があればその位置に付いていく）と向き、長さ、太さ。回転（angVel）もできる。
//
//   lasers.fire(x, y, angle, { len: 520, width: 18, warn: 50, on: 80, color: 'cyan', owner: boss, angVel: 0.004 })
import { SHAPE, PALETTE } from './atlas.js';

const GROW = 8, SHRINK = 12;

export class Lasers {
  constructor() { this.list = []; }

  fire(x, y, angle, o = {}) {
    const c = typeof o.color === 'string' ? PALETTE[o.color] || PALETTE.white : o.color || PALETTE.white;
    const L = {
      x, y, a: angle, len: o.len ?? 560, width: o.width ?? 16,
      warn: o.warn ?? 50, on: o.on ?? 80, t: 0, angVel: o.angVel || 0, owner: o.owner || null,
      ox: o.owner ? x - o.owner.x : 0, oy: o.owner ? y - o.owner.y : 0,
      r: c.r, g: c.g, b: c.b, alive: true, grazed: false, fn: o.fn || null,
    };
    this.list.push(L);
    return L;
  }

  /** 1 コマ。player = { x, y, r, grazeR, vulnerable }。戻り値 { hit, grazes } */
  update(player) {
    let hit = false, grazes = 0;
    for (const L of this.list) {
      if (!L.alive) continue;
      L.t++;
      if (L.owner) { if (L.owner.alive) { L.x = L.owner.x + L.ox; L.y = L.owner.y + L.oy; } }
      L.a += L.angVel;
      L.fn?.(L);
      const end = L.warn + GROW + L.on + SHRINK;
      if (L.t >= end) { L.alive = false; continue; }
      const active = L.t >= L.warn + GROW * 0.5 && L.t < L.warn + GROW + L.on;
      if (!active) continue;
      // 線分と点の距離
      const dx = Math.cos(L.a), dy = Math.sin(L.a);
      const px = player.x - L.x, py = player.y - L.y;
      const along = Math.max(0, Math.min(L.len, px * dx + py * dy));
      const qx = px - dx * along, qy = py - dy * along;
      const d = Math.hypot(qx, qy);
      const w = this.widthAt(L) * 0.36;
      if (!L.grazed && d < w + player.grazeR) { L.grazed = true; grazes++; }
      if (player.vulnerable && d < w + player.r) hit = true;
    }
    if (this.list.length > 64) this.list = this.list.filter((L) => L.alive);
    return { hit, grazes };
  }

  widthAt(L) {
    const t = L.t;
    if (t < L.warn) return 2;
    if (t < L.warn + GROW) return 2 + (L.width - 2) * ((t - L.warn) / GROW);
    if (t < L.warn + GROW + L.on) return L.width;
    return L.width * Math.max(0, 1 - (t - L.warn - GROW - L.on) / SHRINK);
  }

  render(batch) {
    batch.begin();
    for (const L of this.list) {
      if (!L.alive) continue;
      const w = this.widthAt(L);
      const warn = L.t < L.warn;
      const cx = L.x + Math.cos(L.a) * L.len / 2, cy = L.y + Math.sin(L.a) * L.len / 2;
      const alpha = warn ? 0.35 + 0.25 * Math.sin(L.t * 0.5) : 1;
      batch.push(cx, cy, L.a - Math.PI / 2, Math.max(2.5, w * (warn ? 1 : 1.35)), L.len, SHAPE.laser, L.r, L.g, L.b, alpha * (warn ? 1 : 0.9));
    }
    batch.end();
  }

  /** 消す（ボム・フェーズの終わり）。予告線だけのものは消し、撃っているものは細くして終える。 */
  cancel() {
    for (const L of this.list) {
      if (!L.alive) continue;
      if (L.t < L.warn) L.alive = false;
      else if (L.t < L.warn + GROW + L.on) L.on = Math.max(0, L.t - L.warn - GROW);
    }
  }

  clear() { this.list = []; }
}
