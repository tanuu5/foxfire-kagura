// カメラの動かし方（ステージ共通）。
//   Flight      道（pathX）に沿って前（−Z）へ飛ぶ。ボスの合図で決まった場所まで加速 → 減速して止まり、その上に浮かぶ
//   ChunkRing   前へ進むにつれて、後ろに過ぎた区画を前へ回して作り直す（区画ごとにインスタンスの番号の範囲を持つ）
//   frameAnchor 決まった向きのカメラで、ある点が画面のどこに・どの大きさで写るかを決めて、カメラの位置を解く（タイトル）
import * as THREE from 'three';

const hermite = (s, m0) => m0 * (s * s * s - 2 * s * s + s) + (-2 * s * s * s + 3 * s * s);
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

/**
 * o = { speed, alt, pitch, fov, pathX(z), groundY(x, z), follow（道に寄せる割合）, yawK, rollK, lookAhead }
 * update(dt, ctx, rig) で rig（world.rig）を書く。
 */
export class Flight {
  constructor(o) {
    this.o = o;
    this.z = o.z0 ?? 0;
    this.v = o.speed;
    this.vMul = 1;
    this.alt = o.alt;
    this.pitch = o.pitch;
    this.fov = o.fov;
    this.x = o.pathX(this.lookZ()) * (o.follow ?? 0.85);
    this.y = o.groundY(this.x, this.lookZ()) + this.alt;
    this.yaw = 0;
    this.roll = 0;
    this.t = 0;
    this.trip = null;     // ボスの場所への移動
    this.arrived = false;
    this.hover = 0;
  }

  /** 画面の中心（フィールドの中心）が見ている地面の z。 */
  lookZ(z = this.z, alt = this.alt, pitch = this.pitch) { return z - alt / Math.tan(Math.max(0.2, -pitch)); }

  /**
   * ボスの場所へ向かう。dest = { x, y, z（カメラの位置）, pitch, yaw, fov }, T 秒で着く。
   * 加速してから減速する（エルミート曲線。今の速さから始めて 0 で止まる）。
   */
  goTo(dest, T) {
    const D = Math.max(1, this.z - dest.z);
    this.trip = { z0: this.z, D, T, m0: Math.min(2.5, (this.v * this.vMul * T) / D), t: 0, dest,
      from: { pitch: this.pitch, fov: this.fov } };
    this.arrived = false;
  }

  update(dt, ctx, rig) {
    const o = this.o;
    this.t += dt;
    const tr = this.trip;
    let follow = 1;
    if (tr) {
      tr.t += dt;
      const s = Math.min(1, tr.t / tr.T);
      this.z = tr.z0 - tr.D * hermite(s, tr.m0);
      follow = 1 - smoothstep(0.15, 0.95, s);
      this.pitch = tr.from.pitch + (tr.dest.pitch - tr.from.pitch) * smoothstep(0.2, 1, s);
      this.fov = tr.from.fov + ((tr.dest.fov ?? tr.from.fov) - tr.from.fov) * smoothstep(0.2, 1, s);
      if (s >= 1) this.arrived = true;
    } else {
      // 中ボスの間はゆっくり（ボスの合図が無いのに ctx.boss のとき）
      this.vMul = damp(this.vMul, ctx.boss ? 0.45 : 1, 0.8, dt);
      this.z -= this.v * this.vMul * (ctx.speed ?? 1) * dt;
    }
    // 道に沿う位置と向き
    const lz = this.lookZ();
    const px = o.pathX(lz) * (o.follow ?? 0.85);
    const slope = (o.pathX(lz - 20) - o.pathX(lz + 20)) / 40;  // 前へ進むときの dx/d(−z)
    const yawT = -Math.atan(slope) * (o.yawK ?? 0.35);
    const gy = o.groundY(px, lz) * 0.6 + o.groundY(px, this.z) * 0.4 + this.alt;
    const sway = this.t;
    let x = px + Math.sin(sway * 0.23) * 4, y = gy + Math.sin(sway * 0.31) * 3, yaw = yawT + Math.sin(sway * 0.17) * 0.015;
    let roll = -yawT * (o.rollK ?? 0.25) + Math.sin(sway * 0.29) * 0.008;
    if (tr) {
      const d = tr.dest, w = 1 - follow;
      const hx = d.x + Math.sin(sway * 0.13) * 3, hy = d.y + Math.sin(sway * 0.21) * 2;
      x = x + (hx - x) * w;
      y = y + (hy - y) * w;
      yaw = yaw + ((d.yaw ?? 0) + Math.sin(sway * 0.07) * 0.02 - yaw) * w;
      roll = roll * (1 - w) + Math.sin(sway * 0.11) * 0.01 * w;
      if (this.arrived) {
        this.hover = Math.min(1, this.hover + dt * 0.25);
        this.z = d.z + Math.sin(sway * 0.1) * 3 * this.hover;
      }
    }
    const k = tr ? 6 : 1.2;
    this.x = damp(this.x, x, k, dt);
    this.y = damp(this.y, y, k, dt);
    this.yaw = damp(this.yaw, yaw, k, dt);
    this.roll = damp(this.roll, roll, k, dt);
    rig.pos.set(this.x, this.y, this.z);
    rig.yaw = this.yaw;
    rig.pitch = this.pitch;
    rig.roll = this.roll;
  }
}

/**
 * 区画の輪。len：1 区画の長さ、count：区画の数、behind：カメラより後ろに残す区画の数。
 * build(slot, k, z0, z1)：slot 番目の入れ物に、k 番目の区画（z0 > z > z1）を作る。
 */
export class ChunkRing {
  constructor({ len, count, behind = 1, build }) {
    Object.assign(this, { len, count, behind, build });
    this.slots = new Array(count).fill(null);
  }
  update(camZ) {
    const kc = Math.floor(-camZ / this.len);
    const k0 = kc - this.behind;
    for (let k = k0; k < k0 + this.count; k++) {
      const s = ((k % this.count) + this.count) % this.count;
      if (this.slots[s] !== k) {
        this.slots[s] = k;
        this.build(s, k, -k * this.len, -(k + 1) * this.len);
      }
    }
  }
  /** k ≥ kMin の区画を作り直す（ボスの場所ができたとき、まだ見えていない先の区画だけ）。 */
  rebuildFrom(kMin) {
    for (let s = 0; s < this.count; s++) {
      const k = this.slots[s];
      if (k !== null && k >= kMin) this.build(s, k, -k * this.len, -(k + 1) * this.len);
    }
  }
}

const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

/**
 * 決まった向き（pitch, yaw, roll）のカメラで、点 mid（高さ h の物の真ん中）が画面の (ndcX, ndcY) に、
 * 画面の高さの frac の大きさで写るようなカメラの位置を out に入れる。透視（切り出しを含む）は camera.projectionMatrix から。
 */
export function frameAnchor(camera, out, mid, h, ndcX, ndcY, frac, pitch, yaw, roll = 0) {
  const e = camera.projectionMatrix.elements;
  const P00 = e[0], P11 = e[5], P02 = e[8], P12 = e[9];
  _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
  _qi.copy(_q).invert();
  const uy = Math.abs(_v.set(0, 1, 0).applyQuaternion(_qi).y);
  const d = (P11 * h * uy) / Math.max(2 * frac, 1e-3);
  const xc = ((ndcX + P02) * d) / P00, yc = ((ndcY + P12) * d) / P11;
  _v.set(xc, yc, -d).applyQuaternion(_q);
  return out.copy(mid).sub(_v);
}
