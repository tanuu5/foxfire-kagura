// ゲーム全体の決まりごと（フィールドの大きさ・1 コマの長さ・難易度）。
// 弾幕の数値は「1 コマ（1/60 秒）あたりのドット」で書く。フィールドは 360 × 480、原点が中央、y は上が正。

export const FIELD_W = 360;
export const FIELD_H = 480;
export const HALF_W = FIELD_W / 2;
export const HALF_H = FIELD_H / 2;

export const TICK = 1 / 60;

/** フィールドの外でも弾を消さない余白（ドット）。 */
export const OUT_MARGIN = 48;

/** 難易度。D（0〜3）で弾幕の量や速さを変える。 */
export const DIFFS = ['easy', 'normal', 'hard', 'lunatic'];

/** 自機の決まりごと。 */
export const PLAYER = {
  speed: 4.5,
  focusSpeed: 2.0,
  hitR: 2.4,
  grazeR: 22,
  startLives: 2,      // 残り（いま出ている 1 機を除く）
  startBombs: 3,
  deathbombFrames: 8, // 被弾してからボムで助かる猶予
  respawnInvuln: 180,
  bombInvuln: 240,
  margin: 10,         // フィールドの端からの余白
};

/** アイテムを吸い寄せる線（これより上に入ると全部集まる）。 */
export const POC_Y = HALF_H - FIELD_H * 0.25;

/** 角度の道具：0 が右、π/2 が上（数学と同じ）。 */
export const DEG = Math.PI / 180;
