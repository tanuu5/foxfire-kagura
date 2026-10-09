// 画面の割り付け：フィールド（360 × 480）を画面のどこに、どの大きさで置くかを決め、
// 2 つのカメラ（背景・フィールド）の透視をそろえる。
//
//   横長（パソコン・横持ち）：フィールドを中央に高さいっぱい。左右は HUD のパネル。
//   縦長（スマホ縦持ち）：フィールドを上に幅いっぱい。下は指で動かす余白とボタン。
//
// 2 つのカメラは同じ「仮想の画面」（フィールドの中心を真ん中に置いた大きな画面）を共有し、
// その一部（実際のキャンバス）を setViewOffset で切り出す。こうすると透視の中心がフィールドの中心にくる。
// フィールドのカメラは固定で、フィールドの面（z = 0）を正面から見る。
//
// HTML の重ね（HUD・会話・スペル名）は CSS 変数 --fx --fy --fw --fh（px）と --u（1 ドットの px）で位置を合わせる。
import { FIELD_W, FIELD_H, HALF_H } from './config.js';

export const FIELD_FOV = 24;     // フィールドの高さが占める画角（度）。小さいほど平たく見える
const DEG = Math.PI / 180;
export const FIELD_DIST = HALF_H / Math.tan((FIELD_FOV / 2) * DEG);

export class Layout {
  constructor() {
    this.rect = { x: 0, y: 0, w: 1, h: 1 };
    this.mode = 'wide';
    this.scale = 1;          // 1 ドットが何 px か
    this.cameras = [];       // [{ camera, fov }]  fov が null ならフィールド用
    this.size = { w: innerWidth, h: innerHeight };
    this.forceMode = null;   // 'wide' | 'tall' | null（自動）
    this.reserveBottom = 0;  // 縦長のとき、下に残す高さ（px）。タッチのボタン用
    this.clipOn = true;      // フィールドの層をフィールドの中だけに描く（タイトルなどでは外す）
    // 安全な余白（ノッチ・角丸）を測るための見えない要素
    const p = (this.probe = document.createElement('div'));
    p.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;inset:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(p);
  }

  /** カメラを登録する。fov を渡せば背景用（その画角で）、渡さなければフィールド用。 */
  addCamera(camera, fov = null) { this.cameras.push({ camera, fov }); this.apply(); }

  /** 背景のカメラの画角を変える（フィールドの高さに対する度。ステージや演出で）。 */
  setFov(camera, fov) {
    const e = this.cameras.find((c) => c.camera === camera);
    if (!e || e.fov === fov) return;
    e.fov = fov;
    this.apply();
  }

  safe() {
    const cs = getComputedStyle(this.probe);
    const n = (v) => parseFloat(v) || 0;
    return { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
  }

  update(w = innerWidth, h = innerHeight) {
    this.size = { w, h };
    const s = this.safe();
    const tall = this.forceMode ? this.forceMode === 'tall' : w / h < 0.95;
    let fw, fh, fx, fy;
    if (!tall) {
      const m = Math.max(6, Math.round(h * 0.022));
      fh = h - m * 2 - s.t - s.b;
      fw = (fh * FIELD_W) / FIELD_H;
      const minSide = Math.min(260, w * 0.18); // 左右のパネルに最低これだけ残す
      if (w - fw < minSide * 2) { fw = Math.max(120, w - minSide * 2); fh = (fw * FIELD_H) / FIELD_W; }
      fx = (w - fw) / 2;
      fy = s.t + (h - s.t - s.b - fh) / 2;
    } else {
      const top = s.t + Math.max(34, Math.round(w * 0.085));   // 上の帯（スコアなど）
      const bottom = s.b + Math.max(this.reserveBottom, Math.round(h * 0.13)); // 指で動かす余白
      fw = w - Math.max(s.l, s.r) * 2;
      fh = (fw * FIELD_H) / FIELD_W;
      if (top + fh + bottom > h) { fh = Math.max(160, h - top - bottom); fw = (fh * FIELD_W) / FIELD_H; }
      fx = (w - fw) / 2;
      fy = top;
    }
    this.mode = tall ? 'tall' : 'wide';
    this.rect = { x: fx, y: fy, w: fw, h: fh };
    this.scale = fh / FIELD_H;
    this.apply();
    const st = document.documentElement.style;
    st.setProperty('--fx', fx.toFixed(2) + 'px');
    st.setProperty('--fy', fy.toFixed(2) + 'px');
    st.setProperty('--fw', fw.toFixed(2) + 'px');
    st.setProperty('--fh', fh.toFixed(2) + 'px');
    st.setProperty('--u', this.scale.toFixed(4) + 'px');
    document.documentElement.dataset.layout = this.mode;
    this.onChange?.(this);
  }

  /** 登録したカメラの透視を、今の割り付けに合わせる。 */
  apply() {
    const { w, h } = this.size;
    const r = this.rect;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const fullW = 2 * Math.max(cx, w - cx);
    const fullH = 2 * Math.max(cy, h - cy);
    const ratio = fullH / r.h; // 仮想の画面の高さ ÷ フィールドの高さ
    for (const { camera, fov } of this.cameras) {
      const base = fov ?? FIELD_FOV;
      const half = Math.atan(ratio * Math.tan((base / 2) * DEG));
      camera.fov = (half * 2) / DEG;
      camera.aspect = fullW / fullH;
      camera.setViewOffset(fullW, fullH, fullW / 2 - cx, fullH / 2 - cy, w, h);
      camera.updateProjectionMatrix();
    }
  }

  /** 画面の px（clientX, clientY）→ フィールドの座標。 */
  toField(px, py) {
    const r = this.rect;
    return { x: ((px - r.x) / r.w - 0.5) * FIELD_W, y: (0.5 - (py - r.y) / r.h) * FIELD_H };
  }

  /** フィールドの座標 → 画面の px。 */
  toScreen(x, y) {
    const r = this.rect;
    return { x: r.x + (x / FIELD_W + 0.5) * r.w, y: r.y + (0.5 - y / FIELD_H) * r.h };
  }
}
